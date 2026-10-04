import { describe, expect, it } from 'vitest'
import { projectWindowDirect } from '../../src/care/light/project-window-direct.js'

/** unit_fake：Sandia DNI×cos(AOI)、正交向量解析基准；不证明天气、玻璃或植物位置传播。 */
const sample = () => ({
  radiation: {
    atMs: 0,
    semantics: 'instantaneous' as const,
    dniWattsPerM2: { lower: 600, upper: 800 }
  },
  sun: { atMs: 0, elevationDeg: 60, azimuthDeg: 180 },
  plane: { reference: 'south-window-exterior', tiltDeg: 90, azimuthDeg: 180 }
})

describe('unit_fake 窗面直射；Expected：批准计划与 Sandia 平面直射定义', () => {
  it('南向竖窗正对高度60度太阳：600 DNI 的窗面直射是300', () => {
    const result = projectWindowDirect(sample())
    expect(result.directWattsPerM2?.lower).toBeCloseTo(300, 9)
    expect(result.directWattsPerM2?.upper).toBeCloseTo(400, 9)
    expect(result.projectionFactor).toBeCloseTo(0.5, 12)
    expect(result.atMs).toBe(0)
    expect(result.referencePlane).toBe('south-window-exterior')
  })
  it('水平面采用高度角的正弦，而不是竖窗的余弦', () => {
    const input = sample()
    input.plane.tiltDeg = 0
    expect(projectWindowDirect(input).directWattsPerM2?.lower).toBeCloseTo(300 * Math.sqrt(3), 9)
  })
  it('法线与太阳方向重合时投影为1', () => {
    const input = sample()
    input.plane.tiltDeg = 30
    expect(projectWindowDirect(input).directWattsPerM2?.lower).toBeCloseTo(600, 9)
  })
  it('太阳在窗背面时截断负辐射，但保留负入射点积', () => {
    const input = sample()
    input.plane.azimuthDeg = 0
    const result = projectWindowDirect(input)
    expect(result.incidenceCosine).toBeCloseTo(-0.5, 12)
    expect(result.directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('顺时针方位：东窗迎东侧太阳', () => {
    const input = sample()
    input.plane.azimuthDeg = 90
    input.sun.azimuthDeg = 90
    expect(projectWindowDirect(input).directWattsPerM2?.lower).toBeCloseTo(300, 9)
  })
  it('东窗与南侧光方向正交，不制造有效直射', () => {
    const input = sample()
    input.plane.azimuthDeg = 90
    expect(projectWindowDirect(input).directWattsPerM2?.upper).toBeCloseTo(0, 9)
  })
  it('北向方位跨越0度时保持周期几何', () => {
    const input = sample()
    input.sun.azimuthDeg = 350
    input.plane.azimuthDeg = 10
    expect(projectWindowDirect(input).projectionFactor).toBeCloseTo(0.4698463103929542, 12)
  })
  it.each([0, -10, -90])('太阳高度%s度时不计直射', elevation => {
    const input = sample()
    input.sun.elevationDeg = elevation
    expect(projectWindowDirect(input).directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('缺失DNI保持null，不转成零', () => {
    expect(
      projectWindowDirect({
        ...sample(),
        radiation: { atMs: 0, semantics: 'instantaneous', dniWattsPerM2: null }
      }).directWattsPerM2
    ).toBeNull()
  })
  it('有效零DNI仍是有效辐射结果', () => {
    const input = sample()
    input.radiation.dniWattsPerM2 = { lower: 0, upper: 0 }
    expect(projectWindowDirect(input).directWattsPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('拒绝辐射与太阳时刻错配', () => {
    const input = sample()
    input.sun.atMs = 1
    expect(() => projectWindowDirect(input)).toThrow('时刻')
  })
  it('区间平均不能冒充瞬时样本', () => {
    expect(() =>
      projectWindowDirect({
        ...sample(),
        radiation: { ...sample().radiation, semantics: 'interval_mean' as never }
      })
    ).toThrow('瞬时')
  })
  it.each([NaN, Infinity, -1])('非法DNI%s明确拒绝', value => {
    const input = sample()
    input.radiation.dniWattsPerM2.lower = value
    expect(() => projectWindowDirect(input)).toThrow('辐射')
  })
  it('倒置上下界拒绝', () => {
    const input = sample()
    input.radiation.dniWattsPerM2.lower = 900
    expect(() => projectWindowDirect(input)).toThrow('辐射')
  })
  it.each([-1, 360, NaN])('非法方位%s拒绝', value => {
    const input = sample()
    input.sun.azimuthDeg = value
    expect(() => projectWindowDirect(input)).toThrow('角度')
  })
  it.each([-91, 91])('非法高度%s拒绝', value => {
    const input = sample()
    input.sun.elevationDeg = value
    expect(() => projectWindowDirect(input)).toThrow('角度')
  })
  it.each([-1, 181])('非法窗面倾角%s拒绝', value => {
    const input = sample()
    input.plane.tiltDeg = value
    expect(() => projectWindowDirect(input)).toThrow('角度')
  })
  it('拒绝非整数绝对时刻和空窗面引用', () => {
    const input = sample()
    input.sun.atMs = input.radiation.atMs = 0.5
    expect(() => projectWindowDirect(input)).toThrow('时刻')
    const missingPlane = sample()
    missingPlane.plane.reference = ' '
    expect(() => projectWindowDirect(missingPlane)).toThrow('窗面')
  })
  it('不修改任何输入', () => {
    const input = sample()
    const before = structuredClone(input)
    projectWindowDirect(input)
    expect(input).toEqual(before)
  })
})
