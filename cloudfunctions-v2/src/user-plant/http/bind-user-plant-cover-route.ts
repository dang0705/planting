import { createHash, randomBytes } from 'node:crypto'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPrincipalDto } from '../../contracts/types.js'
import type { UserPlantAssetResponseDto } from '../../contracts/user-plant-cover-asset-contract.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies
} from '../../foundation/http/authenticated-json-route.js'
import { PublicRequestError, type PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { PrivateObjectStorage } from '../../foundation/storage/cloudbase-storage-http-adapter.js'
import type { BindUserPlantCoverInput } from '../application/bind-user-plant-cover.js'
import { COVER_ASSET_RULES, detectCoverImageMime, isOwnCoverFileId } from '../domain/cover-asset.js'

/** route-registry.json 中 bindUserPlantAsset 的冻结登记（user-plant-cover-asset/v1）。 */
export const bindUserPlantCoverRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/{userPlantRef}/assets',
  operationId: 'bindUserPlantAsset',
  security: 'authenticated'
}

/** 登记封面路由依赖。 */
export interface BindUserPlantCoverRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** 云存储 Provider；未配置（缺凭证或环境）时为 undefined，登记返回 503。 */
  readonly storage: PrivateObjectStorage | undefined
  /** 事务化登记用例。 */
  readonly bindCover: (input: BindUserPlantCoverInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 可选资产引用生成器；缺省 ast_ + 18 字节随机数 base64url。 */
  readonly createAssetRef?: () => string
}

/** 已严格解析的登记 DTO。 */
interface BindCoverDto {
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
  /** 请求正文中的云存储 fileID（尚未校验目录归属）。 */ readonly fileId: string
  /** 请求正文中客户端计算的文件 SHA-256。 */ readonly contentSha256: string
}

const validators = createPublicContractValidators()
const userPlantRefPattern = /^upl_[A-Za-z0-9_-]{8,60}$/u
const passThroughErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])
const unavailable = () => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
const rejected = (message: string) => new PublicRequestError(400, 'VALIDATION_FAILED', message)

/**
 * `POST …/assets` 处理器（user-plant-cover-asset/v1 §2）：DTO → 目录归属 → 换链接 → 限量下载 → 哈希与魔数复核 → 事务登记。
 * 存储调用在事务外完成，避免持锁等待网络；任一复核失败 400 且不进入事务；Provider 异常 503。
 */
export function createBindUserPlantCoverRouteHandler(dependencies: BindUserPlantCoverRouteDependencies): RouteHandler {
  const createAssetRef = dependencies.createAssetRef ?? (() => `ast_${randomBytes(18).toString('base64url')}`)
  return createAuthenticatedJsonRouteHandler<UserPrincipalDto, BindCoverDto, UserPlantAssetResponseDto>(dependencies, {
    route: bindUserPlantCoverRoute,
    kind: 'write',
    parse: ({ pathParameters, query, body }) => {
      const userPlantRef = pathParameters.userPlantRef ?? ''
      if ([...query.keys()].length > 0 || !userPlantRefPattern.test(userPlantRef) || !validators.bindUserPlantAssetRequest(body)) { throw validationFailed() }
      return { userPlantRef, fileId: body.fileId, contentSha256: body.contentSha256 }
    },
    execute: async ({ principal, dto, nowMs, idempotency }) => {
      if (idempotency === null) { throw new Error('封面登记缺少幂等占位输入') }
      if (!isOwnCoverFileId(dto.fileId, principal.user_id)) { throw rejected('文件不在本人封面目录') }
      const storage = dependencies.storage
      if (storage === undefined) { throw unavailable() }
      let url: string | null
      let bytes: Uint8Array | 'too_large'
      try {
        url = await storage.getDownloadUrl(dto.fileId)
        bytes = url === null ? 'too_large' : await storage.download(url, COVER_ASSET_RULES.maxImageBytes)
      } catch { throw unavailable() }
      if (url === null) { throw rejected('文件不存在') }
      if (bytes === 'too_large') { throw rejected('图片超过 5 MiB') }
      if (createHash('sha256').update(bytes).digest('hex') !== dto.contentSha256) { throw rejected('文件内容与摘要不一致') }
      const mime = detectCoverImageMime(bytes)
      if (mime === null || !COVER_ASSET_RULES.allowedMimeTypes.includes(mime)) { throw rejected('只支持 JPEG、PNG、WebP 图片') }
      return dependencies.bindCover({ userRef: principal.user_id, userPlantRef: dto.userPlantRef, fileId: dto.fileId, contentSha256: dto.contentSha256,
        url, assetRef: createAssetRef(), nowMs, idempotency })
    },
    validateData: data => validators.userPlantAssetResponse(data),
    validateError: body => validators.errorResponse(body),
    passThroughErrors
  })
}
