import type { PotSafetyState } from '../cultivation/evaluate-pot-safety.js'
import type { DryingRange, DryCheckWindow } from './replay-dry-progress.js'
/** 当前盆土观察；上游负责用户植物归属、来源与审核证据。 */
export interface CurrentSoilEvidence {
  /** 已归一的盆土观察状态，不由本用例识别照片。 */
  readonly state: 'wet' | 'waterlogged' | 'target_dry' | 'unknown'
  /** 证据可见范围，表土干不能证明根区干燥。 */
  readonly scope: 'surface' | 'root_zone'
  /** 来源可靠性由受控上游核验，禁止客户端自授资格。 */
  readonly reliable: boolean
  /** 是否可靠达到该植物要求的目标干燥条件。 */
  readonly targetCriteriaConfirmed: boolean
  /** 采集UTC整数毫秒，未来采集时间无效。 */
  readonly collectedAt: number
  /** 明确有效期终点，等于当前时刻即已过期。 */
  readonly validUntil: number
}
/** 当前安全判断的内部输入，禁止绕过发布与归属校验用于公开HTTP。 */
export interface WateringDecisionInput {
  /** 本次判定的UTC整数毫秒时间。 */
  readonly now: number
  /** 已锁定算法发布是否获准，未知不能启用旧算法。 */
  readonly wateringPolicyApproved: boolean | null
  /** 上游实际内盆安全状态，不在此处重复计算体积。 */
  readonly potSafety: PotSafetyState
  /** 当前明确时效与范围的盆土证据，缺失为null。 */
  readonly soil: CurrentSoilEvidence | null
  /** 完整历史积分的等效干燥进度，缺失不填零。 */
  readonly progress: DryingRange | null
  /** 同量纲的已确认参考基线，缺失不推测日期。 */
  readonly baseline: DryingRange | null
  /** 可靠观察后的独立预测，仅在无历史进度裁决时决定何时检查。 */
  readonly observationWindow?: DryCheckWindow | null
}
/** 决策动作只是受控候选，不写计划、事实、提醒或水量。 */
export interface WateringDecisionResult {
  /** 当前证据安全门，不受日历或预测覆盖。 */
  readonly soilGate: 'pause_watering' | 'target_dry_confirmed' | 'unknown'
  /** 进度全区间所处位置；跨阈值保留不确定状态。 */
  readonly windowState: 'before' | 'within' | 'overdue' | 'uncertain' | null
  /** 最终行为；允许浇水不等于已发生浇水。 */
  readonly action: 'temporarily_unavailable' | 'pause_watering' | 'review_drainage' | 'water_allowed' | 'check_later' | 'check_now' | 'priority_check' | 'insufficient_evidence'
}
/** 时间显式限定为可表示UTC整数，避免隐式强转。 */
function validateTime(value: unknown): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || !Number.isFinite(new Date(value).getTime())) { throw new TypeError('盆土证据时间必须为有效UTC整数毫秒') }
}
/** 缺失明确为null，非法范围不能通过比较静默降级。 */
function validateRange(value: DryingRange | null): void {
  if (value !== null && (!value || typeof value.min !== 'number' || typeof value.max !== 'number'
    || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min)) { throw new TypeError('盆土决策的进度或基线区间非法') }
}
/** 安全条件优先；预测仅决定检查，不自动确认根区缺水。 */
export function evaluateWateringDecision(input: WateringDecisionInput): WateringDecisionResult {
  validateTime(input.now)
  if (![true, false, null].includes(input.wateringPolicyApproved) || !['safe', 'drainage_risk', 'insufficient_evidence'].includes(input.potSafety)) { throw new TypeError('缺少有效算法准入或盆器证据状态') }
  validateRange(input.progress); validateRange(input.baseline)
  let soilGate: WateringDecisionResult['soilGate'] = 'unknown'
  if (input.soil !== null) {
    const soil = input.soil
    if (!soil || !['wet', 'waterlogged', 'target_dry', 'unknown'].includes(soil.state)
      || !['surface', 'root_zone'].includes(soil.scope) || typeof soil.reliable !== 'boolean' || typeof soil.targetCriteriaConfirmed !== 'boolean') { throw new TypeError('盆土证据状态、范围或可靠性非法') }
    validateTime(soil.collectedAt); validateTime(soil.validUntil)
    if (soil.collectedAt > input.now || soil.validUntil <= soil.collectedAt) { throw new TypeError('盆土证据时间顺序非法') }
    if (soil.reliable && input.now < soil.validUntil) {
      if (soil.state === 'wet' || soil.state === 'waterlogged') { soilGate = 'pause_watering' }
      else if (soil.state === 'target_dry' && soil.scope === 'root_zone' && soil.targetCriteriaConfirmed) { soilGate = 'target_dry_confirmed' }
    }
  }
  let windowState: WateringDecisionResult['windowState'] = null
  if (input.progress && input.baseline) {
    windowState = input.progress.max < input.baseline.min ? 'before'
      : input.progress.min > input.baseline.max ? 'overdue'
      : input.progress.min >= input.baseline.min && input.progress.max <= input.baseline.max ? 'within' : 'uncertain'
  }
  if (input.observationWindow !== undefined && input.observationWindow !== null) {
    const window = input.observationWindow
    validateTime(window.coverageEnd)
    for (const at of [window.earliestCheckAt, window.latestCheckAt]) {
      if (at !== null) { validateTime(at); if (at < input.now || at > window.coverageEnd) { throw new TypeError('观察预测不能超出当前连续覆盖范围') } }
    }
    if (window.coverageEnd < input.now || (window.earliestCheckAt !== null && window.latestCheckAt !== null && window.earliestCheckAt > window.latestCheckAt)) { throw new TypeError('观察预测窗口顺序非法') }
    if (input.progress !== null || input.baseline !== null) { throw new TypeError('不能混用历史进度与观察窗口作本轮行动依据') }
    // 最早交点已经到达只意味着需要检查；不能制造可靠目标干燥证据。
    windowState = window.earliestCheckAt === null ? null : window.earliestCheckAt > input.now ? 'before' : 'uncertain'
  }
  const result = (action: WateringDecisionResult['action']): WateringDecisionResult => ({ soilGate, windowState, action })
  if (input.wateringPolicyApproved !== true) { return result('temporarily_unavailable') }
  if (soilGate === 'pause_watering') { return result('pause_watering') }
  if (input.potSafety === 'drainage_risk') { return result('review_drainage') }
  if (input.potSafety !== 'safe') { return result('insufficient_evidence') }
  if (soilGate === 'target_dry_confirmed') { return result('water_allowed') }
  if (windowState === 'before') { return result('check_later') }
  if (windowState === 'overdue') { return result('priority_check') }
  if (windowState === 'within' || windowState === 'uncertain') { return result('check_now') }
  return result('insufficient_evidence')
}
