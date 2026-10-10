import { createHash } from 'node:crypto'

import { idempotencyRetentionMs, type HttpRequestWriteRules } from '../../../configuration/business-policies/index.js'
import type { UserPrincipalDto } from '../../../contracts/types.js'
import { PublicRequestError } from '../../../foundation/http/request-chain.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../../foundation/idempotency/http-idempotency.js'
import { IdempotentWriteRetryLaterError } from '../../../foundation/idempotency/run-idempotent-write.js'
import { calculateCanonicalJsonSha256 } from '../../../foundation/json/canonical-json-sha256.js'
import type { PolicyRulesPort } from '../../../foundation/policy/require-policy.js'
import type { PrivateObjectStorage } from '../../../foundation/storage/cloudbase-storage-http-adapter.js'
import { detectCoverImageMime } from '../../../user-plant/domain/cover-asset.js'
import { buildVisualUploadPath, isOwnVisualFileId, mimeOfVisualFileId } from '../domain/visual-image-path.js'
import type { MysqlVisualDiagnosisRepository, NewVisualImage } from '../repository/mysql-visual-diagnosis-repository.js'
import { assertVisualCapability } from './visual-capability.js'
import type { CreateVisualRef, ReadCapabilitySnapshot, ReadVisualAssetRules, RunVisualIdempotentWrite } from './visual-ports.js'

/**
 * 视觉诊断图片：取上传路径与登记（diagnosis-visual-api.md §2.1）。
 *
 * 通俗说明：沿用封面上传的「前端直传私有目录 + 服务端登记校验」——服务端先给出本人专属目录，前端上传后再来登记；
 * 登记时服务端自己下载核对：目录属于本人、真实类型（按文件魔数）在白名单里、大小不超过上限，绝不相信客户端声明。
 */

const sha256 = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
const unavailable = () => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')

/** 取上传路径的依赖。 */
export interface GetVisualUploadTargetsDependencies {
  /** 读取能力快照（判断是否拥有视觉诊断能力）。 */
  readonly readCapabilitySnapshot: ReadCapabilitySnapshot
  /** 读取上传资产策略。 */
  readonly readAssetRules: ReadVisualAssetRules
  /** 生成 32 位随机十六进制。 */
  readonly randomHex: () => string
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 上传路径响应（diagnosis-visual-api/v1 UploadTargetsResponse）。 */
export interface VisualUploadTargetsResponse {
  /** 每张图一条上传目标。 */
  readonly targets: readonly {
    /** 本次可用的云存储路径（不含扩展名）。 */
    readonly cloudPath: string
    /** 允许上传的图片类型。 */
    readonly allowedMimeTypes: readonly string[]
    /** 单张图片字节上限。 */
    readonly maxImageBytes: number
  }[]
}

/** 创建「取上传路径」查询（只读，不落库、不预占）。 */
export function createGetVisualUploadTargets(deps: GetVisualUploadTargetsDependencies) {
  return async (input: { readonly principal: UserPrincipalDto; readonly count: number }): Promise<VisualUploadTargetsResponse> => {
    await assertVisualCapability(deps.readCapabilitySnapshot, input.principal)
    const rules = await deps.readAssetRules()
    if (rules === null) {
      throw unavailable()
    }
    const nowMs = deps.now()
    return {
      targets: Array.from({ length: input.count }, () => ({
        cloudPath: buildVisualUploadPath(input.principal.user_id, nowMs, deps.randomHex()),
        allowedMimeTypes: [...rules.allowedMimeTypes],
        maxImageBytes: rules.maxImageBytes
      }))
    }
  }
}

/** 登记图片的依赖。 */
export interface RegisterVisualImagesDependencies {
  /** 读取能力快照（判断是否拥有视觉诊断能力）。 */
  readonly readCapabilitySnapshot: ReadCapabilitySnapshot
  /** 读取上传资产策略。 */
  readonly readAssetRules: ReadVisualAssetRules
  /** 读取 HTTP 写入策略（幂等保留期）。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /** 私有云存储（下载核对）。 */
  readonly storage: PrivateObjectStorage
  /** 幂等写端口（同键同参返回首次结果）。 */
  readonly runIdempotent: RunVisualIdempotentWrite
  /** 视觉诊断仓储（只用到下列方法）。 */
  readonly repository: Pick<MysqlVisualDiagnosisRepository, 'readUserInternalId' | 'insertImages'>
  /** 生成高熵公开引用。 */
  readonly createRef: CreateVisualRef
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 待登记的一个云文件。 */
export interface VisualImageFileRequest {
  /** 小程序上传返回的云文件 ID（cloud://…）。 */
  readonly fileId: string
}

/** 登记图片的输入。 */
export interface RegisterVisualImagesInput {
  /** 已解析的登录主体。 */
  readonly principal: UserPrincipalDto
  /** 1～3 个云文件 ID（已通过 DTO 校验）。 */
  readonly files: readonly VisualImageFileRequest[]
  /** 原始 Idempotency-Key（只用其摘要）。 */
  readonly idempotencyKey: string
}

/** 下载核对一张图片：归属、类型、大小与真实魔数。 */
async function inspectFile(
  deps: RegisterVisualImagesDependencies,
  principal: UserPrincipalDto,
  allowed: readonly string[],
  maxImageBytes: number,
  fileId: string
): Promise<Omit<NewVisualImage, 'imageRef'>> {
  const declared = mimeOfVisualFileId(fileId)
  if (!isOwnVisualFileId(fileId, principal.user_id) || declared === null || !allowed.includes(declared)) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '图片不在本人上传目录或类型不受支持')
  }
  let bytes: Uint8Array | 'too_large'
  try {
    const url = await deps.storage.getDownloadUrl(fileId)
    if (url === null) {
      throw new PublicRequestError(404, 'NOT_FOUND', '图片不存在')
    }
    bytes = await deps.storage.download(url, maxImageBytes)
  } catch (error) {
    throw error instanceof PublicRequestError ? error : unavailable()
  }
  if (bytes === 'too_large') {
    throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '图片超过大小上限')
  }
  const actual = detectCoverImageMime(bytes)
  if (actual === null || actual !== declared) {
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '图片类型不受支持')
  }
  return { storageFileId: fileId, mimeType: actual, byteSize: bytes.length, contentSha256: sha256(bytes) }
}

/** 创建「登记图片」用例。 */
export function createRegisterVisualImagesUseCase(deps: RegisterVisualImagesDependencies) {
  return async (input: RegisterVisualImagesInput): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    await assertVisualCapability(deps.readCapabilitySnapshot, input.principal)
    const [rules, writeRules] = await Promise.all([deps.readAssetRules(), deps.readHttpWriteRules()])
    if (rules === null || writeRules === null) {
      throw unavailable()
    }
    const inspected: Omit<NewVisualImage, 'imageRef'>[] = []
    for (const file of input.files) {
      inspected.push(await inspectFile(deps, input.principal, rules.allowedMimeTypes, rules.maxImageBytes, file.fileId))
    }
    const nowMs = deps.now()
    const path = '/api/v2/diagnosis/visual/images'
    return deps.runIdempotent(
      {
        principalType: 'user',
        principalScopeHash: sha256(input.principal.user_id),
        httpMethod: 'POST',
        normalizedPath: path,
        operationId: 'registerVisualDiagnosisImages',
        idempotencyKeyHash: sha256(input.idempotencyKey),
        requestHash: calculateCanonicalJsonSha256({ path, body: { files: input.files.map(file => ({ fileId: file.fileId })) } }),
        createdAtMs: nowMs,
        expiresAtMs: nowMs + idempotencyRetentionMs(writeRules)
      },
      async context => {
        const userInternalId = await deps.repository.readUserInternalId(context, input.principal.user_id)
        if (userInternalId === null) {
          throw new IdempotentWriteRetryLaterError('用户状态暂不可用')
        }
        const images = await deps.repository.insertImages(context, {
          userInternalId,
          images: inspected.map(image => ({ ...image, imageRef: deps.createRef('dvi_') })),
          nowMs
        })
        return { status: 200, body: { data: { images: images.map(image => ({ imageRef: image.imageRef, status: 'registered' })) } } }
      }
    )
  }
}
