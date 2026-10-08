import { describe, expect, it } from 'vitest'
import { mapMvpSoilObservation } from '../../../src/care/watering/map-mvp-soil-observation.js'
import { resolveMvpMoistureGroup } from '../../../src/care/watering/resolve-mvp-moisture-group.js'

/**
 * Expected：models/care/mvp-watering-policy-contract.md 第3节映射表（用户2026-10-08授权的MVP文献标定路径）。
 * 层次 L1 unit_fake：只替换策略数值为显式夹具，映射规则本身不替换；不覆盖真实照片识别或用户输入可靠性。
 */
const hour = 3_600_000
const observedAt = Date.UTC(2026, 9, 8, 2)
const policy = {
  releaseVersion: 'care-watering-mvp/v1-fixture', sourceRef: 'fixture:mvp-literature',
  soilEvidenceTtlHours: 24,
  remainingFraction: { wet: { min: 0.6, max: 1 }, moist: { min: 0.2, max: 0.6 }, surfaceDryOnly: { min: 0, max: 0.4 } },
}
const baseline = { min: 5, max: 8 }
const regular = resolveMvpMoistureGroup('regular', 'SURFACE_DRY')
const fullDry = resolveMvpMoistureGroup('drought_tolerant', 'FULL_DRY')
const map = (state: 'wet' | 'moist' | 'dry' | 'uncertain', scope: 'surface' | 'root_zone', group = regular) =>
  mapMvpSoilObservation({ policy, baseline, group, observation: { state, scope, observedAt, reliable: true }, now: observedAt + hour })

describe('MVP 触发条件分组｜L1 unit_fake', () => {
  it.each([
    ['regular', 'SURFACE_DRY', 'surface_dry'], ['regular', 'TIER_DEFAULT', 'surface_dry'],
    ['constant_moisture', 'TIER_DEFAULT', 'keep_moist'], ['constant_moisture', 'KEEP_MOIST', 'keep_moist'],
    ['regular', 'KEEP_WET', 'keep_moist'], ['occasional', 'TIER_DEFAULT', 'dry_wet'], ['regular', 'DRY_WET', 'dry_wet'],
    ['drought_tolerant', 'TIER_DEFAULT', 'full_dry'], ['occasional', 'FULL_DRY', 'full_dry'],
    ['occasional', 'VERY_DRY', 'full_dry'], ['regular', 'DROUGHT_SIGNAL', 'full_dry'],
  ] as const)('%s + %s → %s；表土可否判定目标由分组决定', (tier, trigger, group) => {
    const resolved = resolveMvpMoistureGroup(tier, trigger)
    expect(resolved.group).toBe(group)
    expect(resolved.surfaceSufficient).toBe(group === 'surface_dry' || group === 'keep_moist')
  })
  it('U1：tier 或触发值缺失拒绝，不落入默认分组', () => {
    expect(() => resolveMvpMoistureGroup(undefined as never, 'SURFACE_DRY')).toThrow(TypeError)
    expect(() => resolveMvpMoistureGroup('regular', undefined as never)).toThrow(TypeError)
  })
  it('未知 tier 或触发值拒绝，不落入默认分组', () => {
    expect(() => resolveMvpMoistureGroup('unknown' as never, 'SURFACE_DRY')).toThrow(TypeError)
    expect(() => resolveMvpMoistureGroup('regular', 'RAIN' as never)).toThrow(TypeError)
  })
})

describe('MVP 盆土四态映射｜L1 unit_fake', () => {
  it('湿：暂停浇水门，剩余量 = 0.6～1.0 × 基线 5～8 = 3～8 单位；有效期24小时', () => {
    const result = map('wet', 'surface')
    expect(result.soil).toEqual({ state: 'wet', scope: 'surface', reliable: true, targetCriteriaConfirmed: false,
      collectedAt: observedAt, validUntil: observedAt + 24 * hour })
    expect(result.observedRemaining).toEqual({ observedAt, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true,
      mappingValidated: true, mappingVersion: policy.releaseVersion, evidenceRef: policy.sourceRef, remainingDryUnits: { min: 3, max: 8 } })
  })
  it('微湿：安全门未知，剩余 1～4.8 单位', () => {
    const result = map('moist', 'root_zone')
    expect(result.soil?.state).toBe('unknown')
    expect(result.soil?.targetCriteriaConfirmed).toBe(false)
    expect(result.observedRemaining?.remainingDryUnits.min).toBeCloseTo(1, 10)
    expect(result.observedRemaining?.remainingDryUnits.max).toBeCloseTo(4.8, 10)
  })
  it('表土干对“表土干即浇”植物达到目标，不再生成剩余量', () => {
    const result = map('dry', 'surface')
    expect(result.soil).toMatchObject({ state: 'target_dry', targetCriteriaConfirmed: true, scope: 'surface' })
    expect(result.observedRemaining).toBeNull()
  })
  it('表土干但植物要求干透：不能当作目标，剩余 0～3.2 单位并提示核实根区', () => {
    const result = map('dry', 'surface', fullDry)
    expect(result.soil).toMatchObject({ state: 'unknown', targetCriteriaConfirmed: false })
    expect(result.observedRemaining?.remainingDryUnits.min).toBe(0)
    expect(result.observedRemaining?.remainingDryUnits.max).toBeCloseTo(3.2, 10)
  })
  it('根区干对干透型植物达到目标；喜湿植物表土干即已超过目标', () => {
    expect(map('dry', 'root_zone', fullDry).soil).toMatchObject({ state: 'target_dry', targetCriteriaConfirmed: true })
    const moistLover = resolveMvpMoistureGroup('constant_moisture', 'KEEP_MOIST')
    expect(map('dry', 'surface', moistLover).soil).toMatchObject({ state: 'target_dry', targetCriteriaConfirmed: true })
  })
  it('不确定不形成证据，也不生成剩余量', () => {
    expect(map('uncertain', 'surface')).toEqual({ soil: null, observedRemaining: null })
  })
  it('U2：观察时刻等于计算时刻时接受', () => {
    const result = mapMvpSoilObservation({ policy, baseline, group: regular,
      observation: { state: 'wet', scope: 'surface', observedAt, reliable: true }, now: observedAt })
    expect(result.soil?.collectedAt).toBe(observedAt)
  })
  it('U1：缺少观察对象拒绝', () => {
    expect(() => mapMvpSoilObservation({ policy, baseline, group: regular, observation: undefined as never, now: observedAt })).toThrow(TypeError)
  })
  it('U3：剩余比例越界或基线非法拒绝', () => {
    const badFraction = { ...policy, remainingFraction: { ...policy.remainingFraction, wet: { min: 0.6, max: 1.2 } } }
    expect(() => mapMvpSoilObservation({ policy: badFraction, baseline, group: regular,
      observation: { state: 'wet', scope: 'surface', observedAt, reliable: true }, now: observedAt })).toThrow(RangeError)
    expect(() => mapMvpSoilObservation({ policy, baseline: { min: 0, max: 8 }, group: regular,
      observation: { state: 'wet', scope: 'surface', observedAt, reliable: true }, now: observedAt })).toThrow(RangeError)
  })
  it('U4：同输入结果相同，且不修改调用方对象', () => {
    const observation = { state: 'moist' as const, scope: 'surface' as const, observedAt, reliable: true }
    const policyCopy = structuredClone(policy); const observationCopy = structuredClone(observation)
    const first = mapMvpSoilObservation({ policy, baseline, group: regular, observation, now: observedAt + hour })
    const second = mapMvpSoilObservation({ policy, baseline, group: regular, observation, now: observedAt + hour })
    expect(second).toEqual(first)
    expect(policy).toEqual(policyCopy); expect(observation).toEqual(observationCopy)
  })
  it('Reverse：不可靠观察保持不可靠，映射不提升可靠性', () => {
    const result = mapMvpSoilObservation({ policy, baseline, group: regular,
      observation: { state: 'dry', scope: 'surface', observedAt, reliable: false }, now: observedAt + hour })
    expect(result.soil?.reliable).toBe(false)
  })
  it('未来观察、非法状态或缺有效期策略拒绝', () => {
    expect(() => mapMvpSoilObservation({ policy, baseline, group: regular,
      observation: { state: 'wet', scope: 'surface', observedAt: observedAt + hour, reliable: true }, now: observedAt })).toThrow(TypeError)
    expect(() => map('soaked' as never, 'surface')).toThrow(TypeError)
    expect(() => mapMvpSoilObservation({ policy: { ...policy, soilEvidenceTtlHours: 0 }, baseline, group: regular,
      observation: { state: 'wet', scope: 'surface', observedAt, reliable: true }, now: observedAt })).toThrow(RangeError)
  })
})
