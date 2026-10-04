import { describe, expect, it } from 'vitest'
import { boundSolarWindowInterval } from '../../src/care/light/bound-solar-window-interval.js'

const noon = Date.parse('2026-01-01T12:00:00Z')
const input = () => ({ intervalStartMs: noon - 1800000, intervalEndMs: noon + 1800000,
  latitudeDeg: 0, longitudeDeg: 0.72604224, plane: { reference: 'south', tiltDeg: 90, azimuthDeg: 180 } })

/** unit_fake：谐波导数与旋转向量变化上界的独立数学证明；不验证真实太阳误差。 */
describe('unit_fake 全时段投影界限；Expected：NOAA公式导数上界与地平线门', () => {
  it('独立正午投影及一小时变化范围，不只取单点', () => {
    const result = boundSolarWindowInterval(input())
    expect(result.lower).toBeCloseTo(0.2605425935963377, 8)
    expect(result.upper).toBeCloseTo(0.5228031076853659, 8)
    expect(result).toMatchObject({ semantics: 'whole_interval_bound', referencePlane: 'south', scope: 'model_only', segmentCount: 1 })
    expect(result.evidenceRef).toContain('model_only')
  })
  it('同刻同区间北面背窗整个时段都无直射', () => {
    expect(boundSolarWindowInterval({ ...input(), plane: { ...input().plane, azimuthDeg: 0 } })).toMatchObject({ lower: 0, upper: 0 })
  })
  it('整个时段太阳在地平线下，即使窗面朝向任意也为0', () => {
    expect(boundSolarWindowInterval({ ...input(), longitudeDeg: 0.72604224 - 180 })).toMatchObject({ lower: 0, upper: 0 })
  })
  it('可能经过日出时下界为0，不能绕过地平线跳变', () => {
    const result = boundSolarWindowInterval({ ...input(), intervalStartMs: noon - 7 * 3600000, intervalEndMs: noon - 5 * 3600000, plane: { reference: 'east', tiltDeg: 90, azimuthDeg: 90 } })
    expect(result.lower).toBe(0)
    expect(result.upper).toBeGreaterThan(0.9)
    expect(result.upper).toBeLessThanOrEqual(1)
  })
  it('平闰年跨年分段，原区间完整保留', () => {
    const candidate = { ...input(), intervalStartMs: Date.parse('2024-12-31T23:30:00Z'), intervalEndMs: Date.parse('2025-01-01T00:30:00Z'), longitudeDeg: 180 }
    const result = boundSolarWindowInterval(candidate)
    expect(result.segmentCount).toBe(2)
    expect(result.intervalStartMs).toBe(candidate.intervalStartMs)
    expect(result.intervalEndMs).toBe(candidate.intervalEndMs)
  })
  it('结束标签恰为新年不纳入新年子段，遵守右开时段', () => {
    expect(boundSolarWindowInterval({ ...input(), intervalStartMs: Date.parse('2024-12-31T23:00:00Z'), intervalEndMs: Date.parse('2025-01-01T00:00:00Z') }).segmentCount).toBe(1)
  })
  it('奇数毫秒时段用覆盖两侧的最大距离，不缩短右半段', () => {
    const result = boundSolarWindowInterval({ ...input(), intervalStartMs: noon, intervalEndMs: noon + 3 })
    expect(result.lower).toBeLessThan(0.3916728506)
    expect(result.upper).toBeGreaterThan(0.3916728506)
  })
  it.each([{ intervalEndMs: noon - 1800000 }, { intervalStartMs: NaN }, { intervalEndMs: Infinity }, { intervalStartMs: noon + 0.5 }])('非法时段拒绝 %j', patch => {
    expect(() => boundSolarWindowInterval({ ...input(), ...patch })).toThrow('时段')
  })
  it('非法窗面和位置拒绝，不补默认', () => {
    expect(() => boundSolarWindowInterval({ ...input(), latitudeDeg: 91 })).toThrow('位置')
    expect(() => boundSolarWindowInterval({ ...input(), plane: { ...input().plane, tiltDeg: NaN } })).toThrow('窗面')
  })
})
