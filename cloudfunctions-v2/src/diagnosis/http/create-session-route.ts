import { createHash } from 'node:crypto'
import type { IncomingMessage, IncomingHttpHeaders } from 'node:http'
import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserPrincipalDto, GuestPrincipalDto } from '../../contracts/types.js'
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
import { extractBearerToken } from '../../identity/http/request-identity.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import {
  calculateDiagnosisCreationRequestHash,
  calculatePestDiagnosisCreationRequestHash,
  type IdempotentDiagnosisCreationInput,
  type IdempotentPestDiagnosisCreationInput
} from '../application/idempotent-create-diagnosis.js'
import {
  validatePublicDiagnosisCreationRequest,
  validatePublicDiagnosisCreationResponse,
  type PublicDiagnosisCreationRequest,
  type PublicDiagnosisCreationResponse
} from './pest-create-session-contract.js'
export { projectDiagnosisCreationResponse } from './create-session-contract.js'

/** 与登记一致的会话创建操作；游客分支未接入时明确不可用，不伪装非法身份。 */
export const diagnosisCreationRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/diagnosis/sessions',
  operationId: 'createDiagnosisSession',
  security: 'guest_or_authenticated'
}
/** 协议适配依赖，不在这里创建数据库连接或绕过发布准入。 */
export interface DiagnosisCreationRouteDependencies {
  /** 身份域校验Bearer并返回平台无关主体。 */
  readonly resolvePrincipal: (
    command: ResolveUserPrincipalCommand
  ) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 受控应用用例：发布准入、归属与会话创建及幂等保存；此处理器不会自己发布题包。 */
  readonly createSession: (
    input: IdempotentDiagnosisCreationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 缺正式准备准入时不提供此端口；不能用固定症状创建冒充虫害。 */
  readonly createPestSession?: (
    input: IdempotentPestDiagnosisCreationInput
  ) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 服务端时钟，不采纳客户端时间。 */
  readonly now: () => number
  /** 只记录固定请求链的脱敏结果。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}
/** 大小限制后的最小协议输入。 */
type Restricted = {
  /** 仅供身份和协议验证使用的请求头。 */
  readonly headers: IncomingHttpHeaders
  /** 已受字节上限约束的JSON正文。 */
  readonly bodyText: string
  /** 冻结路由的路径参数；创建入口无客户端会话引用。 */
  readonly path: RoutePathParameters
}
/** 与共享HTTP目录已确认值一致，不新增诊断策略。 */
const bodyLimitBytes = 1_048_576
const retentionMs = 168 * 60 * 60 * 1000
const keyPattern = /^[\x20-\x7e]{8,128}$/u
const validators = createPublicContractValidators()
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
/** 媒体类型及流字节上限先于身份，禁止无界读取。 */
async function restricted(
  request: IncomingMessage,
  path: RoutePathParameters
): Promise<Restricted> {
  if (
    typeof request.headers['content-type'] !== 'string' ||
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(request.headers['content-type'])
  ) {
    request.resume()
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求须使用JSON')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += data.length
    if (bytes > bodyLimitBytes) {
      throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大')
    }
    chunks.push(data)
  }
  return { headers: request.headers, bodyText: Buffer.concat(chunks).toString('utf8'), path }
}
/** 校验请求DTO与协议字段，不从正文采纳身份或题包。 */
function parse(input: Restricted) {
  let body: unknown
  try {
    body = JSON.parse(input.bodyText)
  } catch {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  const key = input.headers['idempotency-key']
  if (
    !validatePublicDiagnosisCreationRequest(body) ||
    typeof key !== 'string' ||
    !keyPattern.test(key)
  ) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return { body, key }
}
/** 严格检查用例的公开投影，拒绝内部字段及非法状态码穿透。 */
function unwrap(result: HttpIdempotencyPublicResponseSnapshot): PublicDiagnosisCreationResponse {
  if ('error' in result.body) {
    if (
      !validators.errorResponse(result.body) ||
      !['VALIDATION_FAILED', 'NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'].includes(
        result.body.error.type
      ) ||
      ![400, 404, 409, 503].includes(result.status)
    ) {
      throw new Error('诊断公开错误非法')
    }
    const messages = {
      VALIDATION_FAILED: '会话创建或证据不合法',
      NOT_FOUND: '用户植物不存在',
      IDEMPOTENCY_CONFLICT: '请求与已记录内容冲突',
      SERVICE_UNAVAILABLE: '服务暂时不可用'
    } as const
    const type = result.body.error.type as keyof typeof messages
    const statuses = {
      VALIDATION_FAILED: 400,
      NOT_FOUND: 404,
      IDEMPOTENCY_CONFLICT: 409,
      SERVICE_UNAVAILABLE: 503
    } as const
    if (result.status !== statuses[type]) {
      throw new Error('诊断公开错误状态非法')
    }
    throw new PublicRequestError(result.status, type, messages[type])
  }
  if (result.status !== 200 || !validatePublicDiagnosisCreationResponse(result.body.data)) {
    throw new Error('诊断公开确认非法')
  }
  return result.body.data
}
/** 既有请求链接入单一路由；归属必须在同一数据库事务中重新核验。 */
export function createDiagnosisCreationRouteHandler(
  deps: DiagnosisCreationRouteDependencies
): RouteHandler {
  return (request, response, path) =>
    createNodeRequestChainHandler<
      Restricted,
      ResolveUserPrincipalCommand,
      UserPrincipalDto | GuestPrincipalDto,
      { body: PublicDiagnosisCreationRequest; key: string },
      IdempotentDiagnosisCreationInput | IdempotentPestDiagnosisCreationInput,
      IdempotentDiagnosisCreationInput | IdempotentPestDiagnosisCreationInput,
      HttpIdempotencyPublicResponseSnapshot,
      PublicDiagnosisCreationResponse
    >({
      requestLimits: { kind: 'execute', run: raw => restricted(raw, path) },
      identityValidate: {
        kind: 'execute',
        run: input => {
          const token = extractBearerToken(input.headers)
          if (!token) {
            throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
          }
          return { bearerToken: token, nowMs: deps.now() }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            return await deps.resolvePrincipal(command)
          } catch (error) {
            if (error instanceof UnifiedUserPrincipalResolveError) {
              throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
            }
            throw error
          }
        }
      },
      objectOwnership: {
        kind: 'not_applicable',
        reason: '归属与会话创建在同一事务按统一用户和植物核验，不能用协议前置检查代替'
      },
      dtoValidate: { kind: 'execute', run: parse },
      buildCommand: {
        kind: 'execute',
        run: ({ dto, principal }) => {
          if (principal.principalType !== 'user') {
            throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '临时问诊创建暂不可用')
          }
          const { userPlantRef } = dto.body
          const startedAtMs = deps.now()
          const input = {
            userRef: principal.user_id,
            userPlantRef,
            startedAtMs,
            ...(dto.body.mode === 'specific_pest_visual'
              ? { mode: 'pest' as const, assetRef: dto.body.assetRef }
              : { mode: dto.body.mode })
          }
          return {
            ...input,
            idempotency: {
              principalType: 'user',
              principalScopeHash: digest(principal.user_id),
              httpMethod: 'POST',
              normalizedPath: diagnosisCreationRoute.path,
              operationId: diagnosisCreationRoute.operationId,
              idempotencyKeyHash: digest(dto.key),
              requestHash:
                input.mode === 'pest'
                  ? calculatePestDiagnosisCreationRequestHash(input)
                  : calculateDiagnosisCreationRequestHash(input),
              createdAtMs: startedAtMs,
              expiresAtMs: startedAtMs + retentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: async ({ domainDecision }) => {
          const result =
            domainDecision.mode === 'pest'
              ? deps.createPestSession
                ? await deps.createPestSession(domainDecision)
                : {
                    status: 503,
                    body: { error: { type: 'SERVICE_UNAVAILABLE', message: '虫害问诊暂不可用' } }
                  }
              : await deps.createSession(domainDecision)
          if (result.status === 200 && 'data' in result.body) {
            const data = result.body.data
            const expectedMode =
              domainDecision.mode === 'pest' ? 'specific_pest_visual' : domainDecision.mode
            if (
              data === null ||
              typeof data !== 'object' ||
              Array.isArray(data) ||
              !('mode' in data) ||
              data.mode !== expectedMode
            ) {
              throw new Error('创建响应模式与请求不匹配')
            }
          }
          return result
        }
      },
      publicResponse: { kind: 'execute', run: unwrap },
      writeAudit: deps.writeAudit
    })(request, response)
}
