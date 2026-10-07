/** 来源tier只作为分类先验，不直接赋予周期天数。 */
export type WaterFrequencyTier = 'constant_moisture' | 'regular' | 'occasional' | 'drought_tolerant'
/** 触发状态独立于tier；默认只表示来源未支持安全细分。 */
export type WaterTriggerState = 'KEEP_WET' | 'KEEP_MOIST' | 'SURFACE_DRY' | 'DRY_WET' | 'FULL_DRY' | 'VERY_DRY' | 'DROUGHT_SIGNAL' | 'TIER_DEFAULT'
/** 保守词义候选保存原文分类依据，不声称正式发布或全库覆盖。 */
export interface ClassifiedWaterState {
  /** 已支持的普通浇水语义编译结果。 */
  readonly status: 'classified'
  /** 明确来源于词义候选，不能当正式规则版本。 */
  readonly method: 'explicit_terms_candidate'
  /** 原tier保留，不被触发语义覆盖。 */
  readonly tier: WaterFrequencyTier
  /** 唯一主句状态，或已批准语义的tier默认。 */
  readonly trigger: WaterTriggerState
  /** 所有无条件主句，保存供审核和历史回放。 */
  readonly generalClauses: readonly string[]
  /** 条件性原句不作为全年触发状态。 */
  readonly conditionalClauses: readonly string[]
  /** 原文命中的触发类型，混合时仍能看到冲突。 */
  readonly matchedTriggers: readonly WaterTriggerState[]
  /** 否定表达不能作为正向要求，单独保存审核依据。 */
  readonly negatedClauses: readonly string[]
}
/** 非普通来源不能进入通用盆土周期。 */
export type WaterStateCompilation = ClassifiedWaterState | {
  /** 只描述不支持的原因，不自由生成周期。 */
  readonly status: 'unsupported_tier' | 'invalid_remarks' | 'special_cultivation' | 'contamination'
}
/** 明确的外部文本输入，不强转数字或对象为字符串。 */
export interface WaterStateInput {
  /** Tropicals来源分类，未知值保留为不支持。 */
  readonly tier: unknown
  /** 原始measurementRemarks，不改写来源字段。 */
  readonly remarks: unknown
}

/** 四类已存在策略tier，不增加隐藏映射或默认值。 */
const tiers: readonly string[] = ['constant_moisture', 'regular', 'occasional', 'drought_tolerant']
/** 明确水分触发词义，不包含任何天数、环境倍率或物种特例。 */
const triggerTerms: readonly (readonly [WaterTriggerState, RegExp])[] = [
  ['KEEP_WET', /保持(?:盆土|土壤|基质)?湿润|持续湿润|维持湿润/u],
  ['KEEP_MOIST', /保持(?:盆土|土壤|基质)?微湿|维持微湿|盆土微湿/u],
  ['SURFACE_DRY', /表(?:土|层)(?:土壤)?干燥|表面干燥/u],
  ['DRY_WET', /见干见湿|干湿交替/u],
  ['FULL_DRY', /干透浇透|干透后|完全干燥/u],
  ['VERY_DRY', /非常干燥|充分干燥|长期干燥/u],
  ['DROUGHT_SIGNAL', /缺水信号|叶片.*(?:发软|萎蔫)/u],
]
/** 生长与季节条件不直接提升为全年规则；不猜用户当前生长状态。 */
const conditionalTerms = /生长季|生长期|休眠期|旺季|春季|夏季|秋季|冬季|冬天|夏天/u

/** 单条来源的确定性候选编译，不查SQL、不用模型、不产生建议或事实。 */
export function compileWaterState(input: WaterStateInput): WaterStateCompilation {
  if (typeof input.tier !== 'string' || !tiers.includes(input.tier)) { return { status: 'unsupported_tier' } }
  if (typeof input.remarks !== 'string') { return { status: 'invalid_remarks' } }
  // 特殊词义只触发专项复核；不声称靠单个词确认了水生或附生植物身份。
  if (/水培|水生|半水生|叶杯|浸泡|喷雾供水/u.test(input.remarks)) { return { status: 'special_cultivation' } }
  const generalClauses: string[] = []
  const conditionalClauses: string[] = []
  // 条件在逗号分句间持续；硬分隔后才重新判定，避免将冬季要求提升为全年规则。
  for (const sentence of input.remarks.split(/[。；;\n]/u)) {
    let conditional = false
    for (const clause of sentence.split(/[，,]/u).map(value => value.trim()).filter(Boolean)) {
      conditional = conditional || conditionalTerms.test(clause)
      ;(conditional ? conditionalClauses : generalClauses).push(clause)
    }
  }
  const negatedClauses = generalClauses.filter(clause => /不要|不可|不宜|不必|不能|无需|不需要|勿|避免|禁止/u.test(clause))
  const positiveClauses = generalClauses.filter(clause => !negatedClauses.includes(clause))
  const matchedTriggers = triggerTerms.filter(([, terms]) => positiveClauses.some(clause => terms.test(clause))).map(([trigger]) => trigger)
  if (matchedTriggers.length === 0 && /叶形|叶序|羽状复叶|生长习性/u.test(input.remarks) && !/浇水|补水|盆土|湿润|微湿|干燥/u.test(input.remarks)) {
    return { status: 'contamination' }
  }
  return { status: 'classified', method: 'explicit_terms_candidate', tier: input.tier as WaterFrequencyTier,
    trigger: matchedTriggers.length === 1 ? matchedTriggers[0]! : 'TIER_DEFAULT', generalClauses, conditionalClauses, matchedTriggers, negatedClauses }
}
