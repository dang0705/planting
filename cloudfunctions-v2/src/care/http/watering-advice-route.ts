import { createHash, randomBytes } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { CareCapabilityResponseDto, GuestPrincipalDto, UserPrincipalDto } from '../../contracts/types.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import { PublicRequestError, type RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import type { MvpPlantBaseline } from '../application/assess-mvp-watering.js'
import { buildWateringAdvice, type PublishedWateringPolicy } from '../application/build-watering-advice.js'
import type { CreateWateringAdviceApplicationInput } from '../application/create-watering-advice.js'
import type { TemporaryCareOwner } from '../domain/temporary-care-result-record.js'
import type { NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { OpenMeteoRadiationQuery } from '../provider/open-meteo-radiation-client.js'
import { resolveOpenMeteoRequestWindow } from '../watering/watering-advice-hard-rules.js'
import { parseWateringAdviceRequest, type WateringAdviceCommand } from './watering-advice-request.js'

/** 浇水建议路由登记（watering-advice/v1）。 */
export const createWateringAdviceRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/care/watering-advice',
  operationId: 'createWateringAdvice',
  security: 'guest_or_authenticated'
}

/** 路由依赖；全部为服务端可信端口，客户端不能提交归属、期限或策略。 */
export interface WateringAdviceRouteDependencies {
  /** guest_or_authenticated 合并主体解析。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto | GuestPrincipalDto>
  /** user-plant 域只读归属前置：本人 active 未过期案例为 owned。 */
  readonly readOwnedCase: (input: {
    /** 已验真主体对应的案例归属。 */
    readonly owner: TemporaryCareOwner
    /** 服务端当前 UTC 毫秒。 */
    readonly nowMs: number
  }) => Promise<'owned' | 'not_found'>
  /** 读取活动 care/mvp_watering 策略；无可用发布返回 null（结果为暂不可用，不是错误）。 */
  readonly readWateringPolicy: (capturedAt: string) => Promise<PublishedWateringPolicy | null>
  /** plant-knowledge 名义基线适配（硬规则 v1）；缺失或不受支持返回 null。 */
  readonly readPlantBaseline: (catalogTaxonRef: string) => Promise<MvpPlantBaseline | null>
  /** Open-Meteo 辐射获取并标准化；不可用返回 null（光照缺段，仍 200）。 */
  readonly fetchRadiation: (query: OpenMeteoRadiationQuery) => Promise<NormalizedOutdoorRadiation | null>
  /** 事务化应用用例。 */
  readonly createWateringAdvice: (input: CreateWateringAdviceApplicationInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
  /** 可选服务端引用生成器；缺省为 18 字节随机数 base64url。 */
  readonly createRef?: (kind: 'session' | 'result') => string
  /** 服务端 UTC 毫秒时钟；每请求只取一次。 */
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
  /** 大小限制内读取的原始 JSON 文本。 */
  readonly bodyText: string
}

/** 已校验的 DTO：命令、原始正文摘要与幂等键。 */
interface AdviceDto {
  /** 已映射且降精度的内部命令（target 已确认为临时案例）。 */
  readonly command: WateringAdviceCommand
  /** 临时案例公开引用。 */
  readonly caseRef: string
  /** 原始 JSON 规范化（键排序）SHA-256（裁决 8）。 */
  readonly requestHash: string
  /** 客户端重试标识，只在当前调用栈计算摘要。 */
  readonly idempotencyKey: string
}

/** 与共享 HTTP 合同已确认值一致（http.json_body_limit_bytes），同既有路由约定（裁决 7）。 */
const jsonBodyLimitBytes = 1_048_576
/** 与共享 HTTP 合同已确认值一致（http.idempotency.retention_hours），同既有路由约定（裁决 7）。 */
const idempotencyRetentionMs = 168 * 60 * 60 * 1000
const validators = createPublicContractValidators()
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
/** 应用用例允许原样公开的确定错误。 */
const passThroughErrors = new Set(['NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const invalidRequest = (message = '请求参数不合法') => new PublicRequestError(400, 'VALIDATION_FAILED', message)
const principalInvalid = () => new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
const notFound = () => new PublicRequestError(404, 'NOT_FOUND', '临时案例不存在或已失效')
const unavailable = () => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')

/** 默认高熵引用：会话 tcs_、结果 cres_。 */
function generateRef(kind: 'session' | 'result'): string {
  return `${kind === 'session' ? 'tcs_' : 'cres_'}${randomBytes(18).toString('base64url')}`
}

/** 媒体类型与字节上限先于认证。 */
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

/** 主体须通过合同校验且当前有效。 */
function verifyPrincipal(principal: UserPrincipalDto | GuestPrincipalDto, nowMs: number): UserPrincipalDto | GuestPrincipalDto {
  const valid = principal.principalType === 'guest' ? validators.guestPrincipal(principal) : validators.userPrincipal(principal)
  const issuedAtMs = Date.parse(principal.issuedAt)
  const expiresAtMs = Date.parse(principal.expiresAt)
  if (!valid || !Number.isFinite(issuedAtMs) || !Number.isFinite(expiresAtMs) || issuedAtMs > nowMs || expiresAtMs <= nowMs) { throw principalInvalid() }
  return principal
}

/** 严格解析正文与幂等头；长期植物目标为阶段性限制（裁决 1）。 */
function parseRequest(input: RestrictedRequest, nowMs: number): AdviceDto {
  let body: unknown
  try { body = JSON.parse(input.bodyText) } catch { throw invalidRequest() }
  const parsed = parseWateringAdviceRequest(body, nowMs)
  if (parsed.status !== 'ok') { throw invalidRequest() }
  if (parsed.command.target.kind !== 'temporary_case') { throw invalidRequest('长期植物浇水建议暂未开放') }
  const key = input.headers['idempotency-key']
  let keyCount = 0
  for (let index = 0; index < input.rawHeaders.length; index += 2) {
    if (input.rawHeaders[index]!.toLowerCase() === 'idempotency-key') { keyCount += 1 }
  }
  if (typeof key !== 'string' || keyCount !== 1 || !validIdempotencyKey.test(key)) { throw invalidRequest() }
  return { command: parsed.command, caseRef: parsed.command.target.caseRef, requestHash: calculateCanonicalJsonSha256(body as CanonicalJsonValue), idempotencyKey: key }
}

/** 由主体与案例引用得到归属；前缀与主体不符视为不存在。 */
function ownerOf(principal: UserPrincipalDto | GuestPrincipalDto, caseRef: string): TemporaryCareOwner {
  if (principal.principalType === 'guest') {
    if (!/^gpc_[A-Za-z0-9_-]{8,60}$/u.test(caseRef)) { throw notFound() }
    return { kind: 'guest', guestSessionRef: principal.guestSessionRef, caseRef }
  }
  if (!/^epc_[A-Za-z0-9_-]{8,60}$/u.test(caseRef)) { throw notFound() }
  return { kind: 'authenticated', userRef: principal.user_id, caseRef }
}

/** 应用结果白名单投影。 */
function unwrapResult(result: HttpIdempotencyPublicResponseSnapshot): CareCapabilityResponseDto {
  if ('error' in result.body) {
    if (!validators.errorResponse(result.body) || !passThroughErrors.has(result.body.error.type)) { throw new Error('浇水建议用例返回未登记的错误') }
    throw new PublicRequestError(result.status, result.body.error.type, result.body.error.message)
  }
  if (result.status !== 200 || !validators.careCapabilityResponse(result.body.data)) { throw new Error('浇水建议用例返回无效公开投影') }
  return result.body.data
}

/** 固定请求链：限制 → 认证 → 合并主体 → DTO → 归属前置/策略/基线/辐射/组装 → 事务 → 白名单响应。 */
export function createWateringAdviceRouteHandler(dependencies: WateringAdviceRouteDependencies): RouteHandler {
  const createRef = dependencies.createRef ?? generateRef
  return (request, response) => {
    const nowMs = dependencies.now()
    return createNodeRequestChainHandler<
      RestrictedRequest, ResolveUserPrincipalCommand, UserPrincipalDto | GuestPrincipalDto, AdviceDto,
      CreateWateringAdviceApplicationInput, CreateWateringAdviceApplicationInput, HttpIdempotencyPublicResponseSnapshot, CareCapabilityResponseDto
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
            return verifyPrincipal(await dependencies.resolvePrincipal(command), nowMs)
          } catch (error: unknown) {
            if (error instanceof UnifiedUserPrincipalResolveError && error.type === 'PRINCIPAL_INVALID') { throw principalInvalid() }
            throw error
          }
        }
      },
      objectOwnership: { kind: 'not_applicable', reason: '案例引用位于正文，归属在 DTO 校验后、任何外部调用前确认' },
      dtoValidate: { kind: 'execute', run: restricted => parseRequest(restricted, nowMs) },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          const owner = ownerOf(principal, dto.caseRef)
          if (await dependencies.readOwnedCase({ owner, nowMs }) !== 'owned') { throw notFound() }
          const { command } = dto
          let policy: PublishedWateringPolicy | null
          let baseline: MvpPlantBaseline | null
          try {
            policy = await dependencies.readWateringPolicy(new Date(nowMs).toISOString())
            baseline = command.catalogTaxonRef === null ? null : await dependencies.readPlantBaseline(command.catalogTaxonRef)
          } catch { throw unavailable() }
          const window = resolveOpenMeteoRequestWindow({ nowMs, evidenceTimesMs: [command.soil?.observedAt ?? null, command.lastWateringAtMs, command.lightReading?.measuredAtMs ?? null] })
          let radiation: NormalizedOutdoorRadiation | null
          try {
            radiation = await dependencies.fetchRadiation({ latitude: command.location.latitude, longitude: command.location.longitude, ...window })
          } catch { radiation = null }
          const built = buildWateringAdvice({ command, policy, baseline, radiation, nowMs })
          const scope = principal.principalType === 'guest' ? principal.guestSessionRef : principal.user_id
          return {
            owner, built, newSessionRef: createRef('session'), newResultRef: createRef('result'), occurredAtMs: nowMs,
            idempotency: {
              principalType: principal.principalType, principalScopeHash: digest(scope), httpMethod: 'POST',
              normalizedPath: createWateringAdviceRoute.path, operationId: createWateringAdviceRoute.operationId,
              idempotencyKeyHash: digest(dto.idempotencyKey), requestHash: dto.requestHash,
              createdAtMs: nowMs, expiresAtMs: nowMs + idempotencyRetentionMs
            }
          }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: { kind: 'execute', run: ({ domainDecision }) => dependencies.createWateringAdvice(domainDecision) },
      publicResponse: { kind: 'execute', run: unwrapResult },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
