import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import { createHash, randomBytes } from 'node:crypto'
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'

import { createPublicContractValidators } from '../../contracts/index.js'
import type { ClaimedGuestObjectKind, ClaimGuestSessionCommandDto, GuestClaimResultDto, UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import { createNodeRequestChainHandler } from '../../foundation/http/node-request-chain-handler.js'
import { PublicRequestError, type RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { UnifiedUserPrincipalResolveError } from '../../identity/domain/resolve-user-principal.js'
import { extractBearerToken } from '../../identity/http/request-identity.js'
import { CapabilitySnapshotExpiredError } from '../../subscription/repository/mysql-capability-snapshot-reader.js'
import type { ClaimGuestPlantCaseApplicationInput, ClaimGuestPlantCaseApplicationResult } from '../application/claim-guest-plant-case.js'
import type { GuestCaseObjectKindsQuery } from '../repository/mysql-guest-case-object-kinds-reader.js'

/** 游客案例认领路由登记（route-registry claimGuestPlantCase）。 */
export const claimGuestPlantCaseRoute: FrozenRoute = {
  method: 'POST',
  path: '/api/v2/user-plants/claims',
  operationId: 'claimGuestPlantCase',
  security: 'authenticated'
}

/** 路由依赖；全部为服务端可信端口。 */
export interface ClaimGuestPlantCaseRouteDependencies {
  /** identity 域登录会话解析（authenticated 路由，游客主体一律拒绝）。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** 新建目标时的请求级能力快照；读取失败或缺失以 null 交给完成事务（不当作默认额度）。 */
  readonly resolveCapabilitySnapshot?: (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto | null>
  /** 完整认领应用用例（登记→租约→完成）。 */
  readonly claimGuestPlantCase: (input: ClaimGuestPlantCaseApplicationInput) => Promise<ClaimGuestPlantCaseApplicationResult>
  /** 认领提交后读取案例已获归属的临时对象类别。 */
  readonly readClaimedObjectKinds: (query: GuestCaseObjectKindsQuery) => Promise<ClaimedGuestObjectKind[]>
  /** 可选服务端引用生成器：认领引用 gcl_、新建植物候选 upl_。 */
  readonly createRef?: (kind: 'claim' | 'plant') => string
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

/** 已校验的 DTO 与幂等键。 */
interface ClaimDto {
  /** 严格认领请求体（含原游客令牌，只在内存使用）。 */
  readonly body: ClaimGuestSessionCommandDto
  /** 客户端重试标识，只在当前调用栈计算摘要。 */
  readonly idempotencyKey: string
}

/** 应用输入与本次候选认领引用（用于判定是否重放）。 */
interface ClaimCommand {
  /** 完整认领用例输入。 */
  readonly input: ClaimGuestPlantCaseApplicationInput
  /** 本次服务端候选认领引用；结果引用不同即为原命令重放。 */
  readonly candidateClaimRef: string
}

/** 与共享 HTTP 合同已确认值一致（http.json_body_limit_bytes），同既有路由约定。 */
const jsonBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
const validators = createPublicContractValidators()
const validIdempotencyKey = /^[\x20-\x7e]{8,128}$/u
const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const invalidRequest = () => new PublicRequestError(400, 'VALIDATION_FAILED', '请求参数不合法')
const principalInvalid = () => new PublicRequestError(401, 'PRINCIPAL_INVALID', '身份凭证无效或已过期')
const unavailable = (message = '服务暂时不可用') => new PublicRequestError(503, 'SERVICE_UNAVAILABLE', message)

/** 默认高熵引用。 */
function generateRef(kind: 'claim' | 'plant'): string {
  return `${kind === 'claim' ? 'gcl_' : 'upl_'}${randomBytes(18).toString('base64url')}`
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

/** 严格解析正文与唯一幂等头；幂等键只走请求头。 */
function parseRequest(input: RestrictedRequest): ClaimDto {
  let body: unknown
  try { body = JSON.parse(input.bodyText) } catch { throw invalidRequest() }
  const key = input.headers['idempotency-key']
  let keyCount = 0
  for (let index = 0; index < input.rawHeaders.length; index += 2) {
    if (input.rawHeaders[index]!.toLowerCase() === 'idempotency-key') { keyCount += 1 }
  }
  if (!validators.claimGuestSession(body) || typeof key !== 'string' || keyCount !== 1 || !validIdempotencyKey.test(key)) { throw invalidRequest() }
  return { body, idempotencyKey: key }
}

/** 应用确定结果到 http-api 错误码表的映射。 */
const rejection: Readonly<Record<string, () => PublicRequestError>> = {
  not_claimable: () => new PublicRequestError(409, 'GUEST_SESSION_NOT_CLAIMABLE', '该游客案例当前不能认领'),
  expired: () => new PublicRequestError(410, 'GUEST_SESSION_EXPIRED', '游客会话或案例已过期'),
  principal_invalid: principalInvalid,
  idempotency_conflict: () => new PublicRequestError(409, 'IDEMPOTENCY_CONFLICT', '幂等键已用于其他请求'),
  capability_denied: () => new PublicRequestError(403, 'CAPABILITY_DENIED', '当前能力不允许创建植物'),
  capability_snapshot_expired: () => new PublicRequestError(409, 'CAPABILITY_SNAPSHOT_EXPIRED', '能力快照已失效，请重新请求'),
  processing: () => unavailable('认领正在处理中，请使用同一幂等键稍后重试'),
  unavailable: () => unavailable()
}

/** 固定请求链：限制 → 认证 → 登录主体 → DTO → 服务端命令 → 认领用例 → 对象类别 → 白名单响应。 */
export function createClaimGuestPlantCaseRouteHandler(dependencies: ClaimGuestPlantCaseRouteDependencies): RouteHandler {
  const createRef = dependencies.createRef ?? generateRef
  return (request, response) => {
    const nowMs = dependencies.now()
    let candidateClaimRef = ''
    let claimed: { sessionRef: string; caseRef: string } = { sessionRef: '', caseRef: '' }
    /** 新建目标读取能力快照时是否明确“已过期”（区别于暂时读不到）；只用于把缺快照导致的失败映射为 409。 */
    let snapshotExpired = false
    return createNodeRequestChainHandler<RestrictedRequest, ResolveUserPrincipalCommand, UserPrincipalDto, ClaimDto, ClaimCommand, ClaimCommand, ClaimGuestPlantCaseApplicationResult, GuestClaimResultDto>({
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
            const principal = await dependencies.resolvePrincipal(command)
            if (!validators.userPrincipal(principal) || Date.parse(principal.issuedAt) > nowMs || Date.parse(principal.expiresAt) <= nowMs) { throw principalInvalid() }
            return principal
          } catch (error: unknown) {
            if (error instanceof UnifiedUserPrincipalResolveError && error.type === 'PRINCIPAL_INVALID') { throw principalInvalid() }
            throw error
          }
        }
      },
      objectOwnership: { kind: 'not_applicable', reason: '案例归属由认领事务内的游客令牌证明与案例锁确认' },
      dtoValidate: { kind: 'execute', run: parseRequest },
      buildCommand: {
        kind: 'execute',
        run: async ({ dto, principal }) => {
          candidateClaimRef = createRef('claim')
          claimed = { sessionRef: dto.body.guestSessionRef, caseRef: dto.body.guestPlantCaseRef }
          const base = {
            principal,
            // 游客令牌即持有证明（guest-token/v1 §3）；当前令牌不轮换，宽限期无发布快照为 null（只阻断上一版证明）。
            proof: { guestSessionRef: dto.body.guestSessionRef, possessionProof: dto.body.guestToken, nowMs, proofRotationGraceSeconds: null },
            guestPlantCaseRef: dto.body.guestPlantCaseRef,
            claimRef: candidateClaimRef,
            idempotencyKeyHash: digest(dto.idempotencyKey)
          }
          if (dto.body.target.type === 'new_user_plant') {
            let capabilitySnapshot: UserCapabilitySnapshotDto | null = null
            try { capabilitySnapshot = (await dependencies.resolveCapabilitySnapshot?.(principal)) ?? null } catch (error: unknown) {
              // 缺能力不猜测授权，由完成事务判定（已成功的同键重放仍可返回原收据）；只记录是否属于“已过期”。
              snapshotExpired = error instanceof CapabilitySnapshotExpiredError
            }
            return { candidateClaimRef, input: { ...base, target: { type: 'new_user_plant' }, newUserPlantRef: createRef('plant'), capabilitySnapshot } }
          }
          return { candidateClaimRef, input: { ...base, target: { type: 'existing_user_plant', user_plant_id: dto.body.target.user_plant_id } } }
        }
      },
      domainRule: { kind: 'execute', run: ({ command }) => command },
      transactionPersistence: { kind: 'execute', run: ({ domainDecision }) => dependencies.claimGuestPlantCase(domainDecision.input) },
      publicResponse: {
        kind: 'execute',
        run: async result => {
          if (result.status !== 'completed') {
            // guest-session-claim.md（2026-10-10 用户裁决）：新建目标因快照已过期而无法完成 → 409 CAPABILITY_SNAPSHOT_EXPIRED。
            if (result.status === 'unavailable' && snapshotExpired) { throw rejection.capability_snapshot_expired!() }
            const mapped = rejection[result.status]
            if (!mapped) { throw new Error('认领用例返回未登记的结果') }
            throw mapped()
          }
          let claimedObjectKinds: ClaimedGuestObjectKind[]
          try {
            claimedObjectKinds = await dependencies.readClaimedObjectKinds({ guestSessionRef: claimed.sessionRef, guestPlantCaseRef: claimed.caseRef })
          } catch { throw unavailable() }
          const data: GuestClaimResultDto = {
            claimRef: result.claimRef as GuestClaimResultDto['claimRef'],
            userPlantId: result.userPlantRef as GuestClaimResultDto['userPlantId'],
            claimedObjectKinds,
            replayed: result.claimRef !== candidateClaimRef
          }
          if (!validators.guestClaimResult(data)) { throw new Error('认领公开结果不合法') }
          return data
        }
      },
      writeAudit: dependencies.writeAudit
    })(request, response)
  }
}
