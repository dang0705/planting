import { describe, expect, it } from 'vitest'
import { traceDirectThroughWindow } from '../../src/care/light/trace-direct-through-window.js'

/** unit_fake：PBRT 射线平面关系、手算45度直角三角形与批准计划的连窗/距离边界。 */
const geometry = () => ({
  sun: { atMs: 0, elevationDeg: 45, azimuthDeg: 180 },
  windowAzimuthDeg: 180,
  plant: { xM: 0, yM: 1, perpendicularDistanceM: 1 },
  apertures: [{ reference: 'opening-a', leftM: -1, rightM: 1, bottomM: 0, topM: 3 }]
})

describe('unit_fake 直射可达性；Expected：独立射线几何与统一计划', () => {
  it('45度太阳、离窗1米，窗面交点比植物高1米', () => {
    const result = traceDirectThroughWindow(geometry())
    expect(result.status).toBe('reachable')
    expect(result.intersection?.xM).toBeCloseTo(0, 12)
    expect(result.intersection?.yM).toBeCloseTo(2, 12)
    expect(result.apertureReferences).toEqual(['opening-a'])
    expect(result.atMs).toBe(0)
  })
  it('移到离窗3米处时射线在窗顶上方，不因窗面有直射就认为植物受光', () => {
    const input = geometry()
    input.plant.perpendicularDistanceM = 3
    expect(traceDirectThroughWindow(input).status).toBe('outside_apertures')
  })
  it('方位向右偏45度时交点向右移1米', () => {
    const input = geometry()
    input.sun.azimuthDeg = 225
    input.apertures[0]!.rightM = 2
    expect(traceDirectThroughWindow(input).intersection?.xM).toBeCloseTo(1, 12)
    expect(traceDirectThroughWindow(input).intersection?.yM).toBeCloseTo(1 + Math.sqrt(2), 12)
  })
  it('方位向左偏45度时交点向左移1米', () => {
    const input = geometry()
    input.sun.azimuthDeg = 135
    input.apertures[0]!.leftM = -2
    expect(traceDirectThroughWindow(input).intersection?.xM).toBeCloseTo(-1, 12)
  })
  it('窗侧墙体挡住横向射线', () => {
    const input = geometry()
    input.plant.xM = 2
    expect(traceDirectThroughWindow(input).status).toBe('outside_apertures')
  })
  it('连窗中间墙体不能被整体包围盒误判为玻璃', () => {
    const input = geometry()
    input.apertures = [
      { reference: 'left', leftM: -3, rightM: -1, bottomM: 0, topM: 3 },
      { reference: 'right', leftM: 1, rightM: 3, bottomM: 0, topM: 3 }
    ]
    expect(traceDirectThroughWindow(input).status).toBe('outside_apertures')
    input.plant.xM = 2
    expect(traceDirectThroughWindow(input).apertureReferences).toEqual(['right'])
  })
  it('命中多个开口时引用顺序稳定，不受输入次序影响', () => {
    const input = geometry()
    input.apertures.push({ ...input.apertures[0]!, reference: 'a' })
    expect(traceDirectThroughWindow(input).apertureReferences).toEqual(['a', 'opening-a'])
    input.apertures.reverse()
    expect(traceDirectThroughWindow(input).apertureReferences).toEqual(['a', 'opening-a'])
  })
  it('恰在窗口侧边只报告边界，不宣称确定可达', () => {
    const input = geometry()
    input.plant.xM = 1
    expect(traceDirectThroughWindow(input).status).toBe('boundary')
  })
  it.each([90, 270, 0])('南窗不接受方位%s度的平行或背面射线', azimuth => {
    const input = geometry()
    input.sun.azimuthDeg = azimuth
    const result = traceDirectThroughWindow(input)
    expect(result.status).toBe('no_forward_ray')
    expect(result.intersection).toBeNull()
  })
  it('太阳在头顶时不把浮点余弦误差当成穿窗射线', () => {
    const input = geometry()
    input.sun.elevationDeg = 90
    expect(traceDirectThroughWindow(input).status).toBe('no_forward_ray')
  })
  it.each([0, -20])('高度%s度时不计直射', elevation => {
    const input = geometry()
    input.sun.elevationDeg = elevation
    expect(traceDirectThroughWindow(input).status).toBe('below_horizon')
  })
  it('方位跨越真北时保持等价几何', () => {
    const input = geometry()
    input.windowAzimuthDeg = 350
    input.sun.azimuthDeg = 35
    input.apertures[0]!.rightM = 2
    expect(traceDirectThroughWindow(input).intersection?.xM).toBeCloseTo(1, 12)
  })
  it.each([0, -1, NaN, Infinity])('非法离窗距离%s拒绝', distance => {
    const input = geometry()
    input.plant.perpendicularDistanceM = distance
    expect(() => traceDirectThroughWindow(input)).toThrow('位置')
  })
  it('缺窗口几何不填默认窗', () => {
    expect(() => traceDirectThroughWindow({ ...geometry(), apertures: [] })).toThrow('窗口')
  })
  it('即使太阳在地平线以下，缺植物坐标也须拒绝，不能掩盖非法输入', () => {
    const input = geometry()
    input.sun.elevationDeg = -10
    expect(() =>
      traceDirectThroughWindow({
        ...input,
        plant: { yM: input.plant.yM, perpendicularDistanceM: 1 } as typeof input.plant
      })
    ).toThrow('位置')
  })
  it('矩形零面积、倒置边界或非有限坐标拒绝', () => {
    for (const patch of [{ rightM: -1 }, { topM: 0 }, { bottomM: NaN }]) {
      const input = geometry()
      input.apertures[0] = { ...input.apertures[0]!, ...patch }
      expect(() => traceDirectThroughWindow(input)).toThrow('窗口')
    }
  })
  it('开口引用不可空且不可重复', () => {
    const input = geometry()
    input.apertures.push({ ...input.apertures[0]! })
    expect(() => traceDirectThroughWindow(input)).toThrow('窗口')
    input.apertures = [{ ...input.apertures[0]!, reference: ' ' }]
    expect(() => traceDirectThroughWindow(input)).toThrow('窗口')
  })
  it('非法太阳时刻或方向拒绝', () => {
    for (const patch of [{ atMs: 0.5 }, { elevationDeg: 91 }, { azimuthDeg: 360 }]) {
      expect(() =>
        traceDirectThroughWindow({ ...geometry(), sun: { ...geometry().sun, ...patch } })
      ).toThrow()
    }
  })
  it('不修改输入坐标或开口顺序', () => {
    const input = geometry()
    const before = structuredClone(input)
    traceDirectThroughWindow(input)
    expect(input).toEqual(before)
  })
})
