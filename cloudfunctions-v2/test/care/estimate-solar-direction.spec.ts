import { describe, expect, it } from 'vitest'
import { estimateSolarDirection } from '../../src/care/light/estimate-solar-direction.js'

/** unit_fake：NOAA官方通用公式独立代入；不证明现场准确度或完整区间。 */
const noon = Date.parse('2026-01-01T12:00:00Z')
const longitude = 0.72604224

describe('unit_fake 太阳方向；Expected：NOAA通用公式与UTC日历合同', () => {
  it('全年角为0的官方代入基准及真太阳正午', () => {
    const result = estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg: longitude })
    expect(result.equationOfTimeMinutes).toBeCloseTo(-2.90416896, 8)
    expect(result.declinationRad).toBeCloseTo(-0.402449, 8)
    expect(result.trueSolarTimeMinutes).toBeCloseTo(720, 8)
    expect(result.hourAngleDeg).toBeCloseTo(0, 8)
    expect(result.elevationDeg).toBeCloseTo(66.9413708307, 7)
    expect(result.azimuthDeg).toBeCloseTo(180, 8)
    expect(result).toMatchObject({ atMs: noon, method: 'noaa_general_solar_position', evidenceKind: 'model_estimate' })
  })
  it('相同全年角下经度前后60度分别对应东方和西方', () => {
    const morning = estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg: longitude - 60 })
    const afternoon = estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg: longitude + 60 })
    expect(morning.hourAngleDeg).toBeCloseTo(-60, 8)
    expect(afternoon.hourAngleDeg).toBeCloseTo(60, 8)
    expect(morning.azimuthDeg).toBeLessThan(180)
    expect(afternoon.azimuthDeg).toBeGreaterThan(180)
    expect(morning.elevationDeg).toBeCloseTo(afternoon.elevationDeg, 8)
  })
  it('东经180度和西经180度是同一方向，真太阳时正确环绕', () => {
    const east = estimateSolarDirection({ atMs: noon, latitudeDeg: 30, longitudeDeg: 180 })
    const west = estimateSolarDirection({ atMs: noon, latitudeDeg: 30, longitudeDeg: -180 })
    expect(east.elevationDeg).toBeCloseTo(west.elevationDeg, 8)
    expect(east.azimuthDeg).toBeCloseTo(west.azimuthDeg!, 8)
    expect(east.trueSolarTimeMinutes).toBeGreaterThanOrEqual(0)
    expect(east.trueSolarTimeMinutes).toBeLessThan(1440)
  })
  it('时刻变更分钟秒毫秒均参与全年角与真太阳时', () => {
    const a = estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg: longitude })
    const b = estimateSolarDirection({ atMs: noon + 30_500, latitudeDeg: 0, longitudeDeg: longitude })
    expect(b.hourAngleDeg).toBeGreaterThan(a.hourAngleDeg)
    expect(b.declinationRad).not.toBe(a.declinationRad)
  })
  it('闰年使用366天；独立年度角与赤纬手算', () => {
    // 2024-07-02为第184天，12时γ=π；赤纬0.402769，时间方程-3.76038544。
    const result = estimateSolarDirection({ atMs: Date.parse('2024-07-02T12:00:00Z'), latitudeDeg: 0, longitudeDeg: 0 })
    expect(result.declinationRad).toBeCloseTo(0.402769, 8)
    expect(result.equationOfTimeMinutes).toBeCloseTo(-3.76038544, 8)
  })
  it('天顶的未定义方位不能随意填写', () => {
    const result = estimateSolarDirection({ atMs: noon, latitudeDeg: -0.402449 * 180 / Math.PI, longitudeDeg: longitude })
    expect(result.elevationDeg).toBeCloseTo(90, 8)
    expect(result.azimuthDeg).toBeNull()
  })
  it('正午地点背面的同刻太阳在地平线下', () => {
    const result = estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg: longitude - 180 })
    expect(result.elevationDeg).toBeCloseTo(-66.9413708307, 7)
  })
  it('时刻本身可表示但当年年初不可表示时拒绝，不能输出NaN', () => {
    expect(() => estimateSolarDirection({ atMs: -8_640_000_000_000_000, latitudeDeg: 0, longitudeDeg: 0 })).toThrow('时刻')
  })
  it.each([NaN, Infinity, -91, 91, '0'])('非法纬度%s拒绝', value => {
    expect(() => estimateSolarDirection({ atMs: noon, latitudeDeg: value as never, longitudeDeg: 0 })).toThrow('位置')
  })
  it.each([NaN, Infinity, -181, 181])('非法经度%s拒绝', longitudeDeg => {
    expect(() => estimateSolarDirection({ atMs: noon, latitudeDeg: 0, longitudeDeg })).toThrow('位置')
  })
  it.each([NaN, Infinity, 0.5, Number.MAX_SAFE_INTEGER])('非法时刻%s拒绝', atMs => {
    expect(() => estimateSolarDirection({ atMs, latitudeDeg: 0, longitudeDeg: 0 })).toThrow('时刻')
  })
})
