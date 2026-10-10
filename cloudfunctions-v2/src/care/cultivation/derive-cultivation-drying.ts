import type { MvpReferencePot } from '../../configuration/mvp-watering-policy.js'
import type { DryingRange } from '../watering/replay-dry-progress.js'
import type { MeasuredPotInput } from './derive-measured-pot.js'
import { frustumFillGeometry } from './frustum-fill-geometry.js'

/** 栽培干燥推导所需的已发布策略字段（care-watering-mvp/v3，合同 8.3～8.6）。 */
export interface CultivationDryingPolicy {
  /** 植物基线对应的参考内盆（不透气、有排水孔）。 */
  readonly referencePot: MvpReferencePot
  /** 参考基质可用水（AW，Bilderback 2005 口径）比例（定义锚点）。 */
  readonly referenceAvailableWater: number
  /** 植物蒸腾随盆容积伸缩的指数区间 b。 */
  readonly plantDemandVolumeExponent: DryingRange
  /** 盆口留空高度区间（cm）；实际盆与参考盆按同一端点计算。 */
  readonly headspaceCm: DryingRange
  /** 几何齐备但缺基质证据时的兜底存量比。 */
  readonly cultivationRetention: DryingRange
}

/** 推导结果：三个相对参考盆的无量纲倍率区间。 */
export interface CultivationDrying {
  /** 存量比 S：本盆可用水量 ÷ 参考盆可用水量；写入 DryingInterval.cultivationRetention。 */
  readonly storage: DryingRange
  /** 植物需求比 P：只乘环境需求的叶片（蒸腾）项。 */
  readonly plantDemandScale: DryingRange
  /** 蒸发面比 Ae：只乘环境需求的基质蒸发项；不含盆壁蒸发（盆壁材质待验证票 z8v0kmvewm）。 */
  readonly evaporationAreaScale: DryingRange
  /** measured：由实测几何与基质推导；fallback：缺几何或基质，按兜底存量比且 P=Ae=1。 */
  readonly basis: 'measured' | 'fallback'
}

/** 中性倍率：缺证据时需求不按盆伸缩。 */
const neutral: DryingRange = { min: 1, max: 1 }

/**
 * 合同 8.4：对留空高度两端点 s，实际盆与参考盆按同一 s 计算体积比与土表面积比，再取包络；
 * 存量比 = 体积比 × 混合可用水（AW，Bilderback 2005 口径） ÷ 参考可用水（AW，Bilderback 2005 口径）；植物比 = 体积比^b 的包络；蒸发面比 = 土表面积比。
 * 几何不全、未确认内盆、装不了土（盆高不大于留空上限）或未选基质时，按 8.6 返回兜底。
 * 排水条件不影响本推导：积水风险由盆器安全门独立裁决。
 */
export function deriveCultivationDrying(policy: CultivationDryingPolicy, pot: MeasuredPotInput, availableWater: DryingRange | null): CultivationDrying {
  const fallback: CultivationDrying = { storage: { ...policy.cultivationRetention }, plantDemandScale: neutral, evaporationAreaScale: neutral, basis: 'fallback' }
  const { potTopDiameterCm: top, potBottomDiameterCm: bottom, potHeightCm: height } = pot
  if (pot.actualInnerPotConfirmed !== true || top === null || bottom === null || height === null
    || height <= policy.headspaceCm.max || availableWater === null) { return fallback }
  const reference = policy.referencePot
  const volumeRatios: number[] = []
  const areaRatios: number[] = []
  for (const headspace of [policy.headspaceCm.min, policy.headspaceCm.max]) {
    const actual = frustumFillGeometry(top, bottom, height, height - headspace)
    const anchor = frustumFillGeometry(reference.topDiameterCm, reference.bottomDiameterCm, reference.heightCm, reference.heightCm - headspace)
    volumeRatios.push(actual.volumeMl / anchor.volumeMl)
    areaRatios.push(actual.surfaceAreaCm2 / anchor.surfaceAreaCm2)
  }
  const volume = { min: Math.min(...volumeRatios), max: Math.max(...volumeRatios) }
  const plant = [volume.min, volume.max].flatMap(ratio => [policy.plantDemandVolumeExponent.min, policy.plantDemandVolumeExponent.max].map(exponent => ratio ** exponent))
  const result: CultivationDrying = {
    storage: { min: volume.min * availableWater.min / policy.referenceAvailableWater, max: volume.max * availableWater.max / policy.referenceAvailableWater },
    plantDemandScale: { min: Math.min(...plant), max: Math.max(...plant) },
    evaporationAreaScale: { min: Math.min(...areaRatios), max: Math.max(...areaRatios) },
    basis: 'measured',
  }
  for (const range of [result.storage, result.plantDemandScale, result.evaporationAreaScale]) {
    if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min <= 0 || range.max < range.min) {
      throw new RangeError('栽培干燥倍率超出可表示范围')
    }
  }
  return result
}
