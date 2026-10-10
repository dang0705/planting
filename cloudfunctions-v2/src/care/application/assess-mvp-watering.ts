import { hasCultivationModel, resolveMvpWateringRuntimeRules, type MvpWateringPolicySnapshot } from '../../configuration/mvp-watering-policy.js'
import type { WaterFrequencyTier, WaterTriggerState } from '../../plant-knowledge/watering/compile-water-state.js'
import { deriveCultivationDrying, type CultivationDrying } from '../cultivation/derive-cultivation-drying.js'
import { deriveMeasuredPot, type MeasuredPotInput } from '../cultivation/derive-measured-pot.js'
import { combineMvpSubstrateMix } from '../watering/combine-mvp-substrate-mix.js'
import { estimateMvpWaterAmount, normalizeMvpMaterialSelection, type MvpWaterAmountResult } from '../watering/estimate-mvp-water-amount.js'
import { fillMvpDryingGaps } from '../watering/fill-mvp-drying-gaps.js'
import { mapMvpSoilObservation, type MvpSoilObservation } from '../watering/map-mvp-soil-observation.js'
import type { DryingInterval, DryingRange } from '../watering/replay-dry-progress.js'
import { resolveMvpMoistureGroup } from '../watering/resolve-mvp-moisture-group.js'
import { resolveMvpSoilEvidenceValidUntil } from '../watering/resolve-mvp-soil-evidence-validity.js'
import { projectWateringReplayResult, type ApplicationAssessment, type WateringCapabilityResult } from './project-watering-replay-result.js'
import { replayWateringTiming } from './replay-watering-timing.js'

/** 一个环境时段：植物位置 PPFD 与室内 VPD；任一缺失时由本用例按合同处理。 */
export interface MvpEnvironmentInterval {
  /** UTC 起点（含）。 */
  readonly start: number
  /** UTC 终点（不含）。 */
  readonly end: number
  /** 植物位置时段平均 PPFD 区间；null 为缺段。 */
  readonly ppfd: DryingRange | null
  /** 室内实测 VPD 区间；null 时使用策略兜底估算区间。 */
  readonly indoorVpdKpa: DryingRange | null
}

/** 已读回的 Tropicals 名义基线；天数在本策略参考条件下解释为等效干燥单位。 */
export interface MvpPlantBaseline {
  /** 来源 tier。 */
  readonly tier: WaterFrequencyTier
  /** 编译出的触发语义。 */
  readonly trigger: WaterTriggerState
  /** 名义天数区间，表示该植物在参考条件下的常规浇水周期。 */
  readonly baselineDays: DryingRange
}

/** 组合用例输入；全部来自服务端已核验的事实与策略快照。 */
export interface AssessMvpWateringInput {
  /** 活动策略快照；null 表示无已发布模型。 */
  readonly policy: Readonly<MvpWateringPolicySnapshot> | null
  /** 本次计算 UTC 毫秒。 */
  readonly now: number
  /** 植物基线；null 表示知识缺失或不受支持。 */
  readonly baseline: MvpPlantBaseline | null
  /** 当前盆土观察；可缺失。 */
  readonly soil: MvpSoilObservation | null
  /** 最近确认实际浇水时刻；未知为 null，不补今天。 */
  readonly lastConfirmedWateringAt: number | null
  /** 实际种植所用内盆的测量证据与尺寸。 */
  readonly pot: MeasuredPotInput
  /** 用户在界面勾选的基质材料列表。 */
  readonly materials: readonly (string | null | undefined)[]
  /** 用户标注的主要材料（占一半及以上，合同 8.10）；未标为 null 或缺省。v1/v2 策略忽略此项以保持已发布语义。 */
  readonly primaryMaterial?: string | null
  /** 观察或浇水起点之后的环境时段。 */
  readonly environment: readonly MvpEnvironmentInterval[]
  /** 植物所在地明确时区。 */
  readonly timezone: string | null
}

/** 对外统一的低置信说明，不含内部引用。 */
const literatureNote = '依据通用文献参数估算，未经本盆标定；检查窗口只用于复查盆土，不承诺届时需要浇水。'

/** 不经回放直接给出的公开结果（无发布、无基线）。 */
function directResult(now: number, status: 'temporarily_unavailable' | 'insufficient_evidence', missing: string, explanation: string): WateringCapabilityResult {
  return {
    capabilityType: 'watering', contractVersion: 'care-capability-result/v1', status, confidence: 'low',
    evidenceSummary: [explanation],
    recommendedActions: status === 'temporarily_unavailable' ? [] : ['请补充植物品种信息后再获取浇水建议。'],
    generatedAt: new Date(now).toISOString(), validUntil: null, detailsSchemaVersion: 'watering-assessment/v1',
    details: { action: status === 'temporarily_unavailable' ? 'temporarily_unavailable' : 'insufficient_evidence', soilState: 'unknown', soilScope: null,
      dryingWindowState: null, checkWindow: null, amountMl: null, netDeficitMl: null, missingEvidence: [missing] },
  }
}

/** 光照半饱和响应。 */
const lightResponse = (q: number, k: number) => q / (q + k)

/** H(D)=r·max(0,1−s·ln r)；r=D/Dref。 */
function vaporFlux(d: number, dref: number, s: number): number {
  if (d === 0) { return 0 }
  const r = d / dref
  return r * Math.max(0, 1 - s * Math.log(r))
}

/** VPD 区间上的 H 包络；内部峰值不能遗漏。 */
function vaporEnvelope(vpd: DryingRange, dref: number, s: number): DryingRange {
  const a = vaporFlux(vpd.min, dref, s); const b = vaporFlux(vpd.max, dref, s)
  const peak = dref * Math.exp(1 / s - 1)
  const max = peak >= vpd.min && peak <= vpd.max ? Math.max(a, b, vaporFlux(peak, dref, s)) : Math.max(a, b)
  return { min: Math.min(a, b), max }
}

/** v1/v2 与缺证据时的中性盆倍率：需求不按盆伸缩。 */
const neutralScales = { plant: { min: 1, max: 1 }, evaporation: { min: 1, max: 1 } } as const
/** 需求两分量各自的盆倍率：植物比只乘叶片项，蒸发面比只乘基质蒸发项（合同 8.5）。 */
interface DemandScales {
  /** 植物需求比 P：乘叶片（蒸腾）项。 */
  readonly plant: DryingRange
  /** 蒸发面比 Ae：乘基质蒸发项。 */
  readonly evaporation: DryingRange
}

/** 合同第2节＋8.5：每参考日的相对环境需求区间；超出有效域返回 null（缺段）。 */
function environmentDemand(policy: Readonly<MvpWateringPolicySnapshot>, interval: Pick<MvpEnvironmentInterval, 'ppfd' | 'indoorVpdKpa'>, scales: DemandScales = neutralScales): DryingRange | null {
  const vpd = interval.indoorVpdKpa ?? policy.indoorVpdFallbackKpa
  const ppfd = interval.ppfd
  if (ppfd === null) { return null }
  const within = (outer: DryingRange, inner: DryingRange) => inner.min >= outer.min && inner.max <= outer.max && inner.max >= inner.min
  if (!within(policy.validPpfd, ppfd) || !within(policy.validVpdKpa, vpd)) { return null }
  const k = policy.lightHalfSaturationPpfd
  const reference = lightResponse(policy.referencePpfd, k)
  const vapor = vaporEnvelope(vpd, policy.referenceVpdKpa, policy.vpdSensitivity)
  const w = policy.transpirationShare
  return {
    min: w * lightResponse(ppfd.min, k) / reference * vapor.min * scales.plant.min + (1 - w) * vpd.min / policy.referenceVpdKpa * scales.evaporation.min,
    max: w * lightResponse(ppfd.max, k) / reference * vapor.max * scales.plant.max + (1 - w) * vpd.max / policy.referenceVpdKpa * scales.evaporation.max,
  }
}

/**
 * v3（合同第 8 节）：由实测盆与基质推导存量比与需求倍率；v1/v2 保持固定保水带与中性需求。
 * 材料选择与主要材料先校验（非法即拒绝），再按 8.10 混合规则得到可用水（AW，Bilderback 2005 口径）区间。
 */
function cultivationDrying(policy: Readonly<MvpWateringPolicySnapshot>, input: AssessMvpWateringInput): CultivationDrying {
  if (!hasCultivationModel(policy)) {
    return { storage: policy.cultivationRetention, plantDemandScale: neutralScales.plant, evaporationAreaScale: neutralScales.evaporation, basis: 'fallback' }
  }
  const selection = normalizeMvpMaterialSelection(policy.substrates, input.materials, input.primaryMaterial)
  const availableWater = selection.materials.length === 0 ? null
    : combineMvpSubstrateMix(selection.materials.map(material => ({ material, range: policy.substrates[material].availableWater })), selection.primaryMaterial)
  return deriveCultivationDrying(policy, input.pot, availableWater)
}

/** 水量结论转为结果投影的供水评估。 */
function toApplication(amount: MvpWaterAmountResult | null): ApplicationAssessment {
  if (amount === null) { return { status: 'not_allowed_now', appliedAmountCandidateMl: null } }
  if (amount.status === 'candidate') { return { status: 'candidate', appliedAmountCandidateMl: amount.appliedAmountCandidateMl } }
  return { status: amount.status, appliedAmountCandidateMl: null }
}

/**
 * MVP 浇水组合用例：基线＋环境＋盆土＋盆器 → 公开浇水结果（合同 `care-watering-mvp/v1`）。
 * 纯计算：不读数据库、不调用 Provider、不写事实或提醒；结果固定低置信。
 */
export function assessMvpWatering(input: AssessMvpWateringInput): WateringCapabilityResult {
  const { policy, now } = input
  if (policy === null) {
    return directResult(now, 'temporarily_unavailable', 'published_watering_model', '浇水模型尚未发布，暂不能提供正式建议。')
  }
  if (input.baseline === null) {
    return directResult(now, 'insufficient_evidence', 'plant_baseline', '缺少该植物的浇水基线知识。')
  }
  const profile = resolveMvpMoistureGroup(input.baseline.tier, input.baseline.trigger)
  const baseline = input.baseline.baselineDays
  const drying = cultivationDrying(policy, input)
  const scales = { plant: drying.plantDemandScale, evaporation: drying.evaporationAreaScale }
  const toInterval = (start: number, end: number, demand: DryingRange): DryingInterval => ({ start, end, environmentDemand: demand,
    cultivationRetention: drying.storage, personalCalibration: { min: 1, max: 1 } })
  const measured: DryingInterval[] = []
  for (const interval of input.environment) {
    const demand = environmentDemand(policy, interval, scales)
    if (demand === null) { continue }
    measured.push(toInterval(interval.start, interval.end, demand))
  }
  // 合同 8.11（v3 起）：不超过策略缺段补齐小时（v3 = 6、v4 读正文）的内部缺段用有效域上的保守需求全区间补齐；v1/v2 保持缺段即中断。
  const conservative = environmentDemand(policy, { ppfd: policy.validPpfd, indoorVpdKpa: policy.validVpdKpa }, scales)
  const gapFillHours = resolveMvpWateringRuntimeRules(policy).dryingGapFillMaxHours
  const intervals = gapFillHours !== null && conservative !== null
    ? fillMvpDryingGaps(measured, (start, end) => toInterval(start, end, conservative), gapFillHours) : measured
  // 盆土证据有效期按策略版本：v1 固定 TTL；v2 按干湿循环（用户 2026-10-09 裁决 U6）。
  const validUntil = input.soil === null || input.soil.state === 'uncertain' ? undefined
    : resolveMvpSoilEvidenceValidUntil({ policy, baseline, group: profile, observation: input.soil, intervals, lastConfirmedWateringAt: input.lastConfirmedWateringAt })
  const mapped = input.soil === null ? { soil: null, observedRemaining: null }
    : mapMvpSoilObservation({ policy, baseline, group: profile, observation: input.soil, now, ...(validUntil === undefined ? {} : { validUntil }) })
  const watering = replayWateringTiming({
    drying: { now, lastConfirmedWateringAt: input.lastConfirmedWateringAt, intervals,
      baseline: { min: baseline.min, max: baseline.max, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true } },
    wateringPolicyApproved: true, potSafety: deriveMeasuredPot(input.pot).safety,
    soil: mapped.soil, observedRemaining: mapped.observedRemaining, waterDeficit: null, timezone: input.timezone,
  })
  const amount = watering.decision.action === 'water_allowed'
    ? estimateMvpWaterAmount({ policy, group: profile.group, pot: input.pot, materials: input.materials,
      primaryMaterial: hasCultivationModel(policy) ? input.primaryMaterial ?? null : null }) : null
  const { candidate } = projectWateringReplayResult(watering, toApplication(amount))
  const netDeficitMl = amount?.status === 'candidate' && candidate.details.amountMl !== null ? { ...amount.netDeficitMl } : null
  return {
    ...candidate, confidence: 'low',
    evidenceSummary: candidate.status === 'ready' ? [literatureNote] : candidate.evidenceSummary,
    details: { ...candidate.details, netDeficitMl },
  }
}
