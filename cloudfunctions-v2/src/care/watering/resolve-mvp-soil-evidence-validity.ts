import type { MvpSoilObservation } from './map-mvp-soil-observation.js'
import { integrateDryingFromAnchor, type DryingInterval, type DryingRange } from './replay-dry-progress.js'
import type { MvpMoistureProfile } from './resolve-mvp-moisture-group.js'

/** 每小时毫秒数，仅用于把策略小时换算成 UTC 毫秒。 */
const millisecondsPerHour = 3_600_000

/** 有效期规则所需的策略字段：v1 固定 TTL；v2 回退与封顶（用户 2026-10-09 裁决 U6）。 */
export type MvpSoilValidityPolicy = {
  /** v1 合同版本。 */
  readonly contractVersion: 'care-watering-mvp/v1'
  /** v1 固定有效小时数。 */
  readonly soilEvidenceTtlHours: number
  /** 各状态在观察时刻剩余基线比例（v1 不使用）。 */
  readonly remainingFraction: MvpSoilRemainingFractions
} | {
  /** v2 合同版本。 */
  readonly contractVersion: 'care-watering-mvp/v2'
  /** 湿/微湿推不出离开时刻时的回退有效小时数。 */
  readonly soilEvidenceFallbackHours: number
  /** 统一封顶有效小时数。 */
  readonly soilEvidenceMaxHours: number
  /** 各状态在观察时刻剩余基线比例，用于计算状态跨度。 */
  readonly remainingFraction: MvpSoilRemainingFractions
}

/** 三种可推算状态的剩余比例区间。 */
export interface MvpSoilRemainingFractions {
  /** 湿土状态在观察时刻剩余的基线比例。 */
  readonly wet: DryingRange
  /** 微湿状态在观察时刻剩余的基线比例。 */
  readonly moist: DryingRange
  /** 只确认表土干时的剩余基线比例（「干」按浇水事实失效，不使用）。 */
  readonly surfaceDryOnly: DryingRange
}

/** 有效期计算输入；全部来自服务端已核验事实与策略快照。 */
export interface MvpSoilValidityInput {
  /** 活动策略中与盆土有效期相关的字段。 */
  readonly policy: MvpSoilValidityPolicy
  /** 本策略参考条件下的基线等效单位区间。 */
  readonly baseline: DryingRange
  /** 植物分组（与映射一致，保留以便规则演进）。 */
  readonly group: MvpMoistureProfile
  /** 本次盆土观察；uncertain 不应调用。 */
  readonly observation: MvpSoilObservation
  /** 观察时刻起的干燥时段（与浇水回放同一组）。 */
  readonly intervals: readonly DryingInterval[]
  /** 最近一次已确认实际浇水 UTC 毫秒；未知为 null。 */
  readonly lastConfirmedWateringAt: number | null
}

/**
 * 盆土证据有效截止时刻（long-term-care-contract.md §8）。
 * v1：观察 + 固定 TTL。v2：湿/微湿 → 以最快干燥速率消耗「(状态剩余比例上界 − 下界) × 基线下端」所需时间，
 * 推不出 → 观察 + 回退小时；干（含仅表土干）→ 有效到晚于观察时刻的已确认浇水事实；统一封顶。返回值严格晚于观察时刻。
 */
export function resolveMvpSoilEvidenceValidUntil(input: MvpSoilValidityInput): number {
  const { policy, observation } = input
  const observedAt = observation.observedAt
  if (!Number.isSafeInteger(observedAt) || observedAt < 0) { throw new TypeError('盆土观察时间不合法') }
  if (observation.state === 'uncertain') { throw new TypeError('不确定观察不形成证据，不计算有效期') }
  if (policy.contractVersion === 'care-watering-mvp/v1') {
    if (!Number.isFinite(policy.soilEvidenceTtlHours) || policy.soilEvidenceTtlHours <= 0) { throw new RangeError('盆土证据有效期必须为正') }
    return observedAt + Math.round(policy.soilEvidenceTtlHours * millisecondsPerHour)
  }
  const { soilEvidenceFallbackHours: fallbackHours, soilEvidenceMaxHours: maxHours } = policy
  if (!Number.isFinite(fallbackHours) || fallbackHours <= 0 || !Number.isFinite(maxHours) || maxHours < fallbackHours) {
    throw new RangeError('盆土证据回退与封顶小时数不合法')
  }
  const cap = observedAt + Math.round(maxHours * millisecondsPerHour)
  if (observation.state === 'dry') {
    const watering = input.lastConfirmedWateringAt
    return watering !== null && watering > observedAt ? Math.min(cap, watering) : cap
  }
  const fraction = observation.state === 'wet' ? policy.remainingFraction.wet : policy.remainingFraction.moist
  const span = (fraction.max - fraction.min) * input.baseline.min
  const fallback = Math.min(cap, observedAt + Math.round(fallbackHours * millisecondsPerHour))
  if (!Number.isFinite(span) || span <= 0) { return fallback }
  const integrated = integrateDryingFromAnchor(observedAt, observedAt, { min: span, max: span }, input.intervals)
  const earliest = integrated?.window.earliestCheckAt ?? null
  if (earliest === null || earliest <= observedAt) { return fallback }
  return Math.min(cap, earliest)
}
