import { describe, expect, it } from 'vitest'
import { deriveRootZoneWaterDeficit, type RootZoneWaterDeficitInput } from '../../../src/care/watering/derive-root-zone-water-deficit.js'
const range = (min: number, max = min) => ({ min, max })
const input = (): RootZoneWaterDeficitInput => ({ volumeBasis: 'effective_substrate', effectiveSubstrateVolumeMl: range(2000), currentVwc: range(0.15), targetVwc: range(0.30), rootZoneEvidenceValid: true })
/** L1 unit_fake：已批准计划4.3.1及体积含水率定义；算术样例不是发布参数。 */
describe('有效基质体积与根区含水率的净补水缺口', () => {
  it('2L基质从15%到30%对应300mL净缺口，不等同施水量', () => {
    const result = deriveRootZoneWaterDeficit(input())
    expect(result.status).toBe('available_candidate')
    expect(result.netDeficitMl!.min).toBeCloseTo(300, 10)
    expect(result.netDeficitMl!.max).toBeCloseTo(300, 10)
    expect(result.appliedAmountMl).toBeNull()
    expect(result.productionAdmission).toBe(false)
  })
  it('独立区间端点给出保守缺口：1.8–2.2L，当前10–20%，目标25–35%', () => {
    const result = deriveRootZoneWaterDeficit({ ...input(), effectiveSubstrateVolumeMl: range(1800, 2200), currentVwc: range(0.1, 0.2), targetVwc: range(0.25, 0.35) })
    expect(result.netDeficitMl!.min).toBeCloseTo(90, 10)
    expect(result.netDeficitMl!.max).toBeCloseTo(550, 10)
  })
  it('已达目标或区间交叠时不生成负补水量', () => {
    expect(deriveRootZoneWaterDeficit({ ...input(), currentVwc: range(0.4) })).toMatchObject({ netDeficitMl: range(0) })
    const result = deriveRootZoneWaterDeficit({ ...input(), currentVwc: range(0.2, 0.4) })
    expect(result.netDeficitMl!.min).toBe(0)
    expect(result.netDeficitMl!.max).toBeCloseTo(200, 10)
  })
  it('盆器容积和表土证据不能替代有效基质与根区量', () => {
    expect(deriveRootZoneWaterDeficit({ ...input(), volumeBasis: 'container_geometry' })).toMatchObject({ status: 'insufficient_evidence', netDeficitMl: null, reason: 'not_effective_substrate' })
    expect(deriveRootZoneWaterDeficit({ ...input(), rootZoneEvidenceValid: false })).toMatchObject({ status: 'insufficient_evidence', netDeficitMl: null })
  })
  it.each(['effectiveSubstrateVolumeMl', 'currentVwc', 'targetVwc'] as const)('缺%s不套盆容积比例或固定毫升数', key => {
    expect(deriveRootZoneWaterDeficit({ ...input(), [key]: null })).toMatchObject({ status: 'insufficient_evidence', netDeficitMl: null, appliedAmountMl: null })
  })
  it('未知可靠性不授予证据；非法类型和百分数拒绝强转', () => {
    expect(deriveRootZoneWaterDeficit({ ...input(), rootZoneEvidenceValid: null })).toMatchObject({ status: 'insufficient_evidence' })
    expect(() => deriveRootZoneWaterDeficit({ ...input(), rootZoneEvidenceValid: 'true' } as unknown as RootZoneWaterDeficitInput)).toThrow()
    for (const v of [range(30), range(-0.1), range(0.5, 0.2), range(NaN)]) {
      expect(() => deriveRootZoneWaterDeficit({ ...input(), targetVwc: v })).toThrow()
    }
    expect(() => deriveRootZoneWaterDeficit({ ...input(), effectiveSubstrateVolumeMl: range(0) })).toThrow()
  })
  it('带min/max属性的数组或函数不是合法区间对象', () => {
    for (const currentVwc of [Object.assign([], range(0.15)), Object.assign(() => 0, range(0.15))]) {
      expect(() => deriveRootZoneWaterDeficit({ ...input(), currentVwc } as unknown as RootZoneWaterDeficitInput)).toThrow(TypeError)
    }
  })
})
