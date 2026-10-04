import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'
import { propagateIsotropicWindowDiffuse } from '../../src/care/light/propagate-window-diffuse.js'

/** unit_fake：Expected 来自辐射亮度余弦积分及矩形解析积分；不从被测输出反推。 */
describe('unit_fake 有限窗洞均匀天空散射传播', () => {
  const aperture = { reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }
  const input = { skyModel: 'isotropic' as const, planeReference: 'target_window_parallel', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [aperture], dhiWattsPerM2: 200 }
  // 解析积分：x∈[-d,d]、y∈[0,d]，F=√2/π atan(1/√2)。
  const factor = Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2)
  it('单位窗口按解析立体角和接收平面余弦积分', () => {
    const result = propagateIsotropicWindowDiffuse(input)
    expect(result.skyGeometricFactor).toBeCloseTo(factor, 12)
    expect(result.diffuseWattsPerM2).toBeCloseTo(200 * factor, 10)
    expect(result).toMatchObject({ scope: 'plant_window_parallel_candidate', productionAdmission: false, planeReference: input.planeReference, numericalGuarantee: 'not_certified' })
  })
  it('不把窗下低于植物的方向作为天空，不含地面反射', () => {
    expect(propagateIsotropicWindowDiffuse({ ...input, apertures: [{ ...aperture, bottomM: -1 }] }).skyGeometricFactor).toBeCloseTo(factor, 12)
    expect(propagateIsotropicWindowDiffuse({ ...input, apertures: [{ ...aperture, bottomM: -2, topM: -1 }] }).diffuseWattsPerM2).toBe(0)
  })
  it('长度同比例变化不改变几何系数', () => {
    expect(propagateIsotropicWindowDiffuse({ ...input, plant: { xM: 0, yM: 0, perpendicularDistanceM: 10 }, apertures: [{ ...aperture, leftM: -10, rightM: 10, topM: 10 }] }).skyGeometricFactor).toBeCloseTo(factor, 12)
  })
  it('离窗距离和横向偏移真正进入积分', () => {
    expect(propagateIsotropicWindowDiffuse({ ...input, plant: { ...input.plant, perpendicularDistanceM: 2 } }).skyGeometricFactor).toBeLessThan(factor)
    expect(propagateIsotropicWindowDiffuse({ ...input, plant: { ...input.plant, xM: 3 } }).skyGeometricFactor).toBeLessThan(factor)
  })
  it('分成两个开口保持同一积分，重叠开口不重复计数', () => {
    const left = { ...aperture, reference: 'left', rightM: 0 }
    const right = { ...aperture, reference: 'right', leftM: 0 }
    expect(propagateIsotropicWindowDiffuse({ ...input, apertures: [left, right] }).skyGeometricFactor).toBeCloseTo(factor, 12)
    expect(propagateIsotropicWindowDiffuse({ ...input, apertures: [aperture, { ...aperture, reference: 'overlap' }] }).skyGeometricFactor).toBeCloseTo(factor, 12)
  })
  it('连窗中间墙体保留，不使用整窗包围盒', () => {
    expect(propagateIsotropicWindowDiffuse({ ...input, apertures: [{ ...aperture, reference: 'left', rightM: -0.5 }, { ...aperture, reference: 'right', leftM: 0.5 }] }).skyGeometricFactor).toBeLessThan(factor)
  })
  it('缺辐射和有效零不同，不修改输入', () => {
    const before = JSON.stringify(input)
    expect(propagateIsotropicWindowDiffuse({ ...input, dhiWattsPerM2: null }).diffuseWattsPerM2).toBeNull()
    expect(propagateIsotropicWindowDiffuse({ ...input, dhiWattsPerM2: 0 }).diffuseWattsPerM2).toBe(0)
    propagateIsotropicWindowDiffuse(input)
    expect(JSON.stringify(input)).toBe(before)
  })
  it.each([0, -1, Infinity, NaN])('拒绝非法距离%s', perpendicularDistanceM => {
    expect(() => propagateIsotropicWindowDiffuse({ ...input, plant: { ...input.plant, perpendicularDistanceM } })).toThrow()
  })
  it('拒绝未指定天空模型、空平面和缺开口', () => {
    expect(() => propagateIsotropicWindowDiffuse({ ...input, skyModel: undefined } as never)).toThrow()
    expect(() => propagateIsotropicWindowDiffuse({ ...input, planeReference: '' })).toThrow()
    expect(() => propagateIsotropicWindowDiffuse({ ...input, apertures: [] })).toThrow()
  })
  it('拒绝非法开口和重复引用', () => {
    expect(() => propagateIsotropicWindowDiffuse({ ...input, apertures: [{ ...aperture, rightM: -1 }] })).toThrow()
    expect(() => propagateIsotropicWindowDiffuse({ ...input, apertures: [aperture, aperture] })).toThrow()
  })
  it.each([-1, Infinity, NaN, undefined])('拒绝非法DHI%s', dhiWattsPerM2 => {
    expect(() => propagateIsotropicWindowDiffuse({ ...input, dhiWattsPerM2 } as never)).toThrow()
  })
})

/** unit_real_data：实际天气制品→正式归一化→有限窗洞传播；几何是独立构造，未验证现场窗户或 HTTP。 */
describe('unit_real_data DHI真实时段到目标窗平行面', () => {
  it('保留24个真实均值时段，以独立解析系数检查各时段', () => {
    const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
    const result = normalizeOpenMeteoRadiation(raw, { series: 'hourly', sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') })
    expect(result.intervals).toHaveLength(24)
    result.intervals.forEach((interval, index) => {
      const estimate = propagateIsotropicWindowDiffuse({ skyModel: 'isotropic', planeReference: 'target_window_parallel', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [{ reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }], dhiWattsPerM2: interval.dhiWattsPerM2 })
      const rawDhi = raw.hourly.diffuse_radiation[index]
      if (rawDhi === null) { expect(estimate.diffuseWattsPerM2).toBeNull() } else { expect(estimate.diffuseWattsPerM2).toBeCloseTo(rawDhi * Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2), 10) }
      expect(interval.intervalEndMs).toBe(raw.hourly.time[index] * 1000)
      expect(interval.semantics).toBe('interval_mean')
    })
  })
})
