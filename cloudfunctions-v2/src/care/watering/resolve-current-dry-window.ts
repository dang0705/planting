import type { DryCheckWindow } from './replay-dry-progress.js'
import type { WateringDecisionInput } from './evaluate-watering-decision.js'

/** 本轮有效检查窗口与历史积分分开，观察不能重置实际干燥历史。 */
export interface CurrentCycleWindow {
  /** 已观察到目标、当前湿态反证、仅历史预测或缺证据。 */
  readonly status: 'target_observed' | 'prediction_conflict' | 'prediction_only' | 'insufficient_evidence'
  /** 当前可使用的窗口；冲突或缺证据不输出猜测日期。 */
  readonly window: DryCheckWindow | null
  /** 真正用于修正窗口的根区证据时刻；未使用时为null。 */
  readonly observedAt: number | null
  /** 证据未晚于最近确认实际浇水时，不能证明本轮浇水后的状态。 */
  readonly ignoredObservationReason: 'not_after_confirmed_watering' | null
}

/**
 * 消费同轮已验证的盆土输入，仅处理无需数值映射的确定语义。
 * 应用入口先调用evaluateWateringDecision验证时间、枚举及证据资格字段。
 * 不从湿/干标签估算非零干燥单位，不恢复缺失历史，也不签发生产准入。
 */
export function resolveCurrentDryWindow(now: number, prediction: DryCheckWindow | null, soil: WateringDecisionInput['soil'], lastConfirmedWateringAt: number | null): CurrentCycleWindow {
  if (soil !== null && lastConfirmedWateringAt !== null && soil.collectedAt <= lastConfirmedWateringAt) {
    return { status: prediction === null ? 'insufficient_evidence' : 'prediction_only', window: prediction, observedAt: null, ignoredObservationReason: 'not_after_confirmed_watering' }
  }
  const currentRootEvidence = soil !== null && soil.reliable && soil.scope === 'root_zone'
    && soil.collectedAt <= now && now < soil.validUntil
  if (currentRootEvidence) {
    if (soil.state === 'target_dry' && soil.targetCriteriaConfirmed) {
      // “现在已达到”不是断言恰在now干燥，更不是确认此刻发生了浇水。
      return { status: 'target_observed', observedAt: soil.collectedAt, ignoredObservationReason: null,
        window: { earliestCheckAt: now, latestCheckAt: now, coverageEnd: now } }
    }
    if ((soil.state === 'wet' || soil.state === 'waterlogged')
      && prediction !== null && prediction.earliestCheckAt !== null && prediction.earliestCheckAt <= now) {
      return { status: 'prediction_conflict', window: null, observedAt: soil.collectedAt, ignoredObservationReason: null }
    }
  }
  return { status: prediction === null ? 'insufficient_evidence' : 'prediction_only', window: prediction, observedAt: null, ignoredObservationReason: null }
}
