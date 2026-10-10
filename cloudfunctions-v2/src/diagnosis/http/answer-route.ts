import { createHash } from 'node:crypto'
import type { IncomingMessage, IncomingHttpHeaders } from 'node:http'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
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
  calculateDiagnosisAnswerRequestHash,
  type IdempotentDiagnosisAnswerInput
} from '../application/idempotent-diagnosis-answers.js'
import {
  validateDiagnosisAnswerRequest,
  validateDiagnosisSessionAnswerResponse,
  type DiagnosisAnswerRequestDto,
  type DiagnosisSessionAnswerResponseDto
} from './answer-contract.js'
export { projectDiagnosisAnswerResponse } from './answer-contract.js'

/** 与登记一致的答案操作；游客分支未接入时明确不可用，不伪装非法身份。 */
export const diagnosisAnswerRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers',
  operationId: 'answerDiagnosisQuestion',
  security: 'guest_or_authenticated'
}
/** 协议适配依赖，不在这里创建数据库连接或绕过发布准入。 */
export interface DiagnosisAnswerRouteDependencies {
  /** 身份域校验Bearer并返回平台无关主体。 */
  readonly resolvePrincipal: (
    command: ResolveUserPrincipalCommand
  ) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 受控应用用例：发布准入、归属与答案及幂等保存；此处理器不会自己发布题包。 */
  readonly submitAnswers: (
    input: IdempotentDiagnosisAnswerInput
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
  /** 冻结路由解析的会话公开引用。 */
  readonly path: RoutePathParameters
}
/** 与共享HTTP目录已确认值一致，不新增诊断策略。 */
const bodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
/** 幂等结果保留毫秒（`http.idempotency.retention_hours` 换算）。 */
const retentionMs = RUNTIME_PARAMETERS.http.idempotencyRetentionHours.value * 60 * 60 * 1000
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
  const ref = input.path.diagnosisSessionRef
  const key = input.headers['idempotency-key']
  if (
    !validateDiagnosisAnswerRequest(body) ||
    typeof ref !== 'string' ||
    ref.length < 8 ||
    ref.length > 100 ||
    typeof key !== 'string' ||
    !keyPattern.test(key)
  ) {
    throw new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
  }
  return { body, ref, key }
}
/** 严格检查用例的公开投影，拒绝内部字段及非法状态码穿透。 */
function unwrap(result: HttpIdempotencyPublicResponseSnapshot): DiagnosisSessionAnswerResponseDto {
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
      VALIDATION_FAILED: '答案或证据不合法',
      NOT_FOUND: '问诊会话不存在',
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
  if (result.status !== 200 || !validateDiagnosisSessionAnswerResponse(result.body.data)) {
    throw new Error('诊断公开确认非法')
  }
  return result.body.data
}
/** 既有请求链接入单一路由；归属必须在同一数据库事务中重新核验。 */
export function createDiagnosisAnswerRouteHandler(
  deps: DiagnosisAnswerRouteDependencies
): RouteHandler {
  return (request, response, path) =>
    createNodeRequestChainHandler<
      Restricted,
      ResolveUserPrincipalCommand,
      UserPrincipalDto | GuestPrincipalDto,
      { body: DiagnosisAnswerRequestDto; ref: string; key: string },
      IdempotentDiagnosisAnswerInput,
      IdempotentDiagnosisAnswerInput,
      HttpIdempotencyPublicResponseSnapshot,
      DiagnosisSessionAnswerResponseDto
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
        reason: '归属与答案提交在同一事务内按用户、植物与会话锁定，不能用协议前置检查代替'
      },
      dtoValidate: { kind: 'execute', run: parse },
      buildCommand: {
        kind: 'execute',
        run: ({ dto, principal }) => {
          if (principal.principalType !== 'user') {
            throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '临时问诊提交暂不可用')
          }
          const { userPlantRef, ...submitted } = dto.body
          const occurredAtMs = deps.now()
          const input = {
            userRef: principal.user_id,
            userPlantRef,
            diagnosisRef: dto.ref,
            submitted,
            occurredAtMs
          }
          return {
            ...input,
            idempotency: {
              principalType: 'user',
              principalScopeHash: digest(principal.user_id),
              httpMethod: 'POST',
              normalizedPath: diagnosisAnswerRoute.path,
              operationId: diagnosisAnswerRoute.operationId,
              idempotencyKeyHash: digest(dto.key),
              requestHash: calculateDiagnosisAnswerRequestHash(input),
              createdAtMs: occurredAtMs,
              expiresAtMs: occurredAtMs + retentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => deps.submitAnswers(domainDecision)
      },
      publicResponse: { kind: 'execute', run: unwrap },
      writeAudit: deps.writeAudit
    })(request, response)
}
