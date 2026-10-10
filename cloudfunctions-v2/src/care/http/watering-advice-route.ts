import { idempotencyRetentionMs, type CareLongTermRules, type HttpRequestWriteRules } from '../../configuration/business-policies/index.js'
import { requirePolicy, type PolicyRulesPort } from '../../foundation/policy/require-policy.js'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
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
import type { CreateUserPlantWateringAdviceInput } from '../application/create-user-plant-watering-advice.js'
import type { UserPlantCareContext, UserPlantCareContextQuery } from '../../user-plant/repository/mysql-user-plant-care-context-reader.js'
import type { OwnedPlantScope, WateringFactRow } from '../repository/mysql-long-term-care-read-repository.js'
import type { TemporaryCareOwner } from '../domain/temporary-care-result-record.js'
import type { NormalizedOutdoorRadiation } from '../light/normalize-open-meteo-radiation.js'
import type { OpenMeteoRadiationQuery } from '../provider/open-meteo-radiation-client.js'
import { resolveOpenMeteoRequestWindow } from '../watering/watering-advice-hard-rules.js'
import { parseWateringAdviceRequest, roundCoordinate, type WateringAdviceCommand } from './watering-advice-request.js'

/** 浇水建议路由登记（watering-advice/v1）。 */
export const createWateringAdviceRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/care/watering-advice',
  operationId: 'createWateringAdvice',
  security: 'guest_or_authenticated'
}

/** 路由依赖；全部为服务端可信端口，客户端不能提交归属、期限或策略。 */
/** 城市目录中的城市中心坐标（度，未降精度）。 */
export interface CityCoordinates {
  /** 城市中心纬度（度）。 */ readonly latitude: number
  /** 城市中心经度（度）。 */ readonly longitude: number
}

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
  /** weather 城市目录只读：城市代码 → 城市中心坐标（度）；不在目录返回 null，读取失败抛出（→ 503）。临时案例与长期植物共用。 */
  readonly resolveCityCoordinates: (cityCode: string) => Promise<CityCoordinates | null>
  /** 长期植物分支（long-term-care/v1 §2）；未接入时长期植物目标返回 400。 */
  readonly userPlant?: UserPlantWateringAdviceDependencies
  /** 可选服务端引用生成器；缺省为 18 字节随机数 base64url。 */
  readonly createRef?: (kind: 'session' | 'result' | 'proposal') => string
  /** 服务端 UTC 毫秒时钟；每请求只取一次。 */
  readonly now: () => number
  /** 读取 HTTP 写入策略快照（幂等保留期）；null 时 503。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /** 读取长期养护规则策略快照（长期植物建议有效小时数）；只在 user_plant 目标时读取，null 时 503。 */
  readonly readLongTermRules: PolicyRulesPort<CareLongTermRules>
  /** 脱敏请求结果审计端口。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 长期植物分支依赖：全部为服务端可信只读端口与事务化用例。 */
export interface UserPlantWateringAdviceDependencies {
  /** user-plant 只读归属上下文（档案盆器、昵称、最新品种绑定）；非本人/已删除为 null。 */
  readonly readPlantContext: (query: UserPlantCareContextQuery) => Promise<UserPlantCareContext | null>
  /** care 只读：最近一条浇水事实。 */
  readonly readLatestWateringFact: (scope: OwnedPlantScope) => Promise<WateringFactRow | null>
  /** 事务化长期浇水建议用例。 */
  readonly createAdvice: (input: CreateUserPlantWateringAdviceInput) => Promise<HttpIdempotencyPublicResponseSnapshot>
}

/** 持久化分支：临时案例或长期植物。 */
type AdvicePersistence =
  | {
      /** 临时案例分支：游客或登录用户的临时识别案例。 */
      readonly kind: 'temporary_case'
      /** 临时案例用例输入。 */
      readonly input: CreateWateringAdviceApplicationInput
    }
  | {
      /** 长期植物分支：本人花园中的用户植物。 */
      readonly kind: 'user_plant'
      /** 长期植物用例输入。 */
      readonly input: CreateUserPlantWateringAdviceInput
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
  /** 已映射且降精度的内部命令。 */
  readonly command: WateringAdviceCommand
  /** 原始 JSON 规范化（键排序）SHA-256（裁决 8）。 */
  readonly requestHash: string
  /** 客户端重试标识，只在当前调用栈计算摘要。 */
  readonly idempotencyKey: string
}

/** 与共享 HTTP 合同已确认值一致（http.json_body_limit_bytes），同既有路由约定（裁决 7）。 */
const jsonBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
const validators = createPublicContractValidators()
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
/** 应用用例允许原样公开的确定错误。 */
const passThroughErrors = new Set(['NOT_FOUND', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE', 'USER_PLANT_NOT_FOUND', 'USER_PLANT_ARCHIVED'])
/** 长期植物不得由客户端提交的字段（服务端从档案、绑定与事实取，§2）。 */
const serverOwnedUserPlantFields = ['catalogTaxonRef', 'pot', 'lastWatering']

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const invalidRequest = (message = '请求参数不合法') => new PublicRequestError(400, 'VALIDATION_FAILED', message)
const principalInvalid = () => new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
const notFound = () => new PublicRequestError(404, 'NOT_FOUND', '临时案例不存在或已失效')
const unavailable = () => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')

/** 默认高熵引用：会话 tcs_、结果 cres_、建议 cpr_。 */
function generateRef(kind: 'session' | 'result' | 'proposal'): string {
  return `${{ session: 'tcs_', result: 'cres_', proposal: 'cpr_' }[kind]}${randomBytes(18).toString('base64url')}`
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

/** 严格解析正文与幂等头；长期植物目标须已接入分支且不得提交服务端字段。 */
function parseRequest(input: RestrictedRequest, nowMs: number, userPlantEnabled: boolean): AdviceDto {
  let body: unknown
  try { body = JSON.parse(input.bodyText) } catch { throw invalidRequest() }
  const parsed = parseWateringAdviceRequest(body, nowMs)
  if (parsed.status !== 'ok') { throw invalidRequest() }
  if (parsed.command.target.kind === 'user_plant') {
    if (!userPlantEnabled) { throw invalidRequest('长期植物浇水建议暂未开放') }
    if (serverOwnedUserPlantFields.some(field => Object.hasOwn(body as object, field))) { throw invalidRequest('长期植物的品种、盆器与上次浇水由服务端提供') }
  }
  const key = input.headers['idempotency-key']
  let keyCount = 0
  for (let index = 0; index < input.rawHeaders.length; index += 2) {
    if (input.rawHeaders[index]!.toLowerCase() === 'idempotency-key') { keyCount += 1 }
  }
  if (typeof key !== 'string' || keyCount !== 1 || !validIdempotencyKey.test(key)) { throw invalidRequest() }
  return { command: parsed.command, requestHash: calculateCanonicalJsonSha256(body as CanonicalJsonValue), idempotencyKey: key }
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

/** 长期植物：服务端上下文覆盖品种、盆器与上次浇水。 */
function withUserPlantContext(command: WateringAdviceCommand, context: UserPlantCareContext, lastWatering: WateringFactRow | null): WateringAdviceCommand {
  const pot = context.measuredPot
  return { ...command, catalogTaxonRef: context.catalogTaxonRef, lastWateringAtMs: lastWatering?.occurredAtMs ?? null,
    pot: pot === null
      ? { actualInnerPotConfirmed: null, drainageAvailable: null, potTopDiameterCm: null, potBottomDiameterCm: null, potHeightCm: null }
      : { ...pot } }
}

/** 一天的毫秒数（Lux 存档有效期换算）。 */
const millisecondsPerDay = 86_400_000

/** 请求未带 Lux 时取档案存档；只在策略可用且读数未过期（含恰好到期）时采用，请求带读数时以请求为准。 */
function withStoredPlantLight(command: WateringAdviceCommand, context: UserPlantCareContext | null, policy: PublishedWateringPolicy | null, nowMs: number): WateringAdviceCommand {
  const stored = context?.plantLight ?? null
  if (command.lightReading !== null || stored === null || policy === null) { return command }
  const ageMs = nowMs - stored.measuredAtMs
  if (ageMs < 0 || ageMs > policy.snapshot.luxAnchorMaxAgeDays * millisecondsPerDay) { return command }
  return { ...command, lightReading: { lux: stored.lux, measuredAtMs: stored.measuredAtMs, source: stored.source } }
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
      AdvicePersistence, AdvicePersistence, HttpIdempotencyPublicResponseSnapshot, CareCapabilityResponseDto
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
      dtoValidate: { kind: 'execute', run: restricted => parseRequest(restricted, nowMs, dependencies.userPlant !== undefined) },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }): Promise<AdvicePersistence> => {
          const target = dto.command.target
          let command = dto.command
          let owner: TemporaryCareOwner | null = null
          let userPlant: { context: UserPlantCareContext; fact: WateringFactRow | null; scope: OwnedPlantScope } | null = null
          if (target.kind === 'temporary_case') {
            owner = ownerOf(principal, target.caseRef)
            if (await dependencies.readOwnedCase({ owner, nowMs }) !== 'owned') { throw notFound() }
            // 临时案例：请求只交城市代码，服务端取城市中心坐标（2026-10-10 用户纠偏）；不在目录 → 400，目录读取失败 → 503。
            let center: CityCoordinates | null
            try { center = await dependencies.resolveCityCoordinates(command.cityRef!) } catch { throw unavailable() }
            if (center === null) { throw invalidRequest('城市不在支持列表') }
            command = { ...command, location: { latitude: roundCoordinate(center.latitude), longitude: roundCoordinate(center.longitude) } }
          } else {
            // 长期植物只对登录用户开放（T8）；游客按请求不合法处理，不探测植物存在性。
            if (principal.principalType !== 'user' || dependencies.userPlant === undefined) { throw invalidRequest() }
            const scope = { userRef: principal.user_id, userPlantRef: target.userPlantRef }
            let context: UserPlantCareContext | null
            let fact: WateringFactRow | null
            try {
              context = await dependencies.userPlant.readPlantContext(scope)
              fact = context === null ? null : await dependencies.userPlant.readLatestWateringFact(scope)
            } catch { throw unavailable() }
            if (context === null) { throw new PublicRequestError(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
            if (context.lifecycle === 'archived') { throw new PublicRequestError(409, 'USER_PLANT_ARCHIVED', '植物已归档，只能查看') }
            command = withUserPlantContext(command, context, fact)
            // 长期植物坐标 = 档案城市中心坐标（降到 0.01°）；无城市或不在目录 → null，不取辐射（2026-10-10 用户裁决）。
            let center: CityCoordinates | null = null
            if (context.cityRef !== null) {
              try { center = await dependencies.resolveCityCoordinates(context.cityRef) } catch { throw unavailable() }
            }
            command = { ...command, cityRef: center === null ? null : context.cityRef,
              location: center === null ? null : { latitude: roundCoordinate(center.latitude), longitude: roundCoordinate(center.longitude) } }
            userPlant = { context, fact, scope }
          }
          let policy: PublishedWateringPolicy | null
          let baseline: MvpPlantBaseline | null
          try {
            policy = await dependencies.readWateringPolicy(new Date(nowMs).toISOString())
            baseline = command.catalogTaxonRef === null ? null : await dependencies.readPlantBaseline(command.catalogTaxonRef)
          } catch { throw unavailable() }
          // 长期植物 Lux 存档（2026-10-10 用户裁决）：请求未带读数时用档案中仍在 luxAnchorMaxAgeDays 内的读数；过期按未测处理（plant_light）。
          command = withStoredPlantLight(command, userPlant?.context ?? null, policy, nowMs)
          const window = resolveOpenMeteoRequestWindow({ nowMs, evidenceTimesMs: [command.soil?.observedAt ?? null, command.lastWateringAtMs, command.lightReading?.measuredAtMs ?? null] })
          let radiation: NormalizedOutdoorRadiation | null
          const location = command.location
          try {
            radiation = location === null ? null : await dependencies.fetchRadiation({ latitude: location.latitude, longitude: location.longitude, ...window })
          } catch { radiation = null }
          const built = buildWateringAdvice({ command, policy, baseline, radiation, nowMs })
          const scope = principal.principalType === 'guest' ? principal.guestSessionRef : principal.user_id
          const retentionMs = idempotencyRetentionMs(await requirePolicy(dependencies.readHttpWriteRules))
          const idempotency = {
            principalType: principal.principalType, principalScopeHash: digest(scope), httpMethod: 'POST',
            normalizedPath: createWateringAdviceRoute.path, operationId: createWateringAdviceRoute.operationId,
            idempotencyKeyHash: digest(dto.idempotencyKey), requestHash: dto.requestHash,
            createdAtMs: nowMs, expiresAtMs: nowMs + retentionMs
          }
          if (userPlant !== null) {
            return { kind: 'user_plant', input: {
              userRef: userPlant.scope.userRef, userPlantRef: userPlant.scope.userPlantRef, built, resultRef: createRef('result'), proposalRef: createRef('proposal'),
              nowMs, idempotency, rules: await requirePolicy(dependencies.readLongTermRules),
              fingerprint: { profileVersion: userPlant.context.profileVersion, bindingRef: userPlant.context.bindingRef, latestWateringFactRef: userPlant.fact?.factRef ?? null }
            } }
          }
          return { kind: 'temporary_case', input: { owner: owner!, built, newSessionRef: createRef('session'), newResultRef: createRef('result'), occurredAtMs: nowMs, idempotency } }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: {
        kind: 'execute',
        run: ({ domainDecision }) => domainDecision.kind === 'user_plant'
          ? dependencies.userPlant!.createAdvice(domainDecision.input)
          : dependencies.createWateringAdvice(domainDecision.input)
      },
      publicResponse: { kind: 'execute', run: unwrapResult },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
