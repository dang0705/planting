import { createHash, randomBytes } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import { createPublicContractValidators } from '../../contracts/index.js'
import type {
  CreateUserPlantResponseDto,
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserPrincipalDto
} from '../../contracts/types.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import {
  PublicRequestError,
  type RequestChainAuditEvent
} from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import { CapabilitySnapshotUnavailableError } from '../../subscription/repository/mysql-capability-snapshot-reader.js'
import type { CreateUserPlantApplicationInput } from '../application/create-user-plant.js'

/** 创建路由登记；业务含义由用户植物合同而非通用分发器决定。 */
export const createUserPlantRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants',
  operationId: 'createUserPlant',
  security: 'authenticated'
}

/** 创建路由只依赖可信的服务端端口，绝不接受客户端能力或植物引用。 */
export type CreateUserPlantRouteDependencies = {
  /** 统一身份域解析 Bearer 所关联的登录主体。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 订阅域或服务端适配器给出的请求级能力快照；没有可信快照时必须拒绝。 */
  readonly resolveCapabilitySnapshot: (
    principal: UserPrincipalDto
  ) => Promise<UserCapabilitySnapshotDto>
  /** 事务化创建用例，负责幂等、归属、数量上限、写入与读回。 */
  readonly createUserPlant: (
    input: CreateUserPlantApplicationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 服务端 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 脱敏的请求结果审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 限制阶段产出的安全请求数据；原始 Bearer 不得进入响应或审计。 */
type RestrictedCreateRequest = {
  /** 只用于提取 Bearer、媒体类型和幂等键的请求头。 */
  readonly headers: IncomingHttpHeaders
  /** 在大小限制内读取的原始 JSON 文本。 */
  readonly bodyText: string
}

/** 已校验的创建 DTO 与必需幂等头。 */
type CreateRequestDto = {
  /** 严格空对象，不承载任何客户端业务字段。 */
  readonly body: Record<string, never>
  /** 客户端请求重试标识，只在当前调用栈用于计算不可逆摘要。 */
  readonly idempotencyKey: string
}

const jsonBodyLimitBytes = 1_048_576
const idempotencyRetentionMs = 168 * 60 * 60 * 1000
const validators = createPublicContractValidators()
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u

/** 将原文变成不可逆摘要，避免在 MySQL 保存主体与幂等键。 */
function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** 读取普通 JSON 的原始字节，上限在解析和身份验证之前执行。 */
async function readRestrictedRequest(request: IncomingMessage): Promise<RestrictedCreateRequest> {
  const mediaType = request.headers['content-type']
  if (
    typeof mediaType !== 'string' ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(mediaType)
  ) {
    request.resume()
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求内容类型不受支持')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > jsonBodyLimitBytes) {
      throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
    }
    chunks.push(buffer)
  }
  return { headers: request.headers, bodyText: Buffer.concat(chunks).toString('utf8') }
}

/** 只接受严格空 JSON 对象和单值幂等头。 */
function parseRequest(input: RestrictedCreateRequest): CreateRequestDto {
  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  const key = input.headers['idempotency-key']
  if (
    !validators.createUserPlantRequest(body) ||
    typeof key !== 'string' ||
    !validIdempotencyKey.test(key)
  ) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return { body, idempotencyKey: key }
}

/** 把应用用例的确定错误转换为固定请求链允许公开的安全错误。 */
function unwrapResult(result: HttpIdempotencyPublicResponseSnapshot): CreateUserPlantResponseDto {
  if ('error' in result.body) {
    if (!validators.errorResponse(result.body)) {
      throw new Error('创建用例返回无效公开错误')
    }
    const error = result.body.error
    switch (error.type) {
      case 'PRINCIPAL_INVALID':
      case 'CAPABILITY_DENIED':
      case 'CAPABILITY_SNAPSHOT_EXPIRED':
      case 'IDEMPOTENCY_CONFLICT':
      case 'SERVICE_UNAVAILABLE':
        throw new PublicRequestError(result.status, error.type, error.message)
      default:
        throw new Error('创建用例返回未登记的错误类型')
    }
  }
  if (result.status !== 200 || !validators.createUserPlantResponse(result.body.data)) {
    throw new Error('创建用例返回无效公开投影')
  }
  return result.body.data
}

/** 组装 POST 创建的固定请求链：认证、能力裁决、空 DTO、事务持久化、白名单响应。 */
export function createUserPlantRouteHandler(
  dependencies: CreateUserPlantRouteDependencies
): RouteHandler {
  return (request, response) =>
    createNodeRequestChainHandler<
      RestrictedCreateRequest,
      ResolveUserPrincipalCommand,
      UserPrincipalDto,
      CreateRequestDto,
      CreateUserPlantApplicationInput,
      CreateUserPlantApplicationInput,
      HttpIdempotencyPublicResponseSnapshot,
      CreateUserPlantResponseDto
    >({
      requestLimits: { kind: 'execute', run: readRestrictedRequest },
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
          } catch (error: unknown) {
            if (
              error instanceof UnifiedUserPrincipalResolveError &&
              error.type === 'PRINCIPAL_INVALID'
            ) {
              throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
            }
            throw error
          }
        }
      },
      objectOwnership: { kind: 'not_applicable', reason: '创建新植物没有现存目标对象可做归属校验' },
      dtoValidate: { kind: 'execute', run: parseRequest },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          const occurredAtMs = dependencies.now()
          let capabilitySnapshot: UserCapabilitySnapshotDto
          try {
            capabilitySnapshot = await dependencies.resolveCapabilitySnapshot(principal)
          } catch (error: unknown) {
            if (error instanceof CapabilitySnapshotUnavailableError) {
              throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
            }
            throw error
          }
          if (
            !validators.capabilitySnapshot(capabilitySnapshot) ||
            capabilitySnapshot.subjectType !== 'user' ||
            capabilitySnapshot.user_id !== principal.user_id
          ) {
            throw new Error('服务端能力快照不合法')
          }
          return {
            principal,
            capabilitySnapshot,
            newUserPlantRef: `upl_${randomBytes(18).toString('base64url')}` as UserPlantRef,
            occurredAtMs,
            idempotency: {
              principalType: 'user',
              principalScopeHash: digest(principal.user_id),
              httpMethod: 'POST',
              normalizedPath: createUserPlantRoute.path,
              operationId: createUserPlantRoute.operationId,
              idempotencyKeyHash: digest(dto.idempotencyKey),
              requestHash: digest('{}'),
              createdAtMs: occurredAtMs,
              expiresAtMs: occurredAtMs + idempotencyRetentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => dependencies.createUserPlant(domainDecision)
      },
      publicResponse: { kind: 'execute', run: unwrapResult },
      writeAudit: dependencies.writeAudit
    })(request, response)
}
