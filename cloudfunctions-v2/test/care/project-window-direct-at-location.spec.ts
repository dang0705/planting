import { describe, expect, it } from 'vitest'
import { projectWindowDirectAtLocation } from '../../src/care/application/project-window-direct-at-location.js'

const atMs = Date.parse('2026-01-01T12:00:00Z')
const input = () => ({ latitudeDeg: 0, longitudeDeg: 0.72604224,
  radiation: { atMs, semantics: 'instantaneous' as const, dniWattsPerM2: { lower: 600, upper: 600 } },
  plane: { reference: 'south-exterior', tiltDeg: 90, azimuthDeg: 180 } })

/** L3 unit_fake：NOAA独立正午基准→真实窗面投影函数；无网络或持久化替身。 */
describe('unit_fake 地点与瞬时辐射组合；Expected：NOAA及窗面投影合同', () => {
  it('NOAA独立基准对应南竖窗直射235.0037103845，而非水平面结果', () => {
    const result = projectWindowDirectAtLocation(input())
    expect(result.state).toBe('estimated')
    expect(result.projection?.directWattsPerM2?.lower).toBeCloseTo(235.0037103845, 7)
    expect(result.projection?.directWattsPerM2?.upper).toBeCloseTo(235.0037103845, 7)
    expect(result.projection?.atMs).toBe(atMs)
    expect(result.solar.method).toBe('noaa_general_solar_position')
    expect(result.solar.evidenceKind).toBe('model_estimate')
    expect(result.projection?.referencePlane).toBe('south-exterior')
  })
  it('北窗背面为0，而非默认存在直射', () => {
    const candidate = input(); candidate.plane.azimuthDeg = 0
    expect(projectWindowDirectAtLocation(candidate).projection?.directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('缺DNI保留空值，不根据方向猜测辐射', () => {
    expect(projectWindowDirectAtLocation({ ...input(), radiation: { atMs, semantics: 'instantaneous', dniWattsPerM2: null } }).projection?.directWattsPerM2).toBeNull()
  })
  it('区间平均辐射不能进入瞬时用例', () => {
    expect(() => projectWindowDirectAtLocation({ ...input(), radiation: { ...input().radiation, semantics: 'interval_mean' as never } })).toThrow('瞬时')
  })
  it('天顶方位未定义时返回特定状态，不填默认窗向', () => {
    const result = projectWindowDirectAtLocation({ ...input(), latitudeDeg: -0.402449 * 180 / Math.PI })
    expect(result.state).toBe('undefined_solar_azimuth')
    expect(result.projection).toBeNull()
  })
  it('太阳方位未定义也不能绕过辐射和窗面输入校验', () => {
    expect(() => projectWindowDirectAtLocation({ ...input(), latitudeDeg: -0.402449 * 180 / Math.PI, radiation: { ...input().radiation, dniWattsPerM2: { lower: -1, upper: 2 } } })).toThrow('辐射')
    expect(() => projectWindowDirectAtLocation({ ...input(), latitudeDeg: -0.402449 * 180 / Math.PI, plane: { ...input().plane, tiltDeg: NaN } })).toThrow()
  })
})
