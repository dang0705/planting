import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { replayDryProgress, type DryProgressInput, type DryProgressResult } from '../watering/replay-dry-progress.js'
import { evaluateWateringDecision, type WateringDecisionInput, type WateringDecisionResult } from '../watering/evaluate-watering-decision.js'
import { deriveRootZoneWaterDeficit, type RootZoneWaterDeficitInput, type RootZoneWaterDeficitResult } from '../watering/derive-root-zone-water-deficit.js'
import { projectCheckWindowDates, type LocalCheckWindowResult } from '../watering/project-check-window-dates.js'
import { resolveCurrentDryWindow, type CurrentCycleWindow } from '../watering/resolve-current-dry-window.js'
import { replayObservedDryCycle, type ObservedRemainingState, type ObservedDryCycleResult } from '../watering/replay-observed-dry-cycle.js'

/** 同轮浇水候选回放的固定输入，日期与当前盆土使用相同时刻。 */
export interface WateringTimingReplayInput {
  /** 环境需求、保水、校准及实际起点的版本锁定输入。 */
  readonly drying: DryProgressInput
  /** 由受控发布读取确定的准入状态，不信任客户端断言。 */
  readonly wateringPolicyApproved: WateringDecisionInput['wateringPolicyApproved']
  /** 实际内盆的已归约安全结果，不重复计算几何。 */
  readonly potSafety: WateringDecisionInput['potSafety']
  /** 本轮盆土证据，作用范围与有效期参与最终裁决。 */
  readonly soil: WateringDecisionInput['soil']
  /** 同一盆土观察的已核验定量映射；未提供或pending时不生成观察剩余量。 */
  readonly observedRemaining?: ObservedRemainingState | null
  /** 可选专业证据；未提供时没有净缺口，不要求MVP前端采集。 */
  readonly waterDeficit?: RootZoneWaterDeficitInput | null
  /** 植物所在地的明确时区；缺失不沿用服务器默认时区。 */
  readonly timezone?: string | null
}
/** 积分与安全决策结果一起保留，不写用户行为或精确水量。 */
export interface WateringTimingReplayResult {
  /** 本用例仍为离线回放，不代表正式HTTP建议准入。 */
  readonly productionAdmission: false
  /** 环境和栽培输入积分的完整结果与覆盖边界。 */
  readonly drying: DryProgressResult
  /** 当前证据修正后的有效窗口；历史进度与旧预测仍在drying内原样保留。 */
  readonly currentCycleWindow: CurrentCycleWindow
  /** 从观察起点独立计算的剩余量；不替代完整历史积分。 */
  readonly observedCycle: ObservedDryCycleResult
  /** 当前盆土、排水和发布准入的最终行动裁决。 */
  readonly decision: WateringDecisionResult
  /** 与日期并列的净补水缺口，始终不冒充实际施水量。 */
  readonly waterDeficit: RootZoneWaterDeficitResult | null
  /** 当前有效窗口的当地检查日期；不是已确认浇水计划。 */
  readonly localCheckWindow: LocalCheckWindowResult
  /** 输入独立副本，调用方后续改动不影响原回放。 */
  readonly snapshot: WateringTimingReplayInput
  /** 规范JSON摘要，拒绝非JSON输入或隐藏非法数值。 */
  readonly snapshotHash: string
}
/** 纵向接通数学积分与当前安全门；不将候选名义日转换为等效单位。 */
export function replayWateringTiming(input: WateringTimingReplayInput): WateringTimingReplayResult {
  const snapshotHash = calculateCanonicalJsonSha256(input as unknown as CanonicalJsonValue)
  const snapshot = structuredClone(input)
  const drying = replayDryProgress(snapshot.drying)
  const decisionInput = {
    now: snapshot.drying.now, wateringPolicyApproved: snapshot.wateringPolicyApproved,
    potSafety: snapshot.potSafety, soil: snapshot.soil, progress: drying.progress,
    baseline: drying.status === 'ready_candidate' ? snapshot.drying.baseline : null,
  }
  // 先沿用安全门的完整输入校验；后续观察处理不放宽证据、排水或发布条件。
  const priorDecision = evaluateWateringDecision(decisionInput)
  const observedCycle = replayObservedDryCycle({ now: snapshot.drying.now, lastConfirmedWateringAt: snapshot.drying.lastConfirmedWateringAt,
    soil: snapshot.soil, state: snapshot.observedRemaining ?? null, intervals: snapshot.drying.intervals })
  const observationReady = observedCycle.status === 'ready_candidate'
  const resolvedWindow = resolveCurrentDryWindow(snapshot.drying.now, observationReady ? observedCycle.window : drying.window, snapshot.soil, snapshot.drying.lastConfirmedWateringAt)
  const currentCycleWindow: CurrentCycleWindow = observationReady && resolvedWindow.status === 'prediction_only'
    ? { ...resolvedWindow, status: 'observation_prediction', observedAt: observedCycle.observedAt } : resolvedWindow
  const evidenceOverridesPrediction = currentCycleWindow.status === 'target_observed' || currentCycleWindow.status === 'prediction_conflict'
  const observationFromEarlierCycle = currentCycleWindow.ignoredObservationReason !== null
  const decision = evidenceOverridesPrediction || observationFromEarlierCycle || observationReady
    ? evaluateWateringDecision({ ...decisionInput,
      soil: observationFromEarlierCycle ? null : snapshot.soil,
      progress: evidenceOverridesPrediction || observationReady ? null : drying.progress,
      baseline: evidenceOverridesPrediction || observationReady ? null : decisionInput.baseline,
      observationWindow: observationReady && !evidenceOverridesPrediction ? currentCycleWindow.window : null,
    }) : priorDecision
  const waterDeficit = snapshot.waterDeficit === undefined || snapshot.waterDeficit === null ? null : deriveRootZoneWaterDeficit(snapshot.waterDeficit)
  const localCheckWindow = projectCheckWindowDates(currentCycleWindow.window, snapshot.timezone ?? null)
  return { productionAdmission: false, drying, currentCycleWindow, observedCycle, decision, waterDeficit, localCheckWindow, snapshot, snapshotHash }
}
