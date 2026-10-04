import { describe, expect, it } from 'vitest'
import { deriveSunCalcDirection } from '../../src/care/light/derive-suncalc-direction.js'

/** unit_fake：NREL报告附录独立数字与批准输入合同；真实SunCalc，无网络或替身。 */
const sample = () => ({ atMs: Date.parse('2003-10-17T19:30:30Z'), latitudeDeg: 39.742476, longitudeDeg: -105.1786 })

describe('unit_fake SunCalc 2.1.0太阳方向', () => {
  it('NREL附录太阳方向：度、北起算；不沿用旧版弧度转换', () => {
    const result = deriveSunCalcDirection(sample())
    expect(Math.abs(result.apparentElevationDeg - 39.88838)).toBeLessThan(0.1)
    expect(Math.abs(result.azimuthDeg - 194.34024)).toBeLessThan(0.1)
    expect(result).toMatchObject({ ...sample(), method: 'suncalc@2.1.0', evidenceKind: 'model_estimate', elevationDefinition: 'apparent_refraction_corrected', azimuthDefinition: 'north_clockwise_degrees' })
    expect(result).not.toHaveProperty('equationOfTimeMinutes')
  })
  it('等价UTC时刻不受输入文本时区影响', () => {
    expect(deriveSunCalcDirection({ ...sample(), atMs: Date.parse('2003-10-17T12:30:30-07:00') })).toEqual(deriveSunCalcDirection(sample()))
  })
  it('午夜保持负高度，不钳成白昼', () => {
    expect(deriveSunCalcDirection({ atMs: Date.parse('2026-10-04T00:00:00Z'), latitudeDeg: 0, longitudeDeg: 0 }).apparentElevationDeg).toBeLessThan(0)
  })
  it.each(['latitudeDeg','longitudeDeg','atMs'] as const)('拒绝%s的缺失和非法类型', field => {
    for (const bad of [undefined, null, '0', NaN, Infinity]) {
      expect(() => deriveSunCalcDirection({ ...sample(), [field]: bad } as never)).toThrow()
    }
  })
  it.each([-91,91])('拒绝超范围纬度%s', latitudeDeg => {
    expect(() => deriveSunCalcDirection({ ...sample(), latitudeDeg })).toThrow()
  })
  it.each([-181,181])('拒绝超范围经度%s', longitudeDeg => {
    expect(() => deriveSunCalcDirection({ ...sample(), longitudeDeg })).toThrow()
  })
  it.each([0.5, Number.MAX_SAFE_INTEGER])('拒绝非法毫秒时刻%s', atMs => {
    expect(() => deriveSunCalcDirection({ ...sample(), atMs })).toThrow()
  })
  it('拒绝缺失对象', () => { expect(() => deriveSunCalcDirection(null as never)).toThrow() })
  it('冻结输入保持原样', () => {
    const input = Object.freeze(sample())
    deriveSunCalcDirection(input)
    expect(input).toEqual(sample())
  })
})
