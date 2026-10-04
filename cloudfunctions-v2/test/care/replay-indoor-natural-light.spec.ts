import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { replayIndoorNaturalLight } from '../../src/care/application/replay-indoor-natural-light.js'

/** L3 unit_real_data：实际气象制品→归一化→SunCalc/实际开口→DHI传播→显式损失；无 Provider 或太阳替身。 */
describe('unit_real_data 室内自然光候选组合', () => {
  const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
  const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
  const target = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'window', tiltDeg: 90, azimuthDeg: 180 }, plantReference: 'plant', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [{ reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }], skyModel: 'isotropic' as const }
  const losses = { glass: { sourceRef: 'explicit-experiment-glass', direct: { lower: 0.4, upper: 0.6 }, diffuse: { lower: 0.4, upper: 0.6 } }, curtain: { sourceRef: 'explicit-experiment-curtain', direct: { lower: 0.5, upper: 0.5 }, diffuse: { lower: 0.5, upper: 0.5 } } }
  const factor = Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2)
  it('24个真实时段保留来源、缺值和同一目标接收平面', () => {
    const result = replayIndoorNaturalLight(raw, context, target, losses)
    expect(result.productionAdmission).toBe(false)
    expect(result.referencePlaneDefinition).toBe('through_target_parallel_to_window')
    expect(result.radiation.sourceRef).toBe(context.sourceRef)
    expect(result.intervals).toHaveLength(24)
    result.intervals.forEach((interval, index) => {
      expect(interval.intervalEndMs).toBe(raw.hourly.time[index] * 1000)
      const dhi = raw.hourly.diffuse_radiation[index]
      if (dhi === null) { expect(interval.diffuseWattsPerM2).toBeNull() } else {
        expect(interval.diffuseWattsPerM2?.lower).toBeCloseTo(dhi * factor * 0.2, 10)
        expect(interval.diffuseWattsPerM2?.upper).toBeCloseTo(dhi * factor * 0.3, 10)
      }
      expect(interval.numericalGuarantee).toBe('not_certified')
      expect(interval.solarMethod).toBe('suncalc@2.1.0')
    })
  })
  it('独立 Edge：零DNI、DHI=200时总量仅是解析散射×明确损失区间', () => {
    const edge = structuredClone(raw)
    edge.hourly.direct_normal_irradiance = edge.hourly.time.map(() => 0)
    edge.hourly.diffuse_radiation = edge.hourly.time.map(() => 200)
    const result = replayIndoorNaturalLight(edge, context, target, losses)
    result.intervals.forEach(interval => {
      expect(interval.directWattsPerM2).toEqual({ lower: 0, upper: 0 })
      expect(interval.totalWattsPerM2?.lower).toBeCloseTo(200 * factor * 0.2, 10)
      expect(interval.totalWattsPerM2?.upper).toBeCloseTo(200 * factor * 0.3, 10)
    })
  })
  it('直射与散射透过区间分开，不能混用', () => {
    const different = { ...losses, glass: { ...losses.glass, diffuse: { lower: 0, upper: 0 } } }
    expect(replayIndoorNaturalLight(raw, context, target, different).intervals.every(i => i.diffuseWattsPerM2 === null || i.diffuseWattsPerM2.upper === 0)).toBe(true)
  })
  it('未知玻璃只使相应分支缺证据，不填默认、不把另一分支加成总量', () => {
    const unknown = { ...losses, glass: { ...losses.glass, diffuse: null } }
    const result = replayIndoorNaturalLight(raw, context, target, unknown)
    expect(result.missingTransmission).toEqual(['glass.diffuse'])
    expect(result.intervals.every(i => i.diffuseWattsPerM2 === null && i.totalWattsPerM2 === null)).toBe(true)
  })
  it('空损失配置不能冒充无遮挡，缺来源也拒绝', () => {
    expect(() => replayIndoorNaturalLight(raw, context, target, {} as never)).toThrow()
    expect(() => replayIndoorNaturalLight(raw, context, target, { ...losses, glass: { ...losses.glass, sourceRef: '' } })).toThrow()
  })
  it.each([{ lower: -0.1, upper: 1 }, { lower: 0, upper: 1.1 }, { lower: 0.8, upper: 0.2 }, { lower: NaN, upper: 1 }])('损失区间非法就拒绝，不允许反射增强%s', direct => {
    expect(() => replayIndoorNaturalLight(raw, context, target, { ...losses, glass: { ...losses.glass, direct } })).toThrow()
  })
  it('目前只支持实际竖窗，不能将倾斜窗套到竖窗开口', () => {
    expect(() => replayIndoorNaturalLight(raw, context, { ...target, plane: { ...target.plane, tiltDeg: 60 } }, losses)).toThrow()
  })
  it('实际开口完全低于目标时直射和天空散射均为零', () => {
    const result = replayIndoorNaturalLight(raw, context, { ...target, apertures: [{ ...target.apertures[0]!, bottomM: -2, topM: -1 }] }, losses)
    result.intervals.forEach(i => {
      if (i.directWattsPerM2) { expect(i.directWattsPerM2.upper).toBe(0) }
      if (i.diffuseWattsPerM2) { expect(i.diffuseWattsPerM2.upper).toBe(0) }
    })
  })
})
