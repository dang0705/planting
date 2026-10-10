import { createHash } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import Ajv, { type JSONSchemaType } from 'ajv'

import { createPublicContractValidators } from '../../contracts/index.js'
import type {
  UserCapabilitySnapshotDto,
  UserPlantDto,
  UserPlantRef,
  UserPrincipalDto
} from '../../contracts/types.js'
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
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import {
  CapabilitySnapshotExpiredError,
  CapabilitySnapshotUnavailableError
} from '../../subscription/repository/mysql-capability-snapshot-reader.js'
import type {
  RestoreUserPlantApplicationInput,
  UserPlantLifecycleApplicationInput
} from '../application/transition-user-plant-lifecycle.js'

/** 归档与恢复的公开路由分别锁定动作名，避免两类幂等命令相互重放。 */
export const archiveUserPlantRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/{userPlantRef}/archive',
  operationId: 'archiveUserPlant',
  security: 'authenticated'
}

/** 恢复路由与归档共享严格版本 DTO，但额外读取服务端能力快照。 */
export const restoreUserPlantRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/{userPlantRef}/restore',
  operationId: 'restoreUserPlant',
  security: 'authenticated'
}

/** 归档/恢复 HTTP 适配层只接收可信用例与服务端依赖。 */
export type TransitionUserPlantRouteDependencies = {
  /** 身份域将青花植 Bearer 解析成统一用户；不信任客户端声明的 user_id。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 恢复前从订阅域读取当前用户的可信能力快照；归档不得调用。 */
  readonly resolveCapabilitySnapshot: (
    principal: UserPrincipalDto
  ) => Promise<UserCapabilitySnapshotDto>
  /** 在同一事务内完成归档、版本比较、公开投影和幂等结果。 */
  readonly archiveUserPlant: (
    input: UserPlantLifecycleApplicationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 在同一用户锁下重新裁决容量后恢复，不接受客户端能力字段。 */
  readonly restoreUserPlant: (
    input: RestoreUserPlantApplicationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 只接收脱敏请求结果的审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 请求限制阶段保留的最小数据；原始请求头绝不进入公开响应。 */
type RestrictedRequest = {
  /** 仅用于读取青花植 Bearer、内容类型和幂等键。 */
  readonly headers: IncomingHttpHeaders
  /** 大小受限的 JSON 原文。 */
  readonly bodyText: string
  /** 分发器从冻结路由解析的公开植物引用。 */
  readonly pathParameters: RoutePathParameters
}

/** 严格 DTO：公开植物引用、乐观锁版本和幂等键。 */
type TransitionRequestDto = {
  /** 当前用户选择操作的植物公开引用。 */
  readonly userPlantRef: string
  /** 调用方最后读取到的正整数版本。 */
  readonly expectedVersion: number
  /** 单次产品动作的重试键，仅用于请求内哈希。 */
  readonly idempotencyKey: string
}

/** 恢复命令在归档命令基础上增加受信能力快照。 */
type LifecycleCommand = UserPlantLifecycleApplicationInput & {
  /** 仅首次恢复执行时读取快照；幂等重放先由应用服务读回首次结果。 */
  readonly resolveCapabilitySnapshot: (() => Promise<UserCapabilitySnapshotDto>) | undefined
}

/** 单次 JSON 请求体上限，与用户植物创建入口一致。 */
const bodyLimitBytes = 1_048_576
/** 幂等结果保留七天；同键重试在此期间必须读回首次结果。 */
const idempotencyRetentionMs = 604_800_000
/** 只用于公开 HTTP 协议转换，不参与领域状态机判断。 */
const validationFailureStatus = 400
const unauthenticatedStatus = 401
const conflictStatus = 409
const payloadTooLargeStatus = 413
const unsupportedMediaTypeStatus = 415
const serviceUnavailableStatus = 503
const successfulTransitionStatus = 200
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
const validators = createPublicContractValidators()
const ajv = new Ajv({ allErrors: true })
const versionBodySchema: JSONSchemaType<{ expectedVersion: number }> = {
  type: 'object',
  additionalProperties: false,
  required: ['expectedVersion'],
  properties: { expectedVersion: { type: 'integer', minimum: 1 } }
}
const pathSchema: JSONSchemaType<{ userPlantRef: string }> = {
  type: 'object',
  additionalProperties: false,
  required: ['userPlantRef'],
  properties: {
    userPlantRef: { type: 'string', maxLength: 64, pattern: '^upl_[A-Za-z0-9_-]{8,}$' }
  }
}
const validateVersionBody = ajv.compile(versionBodySchema)
const validatePath = ajv.compile(pathSchema)

/** 对用户引用、幂等键和请求语义作不可逆摘要，数据库不保存其明文。 */
function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** 内容类型和字节上限先于身份与 DTO 校验，避免无界请求体消耗。 */
async function readRestrictedRequest(
  request: IncomingMessage,
  pathParameters: RoutePathParameters
): Promise<RestrictedRequest> {
  const mediaType = request.headers['content-type']
  if (
    typeof mediaType !== 'string' ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(mediaType)
  ) {
    request.resume()
    throw new PublicRequestError(
      unsupportedMediaTypeStatus,
      'UNSUPPORTED_MEDIA_TYPE',
      '请求内容类型不受支持'
    )
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > bodyLimitBytes) {
      throw new PublicRequestError(payloadTooLargeStatus, 'PAYLOAD_TOO_LARGE', '请求内容过大')
    }
    chunks.push(buffer)
  }
  return {
    headers: request.headers,
    bodyText: Buffer.concat(chunks).toString('utf8'),
    pathParameters
  }
}

/** 拒绝额外字段、非安全整数版本和无效的公开引用或幂等键。 */
function parseRequest(input: RestrictedRequest): TransitionRequestDto {
  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    throw new PublicRequestError(validationFailureStatus, 'VALIDATION_FAILED', '请求参数不合法')
  }
  const path = { ...input.pathParameters }
  const key = input.headers['idempotency-key']
  if (
    !validateVersionBody(body) ||
    !Number.isSafeInteger(body.expectedVersion) ||
    !validatePath(path) ||
    typeof key !== 'string' ||
    !validIdempotencyKey.test(key)
  ) {
    throw new PublicRequestError(validationFailureStatus, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return {
    userPlantRef: path.userPlantRef,
    expectedVersion: body.expectedVersion,
    idempotencyKey: key
  }
}

/** 归档与恢复共同允许透传的确定性公开错误。 */
const sharedTransitionErrors: readonly string[] = [
  'PRINCIPAL_INVALID',
  'USER_PLANT_NOT_FOUND',
  'USER_PLANT_VERSION_CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'SERVICE_UNAVAILABLE'
]
/** 只有恢复会重新核验能力快照；user-plant.md 规定归档路由不声明这两项能力错误。 */
const restoreOnlyErrors: readonly string[] = ['CAPABILITY_DENIED', 'CAPABILITY_SNAPSHOT_EXPIRED']

/** 只把该路由已登记的确定性错误和公开用户植物投影交给响应链；未登记错误泛化为 500。 */
function unwrapResult(route: FrozenRoute, result: HttpIdempotencyPublicResponseSnapshot): UserPlantDto {
  if ('error' in result.body) {
    if (!validators.errorResponse(result.body)) {
      throw new Error('生命周期用例返回无效公开错误')
    }
    const { type, message } = result.body.error
    const allowed =
      sharedTransitionErrors.includes(type) ||
      (route.operationId === restoreUserPlantRoute.operationId && restoreOnlyErrors.includes(type))
    if (!allowed) {
      throw new Error('生命周期用例返回未登记的公开错误')
    }
    throw new PublicRequestError(result.status, type, message)
  }
  if (result.status !== successfulTransitionStatus || !validators.userPlant(result.body.data)) {
    throw new Error('生命周期用例返回无效公开投影')
  }
  return result.body.data
}

/** 为归档或恢复构造固定请求链，业务写入与归属校验均由原子用例完成。 */
function createTransitionRouteHandler(
  route: FrozenRoute,
  dependencies: TransitionUserPlantRouteDependencies
): RouteHandler {
  return (request, response, pathParameters) =>
    createNodeRequestChainHandler<
      RestrictedRequest,
      ResolveUserPrincipalCommand,
      UserPrincipalDto,
      TransitionRequestDto,
      LifecycleCommand,
      LifecycleCommand,
      HttpIdempotencyPublicResponseSnapshot,
      UserPlantDto
    >({
      requestLimits: {
        kind: 'execute',
        run: rawRequest => readRestrictedRequest(rawRequest, pathParameters)
      },
      identityValidate: {
        kind: 'execute',
        run: restricted => {
          const bearerToken = extractBearerToken(restricted.headers)
          if (bearerToken === null) {
            throw new PublicRequestError(
              unauthenticatedStatus,
              'PRINCIPAL_INVALID',
              '身份凭证无效或已过期'
            )
          }
          return { bearerToken, nowMs: dependencies.now() }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            return await dependencies.resolvePrincipal(command)
          } catch (error: unknown) {
            if (
              error instanceof UnifiedUserPrincipalResolveError &&
              error.type === 'PRINCIPAL_INVALID'
            ) {
              throw new PublicRequestError(
                unauthenticatedStatus,
                'PRINCIPAL_INVALID',
                '身份凭证无效或已过期'
              )
            }
            throw error
          }
        }
      },
      objectOwnership: {
        kind: 'not_applicable',
        reason:
          '归属检查与生命周期写入必须在同一事务内按 owner 锁定，避免请求链前置读取产生竞争窗口'
      },
      dtoValidate: { kind: 'execute', run: parseRequest },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          const occurredAtMs = dependencies.now()
          let resolveCapabilitySnapshot: (() => Promise<UserCapabilitySnapshotDto>) | undefined
          if (route.operationId === restoreUserPlantRoute.operationId) {
            resolveCapabilitySnapshot = async () => {
              let snapshot: UserCapabilitySnapshotDto
              try {
                snapshot = await dependencies.resolveCapabilitySnapshot(principal)
              } catch (error: unknown) {
                if (error instanceof CapabilitySnapshotExpiredError) {
                  throw new PublicRequestError(
                    conflictStatus,
                    'CAPABILITY_SNAPSHOT_EXPIRED',
                    '能力快照已失效，请重新请求'
                  )
                }
                if (error instanceof CapabilitySnapshotUnavailableError) {
                  throw new PublicRequestError(
                    serviceUnavailableStatus,
                    'SERVICE_UNAVAILABLE',
                    '服务暂时不可用'
                  )
                }
                throw error
              }
              if (
                !validators.capabilitySnapshot(snapshot) ||
                snapshot.subjectType !== 'user' ||
                snapshot.user_id !== principal.user_id
              ) {
                throw new Error('服务端能力快照不合法')
              }
              return snapshot
            }
          }
          return {
            principal,
            userPlantRef: dto.userPlantRef as UserPlantRef,
            expectedVersion: dto.expectedVersion,
            occurredAtMs,
            resolveCapabilitySnapshot,
            idempotency: {
              principalType: 'user',
              principalScopeHash: digest(principal.user_id),
              httpMethod: 'POST',
              normalizedPath: route.path,
              operationId: route.operationId,
              idempotencyKeyHash: digest(dto.idempotencyKey),
              requestHash: digest(
                JSON.stringify({
                  userPlantRef: dto.userPlantRef,
                  expectedVersion: dto.expectedVersion
                })
              ),
              createdAtMs: occurredAtMs,
              expiresAtMs: occurredAtMs + idempotencyRetentionMs
            } satisfies HttpIdempotencyReservationInput
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => {
          if (route.operationId === restoreUserPlantRoute.operationId) {
            if (domainDecision.resolveCapabilitySnapshot === undefined) {
              throw new Error('恢复缺少服务端能力快照读取器')
            }
            return dependencies.restoreUserPlant({
              ...domainDecision,
              resolveCapabilitySnapshot: domainDecision.resolveCapabilitySnapshot
            })
          }
          return dependencies.archiveUserPlant(domainDecision)
        }
      },
      publicResponse: { kind: 'execute', run: result => unwrapResult(route, result) },
      writeAudit: dependencies.writeAudit
    })(request, response)
}

/** 创建用户植物归档 HTTP 处理器。 */
export function createArchiveUserPlantRouteHandler(
  dependencies: TransitionUserPlantRouteDependencies
): RouteHandler {
  return createTransitionRouteHandler(archiveUserPlantRoute, dependencies)
}

/** 创建用户植物恢复 HTTP 处理器。 */
export function createRestoreUserPlantRouteHandler(
  dependencies: TransitionUserPlantRouteDependencies
): RouteHandler {
  return createTransitionRouteHandler(restoreUserPlantRoute, dependencies)
}
