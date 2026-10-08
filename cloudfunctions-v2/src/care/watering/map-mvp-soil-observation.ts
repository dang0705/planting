import type { CurrentSoilEvidence } from './evaluate-watering-decision.js'
import type { DryingRange } from './replay-dry-progress.js'
import type { ObservedRemainingState } from './replay-observed-dry-cycle.js'
import type { MvpMoistureProfile } from './resolve-mvp-moisture-group.js'

/** 每小时毫秒数，仅用于把策略小时换算成 UTC 毫秒。 */
const millisecondsPerHour = 3_600_000

/** 用户或识别模型给出的四态盆土观察（care.soil_evidence.states 硬规则）。 */
export interface MvpSoilObservation {
  /** 四态之一；uncertain 不形成证据。 */
  readonly state: 'wet' | 'moist' | 'dry' | 'uncertain'
  /** 观察到的范围：表土或根区（指插/竹签等）。 */
  readonly scope: 'surface' | 'root_zone'
  /** 观察 UTC 毫秒；不能晚于本次计算时刻。 */
  readonly observedAt: number
  /** 来源可靠性由受控上游判定，本映射不提升。 */
  readonly reliable: boolean
}

/** 映射所需的已发布策略字段；数值来自不可变发布正文。 */
export interface MvpSoilMappingPolicy {
  /** 发布版本，写入映射版本供回放。 */
  readonly releaseVersion: string
  /** 数值依据引用，仅供内部审计，不对外返回。 */
  readonly sourceRef: string
  /** 盆土证据有效小时数，必须为正。 */
  readonly soilEvidenceTtlHours: number
  /** 各状态在观察时刻剩余基线比例。 */
  readonly remainingFraction: {
    /** 湿土状态在观察时刻剩余的基线比例。 */
    readonly wet: DryingRange
    /** 微湿状态在观察时刻剩余的基线比例。 */
    readonly moist: DryingRange
    /** 只确认表土干、植物要求干透时的剩余比例。 */
    readonly surfaceDryOnly: DryingRange
  }
}

/** 映射输入：基线为该植物的等效干燥单位区间。 */
export interface MvpSoilMappingInput {
  /** 已解析的活动策略。 */
  readonly policy: MvpSoilMappingPolicy
  /** 本策略参考条件下的基线等效单位。 */
  readonly baseline: DryingRange
  /** 植物分组与表土是否足以判定目标。 */
  readonly group: MvpMoistureProfile
  /** 本轮盆土观察结果，含观察时间与可靠性标记。 */
  readonly observation: MvpSoilObservation
  /** 本次计算 UTC 毫秒。 */
  readonly now: number
}

/** 安全门证据与观察剩余量；uncertain 时两者都为 null。 */
export interface MvpSoilMappingResult {
  /** 供 evaluateWateringDecision 使用的当前盆土证据。 */
  readonly soil: CurrentSoilEvidence | null
  /** 观察时刻剩余等效干燥量；已达目标时为 null。 */
  readonly observedRemaining: ObservedRemainingState | null
}

/** 比例区间必须在 0～1 内有序。 */
function validateFraction(range: DryingRange): void {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min < 0 || range.max > 1 || range.max < range.min) {
    throw new RangeError('盆土剩余比例必须是0～1的有序区间')
  }
}

/** 按合同第3节映射四态观察；不识别照片，不改变来源可靠性，不修改输入对象。 */
export function mapMvpSoilObservation(input: MvpSoilMappingInput): MvpSoilMappingResult {
  const { policy, baseline, group, observation, now } = input
  if (!observation || typeof observation !== 'object') { throw new TypeError('缺少盆土观察') }
  if (!['wet', 'moist', 'dry', 'uncertain'].includes(observation.state) || !['surface', 'root_zone'].includes(observation.scope)
    || typeof observation.reliable !== 'boolean') {
    throw new TypeError('盆土观察状态、范围或可靠性不合法')
  }
  if (!Number.isSafeInteger(observation.observedAt) || !Number.isSafeInteger(now) || observation.observedAt > now) {
    throw new TypeError('盆土观察时间不合法或晚于计算时刻')
  }
  if (!Number.isFinite(policy.soilEvidenceTtlHours) || policy.soilEvidenceTtlHours <= 0) { throw new RangeError('盆土证据有效期必须为正') }
  if (!baseline || !Number.isFinite(baseline.min) || !Number.isFinite(baseline.max) || baseline.min <= 0 || baseline.max < baseline.min) {
    throw new RangeError('基线区间非法')
  }
  for (const range of Object.values(policy.remainingFraction)) { validateFraction(range) }
  if (observation.state === 'uncertain') { return { soil: null, observedRemaining: null } }

  const targetReached = observation.state === 'dry' && (observation.scope === 'root_zone' || group.surfaceSufficient)
  const soil: CurrentSoilEvidence = {
    state: observation.state === 'wet' ? 'wet' : targetReached ? 'target_dry' : 'unknown',
    scope: observation.scope, reliable: observation.reliable, targetCriteriaConfirmed: targetReached,
    collectedAt: observation.observedAt,
    validUntil: observation.observedAt + Math.round(policy.soilEvidenceTtlHours * millisecondsPerHour),
  }
  if (targetReached) { return { soil, observedRemaining: null } }
  const fraction = observation.state === 'wet' ? policy.remainingFraction.wet
    : observation.state === 'moist' ? policy.remainingFraction.moist : policy.remainingFraction.surfaceDryOnly
  return { soil, observedRemaining: {
    observedAt: observation.observedAt, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true,
    mappingValidated: true, mappingVersion: policy.releaseVersion, evidenceRef: policy.sourceRef,
    remainingDryUnits: { min: fraction.min * baseline.min, max: fraction.max * baseline.max },
  } }
}
