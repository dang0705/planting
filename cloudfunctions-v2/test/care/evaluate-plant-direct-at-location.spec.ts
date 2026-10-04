import { describe, expect, it } from 'vitest'
import { evaluatePlantDirectAtLocation } from '../../src/care/application/evaluate-plant-direct-at-location.js'

const atMs = Date.parse('2026-01-01T12:00:00Z')
const input = () => ({ latitudeDeg: 0, longitudeDeg: 0.72604224,
  radiation: { atMs, semantics: 'instantaneous' as const, dniWattsPerM2: { lower: 600, upper: 600 } },
  plane: { reference: 'south-window', tiltDeg: 90, azimuthDeg: 180 },
  plantReference: 'target-plant-point',
  plant: { xM: 0, yM: 1, perpendicularDistanceM: 0.5 },
  apertures: [{ reference: 'actual-opening', leftM: -1, rightM: 1, bottomM: 0, topM: 3 }],
})

/** L3 unit_fake：独立NOAA正午基准与几何合同→实际太阳、投影、求交链路；无外部服务或数据库。 */
describe('unit_fake 地点与植物点直射可达性；Expected：同刻太阳和真实透光开口合同', () => {
  it('近窗植物可达，同轮窗面235.0037103845保留外侧参考平面', () => {
    const result = evaluatePlantDirectAtLocation(input())
    expect(result.state).toBe('evaluated')
    expect(result.plantReference).toBe('target-plant-point')
    expect(result.reach).toMatchObject({ status: 'reachable', atMs, apertureReferences: ['actual-opening'] })
    expect(result.window.projection?.directWattsPerM2?.lower).toBeCloseTo(235.0037103845, 7)
    expect(result.window.projection?.referencePlane).toBe('south-window')
    expect(result.reach?.intersection?.xM).toBe(0)
    expect(result.reach?.intersection?.yM).toBeGreaterThan(2)
    expect(result.reach?.intersection?.yM).toBeLessThan(3)
    expect(result).not.toHaveProperty('plantWattsPerM2')
  })
  it('只改垂直距离为2米，窗面仍明亮但目标植物点无直射', () => {
    const candidate = input(); candidate.plant.perpendicularDistanceM = 2
    const result = evaluatePlantDirectAtLocation(candidate)
    expect(result.reach?.status).toBe('outside_apertures')
    expect(result.window.projection?.directWattsPerM2?.lower).toBeCloseTo(235.0037103845, 7)
    expect(result.reach?.intersection?.yM).toBeGreaterThan(3)
  })
  it('连窗中间墙体不能使用整体包围盒透光', () => {
    const candidate = input(); candidate.apertures = [
      { reference: 'left', leftM: -1, rightM: -0.1, bottomM: 0, topM: 3 },
      { reference: 'right', leftM: 0.1, rightM: 1, bottomM: 0, topM: 3 },
    ]
    expect(evaluatePlantDirectAtLocation(candidate).reach?.status).toBe('outside_apertures')
  })
  it('正午射线落在开口边缘仍保留boundary', () => {
    const candidate = input(); candidate.apertures[0]!.leftM = 0
    expect(evaluatePlantDirectAtLocation(candidate).reach?.status).toBe('boundary')
  })
  it('北窗同轮投影0且没有向前射线，不使用独立默认窗向', () => {
    const candidate = input(); candidate.plane.azimuthDeg = 0
    const result = evaluatePlantDirectAtLocation(candidate)
    expect(result.reach?.status).toBe('no_forward_ray')
    expect(result.window.projection?.directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('夜间同刻几何为below_horizon', () => {
    const candidate = input(); candidate.radiation.atMs = Date.parse('2026-01-01T00:00:00Z')
    const result = evaluatePlantDirectAtLocation(candidate)
    expect(result.reach?.status).toBe('below_horizon')
    expect(result.reach?.atMs).toBe(candidate.radiation.atMs)
  })
  it('缺DNI不妨碍几何判断，但强度保持缺失', () => {
    const result = evaluatePlantDirectAtLocation({ ...input(), radiation: { ...input().radiation, dniWattsPerM2: null } })
    expect(result.reach?.status).toBe('reachable')
    expect(result.window.projection?.directWattsPerM2).toBeNull()
  })
  it('均值辐射拒绝进入瞬时组合，不把一张照片推成全天结论', () => {
    const candidate = input(); candidate.radiation.semantics = 'interval_mean' as never
    expect(() => evaluatePlantDirectAtLocation(candidate)).toThrow('瞬时')
  })
  it.each([0, 89, 91, 180])('非竖窗%s度拒绝，不强行套用竖窗求交', tilt => {
    const candidate = input(); candidate.plane.tiltDeg = tilt
    expect(() => evaluatePlantDirectAtLocation(candidate)).toThrow('竖窗')
  })
  it('天顶方位未定义保留状态，无虚构求交', () => {
    const result = evaluatePlantDirectAtLocation({ ...input(), latitudeDeg: -0.402449 * 180 / Math.PI })
    expect(result.state).toBe('undefined_solar_azimuth')
    expect(result.reach).toBeNull()
    expect(result.window.projection).toBeNull()
  })
  it.each([
    { ...input(), plantReference: ' ' },
    { ...input(), plant: { xM: 0, yM: 1, perpendicularDistanceM: 0 } },
    { ...input(), apertures: [] },
    { ...input(), apertures: [...input().apertures, ...input().apertures] },
    { ...input(), plant: { xM: NaN, yM: 1, perpendicularDistanceM: 0.5 } },
  ])('太阳方位未定义仍拒绝非法植物或开口', candidate => {
    expect(() => evaluatePlantDirectAtLocation({ ...candidate, latitudeDeg: -0.402449 * 180 / Math.PI })).toThrow()
  })
  it('输入地点、目标、开口及辐射均不修改', () => {
    const candidate = input(); const before = structuredClone(candidate)
    evaluatePlantDirectAtLocation(candidate)
    expect(candidate).toEqual(before)
  })
})
