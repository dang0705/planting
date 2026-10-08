import type { WaterFrequencyTier, WaterTriggerState } from '../../plant-knowledge/watering/compile-water-state.js'

/**
 * MVP 浇水分组：把 Tropicals 的 tier＋trigger 归为四类“浇水前允许干到什么程度”。
 * 只决定盆土观察范围要求与消耗比例的取值键，不含任何天数或倍率。
 */
export type MvpMoistureGroup = 'keep_moist' | 'surface_dry' | 'dry_wet' | 'full_dry'

/** 分组结果；surfaceSufficient 表示只看表土即可判断是否达到浇水目标。 */
export interface MvpMoistureProfile {
  /** 消耗比例与观察范围要求共同使用的分组键。 */
  readonly group: MvpMoistureGroup
  /** 表土观察能否确认达到目标；干透型植物必须看根区。 */
  readonly surfaceSufficient: boolean
}

/** 明确触发语义直接对应分组；TIER_DEFAULT 再按来源 tier 选择。 */
const triggerGroups: Readonly<Partial<Record<WaterTriggerState, MvpMoistureGroup>>> = {
  KEEP_WET: 'keep_moist', KEEP_MOIST: 'keep_moist', SURFACE_DRY: 'surface_dry',
  DRY_WET: 'dry_wet', FULL_DRY: 'full_dry', VERY_DRY: 'full_dry', DROUGHT_SIGNAL: 'full_dry',
}
/** 来源只有 tier 时的保守对应：越耐旱允许干得越透。 */
const tierGroups: Readonly<Record<WaterFrequencyTier, MvpMoistureGroup>> = {
  constant_moisture: 'keep_moist', regular: 'surface_dry', occasional: 'dry_wet', drought_tolerant: 'full_dry',
}

/** 未知或缺失的 tier、trigger 直接拒绝，不落入隐式默认分组。 */
export function resolveMvpMoistureGroup(tier: WaterFrequencyTier, trigger: WaterTriggerState): MvpMoistureProfile {
  if (typeof tier !== 'string' || !Object.hasOwn(tierGroups, tier)) { throw new TypeError('浇水来源 tier 不受支持') }
  if (typeof trigger !== 'string' || (trigger !== 'TIER_DEFAULT' && !Object.hasOwn(triggerGroups, trigger))) {
    throw new TypeError('浇水触发语义不受支持')
  }
  const group = trigger === 'TIER_DEFAULT' ? tierGroups[tier] : triggerGroups[trigger]!
  return { group, surfaceSufficient: group === 'keep_moist' || group === 'surface_dry' }
}
