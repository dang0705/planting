import { describe, expect, it } from 'vitest'
import { projectSunCalcWindowDirect } from '../../src/care/application/project-suncalc-window-direct.js'

/** unit_fake L3内部协作：真实SunCalc→真实窗面投影；无替身、无天气网络；输入DNI是构造数学案例。 */
const sample = () => ({
  latitudeDeg: 39.742476, longitudeDeg: -105.1786,
  radiation: { atMs: Date.parse('2003-10-17T19:30:30Z'), semantics: 'instantaneous' as const, dniWattsPerM2: { lower: 1000, upper: 1000 } },
  plane: { reference: 'nrel-example-window', tiltDeg: 90, azimuthDeg: 194.34024 }
})

describe('unit_fake SunCalc地点→窗面直射实际协作', () => {
  it('使用NREL独立太阳角与窗面投影基准，1000 DNI 得到约767窗面辐照', () => {
    const result = projectSunCalcWindowDirect(sample())
    expect(result.solar.method).toBe('suncalc@2.1.0')
    expect(result.solar.elevationDefinition).toBe('apparent_refraction_corrected')
    expect(Math.abs((result.projection.directWattsPerM2?.lower ?? NaN) - 767.29525)).toBeLessThan(1)
    expect(result.projection.referencePlane).toBe('nrel-example-window')
    expect(result.projection.atMs).toBe(sample().radiation.atMs)
  })
  it('窗户背面不形成直射', () => {
    const input = sample(); input.plane.azimuthDeg = 14.34024
    expect(projectSunCalcWindowDirect(input).projection.directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('缺DNI保持缺失，不由太阳方向填成零', () => {
    const input = sample()
    expect(projectSunCalcWindowDirect({ ...input, radiation: { ...input.radiation, dniWattsPerM2: null } }).projection.directWattsPerM2).toBeNull()
  })
  it('拒绝将区间平均DNI送入瞬时链路', () => {
    const input = sample()
    expect(() => projectSunCalcWindowDirect({ ...input, radiation: { ...input.radiation, semantics: 'interval_mean' } } as never)).toThrow()
  })
  it('拒绝缺失位置，即使DNI为零也不使用默认地点', () => {
    expect(() => projectSunCalcWindowDirect({ ...sample(), latitudeDeg: null } as never)).toThrow()
  })
})
