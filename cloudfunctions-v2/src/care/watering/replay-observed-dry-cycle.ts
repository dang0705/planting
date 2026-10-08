import { integrateDryingFromAnchor, type DryingInterval, type DryingRange, type DryCheckWindow } from './replay-dry-progress.js'
import { evaluateWateringDecision, type CurrentSoilEvidence } from './evaluate-watering-decision.js'

/** 后台映射制品的定量结果；不能由公开客户端自报映射已经验证。 */
export interface ObservedRemainingState {
  /** 必须与绑定的盆土证据同刻；不是实际浇水时间。 */
  readonly observedAt: number
  /** 本分支只处理等效干燥单位，不混入含水率或日历天数。 */
  readonly basis: 'equivalent_dry_units'
  /** 参考条件已有依据；不会发布任何 pending 的换算。 */
  readonly referenceConditionsConfirmed: boolean
  /** 受控上游的映射证据是否已通过资格核验。 */
  readonly mappingValidated: boolean
  /** 映射版本与依据引用纳入调用方的不可变快照。 */
  readonly mappingVersion: string
  /** 可追溯的后台映射依据，不保存敏感原始图像或用户数据。 */
  readonly evidenceRef: string
  /** 观察时刻至植物目标状态的剩余量区间，允许有效零。 */
  readonly remainingDryUnits: DryingRange
}
/** 单次观察起点回放；环境与栽培由原有上游提供。 */
export interface ObservedDryCycleInput {
  /** 本次计算的UTC整数毫秒，所有资格判断采用同一时刻。 */
  readonly now: number
  /** 最近实际浇水；缺失允许观察预测，但不能恢复历史。 */
  readonly lastConfirmedWateringAt: number | null
  /** 与状态映射绑定的同轮盆土证据。 */
  readonly soil: CurrentSoilEvidence | null
  /** 已映射的定量状态；没有数据时明确为空。 */
  readonly state: ObservedRemainingState | null
  /** 观察之后的环境、栽培及校准区间，禁止隐式填补缺段。 */
  readonly intervals: readonly DryingInterval[]
}
/** 完整历史之外的独立候选，不补造历史或实际施水量。 */
export interface ObservedDryCycleResult {
  /** 数学回放可用或证据不足，不代表生产建议状态。 */
  readonly status: 'ready_candidate' | 'insufficient_evidence'
  /** 此用例不能自行授予生产准入。 */
  readonly productionAdmission: false
  /** 可审计缺口；计算成功时明确为空。 */
  readonly reason: 'missing_state' | 'mapping_unqualified' | 'soil_unqualified' | 'observation_mismatch' | 'not_after_confirmed_watering' | 'history_gap' | null
  /** 实际采用的观察起点，不能用作浇水事实。 */
  readonly observedAt: number | null
  /** 本次采用的映射版本；失败时不冒充已消费。 */
  readonly mappingVersion: string | null
  /** 从观察至今累计，不是最近浇水以来的进度。 */
  readonly consumedSinceObservation: DryingRange | null
  /** 当前时刻至目标干燥状态的剩余量，保留上下界。 */
  readonly remainingDryUnits: DryingRange | null
  /** 连续预测覆盖内的候选检查窗口；未覆盖端点为空。 */
  readonly window: DryCheckWindow | null
}
/** 有效观察只更新预测起点；可靠当前湿土仍可否决实际浇水。 */
export function replayObservedDryCycle(input: ObservedDryCycleInput): ObservedDryCycleResult {
  // 共用既有时间与盆土枚举校验，不增加另一套有效期或可靠性默认值。
  evaluateWateringDecision({ now: input.now, soil: input.soil, wateringPolicyApproved: false, potSafety: 'safe', progress: null, baseline: null })
  const missing = (reason: ObservedDryCycleResult['reason']): ObservedDryCycleResult => ({ status: 'insufficient_evidence', productionAdmission: false,
    reason, observedAt: null, mappingVersion: null, consumedSinceObservation: null, remainingDryUnits: null, window: null })
  const state = input.state
  if (state === null) { return missing('missing_state') }
  if (!state || state.basis !== 'equivalent_dry_units' || typeof state.referenceConditionsConfirmed !== 'boolean' || typeof state.mappingValidated !== 'boolean'
    || typeof state.mappingVersion !== 'string' || !state.mappingVersion.trim() || typeof state.evidenceRef !== 'string' || !state.evidenceRef.trim()
    || typeof state.observedAt !== 'number' || !Number.isSafeInteger(state.observedAt) || !Number.isFinite(new Date(state.observedAt).getTime())
    || !state.remainingDryUnits || typeof state.remainingDryUnits.min !== 'number' || typeof state.remainingDryUnits.max !== 'number'
    || !Number.isFinite(state.remainingDryUnits.min) || !Number.isFinite(state.remainingDryUnits.max)
    || state.remainingDryUnits.min < 0 || state.remainingDryUnits.max < state.remainingDryUnits.min) { throw new TypeError('观察定量状态必须包含有效量纲、版本、来源、时间及有序区间') }
  if (state.observedAt > input.now) { throw new TypeError('不能使用未来观察状态') }
  if (!state.referenceConditionsConfirmed || !state.mappingValidated) { return missing('mapping_unqualified') }
  if (input.soil === null || input.soil.scope !== 'root_zone' || !input.soil.reliable || input.now >= input.soil.validUntil) { return missing('soil_unqualified') }
  if (state.observedAt !== input.soil.collectedAt) { return missing('observation_mismatch') }
  if (input.lastConfirmedWateringAt !== null) {
    if (typeof input.lastConfirmedWateringAt !== 'number' || !Number.isSafeInteger(input.lastConfirmedWateringAt)
      || !Number.isFinite(new Date(input.lastConfirmedWateringAt).getTime()) || input.lastConfirmedWateringAt > input.now) { throw new TypeError('实际浇水时间非法') }
    if (state.observedAt <= input.lastConfirmedWateringAt) { return missing('not_after_confirmed_watering') }
  }
  const integrated = integrateDryingFromAnchor(input.now, state.observedAt, state.remainingDryUnits, input.intervals)
  if (integrated === null) { return missing('history_gap') }
  return { status: 'ready_candidate', productionAdmission: false, reason: null, observedAt: state.observedAt, mappingVersion: state.mappingVersion,
    consumedSinceObservation: integrated.consumed,
    remainingDryUnits: { min: Math.max(0, state.remainingDryUnits.min - integrated.consumed.max), max: Math.max(0, state.remainingDryUnits.max - integrated.consumed.min) },
    window: integrated.window }
}
