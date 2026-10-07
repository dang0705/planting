import { describe, expect, it } from 'vitest'
import { fitClimateExchange, replayHeldOutClimate, summarizeClimateErrors } from '../../../models/care/experiments/indoor-climate-validation.js'

/** L1 unit_fake：独立线性样例、含湿比守恒、FAO式11；验证离线方法，不授予模型生产资格。 */
const point = (temperatureC: number, relativeHumidityPercent: number) => ({ temperatureC, relativeHumidityPercent })
const zeroSources = { temperatureExchangePerSecond: 0, heatInputCPerSecond: 0, moistureExchangePerSecond: 0, moistureInputKgPerKgPerSecond: 0 }
const rows = () => [0, 600, 1200].map((elapsedSeconds) => ({ elapsedSeconds, indoor: point(20, 50), outdoor: point(10, 40), pressureKpa: 100 }))

describe('unit_fake 室内研究候选的校准与独立时段验证', () => {
  it('由独立关系 Δx=0.25·差值+1 恢复常系数解析解参数', () => {
    const result = fitClimateExchange([-2, 0, 2], [0.5, 1, 1.5], 600)
    expect(result.exchangePerSecond).toBeCloseTo(Math.log(4 / 3) / 600, 14)
    expect(result.sourcePerSecond).toBeCloseTo(4 * Math.log(4 / 3) / 600, 14)
    expect(result.fraction).toBeCloseTo(0.25, 14)
    expect(result.increment).toBeCloseTo(1, 14)
  })
  it('零交换允许常数热湿源，不除以零', () => {
    expect(fitClimateExchange([-2, 0, 2], [3, 3, 3], 600)).toEqual({ fraction: 0, increment: 3, exchangePerSecond: 0, sourcePerSecond: 0.005 })
  })
  it.each([
    [[-1, 0, 1], [1, 0, -1], 600],
    [[-1, 0, 1], [-1, 0, 1], 600],
    [[1, 1, 1], [0, 1, 2], 600],
    [[1], [1], 600],
    [[1, 2], [1], 600],
    [[1, NaN], [1, 2], 600],
    [[1, 2], [1, 2], 0],
  ] as const)('不钳制不可识别、非法或不符合非负交换假设的拟合 %j', (x, y, seconds) => {
    expect(() => fitClimateExchange(x, y, seconds)).toThrow()
  })
  it('递推仅消费第一次室内锚点；后续室内真值不影响预测', () => {
    const original = rows(); const changed = rows()
    changed[1]!.indoor = point(30, 80); changed[2]!.indoor = point(15, 20)
    const expected = replayHeldOutClimate(original, zeroSources)
    expect(replayHeldOutClimate(changed, zeroSources)).toEqual(expected)
    expect(expected).toHaveLength(2)
    for (const value of expected) {
      expect(value).toMatchObject({ status: 'candidate', temperatureC: 20, productionAdmission: false })
      if (value.status === 'candidate') {expect(value.relativeHumidityPercent).toBeCloseTo(50, 10)}
    }
  })
  it('压力变化时携带含湿比；不能把RH直接沿用而凭空增减水分', () => {
    const input = rows(); input[1]!.pressureKpa = 90; input[2]!.pressureKpa = 100
    const result = replayHeldOutClimate(input, zeroSources)
    if (result[0]!.status !== 'candidate' || result[1]!.status !== 'candidate') {throw new Error('守恒样例应可算')}
    expect(result[0]!.relativeHumidityPercent).toBeCloseTo(45, 10)
    expect(result[1]!.relativeHumidityPercent).toBeCloseTo(50, 10)
  })
  it('区间失效后不从下一条实测静默重启；失败仍计入覆盖分母', () => {
    const predictions = replayHeldOutClimate(rows(), { ...zeroSources, heatInputCPerSecond: -15 / 600 })
    expect(predictions.map((row) => row.status)).toEqual(['outside_model_scope', 'previous_step_unavailable'])
    expect(summarizeClimateErrors(rows().slice(1).map((row) => row.indoor), predictions)).toEqual({ total: 2, valid: 0, unavailable: 2, coverage: 0, temperatureC: null, relativeHumidityPercent: null, vpdKpa: null })
  })
  it('误差按所有匹配时段计算，零误差是真实零；不改变输入', () => {
    const input = rows(); const before = structuredClone(input)
    const predictions = replayHeldOutClimate(input, zeroSources)
    const scores = summarizeClimateErrors([point(18, 50), point(22, 50)], predictions)
    expect(scores).toMatchObject({ total: 2, valid: 2, coverage: 1, temperatureC: { meanAbsoluteError: 2, rootMeanSquareError: 2, maximumAbsoluteError: 2 } })
    expect(input).toEqual(before)
    expect(() => summarizeClimateErrors([point(20, 50)], predictions)).toThrow()
  })
  it('重复或倒序区间拒绝，不补造时长', () => {
    const input = rows(); input[1]!.elapsedSeconds = 0
    expect(() => replayHeldOutClimate(input, zeroSources)).toThrow()
  })
})
