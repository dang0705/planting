import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { replayPlantDirectRadiation } from '../../src/care/application/replay-plant-direct-radiation.js'

const raw = JSON.parse(fs.readFileSync(path.join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
const context = { series: 'hourly' as const, sourceRef: 'saved-real-shanghai-response', fetchedAtMs: 1000 }
const site = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'south-window', tiltDeg: 90, azimuthDeg: 180 },
  plantReference: 'target', plant: { xM: 0, yM: 1, perpendicularDistanceM: 0.5 },
  apertures: [{ reference: 'actual-opening', leftM: -1, rightM: 1, bottomM: 0, topM: 3 }] }

/** L3 unit_real_data：真实保存制品→归一化→全时段太阳与开口资格→均值范围；网络由原始制品替换。 */
describe('unit_real_data 植物点几何直射均值回放', () => {
  it('实际24时段保留UTC及来源；目标参考平面和未透光边界明确', () => {
    const result = replayPlantDirectRadiation(raw, context, site)
    expect(result).toMatchObject({ scope: 'model_only', sourceRef: context.sourceRef, timezone: 'Asia/Shanghai', plantReference: 'target', sourceWindowReference: 'south-window', referencePlaneDefinition: 'through_target_parallel_to_window', transmissionApplied: false, location: { latitudeDeg: 31.23, longitudeDeg: 121.47 } })
    expect(result.intervals).toHaveLength(24)
    for (let i = 0; i < 24; i++) {
      const value = result.intervals[i]!
      expect(value.intervalEndMs).toBe(raw.hourly.time[i] * 1000)
      expect(value.geometricDirectWattsPerM2!.lower).toBeGreaterThanOrEqual(0)
      expect(value.geometricDirectWattsPerM2!.upper).toBeLessThanOrEqual(raw.hourly.direct_normal_irradiance[i])
    }
    expect(result).not.toHaveProperty('dli')
    expect(result).not.toHaveProperty('plantLeafWattsPerM2')
    expect(result).not.toHaveProperty('algorithmRelease')
  })
  it('真实午夜时段几何不可达且强度范围0', () => {
    expect(replayPlantDirectRadiation(raw, context, site).intervals[0]).toMatchObject({ reachState: 'all_blocked', geometricDirectWattsPerM2: { lower: 0, upper: 0 } })
  })
  // Edge用真实响应字段构造独立数学场景，不声称这些数值属于原Provider响应。
  it('独立正午基准贯穿均值用例；远处目标被开口排除而不是平方衰减', () => {
    const candidate = structuredClone(raw)
    for (const key of Object.keys(candidate.hourly)) { candidate.hourly[key] = [candidate.hourly[key][0]] }
    candidate.hourly.time = [Date.parse('2026-01-01T12:30:00Z') / 1000]
    candidate.hourly.direct_normal_irradiance = [600]
    const location = { ...site, latitudeDeg: 0, longitudeDeg: 0.72604224 }
    const near = replayPlantDirectRadiation(candidate, context, location).intervals[0]!
    expect(near.reachState).toBe('all_reachable')
    expect(near.geometricDirectWattsPerM2!.lower).toBeCloseTo(156.3255561578026, 7)
    expect(near.geometricDirectWattsPerM2!.upper).toBeCloseTo(313.68186461121956, 7)
    const far = replayPlantDirectRadiation(candidate, context, { ...location, plant: { ...location.plant, perpendicularDistanceM: 2 } }).intervals[0]!
    expect(far.reachState).toBe('all_blocked')
    expect(far.geometricDirectWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('DNI缺失保持null，即使夜间已证明不可达', () => {
    const candidate = structuredClone(raw); candidate.hourly.direct_normal_irradiance[0] = null
    expect(replayPlantDirectRadiation(candidate, context, site).intervals[0]).toMatchObject({ state: 'missing_radiation', geometricDirectWattsPerM2: null })
  })
  it('合法空序列没有太阳时段，也不补全天记录', () => {
    const candidate = structuredClone(raw); for (const key of Object.keys(candidate.hourly)) { candidate.hourly[key] = [] }
    expect(replayPlantDirectRadiation(candidate, context, site).intervals).toEqual([])
  })
  it.each([
    { ...site, latitudeDeg: NaN },
    { ...site, plantReference: ' ' },
    { ...site, apertures: [] },
    { ...site, plane: { ...site.plane, tiltDeg: 0 } },
  ])('空序列也拒绝非法地点与目标几何', location => {
    const candidate = structuredClone(raw); for (const key of Object.keys(candidate.hourly)) { candidate.hourly[key] = [] }
    expect(() => replayPlantDirectRadiation(candidate, context, location)).toThrow()
  })
  it('原始单位非法仍由实际归一化器拒绝', () => {
    const candidate = structuredClone(raw); candidate.hourly_units.direct_normal_irradiance = 'lux'
    expect(() => replayPlantDirectRadiation(candidate, context, site)).toThrow()
  })
  it('输入制品与目标位置不修改', () => {
    const candidate = structuredClone(raw); const location = structuredClone(site); const before = structuredClone([candidate, location])
    replayPlantDirectRadiation(candidate, context, location); expect([candidate, location]).toEqual(before)
  })
})
