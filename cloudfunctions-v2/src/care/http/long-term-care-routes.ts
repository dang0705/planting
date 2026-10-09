import { createPublicContractValidators } from '../../contracts/index.js'
import type {
  CareSummaryResponseDto,
  CompleteCarePlanRequestDto,
  ConfirmCareProposalRequestDto,
  CreateCareFactRequestDto,
  UserPrincipalDto
} from '../../contracts/types.js'
import {
  createAuthenticatedJsonRouteHandler,
  validationFailed,
  type AuthenticatedJsonRouteDependencies,
  type AuthenticatedRouteRequest
} from '../../foundation/http/authenticated-json-route.js'
import { PublicRequestError, type PublicErrorType } from '../../foundation/http/request-chain.js'
import type { FrozenRoute, RouteBinding } from '../../foundation/http/route-dispatcher.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { UserPlantCareContext, UserPlantCareContextQuery } from '../../user-plant/repository/mysql-user-plant-care-context-reader.js'
import type { CompletePlanCommand, ConfirmProposalCommand, RecordWateringCommand } from '../application/long-term-care-commands.js'
import { resolvePlanPageLimit } from '../domain/long-term-care-rules.js'
import type { CarePlanRow, LatestAdviceRow, OwnedPlantScope, PlanCursor, WateringFactRow } from '../repository/mysql-long-term-care-read-repository.js'

/** 冻结路由登记（与 route-registry.json 一致）。 */
const route = (method: string, path: string, operationId: string): FrozenRoute => ({ method, path: `/api/v2/user-plants/{userPlantRef}${path}`, operationId, security: 'authenticated' })
export const createCareFactRoute = route('POST', '/care/facts', 'createCareFact')
export const confirmCareProposalRoute = route('POST', '/care/proposals/{proposalRef}/confirmations', 'confirmCareProposal')
export const completeCarePlanRoute = route('POST', '/care/plans/{planRef}/completions', 'completeCarePlan')
export const listCarePlansRoute = route('GET', '/care/plans', 'listCarePlans')
export const getUserPlantCareSummaryRoute = route('GET', '/care/summary', 'getUserPlantCareSummary')

/** 长期养护路由依赖：身份、只读端口与事务化用例。 */
export interface LongTermCareRouteDependencies extends AuthenticatedJsonRouteDependencies<UserPrincipalDto> {
  /** user-plant 只读归属上下文；非本人/已删除为 null。 */
  readonly readPlantContext: (query: UserPlantCareContextQuery) => Promise<UserPlantCareContext | null>
  /** plant-knowledge 只读：目录中文名；无为 null。 */
  readonly readTaxonDisplayName: (catalogTaxonRef: string) => Promise<string | null>
  /** 事务化写用例集合（记录浇水、确认建议、完成计划）。 */
  readonly commands: {
    /** 记录浇水（§3）。 */
    readonly recordWatering: (command: RecordWateringCommand) => Promise<HttpIdempotencyPublicResponseSnapshot>
    /** 确认建议（§6）。 */
    readonly confirmProposal: (command: ConfirmProposalCommand) => Promise<HttpIdempotencyPublicResponseSnapshot>
    /** 完成计划（§7）。 */
    readonly completePlan: (command: CompletePlanCommand) => Promise<HttpIdempotencyPublicResponseSnapshot>
  }
  /** 长期养护只读仓储（事实、计划、结果）。 */
  readonly reads: {
    /** 读取该植物最近一条浇水事实。 */
    readonly latestWateringFact: (scope: OwnedPlantScope) => Promise<WateringFactRow | null>
    /** 按状态与游标分页列出养护计划。 */
    readonly listPlans: (scope: OwnedPlantScope, status: string, limit: number, after: PlanCursor | null) => Promise<CarePlanRow[]>
    /** 最新长期浇水结果。 */
    readonly latestAdvice: (scope: OwnedPlantScope) => Promise<LatestAdviceRow | null>
  }
}

const validators = createPublicContractValidators()
const refPattern = (prefix: string) => new RegExp(`^${prefix}_[A-Za-z0-9_-]{8,60}$`, 'u')
const userPlantRefPattern = refPattern('upl')
const proposalRefPattern = refPattern('cpr')
const planRefPattern = refPattern('cpl')
const planStatuses = new Set(['planned', 'completed', 'cancelled', 'expired'])
const writeErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'USER_PLANT_ARCHIVED', 'VALIDATION_FAILED', 'IDEMPOTENCY_CONFLICT', 'SERVICE_UNAVAILABLE'])
const readErrors = new Set<PublicErrorType>(['USER_PLANT_NOT_FOUND', 'VALIDATION_FAILED', 'SERVICE_UNAVAILABLE'])
const notFound = (): HttpIdempotencyPublicResponseSnapshot => ({ status: 404, body: { error: { type: 'USER_PLANT_NOT_FOUND', message: '用户植物不存在' } } })
const ok = (data: unknown): HttpIdempotencyPublicResponseSnapshot => ({ status: 200, body: { data: data as Record<string, unknown> } })
const iso = (ms: number) => new Date(ms).toISOString()

/** 路径中的引用必须合法（非法 400，不查库）。 */
function pathRef(request: AuthenticatedRouteRequest, name: string, pattern: RegExp): string {
  const value = request.pathParameters[name] ?? ''
  if (!pattern.test(value)) { throw validationFailed() }
  return value
}

/** 正文严格合同校验。 */
function body<T>(request: AuthenticatedRouteRequest, validate: (value: unknown) => boolean): T {
  if (!validate(request.body)) { throw validationFailed() }
  return request.body as T
}

/** 不透明游标：base64url(JSON [scheduledAtMs, planRef])。 */
const encodeCursor = (cursor: PlanCursor) => Buffer.from(JSON.stringify([cursor.scheduledAtMs, cursor.planRef]), 'utf8').toString('base64url')
function decodeCursor(raw: string): PlanCursor {
  try {
    const value = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as unknown
    if (Array.isArray(value) && value.length === 2 && Number.isSafeInteger(value[0]) && value[0] >= 0 && typeof value[1] === 'string' && planRefPattern.test(value[1])
      && encodeCursor({ scheduledAtMs: value[0], planRef: value[1] }) === raw) {
      return { scheduledAtMs: value[0], planRef: value[1] }
    }
  } catch { /* 落到 400 */ }
  throw validationFailed()
}

/** 计划公开投影。 */
const planDto = (row: CarePlanRow) => ({ planRef: row.planRef, planType: 'check_soil', scheduledAt: iso(row.scheduledAtMs), status: row.status,
  sourceProposalRef: row.sourceProposalRef, completedFactRef: row.completedFactRef, calendar: row.calendar })

/** 外部只读失败统一 503，不泄露 SQL。 */
async function guarded<T>(work: () => Promise<T>): Promise<T> {
  try { return await work() } catch (error: unknown) {
    if (error instanceof PublicRequestError) { throw error }
    throw new PublicRequestError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用')
  }
}

/** 组装五个长期养护路由（§3–§7）。 */
export function createLongTermCareRouteBindings(dependencies: LongTermCareRouteDependencies): RouteBinding[] {
  const scopeOf = (principal: UserPrincipalDto, userPlantRef: string) => ({ userRef: principal.user_id, userPlantRef })
  const common = { validateError: (value: unknown) => validators.errorResponse(value) }
  return [
    { route: createCareFactRoute, handler: createAuthenticatedJsonRouteHandler(dependencies, {
      ...common, route: createCareFactRoute, kind: 'write', passThroughErrors: writeErrors,
      parse: request => ({ userPlantRef: pathRef(request, 'userPlantRef', userPlantRefPattern), body: body<CreateCareFactRequestDto>(request, validators.createCareFactRequest) }),
      execute: ({ principal, dto, nowMs, idempotency }) => dependencies.commands.recordWatering({
        ...scopeOf(principal, dto.userPlantRef), nowMs, idempotency: idempotency!, occurredAtMs: Date.parse(dto.body.occurredAt), amountMl: dto.body.amountMl ?? null }),
      validateData: data => validators.careFactResponse(data)
    }) },
    { route: confirmCareProposalRoute, handler: createAuthenticatedJsonRouteHandler(dependencies, {
      ...common, route: confirmCareProposalRoute, kind: 'write', passThroughErrors: new Set([...writeErrors, 'CARE_PROPOSAL_NOT_CONFIRMABLE']),
      parse: request => ({ userPlantRef: pathRef(request, 'userPlantRef', userPlantRefPattern), proposalRef: pathRef(request, 'proposalRef', proposalRefPattern),
        body: body<ConfirmCareProposalRequestDto>(request, validators.confirmCareProposalRequest) }),
      execute: async ({ principal, dto, nowMs, idempotency }) => {
        const scope = scopeOf(principal, dto.userPlantRef)
        const context = await guarded(() => dependencies.readPlantContext(scope))
        if (context === null) { return notFound() }
        const displayName = context.nickname ?? (context.catalogTaxonRef === null ? null : await guarded(() => dependencies.readTaxonDisplayName(context.catalogTaxonRef!)))
        return dependencies.commands.confirmProposal({ ...scope, nowMs, idempotency: idempotency!, proposalRef: dto.proposalRef, request: dto.body,
          displayName, profileVersion: context.profileVersion, bindingRef: context.bindingRef })
      },
      validateData: data => validators.careConfirmationResponse(data)
    }) },
    { route: completeCarePlanRoute, handler: createAuthenticatedJsonRouteHandler(dependencies, {
      ...common, route: completeCarePlanRoute, kind: 'write', passThroughErrors: new Set([...writeErrors, 'CARE_PLAN_VERSION_CONFLICT']),
      parse: request => ({ userPlantRef: pathRef(request, 'userPlantRef', userPlantRefPattern), planRef: pathRef(request, 'planRef', planRefPattern),
        body: body<CompleteCarePlanRequestDto>(request, validators.completeCarePlanRequest) }),
      execute: ({ principal, dto, nowMs, idempotency }) => dependencies.commands.completePlan({
        ...scopeOf(principal, dto.userPlantRef), nowMs, idempotency: idempotency!, planRef: dto.planRef, request: dto.body }),
      validateData: data => validators.carePlanResponse(data)
    }) },
    { route: listCarePlansRoute, handler: createAuthenticatedJsonRouteHandler(dependencies, {
      ...common, route: listCarePlansRoute, kind: 'read', passThroughErrors: readErrors,
      parse: request => {
        const keys = [...request.query.keys()]
        if (keys.some(key => !['status', 'limit', 'cursor'].includes(key)) || new Set(keys).size !== keys.length) { throw validationFailed() }
        const status = request.query.get('status') ?? 'planned'
        const limit = resolvePlanPageLimit(request.query.get('limit') ?? undefined)
        if (!planStatuses.has(status) || limit === null) { throw validationFailed() }
        const cursor = request.query.get('cursor')
        return { userPlantRef: pathRef(request, 'userPlantRef', userPlantRefPattern), status, limit, after: cursor === null ? null : decodeCursor(cursor) }
      },
      execute: async ({ principal, dto }) => {
        const scope = scopeOf(principal, dto.userPlantRef)
        if (await guarded(() => dependencies.readPlantContext(scope)) === null) { return notFound() }
        const rows = await guarded(() => dependencies.reads.listPlans(scope, dto.status, dto.limit, dto.after))
        const page = rows.slice(0, dto.limit)
        const last = page.at(-1)
        return ok({ items: page.map(planDto), nextCursor: rows.length > dto.limit && last ? encodeCursor({ scheduledAtMs: last.scheduledAtMs, planRef: last.planRef }) : null })
      },
      validateData: data => validators.carePlanListResponse(data)
    }) },
    { route: getUserPlantCareSummaryRoute, handler: createAuthenticatedJsonRouteHandler(dependencies, {
      ...common, route: getUserPlantCareSummaryRoute, kind: 'read', passThroughErrors: readErrors,
      parse: request => {
        if ([...request.query.keys()].length > 0) { throw validationFailed() }
        return { userPlantRef: pathRef(request, 'userPlantRef', userPlantRefPattern) }
      },
      execute: async ({ principal, dto, nowMs }) => {
        const scope = scopeOf(principal, dto.userPlantRef)
        const context = await guarded(() => dependencies.readPlantContext(scope))
        if (context === null) { return notFound() }
        const [fact, advice, plans] = await guarded(() => Promise.all([dependencies.reads.latestWateringFact(scope), dependencies.reads.latestAdvice(scope),
          dependencies.reads.listPlans(scope, 'planned', 1, null)]))
        const proposal = advice?.proposal ?? null
        const nextPlan = plans[0] ?? null
        const summary: CareSummaryResponseDto = {
          lastWatering: fact === null ? null : { factRef: fact.factRef, occurredAt: iso(fact.occurredAtMs), amountMl: fact.amountMl },
          latestWateringAdvice: advice === null ? null : {
            resultRef: advice.resultRef, generatedAt: advice.result.generatedAt, status: advice.result.status, action: advice.result.details.action,
            checkWindow: advice.result.details.checkWindow ?? null,
            proposal: proposal === null ? null : {
              proposalRef: proposal.proposalRef,
              status: (proposal.status === 'proposed' && proposal.validUntilMs !== null && proposal.validUntilMs <= nowMs ? 'expired' : proposal.status) as 'proposed',
              validUntil: proposal.validUntilMs === null ? null : iso(proposal.validUntilMs)
            }
          },
          nextPlan: nextPlan === null ? null : { planRef: nextPlan.planRef, planType: 'check_soil', scheduledAt: iso(nextPlan.scheduledAtMs), status: 'planned', calendar: nextPlan.calendar },
          profileReadiness: { hasMeasuredPot: context.measuredPot !== null, hasCatalogBinding: context.catalogTaxonRef !== null }
        }
        return ok(summary)
      },
      validateData: data => validators.careSummaryResponse(data)
    }) }
  ]
}
