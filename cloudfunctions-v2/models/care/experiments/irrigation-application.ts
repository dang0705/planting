import type { DryingRange } from '../../../src/care/watering/replay-dry-progress.js'

/** 明确的离线供排水条件；所有水量均为毫升，缺值不能由模型补齐。 */
export interface IrrigationApplicationInput {
  /** 当前净缺口的不确定范围，不是允许净补水范围。 */
  readonly netDeficitMl: DryingRange | null
  /** 同一操作和适用域内，浇入量最终留在根区的比例。 */
  readonly retentionFraction: DryingRange | null
  /** 独立有依据的本次最低补水及最高允许净留水，不能从净缺口自动复制。 */
  readonly allowedNetAdditionMl: DryingRange | null
  /** 上述比例有依据的施水量适用域。 */
  readonly calibratedAppliedMl: DryingRange | null
  /** 独立核验的单次浇入量上限，不按盆容积猜测。 */
  readonly maximumSingleApplicationMl: number | null
}

/** 拒绝无穷、负值、错序及比例超域；有效零仅用于毫升量。 */
function validateRange(range: DryingRange | null, fraction = false): void {
  if (range === null) { return }
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min < 0 || range.max < range.min
    || (fraction && (range.min <= 0 || range.max > 1))) { throw new TypeError('供排水参考量必须为有效有限区间') }
}

/** 比例换算不能把不可表示的正水量变成零或无穷。 */
function divide(value: number, fraction: number): number {
  const result = value / fraction
  if (!Number.isFinite(result) || (value > 0 && result === 0)) { throw new RangeError('施水量换算超出数值表示范围') }
  return result
}

/**
 * 保留需求不确定包络，另算同时满足允许净留水范围的施水交集。
 * 只保证显式条件下的算术，不自授盆土安全或生产准入。
 */
export function deriveIrrigationApplication(input: IrrigationApplicationInput) {
  validateRange(input.netDeficitMl); validateRange(input.retentionFraction, true)
  validateRange(input.allowedNetAdditionMl); validateRange(input.calibratedAppliedMl)
  const cap = input.maximumSingleApplicationMl
  if (cap !== null && (!Number.isFinite(cap) || cap < 0)) { throw new TypeError('单次施水上限必须为非负有限毫升数') }
  const deficit = input.netDeficitMl; const fraction = input.retentionFraction
  const requiredAppliedEnvelopeMl = deficit === null || fraction === null ? null
    : { min: divide(deficit.min, fraction.max), max: divide(deficit.max, fraction.min) }
  const unavailable = (status: 'insufficient_evidence' | 'not_required' | 'no_safe_single_application') => ({
    productionAdmission: false as const, status, requiredAppliedEnvelopeMl,
    appliedAmountCandidateMl: null, retainedEnvelopeMl: null,
  })
  if (deficit === null) { return unavailable('insufficient_evidence') }
  if (deficit.max === 0) { return unavailable('not_required') }
  const allowed = input.allowedNetAdditionMl; const domain = input.calibratedAppliedMl
  if (fraction === null || allowed === null || domain === null || cap === null) { return unavailable('insufficient_evidence') }
  const min = Math.max(divide(allowed.min, fraction.min), domain.min)
  const max = Math.min(divide(allowed.max, fraction.max), domain.max, cap)
  if (min > max || max === 0) { return unavailable('no_safe_single_application') }
  return { productionAdmission: false as const, status: 'candidate' as const, requiredAppliedEnvelopeMl,
    appliedAmountCandidateMl: { min, max }, retainedEnvelopeMl: { min: min * fraction.min, max: max * fraction.max } }
}
