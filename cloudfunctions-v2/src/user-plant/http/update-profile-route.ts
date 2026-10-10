import { createHash } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import Ajv from 'ajv'
import type { UserPlantDto, UserPlantRef, UserPrincipalDto } from '../../contracts/types.js'
import { errorResponseSchema } from '../../contracts/schemas.js'
import { userPlantSchema } from '../../contracts/user-plant-schema.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type {
  FrozenRoute,
  RouteHandler,
  RoutePathParameters
} from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import {
  serializeCanonicalJson,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import type {
  GetUserPlantApplicationInput,
  GetUserPlantApplicationResponse
} from '../application/get-user-plant.js'
import type { MeasuredProfileApplicationInput } from '../application/save-measured-profile.js'
import { lockUserPlantProfilePatch, type UserPlantProfilePatch } from '../domain/profile-patch.js'
import { ENVIRONMENT_GROUP_KEYS, type PotShapeProfile, type SubstrateProfile } from '../domain/environment-profile.js'
import type { CareContextGroupPatch } from '../repository/mysql-user-plant-environment-repository.js'
import type { UserPlantProfileCompletenessPolicy } from '../domain/evaluate-profile-completeness.js'

/** 已登记档案修改路由；引用模板用于幂等隔离，不能替换为某次请求的实际路径。 */
export const updateProfileRoute: FrozenRoute = {
  method: 'PATCH',
  path: '/api/v2/user-plants/{userPlantRef}',
  operationId: 'updateUserPlant',
  security: 'authenticated'
}

/** 当前请求可信发布策略；没有发布快照时不准进入写用例。 */
export interface ProfileWritePolicy {
  /** 已确认的档案策略版本，只从服务端读取，禁止客户端指定。 */
  readonly profileVersion: string
  /** 幂等收据保留毫秒数，由发布策略明确给出，不设隐式默认。 */
  readonly idempotencyRetentionMs: number
  /** 已发布完整度策略原文（user-plant-profile/v1）；缺失时失败关闭，不能跳过首株完整判定。 */
  readonly profilePolicy?: UserPlantProfileCompletenessPolicy
}
/** HTTP边界只处理协议，归属和保存分别调用已有应用端口。 */
export interface UpdateProfileRouteDependencies {
  /** 身份域验真青花植会话并解析平台无关统一用户。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 同用户植物读取端口，在正文DTO准入之前校验对象归属。 */
  readonly getUserPlant: (
    input: GetUserPlantApplicationInput
  ) => Promise<GetUserPlantApplicationResponse>
  /** 同事务档案保存与幂等收据用例，不接受客户端策略或时间。 */
  readonly saveProfile: (
    input: MeasuredProfileApplicationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 发布的原始请求字节上限；未发布时为空并在第一阶段拒绝。 */
  readonly maxBodyBytes: number | null
  /** 当前主体对应的只读发布策略快照，缺失或损坏必须失败关闭。 */
  readonly resolveWritePolicy: (principal: UserPrincipalDto) => Promise<ProfileWritePolicy | null>
  /** weather 城市目录只读：位置分组的 cityRef 是否存在；未接入时提交位置失败关闭为503。 */
  readonly cityExists?: (cityRef: string) => Promise<boolean>
  /** 服务端可信UTC毫秒时钟，客户端不得覆盖。 */
  readonly now: () => number
  /** 固定请求链产出的脱敏结果事件端口，不记录正文或凭据。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}
/** 限制阶段保存后续认证和解析所需的最小请求数据。 */
interface RestrictedRequest {
  /** 原始请求头仅用于认证、媒体和幂等，不返回或记录。 */
  readonly headers: IncomingHttpHeaders
  /** 原始头列表用于检测Node可能合并的重复幂等头。 */
  readonly rawHeaders: readonly string[]
  /** 在已发布字节限制内完整读取的JSON文本。 */
  readonly bodyText: string
  /** 分发器给出的路径引用，须验证形状后才进入归属读取。 */
  readonly pathParameters: RoutePathParameters
}
/** 通过严格准入的客户端事实，尚不包含任何服务端策略或时间。 */
interface ProfileRequestDto {
  /** 用户植物公开引用，已经过路径合同验证。 */
  readonly userPlantRef: UserPlantRef
  /** 已冻结的版本和昵称或完整测量事实，省略表示保留。 */
  readonly patch: Readonly<UserPlantProfilePatch>
  /** 单值ASCII请求重试键，仅用于计算摘要。 */
  readonly idempotencyKey: string
}
const ajv = new Ajv({ strict: true, allErrors: true })
const validatePlant = ajv.compile<UserPlantDto>(userPlantSchema)
const validateError = ajv.compile(errorResponseSchema)
const keyPattern = /^[\x20-\x7e]{8,128}$/u
/** 稳定安全参数错误，不附加解析异常或原始请求内容。 */
function invalid(): PublicRequestError {
  return new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
}
/** 发布限制或策略缺失使用固定503，禁止继续猜测或写入。 */
function unavailable(): PublicRequestError {
  return new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
}
/** 公开引用是路径合同，不接受其他参数或客户端归属字段。 */
function pathRef(parameters: RoutePathParameters): UserPlantRef {
  const ref = parameters.userPlantRef
  if (
    Object.keys(parameters).length !== 1 ||
    typeof ref !== 'string' ||
    ref.length > 64 ||
    !/^upl_[A-Za-z0-9_-]{8,}$/u.test(ref)
  ) {
    throw invalid()
  }
  return ref as UserPlantRef
}
/** 请求流按实际字节累计；超限时继续排空，保留稳定HTTP拒绝响应。 */
async function restrict(
  request: IncomingMessage,
  parameters: RoutePathParameters,
  maximum: number | null
): Promise<RestrictedRequest> {
  if (maximum === null || !Number.isSafeInteger(maximum) || maximum <= 0) {
    request.resume()
    throw unavailable()
  }
  const media = request.headers['content-type']
  if (typeof media !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(media)) {
    request.resume()
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求内容类型不受支持')
  }
  const chunks: Buffer[] = []
  let bytes = 0,
    oversized = false
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > maximum) {
      oversized = true
      chunks.length = 0
    }
    if (!oversized) {
      chunks.push(buffer)
    }
  }
  if (oversized) {
    throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
  }
  return {
    headers: request.headers,
    rawHeaders: request.rawHeaders,
    bodyText: Buffer.concat(chunks).toString('utf8'),
    pathParameters: parameters
  }
}
/** 独立校验JSON事实和幂等头；正文永不接收profileVersion或服务端时间。 */
function parse(input: RestrictedRequest): ProfileRequestDto {
  try {
    const key = input.headers['idempotency-key']
    let headerCount = 0
    for (let i = 0; i < input.rawHeaders.length; i += 2) {
      if (input.rawHeaders[i]!.toLowerCase() === 'idempotency-key') {
        headerCount += 1
      }
    }
    if (headerCount !== 1 || typeof key !== 'string' || !keyPattern.test(key)) {
      throw invalid()
    }
    return {
      userPlantRef: pathRef(input.pathParameters),
      patch: lockUserPlantProfilePatch(JSON.parse(input.bodyText)),
      idempotencyKey: key
    }
  } catch {
    throw invalid()
  }
}
/** 主体和幂等键原文不能保存，规范化业务事实摘要不含服务端时间或策略。 */
function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}
/** 只允许已冻结应用错误及其对应状态，严格校验完整公开DTO。 */
function project(result: HttpIdempotencyPublicResponseSnapshot): UserPlantDto {
  if (!result || !result.body || Object.keys(result.body).length !== 1) {
    throw new Error('应用收据形状不合法')
  }
  if ('error' in result.body) {
    if (!validateError(result.body)) {
      throw new Error('应用错误未通过严格公开合同')
    }
    const error = result.body.error
    const status = {
      USER_PLANT_NOT_FOUND: 404,
      USER_PLANT_VERSION_CONFLICT: 409,
      IDEMPOTENCY_CONFLICT: 409,
      SERVICE_UNAVAILABLE: 503
    } as const
    if (!(error.type in status) || result.status !== status[error.type as keyof typeof status]) {
      throw new Error('应用错误未登记或状态不一致')
    }
    throw new PublicRequestError(result.status, error.type as keyof typeof status, error.message)
  }
  if (result.status !== 200 || !validatePlant(result.body.data)) {
    throw new Error('档案保存未返回完整公开用户植物')
  }
  return result.body.data
}
/** 固定顺序：限制→认证→统一主体→归属→DTO→可信策略命令→用例→严格公开响应。 */
export function createUpdateProfileRouteHandler(
  dependencies: UpdateProfileRouteDependencies
): RouteHandler {
  return (request, response, pathParameters) =>
    createNodeRequestChainHandler<
      RestrictedRequest,
      ResolveUserPrincipalCommand,
      UserPrincipalDto,
      ProfileRequestDto,
      MeasuredProfileApplicationInput,
      MeasuredProfileApplicationInput,
      HttpIdempotencyPublicResponseSnapshot,
      UserPlantDto
    >({
      requestLimits: {
        kind: 'execute',
        run: raw => restrict(raw, pathParameters, dependencies.maxBodyBytes)
      },
      identityValidate: {
        kind: 'execute',
        run: restricted => {
          const bearerToken = extractBearerToken(restricted.headers)
          if (bearerToken === null) {
            throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
          }
          return { bearerToken, nowMs: dependencies.now() }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            return await dependencies.resolvePrincipal(command)
          } catch (cause) {
            if (
              cause instanceof UnifiedUserPrincipalResolveError &&
              cause.type === 'PRINCIPAL_INVALID'
            ) {
              throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
            }
            throw cause
          }
        }
      },
      objectOwnership: {
        kind: 'execute',
        run: async ({ request: restricted, principal }) => {
          const result = await dependencies.getUserPlant({
            principal,
            userPlantRef: pathRef(restricted.pathParameters)
          })
          if (
            result.status === 404 &&
            validateError(result.body) &&
            result.body.error.type === 'USER_PLANT_NOT_FOUND'
          ) {
            throw new PublicRequestError(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在')
          }
          if (
            result.status !== 200 ||
            !('data' in result.body) ||
            !validatePlant(result.body.data) ||
            result.body.data.user_plant_id !== restricted.pathParameters.userPlantRef
          ) {
            throw new Error('归属读取未返回严格目标植物')
          }
        }
      },
      dtoValidate: { kind: 'execute', run: parse },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          const policy = await dependencies.resolveWritePolicy(principal)
          const now = dependencies.now()
          if (
            !policy ||
            typeof policy.profileVersion !== 'string' ||
            policy.profileVersion.trim() !== policy.profileVersion ||
            !/\S/u.test(policy.profileVersion) ||
            [...policy.profileVersion].length > 32 ||
            policy.profilePolicy === undefined ||
            !Number.isSafeInteger(policy.idempotencyRetentionMs) ||
            policy.idempotencyRetentionMs <= 0 ||
            !Number.isSafeInteger(now) ||
            now < 0 ||
            !Number.isSafeInteger(now + policy.idempotencyRetentionMs) ||
            now + policy.idempotencyRetentionMs > 8640000000000000
          ) {
            throw unavailable()
          }
          const location = dto.patch.location
          if (location !== undefined && location !== null) {
            let exists: boolean
            try {
              if (!dependencies.cityExists) { throw unavailable() }
              exists = await dependencies.cityExists(location.cityRef)
            } catch { throw unavailable() }
            if (!exists) { throw new PublicRequestError(400, 'VALIDATION_FAILED', '城市不在支持列表') }
          }
          const groups = Object.fromEntries(ENVIRONMENT_GROUP_KEYS.filter(key => key in dto.patch).map(key => [key, dto.patch[key] ?? null]))
          const facts = {
            userPlantRef: dto.userPlantRef,
            version: dto.patch.version,
            ...('nickname' in dto.patch ? { nickname: dto.patch.nickname! } : {}),
            ...('measuredPot' in dto.patch ? { measuredPot: dto.patch.measuredPot! } : {}),
            ...groups
          }
          const environment = Object.fromEntries(['location', 'lighting', 'ventilation'].filter(key => key in groups).map(key => [key, groups[key]])) as CareContextGroupPatch
          return {
            command: {
              userRef: principal.user_id,
              userPlantRef: dto.userPlantRef,
              expectedVersion: dto.patch.version,
              ...('nickname' in dto.patch ? { nickname: dto.patch.nickname } : {}),
              ...('measuredPot' in dto.patch ? { measuredPot: dto.patch.measuredPot } : {}),
              ...('potShape' in groups ? { potShape: groups.potShape as PotShapeProfile | null } : {}),
              ...('substrate' in groups ? { substrate: groups.substrate as SubstrateProfile | null } : {}),
              profileVersion: policy.profileVersion,
              occurredAtMs: now
            },
            environment,
            profilePolicy: policy.profilePolicy,
            idempotency: {
              principalType: 'user',
              principalScopeHash: digest(principal.user_id),
              httpMethod: 'PATCH',
              normalizedPath: updateProfileRoute.path,
              operationId: updateProfileRoute.operationId,
              idempotencyKeyHash: digest(dto.idempotencyKey),
              requestHash: digest(serializeCanonicalJson(facts as unknown as CanonicalJsonValue)),
              createdAtMs: now,
              expiresAtMs: now + policy.idempotencyRetentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => dependencies.saveProfile(domainDecision)
      },
      publicResponse: { kind: 'execute', run: project },
      writeAudit: dependencies.writeAudit
    })(request, response)
}
