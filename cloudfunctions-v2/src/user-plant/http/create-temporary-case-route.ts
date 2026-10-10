import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import { createHash, randomBytes } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { GuestPrincipalDto, TemporaryCaseResponseDto, UserPrincipalDto } from '../../contracts/types.js'
import type { UserPlantLimitsPolicySnapshot } from '../../configuration/user-plant-limits-policy.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import { PublicRequestError, type RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import type { CreateTemporaryCaseApplicationInput } from '../application/create-temporary-case.js'

/** 临时案例创建路由登记（temporary-case/v1 §1）。 */
export const createTemporaryCaseRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/temporary-cases',
  operationId: 'createTemporaryCase',
  security: 'guest_or_authenticated'
}

/** 临时案例归属类别；决定引用前缀与写入表。 */
export type TemporaryCaseOwnerKind = 'guest' | 'authenticated'

/** 路由只依赖可信服务端端口；客户端不能提交归属、期限或引用。 */
export interface CreateTemporaryCaseRouteDependencies {
  /** guest_or_authenticated 合并主体解析：`guest.` 前缀为游客，其他为登录会话。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** 读取已发布 userplant_limits 策略快照；无可信发布返回 null，调用方必须 503。 */
  readonly readLimitsPolicy: (capturedAt: string) => Promise<Readonly<UserPlantLimitsPolicySnapshot> | null>
  /** 事务化创建用例，负责幂等、加锁计数、写入、读回。 */
  readonly createTemporaryCase: (input: CreateTemporaryCaseApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 可选的服务端案例引用生成器；缺省使用 18 字节随机数 base64url。 */
  readonly createCaseRef?: (ownerKind: TemporaryCaseOwnerKind) => string
  /** 服务端 UTC 毫秒时钟；整个请求只取一次。 */
  readonly now: () => number
  /** 脱敏请求结果审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 限制阶段产出的安全请求数据；Bearer 原文不得进入响应或审计。 */
interface RestrictedRequest {
  /** 只用于提取 Bearer、媒体类型与幂等键的请求头。 */
  readonly headers: IncomingHttpHeaders
  /** 用于识别 Node 合并前重复幂等头的原始头数组。 */
  readonly rawHeaders: readonly string[]
  /** 大小限制内读取的原始 JSON 文本。 */
  readonly bodyText: string
}

/** 已校验的空 DTO 与幂等键。 */
interface TemporaryCaseRequestDto {
  /** 客户端请求重试标识，只在当前调用栈计算不可逆摘要。 */
  readonly idempotencyKey: string
}

/** 与共享 HTTP 合同已确认值一致（http.json_body_limit_bytes），与创建用户植物路由同一约定。 */
const jsonBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
/** 与共享 HTTP 合同已确认值一致（http.idempotency.retention_hours），与创建用户植物路由同一约定。 */
const idempotencyRetentionMs = RUNTIME_PARAMETERS.http.idempotencyRetentionHours.value * 60 * 60 * 1000
/** 严格空对象的规范请求文本；同键请求摘要以此计算。 */
const canonicalEmptyBody = '{}'
const validators = createPublicContractValidators()
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
/** 应用用例允许原样公开的确定错误类型。 */
const passThroughErrors = new Set(['PRINCIPAL_INVALID', 'TEMPORARY_CASE_LIMIT_REACHED', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])

/** 不可逆摘要，避免在 MySQL 保存主体引用与幂等键原文。 */
function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

/** 默认高熵引用：游客 gpc_、登录 epc_，后缀 24 字符 base64url。 */
export function generateTemporaryCaseRef(ownerKind: TemporaryCaseOwnerKind): string {
  return `${ownerKind === 'guest' ? 'gpc_' : 'epc_'}${randomBytes(18).toString('base64url')}`
}

const invalidRequest = () => new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
const principalInvalid = () => new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
const unavailable = () => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')

/** 在解析与认证之前执行媒体类型与字节上限。 */
async function readRestrictedRequest(request: IncomingMessage): Promise<RestrictedRequest> {
  const mediaType = request.headers['content-type']
  if (typeof mediaType !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(mediaType)) {
    request.resume()
    throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求内容类型不受支持')
  }
  const chunks: Buffer[] = []
  let bytes = 0
  let oversized = false
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.byteLength
    if (bytes > jsonBodyLimitBytes) { oversized = true; chunks.length = 0 }
    if (!oversized) { chunks.push(buffer) }
  }
  if (oversized) { throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大') }
  return { headers: request.headers, rawHeaders: request.rawHeaders, bodyText: Buffer.concat(chunks).toString('utf8') }
}

/** 只接受严格空 JSON 对象与唯一合法幂等头。 */
function parseRequest(input: RestrictedRequest): TemporaryCaseRequestDto {
  let body: unknown
  try { body = JSON.parse(input.bodyText) } catch { throw invalidRequest() }
  const key = input.headers['idempotency-key']
  let keyCount = 0
  for (let index = 0; index < input.rawHeaders.length; index += 2) {
    if (input.rawHeaders[index]!.toLowerCase() === 'idempotency-key') { keyCount += 1 }
  }
  if (!validators.createTemporaryCaseRequest(body) || typeof key !== 'string' || keyCount !== 1 || !validIdempotencyKey.test(key)) {
    throw invalidRequest()
  }
  return { idempotencyKey: key }
}

/** 主体必须通过合同校验且在当前时刻有效。 */
function verifyPrincipal(principal: UserPrincipalDto | GuestPrincipalDto, nowMs: number): UserPrincipalDto | GuestPrincipalDto {
  const valid = principal.principalType === 'guest' ? validators.guestPrincipal(principal) : validators.userPrincipal(principal)
  const issuedAtMs = Date.parse(principal.issuedAt)
  const expiresAtMs = Date.parse(principal.expiresAt)
  if (!valid || !Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || issuedAtMs > nowMs || expiresAtMs <= nowMs) {
    throw principalInvalid()
  }
  return principal
}

/** 应用结果白名单投影：只放行登记错误与合同成功体。 */
function unwrapResult(result: HttpIdempotencyPublicResponseSnapshot, principal: UserPrincipalDto | GuestPrincipalDto): TemporaryCaseResponseDto {
  if ('error' in result.body) {
    if (!validators.errorResponse(result.body) || !passThroughErrors.has(result.body.error.type)) {
      throw new Error('临时案例用例返回未登记的错误')
    }
    throw new PublicRequestError(result.status, result.body.error.type, result.body.error.message)
  }
  const data = result.body.data
  const expectedOwner: TemporaryCaseOwnerKind = principal.principalType === 'guest' ? 'guest' : 'authenticated'
  if (result.status !== 200 || !validators.temporaryCaseResponse(data) || data.ownerKind !== expectedOwner) {
    throw new Error('临时案例用例返回无效公开投影')
  }
  return { caseRef: data.caseRef, ownerKind: data.ownerKind, expiresAt: data.expiresAt }
}

/** 固定请求链：限制 → 认证 → 合并主体 → 空 DTO → 策略快照与命令 → 事务 → 白名单响应。 */
export function createTemporaryCaseRouteHandler(dependencies: CreateTemporaryCaseRouteDependencies): RouteHandler {
  const createCaseRef = dependencies.createCaseRef ?? generateTemporaryCaseRef
  return (request, response) => {
    const nowMs = dependencies.now()
    let resolvedPrincipal: UserPrincipalDto | GuestPrincipalDto
    return createNodeRequestChainHandler<
      RestrictedRequest,
      ResolveUserPrincipalCommand,
      UserPrincipalDto | GuestPrincipalDto,
      TemporaryCaseRequestDto,
      CreateTemporaryCaseApplicationInput,
      CreateTemporaryCaseApplicationInput,
      HttpIdempotencyPublicResponseSnapshot,
      TemporaryCaseResponseDto
    >({
      requestLimits: { kind: 'execute', run: readRestrictedRequest },
      identityValidate: {
        kind: 'execute',
        run: restricted => {
          const bearerToken = extractBearerToken(restricted.headers)
          if (bearerToken === null) { throw principalInvalid() }
          return { bearerToken, nowMs }
        }
      },
      principalResolve: {
        kind: 'execute',
        run: async command => {
          try {
            resolvedPrincipal = verifyPrincipal(await dependencies.resolvePrincipal(command), nowMs)
            return resolvedPrincipal
          } catch (error: unknown) {
            if (error instanceof UnifiedUserPrincipalResolveError && error.type === 'PRINCIPAL_INVALID') { throw principalInvalid() }
            throw error
          }
        }
      },
      objectOwnership: { kind: 'not_applicable', reason: '新建临时案例没有现存目标对象可做归属校验' },
      dtoValidate: { kind: 'execute', run: parseRequest },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          let policy: Readonly<UserPlantLimitsPolicySnapshot> | null
          try { policy = await dependencies.readLimitsPolicy(new Date(nowMs).toISOString()) } catch { throw unavailable() }
          if (policy === null) { throw unavailable() }
          const ownerKind: TemporaryCaseOwnerKind = principal.principalType === 'guest' ? 'guest' : 'authenticated'
          const newCaseRef = createCaseRef(ownerKind)
          if (typeof newCaseRef !== 'string' || !/^(?:gpc|epc)_[A-Za-z0-9_-]{8,60}$/u.test(newCaseRef)) { throw new Error('服务端案例引用不合法') }
          const scope = principal.principalType === 'guest' ? principal.guestSessionRef : principal.user_id
          return {
            principal,
            limits: { guestMaxCasesPerSession: policy.guestMaxCasesPerSession, authenticatedEphemeralCaseTtlHours: policy.authenticatedEphemeralCaseTtlHours },
            newCaseRef,
            occurredAtMs: nowMs,
            idempotency: {
              principalType: principal.principalType,
              principalScopeHash: digest(scope),
              httpMethod: 'POST',
              normalizedPath: createTemporaryCaseRoute.path,
              operationId: createTemporaryCaseRoute.operationId,
              idempotencyKeyHash: digest(dto.idempotencyKey),
              requestHash: digest(canonicalEmptyBody),
              createdAtMs: nowMs,
              expiresAtMs: nowMs + idempotencyRetentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: { kind: 'execute', run: ({ domainDecision }) => dependencies.createTemporaryCase(domainDecision) },
      publicResponse: { kind: 'execute', run: result => unwrapResult(result, resolvedPrincipal) },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
