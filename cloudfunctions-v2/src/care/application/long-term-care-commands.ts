import type { CareCalendarDto, CompleteCarePlanRequestDto, ConfirmCareProposalRequestDto } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  IdempotentWriteRetryLaterError,
  publicErrorSnapshot,
  runIdempotentWrite,
  type IdempotentWriteDependencies
} from '../../foundation/idempotency/run-idempotent-write.js'
import { lockOwnedUserPlant, readLatestBindingRef, type LockedOwnedUserPlant } from '../../user-plant/repository/mysql-catalog-binding-repository.js'
import { buildCareCalendar, resolveCheckScheduledAt, validateWateringOccurredAt } from '../domain/long-term-care-rules.js'
import {
  finishCarePlan,
  insertCarePlan,
  insertSoilObservation,
  insertWateringFact,
  lockCareProposal,
  lockCarePlan,
  settleCareProposal
} from '../repository/mysql-long-term-care-repository.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 服务端引用生成端口（高熵、带前缀）。 */
export type CareRefFactory = (kind: 'fact' | 'plan' | 'command' | 'observation') => string

/** 所有长期写用例共享的已验真作用域。 */
export interface OwnedPlantCommandScope {
  /** 统一用户公开标识。 */
  readonly userRef: string
  /** 路径中的用户植物公开引用。 */
  readonly userPlantRef: string
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 共享 HTTP 幂等占位输入。 */
  readonly idempotency: HttpIdempotencyReservationInput
}

/** 确认建议输入；日历名称来自事务前读取的档案昵称或品种中文名。 */
export interface ConfirmProposalCommand extends OwnedPlantCommandScope {
  /** 路径中的建议公开引用。 */
  readonly proposalRef: string
  /** 已校验的确认请求。 */
  readonly request: ConfirmCareProposalRequestDto
  /** 事务前读取的日历显示名称；没有为 null。 */
  readonly displayName: string | null
  /** 事务前读取的档案版本（事务内复核，T6）。 */
  readonly profileVersion: number | null
  /** 事务前读取的最新品种绑定引用（事务内复核，T6）。 */
  readonly bindingRef: string | null
}

/** 完成计划输入。 */
export interface CompletePlanCommand extends OwnedPlantCommandScope {
  /** 路径中的计划公开引用。 */
  readonly planRef: string
  /** 已校验的完成请求。 */
  readonly request: CompleteCarePlanRequestDto
}

/** 记录浇水输入。 */
export interface RecordWateringCommand extends OwnedPlantCommandScope {
  /** 实际浇水 UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 浇水量毫升；未知为 null。 */
  readonly amountMl: number | null
}

const notFound = () => publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在')
const archived = () => publicErrorSnapshot(409, 'USER_PLANT_ARCHIVED', '植物已归档，只能查看')
const invalid = (message: string) => publicErrorSnapshot(400, 'VALIDATION_FAILED', message)
const notConfirmable = () => publicErrorSnapshot(409, 'CARE_PROPOSAL_NOT_CONFIRMABLE', '该建议已处理或已过期')
const versionConflict = () => publicErrorSnapshot(409, 'CARE_PLAN_VERSION_CONFLICT', '计划已被更新，请刷新后重试')
/** §12.3：计划已被定时扫描标为过期，只读。 */
const planExpired = () => publicErrorSnapshot(409, 'CARE_PLAN_EXPIRED', '计划已过期，请重新获取浇水建议')
const ok = (data: unknown): HttpIdempotencyPublicResponseSnapshot => ({ status: 200, body: { data: data as Record<string, unknown> } })

/** 锁本人可写植物：不存在 404、归档 409。 */
async function lockWritablePlant(transaction: Transaction, scope: OwnedPlantCommandScope): Promise<LockedOwnedUserPlant | HttpIdempotencyPublicResponseSnapshot> {
  const plant = await lockOwnedUserPlant(transaction, scope.userRef, scope.userPlantRef)
  if (plant === null) { return notFound() }
  return plant.lifecycle === 'archived' ? archived() : plant
}

const isSnapshot = (value: LockedOwnedUserPlant | HttpIdempotencyPublicResponseSnapshot): value is HttpIdempotencyPublicResponseSnapshot => 'body' in value

/** 校验并写一条浇水事实；规则不满足返回 null。 */
async function writeWatering(transaction: Transaction, plant: LockedOwnedUserPlant, refs: CareRefFactory, input: {
  /** 实际浇水 UTC 毫秒。 */ readonly occurredAtMs: number
  /** 浇水量毫升或 null。 */ readonly amountMl: number | null
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
}): Promise<string | null> {
  if (!validateWateringOccurredAt({ occurredAtMs: input.occurredAtMs, nowMs: input.nowMs, plantCreatedAtMs: plant.createdAtMs })) { return null }
  const factRef = refs('fact')
  await insertWateringFact(transaction, plant, { factRef, occurredAtMs: input.occurredAtMs, amountMl: input.amountMl, sourceCommandRef: refs('command'), nowMs: input.nowMs })
  return factRef
}

const wateringRuleMessage = '浇水时间须在最近 7 天内、不晚于现在且不早于植物加入花园'

/** 检查窗口端点（UTC 毫秒）；无为 null。 */
function windowEdge(result: Record<string, any>, key: 'earliestAt' | 'latestAt'): number | null {
  const value = result.details?.checkWindow?.[key]
  return typeof value === 'string' ? Date.parse(value) : null
}

/** 长期养护写用例集合（long-term-care/v1 §3、§6、§7）。 */
export function createLongTermCareCommands(dependencies: IdempotentWriteDependencies<Transaction> & {
  /** 服务端引用生成端口。 */
  readonly createRef: CareRefFactory
}) {
  const refs = dependencies.createRef
  return {
    /** §3 记录浇水：同事务 锁植物 → 规则 → 追加事实。 */
    recordWatering: (command: RecordWateringCommand) => runIdempotentWrite(dependencies, command.idempotency, command.nowMs, async transaction => {
      const plant = await lockWritablePlant(transaction, command)
      if (isSnapshot(plant)) { return plant }
      const factRef = await writeWatering(transaction, plant, refs, command)
      if (factRef === null) { return invalid(wateringRuleMessage) }
      return ok({ factRef, factType: 'watering', occurredAt: new Date(command.occurredAtMs).toISOString(), amountMl: command.amountMl })
    }),

    /** §6 确认建议：条件写一次 proposed → confirmed/dismissed，并按决定写计划或事实；不写提醒任务。 */
    confirmProposal: (command: ConfirmProposalCommand) => runIdempotentWrite(dependencies, command.idempotency, command.nowMs, async transaction => {
      const plant = await lockWritablePlant(transaction, command)
      if (isSnapshot(plant)) { return plant }
      if (plant.profileVersion !== command.profileVersion || await readLatestBindingRef(transaction, plant) !== command.bindingRef) {
        throw new IdempotentWriteRetryLaterError('档案或品种绑定在读取后发生变化')
      }
      const proposal = await lockCareProposal(transaction, plant, command.proposalRef)
      if (proposal === null || proposal.status !== 'proposed' || (proposal.validUntilMs !== null && proposal.validUntilMs <= command.nowMs)) {
        return notConfirmable()
      }
      const request = command.request
      if (request.decision === 'dismiss') {
        await settleCareProposal(transaction, proposal, 'dismissed', command.nowMs)
        return ok({ proposalRef: command.proposalRef, proposalStatus: 'dismissed', plan: null, factRef: null })
      }
      if (request.decision === 'record_watering') {
        const factRef = await writeWatering(transaction, plant, refs, { occurredAtMs: Date.parse(request.occurredAt), amountMl: request.amountMl ?? null, nowMs: command.nowMs })
        if (factRef === null) { return invalid(wateringRuleMessage) }
        await settleCareProposal(transaction, proposal, 'confirmed', command.nowMs)
        return ok({ proposalRef: command.proposalRef, proposalStatus: 'confirmed', plan: null, factRef })
      }
      const scheduledAtMs = resolveCheckScheduledAt({
        requestedMs: request.scheduledAt === undefined ? null : Date.parse(request.scheduledAt),
        earliestMs: windowEdge(proposal.result, 'earliestAt'), latestMs: windowEdge(proposal.result, 'latestAt'), nowMs: command.nowMs,
        generatedAtMs: Date.parse(String(proposal.result.generatedAt))
      })
      if (scheduledAtMs === null) { return invalid('检查时间须在建议的检查窗口内') }
      const calendar: CareCalendarDto = buildCareCalendar({ scheduledAtMs, displayName: command.displayName })
      const planRef = refs('plan')
      await insertCarePlan(transaction, plant, { planRef, proposal, scheduledAtMs, payload: { calendar, completedFactRef: null }, nowMs: command.nowMs })
      await settleCareProposal(transaction, proposal, 'confirmed', command.nowMs)
      return ok({ proposalRef: command.proposalRef, proposalStatus: 'confirmed', factRef: null,
        plan: { planRef, planType: 'check_soil', scheduledAt: new Date(scheduledAtMs).toISOString(), status: 'planned', calendar } })
    }),

    /** §7 完成计划：按版本条件写终态；done 可附盆土观察与浇水事实；已过期计划 409（§12.3）。 */
    completePlan: (command: CompletePlanCommand) => runIdempotentWrite(dependencies, command.idempotency, command.nowMs, async transaction => {
      const plant = await lockWritablePlant(transaction, command)
      if (isSnapshot(plant)) { return plant }
      const plan = await lockCarePlan(transaction, plant, command.planRef)
      if (plan === null) { return notFound() }
      // §12.3：过期判定先于版本比对；扫描已提交的过期不可被用户完成覆盖。
      if (plan.status === 'expired') { return planExpired() }
      if (plan.status !== 'planned' || plan.version !== command.request.version) { return versionConflict() }
      const request = command.request
      let factRef: string | null = null
      if (request.outcome === 'done' && request.watering !== undefined) {
        factRef = await writeWatering(transaction, plant, refs, { occurredAtMs: Date.parse(request.watering.occurredAt), amountMl: request.watering.amountMl ?? null, nowMs: command.nowMs })
        if (factRef === null) { return invalid(wateringRuleMessage) }
      }
      if (request.outcome === 'done' && request.soil !== undefined) {
        await insertSoilObservation(transaction, plant, { observationRef: refs('observation'), planRef: command.planRef, state: request.soil.state, scope: request.soil.scope, observedAtMs: command.nowMs })
      }
      const status = request.outcome === 'done' ? 'completed' : 'cancelled'
      await finishCarePlan(transaction, plan, status, { calendar: plan.payload.calendar, completedFactRef: factRef }, command.nowMs)
      return ok({ planRef: command.planRef, status, version: plan.version + 1, factRef, calendar: plan.payload.calendar })
    })
  }
}

