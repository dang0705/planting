import { describe, expect, it } from 'vitest'
import { estimateMvpWaterAmount } from '../../../src/care/watering/estimate-mvp-water-amount.js'

/**
 * Expected：models/care/mvp-watering-policy-contract.md 第4节；数值由独立手算（截锥装土体积、易利用水×消耗比例÷(1−排出比例)）。
 * 层次 L1 unit_fake：策略数值为显式夹具，不代表已发布参数；不覆盖真实基质或真实浇水验证。
 */
const policy = {
  headspaceCm: { min: 1, max: 2 },
  leachingFraction: { min: 0.1, max: 0.2 },
  depletion: { surface_dry: { min: 0.3, max: 0.5 }, keep_moist: { min: 0.2, max: 0.3 }, dry_wet: { min: 0.5, max: 0.7 }, full_dry: { min: 0.7, max: 0.9 } },
  substrates: {
    peat: { containerCapacity: { min: 0.6, max: 0.7 }, availableWater: { min: 0.3, max: 0.4 } },
    perlite: { containerCapacity: { min: 0.25, max: 0.35 }, availableWater: { min: 0.15, max: 0.25 } },
  },
}
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 16, potBottomDiameterCm: 12, potHeightCm: 14 }
const estimate = (overrides: Record<string, unknown> = {}) => estimateMvpWaterAmount({
  policy, group: 'surface_dry', pot, materials: ['peat', 'perlite'], ...overrides,
} as Parameters<typeof estimateMvpWaterAmount>[0])

describe('MVP 浇水量估算｜L1 unit_fake', () => {
  it('16/12/14cm 内盆留空1～2cm、泥炭+珍珠岩：净补水≈80.2～394.5mL，建议浇入 90～490mL', () => {
    const result = estimate()
    expect(result.status).toBe('candidate')
    if (result.status !== 'candidate') { throw new Error('unreachable') }
    expect(result.substrateVolumeMl.min).toBeCloseTo(1781.86, 1)
    expect(result.substrateVolumeMl.max).toBeCloseTo(1972.30, 1)
    expect(result.netDeficitMl.min).toBeCloseTo(80.184, 2)
    expect(result.netDeficitMl.max).toBeCloseTo(394.460, 2)
    expect(result.appliedAmountCandidateMl).toEqual({ min: 90, max: 490 })
  })
  it('未知配比时取所选材料物性的并集：只选泥炭比混合珍珠岩的下端更高', () => {
    const peatOnly = estimate({ materials: ['peat'] })
    if (peatOnly.status !== 'candidate') { throw new Error('unreachable') }
    // 1781.86 × 0.3 × 0.3 / 0.9 = 178.19 → 180；1972.30 × 0.5 × 0.4 / 0.8 = 493.08 → 490
    expect(peatOnly.appliedAmountCandidateMl).toEqual({ min: 180, max: 490 })
  })
  it('干透型植物消耗比例更大，建议浇入随之增大', () => {
    const full = estimate({ group: 'full_dry' })
    if (full.status !== 'candidate') { throw new Error('unreachable') }
    // 1781.86 × 0.7 × 0.15 / 0.9 = 207.88 → 210；1972.30 × 0.9 × 0.4 / 0.8 = 887.54 → 890
    expect(full.appliedAmountCandidateMl).toEqual({ min: 210, max: 890 })
  })
  it('无排水孔不给水量；排水未知、外盆未确认或尺寸缺失为缺证据', () => {
    expect(estimate({ pot: { ...pot, drainageAvailable: false } })).toEqual({ status: 'unsupported_drainage', missing: ['drainage_conditions'] })
    expect(estimate({ pot: { ...pot, drainageAvailable: null } })).toEqual({ status: 'insufficient_evidence', missing: ['drainage_conditions'] })
    expect(estimate({ pot: { ...pot, actualInnerPotConfirmed: null } })).toEqual({ status: 'insufficient_evidence', missing: ['inner_pot_geometry'] })
    expect(estimate({ pot: { ...pot, potHeightCm: null } })).toEqual({ status: 'insufficient_evidence', missing: ['inner_pot_geometry'] })
  })
  it('未选材料为缺证据；留空不小于盆高时无法装土，拒绝而不是给零', () => {
    expect(estimate({ materials: [] })).toEqual({ status: 'insufficient_evidence', missing: ['substrate_materials'] })
    expect(() => estimate({ pot: { ...pot, potHeightCm: 2 } })).toThrow(RangeError)
  })
  it('U2：直筒盆退化为圆柱（10/10/10cm 留空1cm → 706.86mL），浇入 70～180mL', () => {
    const result = estimateMvpWaterAmount({ policy: { ...policy, headspaceCm: { min: 1, max: 1 } }, group: 'surface_dry',
      pot: { ...pot, potTopDiameterCm: 10, potBottomDiameterCm: 10, potHeightCm: 10 }, materials: ['peat'] })
    if (result.status !== 'candidate') { throw new Error('unreachable') }
    expect(result.substrateVolumeMl.min).toBeCloseTo(706.858, 2)
    expect(result.substrateVolumeMl.max).toBeCloseTo(706.858, 2)
    expect(result.appliedAmountCandidateMl).toEqual({ min: 70, max: 180 })
  })
  it('U1 元素洞：跳过 null／undefined 空洞；只剩空洞视为未选材料', () => {
    const withHole = estimate({ materials: [null, 'peat', undefined] })
    if (withHole.status !== 'candidate') { throw new Error('unreachable') }
    expect(withHole.appliedAmountCandidateMl).toEqual({ min: 180, max: 490 })
    expect(estimate({ materials: [null, undefined] })).toEqual({ status: 'insufficient_evidence', missing: ['substrate_materials'] })
  })
  it('U4：重复选择同一材料与只选一次结果相同', () => {
    expect(estimate({ materials: ['peat', 'peat'] })).toEqual(estimate({ materials: ['peat'] }))
  })
  it('U3：易利用水上限超过容器持水量下限的策略自相矛盾，拒绝', () => {
    const contradictory = { ...policy, substrates: { peat: { containerCapacity: { min: 0.3, max: 0.4 }, availableWater: { min: 0.2, max: 0.35 } } } }
    expect(() => estimateMvpWaterAmount({ policy: contradictory, group: 'surface_dry', pot, materials: ['peat'] })).toThrow(RangeError)
  })
  it('未知材料代码或策略缺该材料时拒绝，不用其他材料替代', () => {
    expect(() => estimate({ materials: ['moon_dust'] })).toThrow(TypeError)
    expect(() => estimate({ materials: ['bark'] })).toThrow(TypeError)
  })
})
