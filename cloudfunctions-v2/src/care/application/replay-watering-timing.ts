import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { replayDryProgress, type DryProgressInput, type DryProgressResult } from '../watering/replay-dry-progress.js'
import { evaluateWateringDecision, type WateringDecisionInput, type WateringDecisionResult } from '../watering/evaluate-watering-decision.js'
import { deriveRootZoneWaterDeficit, type RootZoneWaterDeficitInput, type RootZoneWaterDeficitResult } from '../watering/derive-root-zone-water-deficit.js'
import { projectCheckWindowDates, type LocalCheckWindowResult } from '../watering/project-check-window-dates.js'

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
  /** 当前盆土、排水和发布准入的最终行动裁决。 */
  readonly decision: WateringDecisionResult
  /** 与日期并列的净补水缺口，始终不冒充实际施水量。 */
  readonly waterDeficit: RootZoneWaterDeficitResult | null
  /** 与UTC积分同源的当地检查日期；不是已确认浇水计划。 */
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
  const decision = evaluateWateringDecision({
    now: snapshot.drying.now, wateringPolicyApproved: snapshot.wateringPolicyApproved,
    potSafety: snapshot.potSafety, soil: snapshot.soil, progress: drying.progress,
    baseline: drying.status === 'ready_candidate' ? snapshot.drying.baseline : null,
  })
  const waterDeficit = snapshot.waterDeficit === undefined || snapshot.waterDeficit === null ? null : deriveRootZoneWaterDeficit(snapshot.waterDeficit)
  const localCheckWindow = projectCheckWindowDates(drying.window, snapshot.timezone ?? null)
  return { productionAdmission: false, drying, decision, waterDeficit, localCheckWindow, snapshot, snapshotHash }
}
