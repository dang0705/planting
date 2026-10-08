import { replayEnvironmentalWateringSample, type EnvironmentalWateringSample } from './replay-environmental-watering-sample.js'
import { deriveRootZoneReference } from './root-zone-reference.js'
import { integrateDryingFromAnchor, type DryingRange } from '../../../src/care/watering/replay-dry-progress.js'
import { replayWateringTiming } from '../../../src/care/application/replay-watering-timing.js'
import type { RootZoneWaterDeficitInput } from '../../../src/care/watering/derive-root-zone-water-deficit.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonValue } from '../../../src/foundation/json/canonical-json-sha256.js'

/** 根区专业观察与同盆历史失水的合成样本；禁止运行入口使用。 */
export interface RootZoneWateringSample {
  readonly classification: 'synthetic_experimental'
  /** 同一响应参数下的历史及未来环境，保留实际时段。 */
  readonly environment: EnvironmentalWateringSample
  /** 当前盆器、基质及种植状态版本；改变即不能沿用历史参考。 */
  readonly cultivationRef: string
  readonly rootZone: {
    readonly plantReference: string
    readonly cultivationRef: string
    readonly sourceRef: string
    /** 本增量只处理本次时刻观察；旧观察不能冒充当前净水量。 */
    readonly observedAt: number
    readonly water: RootZoneWaterDeficitInput
    readonly triggerVwc: DryingRange | null
  }
  readonly reference: {
    readonly plantReference: string
    readonly cultivationRef: string
    readonly sourceRef: string
    /** 校准区间必须在当前观察之前且连续完整。 */
    readonly start: number
    readonly end: number
    readonly netLossMl: DryingRange | null
    /** 已核验供排水及其他质量变动，不是自动猜测的布尔默认。 */
    readonly waterBalanceAccounted: boolean
  }
}

/** 同盆参考已经包含栽培及个体影响，本分支不得再次叠加倍率。 */
function isIdentity(range: DryingRange): boolean { return range?.min === 1 && range.max === 1 }

/** 当前根区→体积剩余量→同盆历史参考→动态日期与净缺口，保持完整来源快照。 */
export function replayRootZoneWateringSample(input: RootZoneWateringSample) {
  const snapshotHash = calculateCanonicalJsonSha256(input as unknown as CanonicalJsonValue)
  const snapshot = structuredClone(input)
  const { rootZone: root, reference, environment: env } = snapshot
  const now = env.watering.drying.now
  if (snapshot.classification !== 'synthetic_experimental' || !snapshot.cultivationRef?.trim()
    || !root.sourceRef?.trim() || !reference.sourceRef?.trim() || !root.plantReference?.trim()
    || root.plantReference !== reference.plantReference || root.cultivationRef !== snapshot.cultivationRef
    || reference.cultivationRef !== snapshot.cultivationRef || root.observedAt !== now
    || !Number.isSafeInteger(reference.start) || !Number.isSafeInteger(reference.end)
    || reference.start >= reference.end || reference.end > root.observedAt || reference.waterBalanceAccounted !== true) {
    throw new TypeError('同盆参考、当前观察或校准时序不满足实验合同')
  }
  for (const day of env.days) {
    if (day.light.plantReference !== root.plantReference || day.demand.basis !== 'nonlinear_research_candidate'
      || !isIdentity(day.cultivationRetention) || !isIdentity(day.personalCalibration)) {
      throw new TypeError('同盆参考不得混用位置、人工需求或重复栽培/个体修正')
    }
  }
  const soil = env.watering.soil
  if (soil !== null && soil.collectedAt !== root.observedAt) { throw new TypeError('根区定量观察与盆土证据不同刻') }
  const rootZoneEvidenceValid = root.water.rootZoneEvidenceValid === true && soil !== null
    && soil.scope === 'root_zone' && soil.reliable && soil.collectedAt === now && now < soil.validUntil
  const water = { ...root.water, rootZoneEvidenceValid }
  // 原始基线和预填剩余量完整保留于snapshot。本次体积尺度未换算基线，不让它补出另一套日期。
  const environment = replayEnvironmentalWateringSample({ ...env,
    watering: { ...env.watering, drying: { ...env.watering.drying, baseline: null }, observedRemaining: null, waterDeficit: null } })
  const intervals = environment.watering.snapshot.drying.intervals
  const historical = integrateDryingFromAnchor(reference.end, reference.start, { min: 0, max: 0 }, intervals)
  const rootZoneReference = deriveRootZoneReference({ water, triggerVwc: root.triggerVwc,
    referenceLossMl: reference.netLossMl, integratedDemand: historical?.consumed ?? null })
  const observedRemaining = rootZoneReference.status === 'candidate' ? {
    observedAt: root.observedAt, basis: 'equivalent_dry_units' as const,
    // 这些资格只表达合成制品的数学一致性；外层永久保留synthetic和非生产准入。
    referenceConditionsConfirmed: true, mappingValidated: true, mappingVersion: 'synthetic-root-zone-reference/v1',
    evidenceRef: root.sourceRef, remainingDryUnits: rootZoneReference.remainingDryUnits,
  } : null
  const watering = replayWateringTiming({ ...environment.watering.snapshot, observedRemaining, waterDeficit: water })
  return { classification: 'synthetic_experimental' as const, productionAdmission: false as const,
    historicalDemand: historical?.consumed ?? null, rootZoneReference, watering, environment, snapshot, snapshotHash }
}
