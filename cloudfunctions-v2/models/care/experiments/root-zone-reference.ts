import { deriveRootZoneWaterDeficit, type RootZoneWaterDeficitInput } from '../../../src/care/watering/derive-root-zone-water-deficit.js'
import type { DryingRange } from '../../../src/care/watering/replay-dry-progress.js'

/** 同盆观察及历史参考积分；专业数据只属于本地实验，不来自客户端默认。 */
export interface RootZoneReferenceInput {
  /** 当前根区与补水目标；缺目标不影响独立时间换算。 */
  readonly water: RootZoneWaterDeficitInput
  /** 有依据的检查干燥阈值，不是补水后目标。 */
  readonly triggerVwc: DryingRange | null
  /** 已核验同盆净失水，毫升；缺质量到体积依据时不能传克。 */
  readonly referenceLossMl: DryingRange | null
  /** 同期、同响应版本的积分，单位为参考干燥单位，不是自然天。 */
  readonly integratedDemand: DryingRange | null
}

/** 有效零可以出现，但负值、无穷或反序不能进入物理换算。 */
function validateNonnegative(value: DryingRange | null): void {
  if (value === null) { return }
  if (!value || !Number.isFinite(value.min) || !Number.isFinite(value.max) || value.min < 0 || value.max < value.min) {
    throw new TypeError('同盆参考量须为非负有限有序区间')
  }
}

/** 非负分子除严格正分母；不可表示的正结果不伪装为有效零。 */
function divide(numerator: number, denominator: number): number {
  const result = numerator / denominator
  if (!Number.isFinite(result) || (numerator > 0 && result === 0)) { throw new RangeError('同盆参考换算超出数值表示范围') }
  return result
}

/**
 * 体积含水率给出的水量与历史参考尺度连接；不含环境模型默认或浇水许可。
 * 原子来源与时序由组合用例校验，本函数只做量纲和范围算术。
 */
export function deriveRootZoneReference(input: RootZoneReferenceInput) {
  validateNonnegative(input.referenceLossMl); validateNonnegative(input.integratedDemand)
  const netDeficit = deriveRootZoneWaterDeficit(input.water)
  // 复用已验证的V×max(0,目标-当前)区间算术，调换两项得到V×max(0,c-t)。
  // 此结果仅表示到检查阈值还需失水，绝不作为施水量返回。
  const remaining = deriveRootZoneWaterDeficit({ ...input.water, currentVwc: input.triggerVwc, targetVwc: input.water.currentVwc })
  if (input.triggerVwc !== null && input.water.targetVwc !== null && input.triggerVwc.min > input.water.targetVwc.max) {
    throw new TypeError('检查干燥阈值高于补水目标')
  }
  const missing = (reason: string) => ({ productionAdmission: false as const, status: 'insufficient_evidence' as const, reason,
    netDeficit, remainingWaterMl: remaining.netDeficitMl, referenceMlPerDryUnit: null, remainingDryUnits: null })
  if (remaining.netDeficitMl === null) { return missing('missing_root_zone_or_trigger') }
  const loss = input.referenceLossMl; const integral = input.integratedDemand
  if (loss === null || integral === null || loss.min === 0 || integral.min === 0) { return missing('missing_positive_reference') }
  const referenceMlPerDryUnit = { min: divide(loss.min, integral.max), max: divide(loss.max, integral.min) }
  const remainingDryUnits = { min: divide(remaining.netDeficitMl.min, referenceMlPerDryUnit.max), max: divide(remaining.netDeficitMl.max, referenceMlPerDryUnit.min) }
  return { productionAdmission: false as const, status: 'candidate' as const, reason: null, netDeficit,
    remainingWaterMl: remaining.netDeficitMl, referenceMlPerDryUnit, remainingDryUnits }
}
