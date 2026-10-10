import { createHash } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../idempotency/mysql-http-idempotency-repository.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../json/canonical-json-sha256.js'
import { createNodeRequestChainHandler } from './node-request-chain-handler.js'
import { PublicRequestError, type PublicErrorType, type RequestChainAuditEvent } from './request-chain.js'
import type { FrozenRoute, RouteHandler, RoutePathParameters } from './route-dispatcher.js'

/** 已验真的登录主体最小形状：只用公开 user_id 计算幂等作用域摘要。 */
export interface AuthenticatedRoutePrincipal {
  /** identity 解析的统一用户公开标识；不得进入响应或日志。 */
  readonly user_id: string
}

/** 解析后的请求输入：路径参数、查询参数与 JSON 正文（GET 为 null）。 */
export interface AuthenticatedRouteRequest {
  /** 分发器解码的路径参数。 */
  readonly pathParameters: RoutePathParameters
  /** URL 查询参数；只由读接口使用。 */
  readonly query: URLSearchParams
  /** 已解析的 JSON 正文；读接口为 null。 */
  readonly body: unknown
  /** 服务端当前 UTC 毫秒（每请求只取一次）。 */
  readonly nowMs: number
}

/** 路由执行输入：主体、DTO、时钟与（写接口）幂等占位输入。 */
export interface AuthenticatedRouteExecution<TPrincipal, TDto> {
  /** 已验真的调用主体（统一 user_id 及会话信息）。 */
  readonly principal: TPrincipal
  /** 已严格校验的 DTO。 */
  readonly dto: TDto
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 写接口的幂等占位输入；读接口为 null。 */
  readonly idempotency: HttpIdempotencyReservationInput | null
}

/** 单一路由规格。 */
export interface AuthenticatedJsonRouteSpec<TPrincipal extends AuthenticatedRoutePrincipal, TDto> {
  /** 已冻结的路由登记项（方法、路径与对应合同）。 */
  readonly route: FrozenRoute
  /** 写接口必须带 JSON 正文与唯一 Idempotency-Key；读接口丢弃正文。 */
  readonly kind: 'write' | 'read'
  /** 严格解析 DTO；非法时抛出 PublicRequestError(400)。 */
  readonly parse: (request: AuthenticatedRouteRequest) => TDto
  /** 应用用例；返回首次确定的公开结果快照。 */
  readonly execute: (input: AuthenticatedRouteExecution<TPrincipal, TDto>) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 成功数据严格合同校验。 */
  readonly validateData: (data: unknown) => boolean
  /** 应用用例允许原样公开的错误类型。 */
  readonly passThroughErrors: ReadonlySet<PublicErrorType>
  /** 错误类型合同校验（防止未登记错误外泄）。 */
  readonly validateError: (body: unknown) => boolean
}

/** 路由共享依赖。 */
export interface AuthenticatedJsonRouteDependencies<TPrincipal extends AuthenticatedRoutePrincipal> {
  /** 由 identity 域提供：Bearer → 已验真登录主体；无效抛 PublicRequestError(401)。 */
  readonly authenticate: (headers: IncomingHttpHeaders, nowMs: number) => Promise<TPrincipal>
  /** 服务端 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 脱敏请求结果审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 限制阶段产出的安全请求数据。 */
interface RestrictedRequest {
  /** 只用于 Bearer、媒体类型与幂等键的请求头。 */
  readonly headers: IncomingHttpHeaders
  /** 用于识别重复幂等头的原始头数组。 */
  readonly rawHeaders: readonly string[]
  /** 大小限制内读取的原始 JSON 文本；读接口为 null。 */
  readonly bodyText: string | null
  /** 请求 URL 查询参数。 */
  readonly query: URLSearchParams
}

/** 已校验 DTO 与请求摘要。 */
interface ParsedRequest<TDto> {
  /** 已严格校验通过的路由请求 DTO。 */
  readonly dto: TDto
  /** 写接口幂等键原文（只在调用栈内摘要）；读接口为 null。 */
  readonly idempotencyKey: string | null
  /** 规范化（路径参数 + 正文）SHA-256。 */
  readonly requestHash: string
}

/** 与共享 HTTP 合同已确认值一致（http.json_body_limit_bytes），取值见代码层注册表。 */
const jsonBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
/** 与共享 HTTP 合同已确认值一致（http.idempotency.retention_hours），取值见代码层注册表，此处换算为毫秒。 */
const idempotencyRetentionMs = RUNTIME_PARAMETERS.http.idempotencyRetentionHours.value * 60 * 60 * 1000
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

/** 统一 400 公开错误。 */
export const validationFailed = (message = '请求参数不合法') => new PublicRequestError(400, 'VALIDATION_FAILED', message)

/** 写接口：媒体类型与字节上限先于认证；读接口直接丢弃正文。 */
async function readRestrictedRequest(request: IncomingMessage, kind: 'write' | 'read'): Promise<RestrictedRequest> {
  const query = new URL(request.url ?? '/', 'http://127.0.0.1').searchParams
  if (kind === 'read') {
    request.resume()
    return { headers: request.headers, rawHeaders: request.rawHeaders, bodyText: null, query }
  }
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
  return { headers: request.headers, rawHeaders: request.rawHeaders, bodyText: Buffer.concat(chunks).toString('utf8'), query }
}

/** 唯一且可打印的 Idempotency-Key；否则 400。 */
export function readIdempotencyKey(headers: IncomingHttpHeaders, rawHeaders: readonly string[]): string {
  const key = headers['idempotency-key']
  let count = 0
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (rawHeaders[index]!.toLowerCase() === 'idempotency-key') { count += 1 }
  }
  if (typeof key !== 'string' || count !== 1 || !validIdempotencyKey.test(key)) { throw validationFailed() }
  return key
}

/** 解析 JSON 正文、DTO 与幂等键。 */
function parseRequest<TDto>(restricted: RestrictedRequest, spec: { kind: 'write' | 'read'; parse: (request: AuthenticatedRouteRequest) => TDto },
  pathParameters: RoutePathParameters, nowMs: number): ParsedRequest<TDto> {
  let body: unknown = null
  if (restricted.bodyText !== null) {
    try { body = JSON.parse(restricted.bodyText) } catch { throw validationFailed() }
  }
  const dto = spec.parse({ pathParameters, query: restricted.query, body, nowMs })
  const idempotencyKey = spec.kind === 'write' ? readIdempotencyKey(restricted.headers, restricted.rawHeaders) : null
  const hashed = { path: { ...pathParameters }, body } as unknown as CanonicalJsonValue
  return { dto, idempotencyKey, requestHash: calculateCanonicalJsonSha256(hashed) }
}

/**
 * 登录用户 JSON 路由固定请求链：限制 → Bearer → 主体 → DTO + 幂等键 → 用例（事务与归属在用例内）→ 白名单响应。
 * 归属确认在用例事务内按 user_id + 公开引用加锁完成，不信任路径参数本身。
 */
export function createAuthenticatedJsonRouteHandler<TPrincipal extends AuthenticatedRoutePrincipal, TDto, TData>(
  dependencies: AuthenticatedJsonRouteDependencies<TPrincipal>,
  spec: AuthenticatedJsonRouteSpec<TPrincipal, TDto>
): RouteHandler {
  return (request, response, pathParameters) => {
    const nowMs = dependencies.now()
    return createNodeRequestChainHandler<
      RestrictedRequest, IncomingHttpHeaders, TPrincipal, ParsedRequest<TDto>,
      AuthenticatedRouteExecution<TPrincipal, TDto>, AuthenticatedRouteExecution<TPrincipal, TDto>, HttpIdempotencyPublicResponseSnapshot, TData
    >({
      requestLimits: { kind: 'execute', run: raw => readRestrictedRequest(raw, spec.kind) },
      identityValidate: { kind: 'execute', run: restricted => restricted.headers },
      principalResolve: { kind: 'execute', run: headers => dependencies.authenticate(headers, nowMs) },
      objectOwnership: { kind: 'not_applicable', reason: '归属在用例事务内按主体与公开引用加锁确认' },
      dtoValidate: { kind: 'execute', run: restricted => parseRequest(restricted, spec, pathParameters, nowMs) },
      buildCommand: {
        kind: 'execute',
        run: ({ dto, principal }) => ({
          principal, dto: dto.dto, nowMs,
          idempotency: dto.idempotencyKey === null ? null : {
            principalType: 'user', principalScopeHash: digest(principal.user_id), httpMethod: spec.route.method,
            normalizedPath: spec.route.path, operationId: spec.route.operationId,
            idempotencyKeyHash: digest(dto.idempotencyKey), requestHash: dto.requestHash,
            createdAtMs: nowMs, expiresAtMs: nowMs + idempotencyRetentionMs
          }
        })
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: { kind: 'execute', run: ({ domainDecision }) => spec.execute(domainDecision) },
      publicResponse: {
        kind: 'execute',
        run: result => {
          if ('error' in result.body) {
            const error = result.body.error as { readonly type: PublicErrorType; readonly message: string }
            if (!spec.validateError(result.body) || !spec.passThroughErrors.has(error.type)) { throw new Error('用例返回未登记的错误') }
            throw new PublicRequestError(result.status, error.type, error.message)
          }
          if (result.status !== 200 || !spec.validateData(result.body.data)) { throw new Error('用例返回无效公开投影') }
          return result.body.data as TData
        }
      },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
