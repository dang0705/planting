import { deriveMeasuredPot, type MeasuredPotInput } from '../cultivation/derive-measured-pot.js'
import type { DryingRange } from './replay-dry-progress.js'
import type { MvpMoistureGroup } from './resolve-mvp-moisture-group.js'

/** V1 已确认的 9 类基质材料选项代码（前端 PotProfileFormCore 的 value）。 */
export const mvpSubstrateMaterials = ['general', 'coco', 'ceramsite', 'peat', 'perlite', 'bark', 'sphagnum', 'gritty', 'coarse_sand'] as const
/** 用户可选的基质材料代码。 */
export type MvpSubstrateMaterial = typeof mvpSubstrateMaterials[number]

/** 单一材料的体积含水物性（0～1 体积比）。 */
export interface MvpSubstrateProperties {
  /** 浇透并自由排水后的容器持水量。 */
  readonly containerCapacity: DryingRange
  /** 植物易利用水占基质体积比例；上限不能超过持水量下限。 */
  readonly availableWater: DryingRange
}

/** 水量估算所需的已发布策略字段。 */
export interface MvpWaterAmountPolicy {
  /** 盆口留空高度区间（cm），不装土部分。 */
  readonly headspaceCm: DryingRange
  /** 浇水时从盆底排出的比例区间，0～1 且小于 1。 */
  readonly leachingFraction: DryingRange
  /** 各分组浇水前已消耗的易利用水比例。 */
  readonly depletion: Readonly<Record<MvpMoistureGroup, DryingRange>>
  /** 各材料物性；缺少的材料不能用其他材料代替。 */
  readonly substrates: Readonly<Partial<Record<MvpSubstrateMaterial, MvpSubstrateProperties>>>
}

/** 水量估算输入；只在当前行动允许浇水时调用。 */
export interface MvpWaterAmountInput {
  /** 已解析的活动策略。 */
  readonly policy: MvpWaterAmountPolicy
  /** 植物所属的浇水分组，决定目标剩余量。 */
  readonly group: MvpMoistureGroup
  /** 实际种植内盆证据与尺寸。 */
  readonly pot: MeasuredPotInput
  /** 用户勾选的材料；配比未知，按集合处理，空洞跳过。 */
  readonly materials: readonly (string | null | undefined)[]
}

/** 与结果投影 ApplicationAssessment 对齐的水量结论。 */
export type MvpWaterAmountResult = {
  /** 已得到建议浇入区间。 */
  readonly status: 'candidate'
  /** 装土体积区间（mL）。 */
  readonly substrateVolumeMl: DryingRange
  /** 留在根区的净补水区间（mL），不等于浇入量。 */
  readonly netDeficitMl: DryingRange
  /** 建议浇入区间（mL，四舍五入到 10mL）。 */
  readonly appliedAmountCandidateMl: DryingRange
} | {
  /** 无排水孔不适用“浇到少量出水”的估算；其余为缺证据。 */
  readonly status: 'unsupported_drainage' | 'insufficient_evidence'
  /** 缺失的证据类别，供上层给出可解释的说明。 */
  readonly missing: readonly string[]
}

/** 区间必须有限、非负、有序且不超过上界。 */
function validateRange(range: DryingRange, upper: number, label: string): void {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min < 0 || range.max < range.min || range.max > upper) {
    throw new RangeError(`${label} 区间非法`)
  }
}

/** 截锥在装土高度处的体积（mL）；半径按盆高线性插值。 */
function fillVolume(topDiameter: number, bottomDiameter: number, height: number, fillHeight: number): number {
  const bottom = bottomDiameter / 2
  const surface = bottom + (topDiameter / 2 - bottom) * fillHeight / height
  return Math.PI * fillHeight / 3 * (surface ** 2 + surface * bottom + bottom ** 2)
}

/** 四舍五入到 10mL，用户侧不需要更细精度。 */
const roundToTen = (value: number) => Math.round(value / 10) * 10

/** 按合同第4节估算；缺证据返回类别，不用盆容积百分比兜底。 */
export function estimateMvpWaterAmount(input: MvpWaterAmountInput): MvpWaterAmountResult {
  const { policy, pot } = input
  const materials = [...new Set(input.materials.filter((item): item is string => item !== null && item !== undefined))]
  for (const material of materials) {
    if (!(mvpSubstrateMaterials as readonly string[]).includes(material)) { throw new TypeError('未知基质材料代码') }
    if (!policy.substrates[material as MvpSubstrateMaterial]) { throw new TypeError('策略缺少所选材料的物性') }
  }
  const geometry = deriveMeasuredPot(pot)
  if (geometry.geometry === null || pot.potTopDiameterCm === null || pot.potBottomDiameterCm === null || pot.potHeightCm === null) {
    return { status: 'insufficient_evidence', missing: ['inner_pot_geometry'] }
  }
  if (pot.drainageAvailable === false) { return { status: 'unsupported_drainage', missing: ['drainage_conditions'] } }
  if (pot.drainageAvailable !== true) { return { status: 'insufficient_evidence', missing: ['drainage_conditions'] } }
  if (materials.length === 0) { return { status: 'insufficient_evidence', missing: ['substrate_materials'] } }

  validateRange(policy.headspaceCm, Number.POSITIVE_INFINITY, '留空高度')
  validateRange(policy.leachingFraction, 0.99, '排出比例')
  const depletion = policy.depletion[input.group]
  validateRange(depletion, 1, '消耗比例')
  if (policy.headspaceCm.max >= pot.potHeightCm) { throw new RangeError('留空高度不小于盆高，无法装土') }

  const properties = materials.map(material => policy.substrates[material as MvpSubstrateMaterial]!)
  for (const item of properties) {
    validateRange(item.containerCapacity, 1, '容器持水量'); validateRange(item.availableWater, 1, '易利用水')
    if (item.availableWater.max > item.containerCapacity.min) { throw new RangeError('易利用水不能超过容器持水量') }
  }
  // 配比未知：任意混合的物性都落在各组分最小值与最大值之间。
  const capacityMax = Math.max(...properties.map(item => item.containerCapacity.max))
  const available = { min: Math.min(...properties.map(item => item.availableWater.min)), max: Math.max(...properties.map(item => item.availableWater.max)) }
  const { potTopDiameterCm: top, potBottomDiameterCm: bottom, potHeightCm: height } = pot
  const volume = { min: fillVolume(top, bottom, height, height - policy.headspaceCm.max), max: fillVolume(top, bottom, height, height - policy.headspaceCm.min) }
  const net = { min: volume.min * depletion.min * available.min, max: volume.max * depletion.max * available.max }
  const cap = volume.max * capacityMax / (1 - policy.leachingFraction.max)
  const applied = {
    min: roundToTen(Math.min(net.min / (1 - policy.leachingFraction.min), cap)),
    max: roundToTen(Math.min(net.max / (1 - policy.leachingFraction.max), cap)),
  }
  return { status: 'candidate', substrateVolumeMl: volume, netDeficitMl: net, appliedAmountCandidateMl: applied }
}
