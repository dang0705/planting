import { createHash } from 'node:crypto'
import type { IncomingMessage, IncomingHttpHeaders } from 'node:http'
import Ajv from 'ajv'
import type { UserPrincipalDto, UserCapabilitySnapshotDto } from '../../contracts/types.js'
import { userPrincipalSchema } from '../../contracts/schemas.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import { PublicRequestError, type RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler, RoutePathParameters } from '../../foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import type { AuthenticatedEphemeralBindingApplicationInput, AuthenticatedEphemeralBindingApplicationResult } from '../application/bind-authenticated-ephemeral-case.js'
import type { AuthenticatedEphemeralOwnershipInput, AuthenticatedEphemeralOwnershipResult } from '../repository/mysql-authenticated-ephemeral-case-ownership-reader.js'

import type { AuthenticatedEphemeralNewPlantInput, AuthenticatedEphemeralNewPlantResult } from '../repository/mysql-authenticated-ephemeral-new-plant-repository.js'

/** 登录临时案例绑定与游客认领命名空间分离；目标由用户显式选择。 */
export const authenticatedEphemeralBindingRoute: FrozenRoute = {
  method: 'POST', path: '/api/v2/user-plants/ephemeral-cases/{ephemeralCaseRef}/bindings', operationId: 'bindAuthenticatedEphemeralCase', security: 'authenticated'
}
/** 协议边界只依赖已经实现的身份、归属与绑定应用。 */
export interface AuthenticatedEphemeralBindingRouteDependencies {
  /** 从当前不可变HTTP写策略读取，缺失不设默认。 */ readonly maxBodyBytes: number | null
  /** identity验真Bearer会话。 */ readonly resolvePrincipal: (input: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 本人案例只读前置；事务内仍须再次验证。 */ readonly readOwnedCase: (input: AuthenticatedEphemeralOwnershipInput) => Promise<AuthenticatedEphemeralOwnershipResult>
  /** 完整三表事务与提交未知只读核对。 */ readonly bindExisting: (input: AuthenticatedEphemeralBindingApplicationInput) => Promise<AuthenticatedEphemeralBindingApplicationResult>
  /** 新建目标与绑定同事务，未接线时拒绝新建。 */ readonly saveNew?: (input: AuthenticatedEphemeralNewPlantInput) => Promise<AuthenticatedEphemeralNewPlantResult>
  /** 服务端生成候选植物引用，不接受客户端指定。 */ readonly createUserPlantRef?: () => string
  /** 订阅域可信能力；缺失以null进入事务，允许读回历史成功。 */ readonly resolveCapabilitySnapshot?: (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto | null>
  /** 服务端时钟，整个请求锁定一次。 */ readonly now: () => number
  /** 服务端随机命令引用；调用者不能指定。 */ readonly createPromotionRef: () => string
  /** 脱敏结果审计，不消费请求正文和Bearer。 */ readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}
/** 限制阶段保留认证/解析所需的最小原始输入。 */
interface Restricted {
  /** 原始头仅在当前请求使用。 */ readonly headers: IncomingHttpHeaders
  /** 识别Node合并之前的重复幂等头。 */ readonly rawHeaders: readonly string[]
  /** 已受限正文，归属确认之后才解析。 */ readonly text: string
  /** 经分发器提取、尚待精确准入的案例引用。 */ readonly parameters: RoutePathParameters
  /** 当前服务端时刻。 */ readonly now: number
}
/** 严格客户端输入，不包括归属、期限或命令引用。 */
interface BindingDto {
  /** 当前本人临时案例。 */ readonly ephemeralCaseRef: string
  /** 用户显式选定的目标。 */ readonly target: {
    /** 用户明确选择已有植物。 */ type: 'existing_user_plant'
    /** 用户选定、尚须事务确认归属的植物公开引用。 */ user_plant_id: string
  } | {
    /** 用户仅声明新建，不携带植物候选引用。 */ type: 'new_user_plant'
  }
  /** 原始重试键只用于摘要。 */ readonly key: string
}
const ajv = new Ajv({ strict: true, allErrors: true })
const principalValid = ajv.compile(userPrincipalSchema)
const plantPattern = '^upl_[A-Za-z0-9_-]{8,}$'
/** 两类明确目标共享协议链，内部命令保持不同类型。 */
type BindingCommand = {
  /** 已有目标分支，必须匹配用户指定引用。 */ kind: 'existing'
  /** 已有植物绑定应用的可信命令。 */ input: AuthenticatedEphemeralBindingApplicationInput
} | {
  /** 显式新建分支，允许返回原成功收据。 */ kind: 'new'
  /** 服务端候选植物与可信能力组成的新建命令。 */ input: AuthenticatedEphemeralNewPlantInput
}
type BindingResult = AuthenticatedEphemeralBindingApplicationResult | AuthenticatedEphemeralNewPlantResult
const requestValid = ajv.compile<{ target: BindingDto['target'] }>({
  type: 'object', additionalProperties: false, required: ['target'], properties: {
    target: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['type', 'user_plant_id'], properties: { type: { type: 'string', const: 'existing_user_plant' }, user_plant_id: { type: 'string', pattern: plantPattern, maxLength: 64 } } },
      { type: 'object', additionalProperties: false, required: ['type'], properties: { type: { type: 'string', const: 'new_user_plant' } } }
    ] }
  }
})
/** 固定中文错误，不包含原始输入或存储原因。 */
function invalid(): PublicRequestError { return new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法') }
/** 限制/存储不可用不得授予成功或猜测默认。 */
function unavailable(): PublicRequestError { return new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用') }
/** 案例和目标不可见使用同一错误，防止泄露所有者。 */
function notFound(): PublicRequestError { return new PublicRequestError(404, 'NOT_FOUND', '案例或用户植物不存在') }
/** 不透明路径必须使用登录案例命名空间。 */
function caseReference(parameters: RoutePathParameters): string {
  const ref = parameters.ephemeralCaseRef
  if (Object.keys(parameters).length !== 1 || typeof ref !== 'string' || ref.length > 64 || !/^epc_[A-Za-z0-9_-]{8,}$/u.test(ref)) { throw invalid() }
  return ref
}
/** 先限制字节与媒体，再消费正文；超限排空以返回稳定拒绝。 */
async function restrict(request: IncomingMessage, parameters: RoutePathParameters, d: AuthenticatedEphemeralBindingRouteDependencies, now: number): Promise<Restricted> {
  if (d.maxBodyBytes === null || !Number.isSafeInteger(d.maxBodyBytes) || d.maxBodyBytes <= 0 || !Number.isSafeInteger(now) || now < 0 || !Number.isFinite(new Date(now).getTime())) { request.resume(); throw unavailable() }
  const media = request.headers['content-type']
  if (typeof media !== 'string' || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(media)) { request.resume(); throw new PublicRequestError(415, 'UNSUPPORTED_MEDIA_TYPE', '请求内容类型不受支持') }
  let size = 0, oversized = false
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += buffer.byteLength
    if (size > d.maxBodyBytes) { oversized = true; chunks.length = 0 }
    if (!oversized) { chunks.push(buffer) }
  }
  if (oversized) { throw new PublicRequestError(413, 'PAYLOAD_TOO_LARGE', '请求内容过大') }
  return { headers: request.headers, rawHeaders: request.rawHeaders, text: Buffer.concat(chunks).toString('utf8'), parameters, now }
}
/** 严格解析JSON和单值幂等头，不从正文读取任何服务端信息。 */
function parse(r: Restricted): BindingDto {
  let body: unknown
  try { body = JSON.parse(r.text) } catch { throw invalid() }
  const key = r.headers['idempotency-key']
  let count = 0
  for (let i = 0; i < r.rawHeaders.length; i += 2) { if (r.rawHeaders[i]!.toLowerCase() === 'idempotency-key') { count++ } }
  if (!requestValid(body) || typeof key !== 'string' || count !== 1 || !/^[\x20-\x7e]{8,128}$/u.test(key)) { throw invalid() }
  return Object.freeze({ ephemeralCaseRef: caseReference(r.parameters), target: Object.freeze({ ...body.target }), key })
}
/** 拒绝状态白名单与成功收据核验；仅目标引用可进入成功正文。 */
function project(result: BindingResult, command: BindingCommand): { user_plant_id: string } {
  if (!result || typeof result !== 'object' || Array.isArray(result)) { throw new Error('绑定应用结果不合法') }
  if (result.status === 'bound') {
    if (Object.keys(result).length !== 4 || Object.keys(result).some(k => !['status', 'promotionRef', 'userPlantRef', 'boundAtMs'].includes(k))
      || typeof result.promotionRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(result.promotionRef)
      || typeof result.userPlantRef !== 'string' || result.userPlantRef.length > 64 || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(result.userPlantRef)
      || (command.kind === 'existing' && result.userPlantRef !== command.input.command.targetUserPlantRef) || !Number.isSafeInteger(result.boundAtMs) || result.boundAtMs < 0 || result.boundAtMs > (command.kind === 'existing' ? command.input.command.occurredAtMs : command.input.occurredAtMs)) { throw new Error('成功绑定不匹配') }
    return { user_plant_id: result.userPlantRef }
  }
  if (Object.keys(result).length !== 1) { throw new Error('绑定拒绝结果不合法') }
  switch (result.status) {
    case 'not_found': throw notFound()
    case 'principal_invalid': throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
    case 'expired': case 'already_bound': throw new PublicRequestError(409, 'EPHEMERAL_CASE_NOT_BINDABLE', '当前案例不能绑定，请检查后重新操作')
    case 'idempotency_conflict': throw new PublicRequestError(409, 'IDEMPOTENCY_CONFLICT', '重复请求参数不一致')
    case 'capability_denied': throw new PublicRequestError(403, 'CAPABILITY_DENIED', '当前能力不允许创建植物')
    case 'capability_snapshot_expired': throw new PublicRequestError(409, 'CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已过期，请重新操作')
    case 'unavailable': throw unavailable()
    default: throw new Error('绑定结果未登记')
  }
}
/** 每请求固定链：限制→认证→主体→案例归属→DTO→服务端命令→事务→脱敏投影。 */
export function createAuthenticatedEphemeralBindingRouteHandler(d: AuthenticatedEphemeralBindingRouteDependencies): RouteHandler {
  return (request, response, parameters) => {
    const now = d.now()
    let command: BindingCommand
    return createNodeRequestChainHandler<Restricted, ResolveUserPrincipalCommand, UserPrincipalDto, BindingDto, BindingCommand, BindingCommand, BindingResult, { user_plant_id: string }>({
      requestLimits: { kind: 'execute', run: r => restrict(r, parameters, d, now) },
      identityValidate: { kind: 'execute', run: r => { const bearerToken = extractBearerToken(r.headers); if (!bearerToken) { throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期') } return { bearerToken, nowMs: now } } },
      principalResolve: { kind: 'execute', run: async c => {
        try {
          const p = await d.resolvePrincipal(c)
          if (!principalValid(p) || Date.parse(p.issuedAt) > now || Date.parse(p.expiresAt) <= now || !Number.isFinite(Date.parse(p.issuedAt)) || !Number.isFinite(Date.parse(p.expiresAt))) { throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期') }
          return p
        } catch (cause) { if (cause instanceof UnifiedUserPrincipalResolveError && cause.type === 'PRINCIPAL_INVALID') { throw new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期') } throw cause }
      } },
      objectOwnership: { kind: 'execute', run: async ({ request: r, principal }) => {
        const owned = await d.readOwnedCase({ userRef: principal.user_id, ephemeralCaseRef: caseReference(r.parameters) })
        if (!owned || Object.keys(owned).length !== 1) { throw new Error('归属结果不合法') }
        if (owned.status === 'not_found') { throw notFound() }
        if (owned.status === 'unavailable') { throw unavailable() }
        if (owned.status !== 'owned') { throw new Error('归属状态不合法') }
      } },
      dtoValidate: { kind: 'execute', run: parse },
      buildCommand: { kind: 'execute', run: async ({ dto, principal }) => {
        const promotionRef = d.createPromotionRef()
        if (typeof promotionRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(promotionRef)) { throw new Error('服务端命令引用不合法') }
        const idempotencyKeyHash = createHash('sha256').update(dto.key, 'utf8').digest('hex')
        if (dto.target.type === 'existing_user_plant') {
          command = { kind: 'existing', input: { principal, command: { ephemeralCaseRef: dto.ephemeralCaseRef, targetUserPlantRef: dto.target.user_plant_id, promotionRef, idempotencyKeyHash, occurredAtMs: now } } }
        } else {
          if (!d.saveNew || !d.createUserPlantRef) { throw unavailable() }
          const newUserPlantRef = d.createUserPlantRef()
          if (typeof newUserPlantRef !== 'string' || newUserPlantRef.length > 64 || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(newUserPlantRef)) { throw new Error('服务端植物引用不合法') }
          let capabilitySnapshot: UserCapabilitySnapshotDto | null = null
          try { capabilitySnapshot = await d.resolveCapabilitySnapshot?.(principal) ?? null } catch { /* 缺能力不能猜测授权，原收据仍由事务核对。 */ }
          command = { kind: 'new', input: { principal, capabilitySnapshot, ephemeralCaseRef: dto.ephemeralCaseRef, newUserPlantRef, promotionRef, idempotencyKeyHash, occurredAtMs: now } }
        }
        return command
      } },
      domainRule: { kind: 'execute', run: ({ command: c }) => c },
      transactionPersistence: { kind: 'execute', run: ({ domainDecision }) => domainDecision.kind === 'existing' ? d.bindExisting(domainDecision.input) : d.saveNew!(domainDecision.input) },
      publicResponse: { kind: 'execute', run: r => project(r, command) }, writeAudit: d.writeAudit
    })(request, response)
  }
}
