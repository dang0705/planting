import { describe, expect, it } from 'vitest'
import { deriveIrrigationApplication, type IrrigationApplicationInput } from '../../../models/care/experiments/irrigation-application.js'

const point = (value: number) => ({ min: value, max: value })
/** L1 unit_fake；Expected来自守恒关系与合同手算，不从被测结果生成。 */
function input(): IrrigationApplicationInput {
  return { netDeficitMl: point(200), retentionFraction: point(0.8), allowedNetAdditionMl: point(200),
    calibratedAppliedMl: { min: 0, max: 500 }, maximumSingleApplicationMl: 500 }
}
describe('净补水到单次施水候选', () => {
  it('200mL净需水除以0.8留水比例为250mL浇入量', () => {
    const r = deriveIrrigationApplication(input())
    expect(r.status).toBe('candidate'); expect(r.productionAdmission).toBe(false)
    expect(r.requiredAppliedEnvelopeMl).toEqual(point(250))
    expect(r.appliedAmountCandidateMl).toEqual(point(250))
    expect(r.retainedEnvelopeMl).toEqual(point(200))
  })
  it('需求不确定范围不能自动充当允许净补水范围', () => {
    const r = deriveIrrigationApplication({ ...input(), netDeficitMl: { min: 180, max: 240 }, retentionFraction: { min: 0.75, max: 0.9 }, allowedNetAdditionMl: null })
    expect(r.requiredAppliedEnvelopeMl).toEqual({ min: 200, max: 320 })
    expect(r.appliedAmountCandidateMl).toBeNull(); expect(r.status).toBe('insufficient_evidence')
  })
  it('允许净补水与比例约束给出稳健范围，而不是需求包络', () => {
    const r = deriveIrrigationApplication({ ...input(), netDeficitMl: { min: 180, max: 240 }, retentionFraction: { min: 0.75, max: 0.9 }, allowedNetAdditionMl: { min: 180, max: 240 } })
    expect(r.appliedAmountCandidateMl!.min).toBe(240)
    expect(r.appliedAmountCandidateMl!.max).toBeCloseTo(800 / 3, 10)
    expect(r.retainedEnvelopeMl!.min).toBe(180)
    expect(r.retainedEnvelopeMl!.max).toBeCloseTo(240, 10)
  })
  it('稳健范围与上限有交集时保留可用子集', () => {
    const r = deriveIrrigationApplication({ ...input(), retentionFraction: { min: 0.75, max: 0.9 }, allowedNetAdditionMl: { min: 180, max: 240 }, maximumSingleApplicationMl: 250 })
    expect(r.appliedAmountCandidateMl).toEqual({ min: 240, max: 250 })
    expect(r.retainedEnvelopeMl).toEqual({ min: 180, max: 225 })
  })
  it.each(['safety', 'domain', 'incompatible_band'] as const)('%s无可用交集时不截短后伪报补足', kind => {
    const x = input()
    const r = deriveIrrigationApplication({ ...x,
      ...(kind === 'safety' ? { maximumSingleApplicationMl: 230 } : {}),
      ...(kind === 'domain' ? { calibratedAppliedMl: { min: 300, max: 500 } } : {}),
      ...(kind === 'incompatible_band' ? { retentionFraction: { min: 0.5, max: 1 } } : {}) })
    expect(r.status).toBe('no_safe_single_application'); expect(r.appliedAmountCandidateMl).toBeNull()
  })
  it.each(['netDeficitMl', 'retentionFraction', 'allowedNetAdditionMl', 'calibratedAppliedMl', 'maximumSingleApplicationMl'] as const)('缺%s不猜值', key => {
    expect(deriveIrrigationApplication({ ...input(), [key]: null }).appliedAmountCandidateMl).toBeNull()
  })
  it('净缺口为零时不凭其他参数制造施水量', () => {
    const r = deriveIrrigationApplication({ ...input(), netDeficitMl: point(0) })
    expect(r.status).toBe('not_required'); expect(r.appliedAmountCandidateMl).toBeNull()
  })
  it.each([0, -0.1, 1.1, NaN, Infinity])('拒绝非法净留水比例%s', value => {
    expect(() => deriveIrrigationApplication({ ...input(), retentionFraction: point(value) })).toThrow()
  })
  it('正量溢出不得成为有效施水候选', () => {
    expect(() => deriveIrrigationApplication({ ...input(), retentionFraction: point(Number.MIN_VALUE) })).toThrow()
  })
  it('不可变输入重复回放一致', () => {
    const x = input(); const before = structuredClone(x)
    expect(deriveIrrigationApplication(x)).toEqual(deriveIrrigationApplication(x)); expect(x).toEqual(before)
  })
})
