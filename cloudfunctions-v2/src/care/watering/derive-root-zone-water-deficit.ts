import type { DryingRange } from './replay-dry-progress.js'
/** 内部根区水分证据；含水率为体积比，专业输入不属于MVP前端必填。 */
export interface RootZoneWaterDeficitInput {
  /** 明确有效基质体积或仅盆器几何，二者不可混用。 */
  readonly volumeBasis: 'effective_substrate' | 'container_geometry'
  /** 有效基质体积区间，单位毫升；缺失必须为null。 */
  readonly effectiveSubstrateVolumeMl: DryingRange | null
  /** 当前根区体积含水率分数区间，不能使用相对湿度刻度。 */
  readonly currentVwc: DryingRange | null
  /** 有依据的目标体积含水率分数区间，不写固定默认。 */
  readonly targetVwc: DryingRange | null
  /** 上游核验同一根区、部位、时效和来源的结果。 */
  readonly rootZoneEvidenceValid: boolean | null
}
/** 净缺口与实际施水量明确分开，不自行推断供水损失或排水上限。 */
export interface RootZoneWaterDeficitResult {
  /** 有证据可计算的候选或明确缺少必要证据。 */
  readonly status: 'available_candidate' | 'insufficient_evidence'
  /** 本用例不发布算法或授予正式水量建议资格。 */
  readonly productionAdmission: false
  /** 缺口原因可供后续确认，不把缺失当有效零值。 */
  readonly reason: 'not_effective_substrate' | 'missing_volume' | 'missing_moisture' | 'root_zone_unconfirmed' | null
  /** 净补水体积区间；计算结果不是实际施水量。 */
  readonly netDeficitMl: DryingRange | null
  /** 尚缺独立供水与排水策略，不私设效率或盆容积比例。 */
  readonly appliedAmountMl: null
}
/** 校验真实量纲和端点，不用Number强转空值、字符串或百分数。 */
function validateRange(value: DryingRange | null, fraction: boolean): void {
  if (value === null) { return }
  if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.min !== 'number' || typeof value.max !== 'number'
    || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.max < value.min
    || (fraction ? value.min < 0 || value.max > 1 : value.min <= 0)) { throw new TypeError('根区水量证据必须为有效有序区间及明确量纲') }
}
/** 承接已批准净缺口公式；不读取天气、不消费DryProgress、不写用户事实。 */
export function deriveRootZoneWaterDeficit(input: RootZoneWaterDeficitInput): RootZoneWaterDeficitResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) { throw new TypeError('缺少根区补水证据对象') }
  if (!['effective_substrate', 'container_geometry'].includes(input.volumeBasis) || ![true, false, null].includes(input.rootZoneEvidenceValid)) { throw new TypeError('体积依据或根区证据类型非法') }
  validateRange(input.effectiveSubstrateVolumeMl, false)
  validateRange(input.currentVwc, true); validateRange(input.targetVwc, true)
  const missing = (reason: RootZoneWaterDeficitResult['reason']): RootZoneWaterDeficitResult => ({ status: 'insufficient_evidence', productionAdmission: false, reason, netDeficitMl: null, appliedAmountMl: null })
  if (input.volumeBasis !== 'effective_substrate') { return missing('not_effective_substrate') }
  if (input.effectiveSubstrateVolumeMl === null) { return missing('missing_volume') }
  if (input.currentVwc === null || input.targetVwc === null) { return missing('missing_moisture') }
  if (input.rootZoneEvidenceValid !== true) { return missing('root_zone_unconfirmed') }
  const lowerDelta = Math.max(0, input.targetVwc.min - input.currentVwc.max)
  const upperDelta = Math.max(0, input.targetVwc.max - input.currentVwc.min)
  const min = input.effectiveSubstrateVolumeMl.min * lowerDelta
  const max = input.effectiveSubstrateVolumeMl.max * upperDelta
  if (!Number.isFinite(max) || (lowerDelta > 0 && min === 0) || (upperDelta > 0 && max === 0)) { throw new RangeError('根区正补水量超出可表示数值范围') }
  return { status: 'available_candidate', productionAdmission: false, reason: null, netDeficitMl: { min, max }, appliedAmountMl: null }
}
