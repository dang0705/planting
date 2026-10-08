import { describe, expect, it } from 'vitest'
import { deriveRootZoneReference, type RootZoneReferenceInput } from '../../../models/care/experiments/root-zone-reference.js'

const point = (n: number) => ({ min: n, max: n })
/** 独立数学样例，L1 unit_fake；并发、鉴权和写回不属于纯函数职责。 */
function input(): RootZoneReferenceInput {
  return { water: { volumeBasis: 'effective_substrate', effectiveSubstrateVolumeMl: point(2000), currentVwc: point(0.20), targetVwc: point(0.30), rootZoneEvidenceValid: true },
    triggerVwc: point(0.15), referenceLossMl: point(62.5), integratedDemand: point(0.625) }
}
describe('同盆根区水量与剩余参考单位', () => {
  it('一天失水62.5ml除同期0.625单位，100ml剩余对应1单位', () => {
    const r = deriveRootZoneReference(input())
    expect(r.status).toBe('candidate')
    expect(r.productionAdmission).toBe(false)
    expect(r.referenceMlPerDryUnit).toEqual(point(100))
    expect(r.remainingWaterMl!.min).toBeCloseTo(100, 12)
    expect(r.remainingDryUnits!.min).toBeCloseTo(1, 12)
    expect(r.netDeficit.netDeficitMl!.min).toBeCloseTo(200, 12)
    expect(r.netDeficit.appliedAmountMl).toBeNull()
  })
  it('相反端点保留范围，不用中心值掩盖不确定性', () => {
    const x = input()
    const r = deriveRootZoneReference({ ...x, water: { ...x.water, effectiveSubstrateVolumeMl: { min: 1800, max: 2200 }, currentVwc: { min: 0.18, max: 0.22 } },
      triggerVwc: { min: 0.14, max: 0.16 }, referenceLossMl: { min: 50, max: 75 }, integratedDemand: { min: 0.5, max: 0.75 } })
    expect(r.remainingWaterMl!.min).toBeCloseTo(36, 10)
    expect(r.remainingWaterMl!.max).toBeCloseTo(176, 10)
    expect(r.remainingDryUnits!.min).toBeCloseTo(0.24, 10)
    expect(r.remainingDryUnits!.max).toBeCloseTo(2.64, 10)
    expect(r.netDeficit.netDeficitMl!.min).toBeCloseTo(144, 10)
    expect(r.netDeficit.netDeficitMl!.max).toBeCloseTo(264, 10)
  })
  it.each(['referenceLossMl', 'integratedDemand', 'triggerVwc'] as const)('缺%s只阻断剩余单位，净缺口独立保留', key => {
    const r = deriveRootZoneReference({ ...input(), [key]: null })
    expect(r.status).toBe('insufficient_evidence')
    expect(r.remainingDryUnits).toBeNull()
    expect(r.netDeficit.netDeficitMl!.min).toBeCloseTo(200, 12)
  })
  it('缺补水目标只影响水量，不阻断剩余时间量纲', () => {
    const x = input(); const r = deriveRootZoneReference({ ...x, water: { ...x.water, targetVwc: null } })
    expect(r.status).toBe('candidate')
    expect(r.remainingDryUnits!.min).toBeCloseTo(1, 12)
    expect(r.netDeficit.netDeficitMl).toBeNull()
  })
  it('检查干燥阈值完全高于补水目标时拒绝互相矛盾的条件', () => {
    expect(() => deriveRootZoneReference({ ...input(), triggerVwc: { min: 0.31, max: 0.35 } })).toThrow('检查干燥阈值高于补水目标')
  })
  it.each(['referenceLossMl', 'integratedDemand'] as const)('%s含零不能作为除数', key => {
    const r = deriveRootZoneReference({ ...input(), [key]: { min: 0, max: 1 } })
    expect(r.remainingDryUnits).toBeNull()
  })
  it('达到检查干燥状态时剩余零，补水缺口仍正', () => {
    const x = input(); const r = deriveRootZoneReference({ ...x, water: { ...x.water, currentVwc: point(0.1) } })
    expect(r.remainingDryUnits).toEqual(point(0))
    expect(r.netDeficit.netDeficitMl!.min).toBeCloseTo(400, 10)
  })
  it.each([false, null])('根区未核验%s不能生成时间或水量', valid => {
    const x = input(); const r = deriveRootZoneReference({ ...x, water: { ...x.water, rootZoneEvidenceValid: valid } })
    expect(r.remainingDryUnits).toBeNull(); expect(r.netDeficit.netDeficitMl).toBeNull()
  })
  it('几何体积不能替代有效基质体积', () => {
    const x = input(); const r = deriveRootZoneReference({ ...x, water: { ...x.water, volumeBasis: 'container_geometry' } })
    expect(r.remainingDryUnits).toBeNull(); expect(r.netDeficit.netDeficitMl).toBeNull()
  })
  it.each([-1, NaN, Infinity, 30])('拒绝非法阈值%s', v => {
    expect(() => deriveRootZoneReference({ ...input(), triggerVwc: point(v) })).toThrow()
  })
  it('输入不变，重复回放一致', () => {
    const x = input(); const before = structuredClone(x)
    expect(deriveRootZoneReference(x)).toEqual(deriveRootZoneReference(before)); expect(x).toEqual(before)
  })
})
