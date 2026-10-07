import { describe, expect, it } from 'vitest'
import { evaluateIdealClimateTransfer } from '../../../models/care/experiments/ideal-outdoor-comparison.js'

/** L1 unit_fake：固定人工系数与跨住宅协议；无替身，不证明真实住宅精度或HTTP。 */
const fit = Object.freeze({
  productionAdmission: false as const,
  sampleCount: 9,
  temperature: Object.freeze({ intercept: 10, temperatureCoefficient: 0.5, vaporCoefficient: 2 }),
  vapor: Object.freeze({ intercept: 0.2, temperatureCoefficient: 0.02, vaporCoefficient: 0.3 })
})
const trainingMean = Object.freeze({ temperatureC: 20, relativeHumidityPercent: 50 })
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
const prefixes = ['indoor_temperature', 'indoor_rh', 'outdoor_temperature', 'outdoor_rh']
const fields = ['mean', 'min', 'max', 'samples', 'first_utc', 'last_utc']
const header = [
  'interval_start_utc',
  'interval_end_utc',
  ...prefixes.flatMap(p => fields.map(f => `${p}_${f}`))
]
function fixture(
  indoorTemperature = 15.8,
  indoorRh = (100 * 0.52) / es(15.8),
  start = '2017-12-29T00:00:00Z'
) {
  const ms = Date.parse(start)
  const means = [indoorTemperature, indoorRh, 10, (100 * 0.4) / es(10)]
  const cells = [start, new Date(ms + 3600000).toISOString()]
  means.forEach((mean, i) =>
    cells.push(
      String(mean),
      String(mean),
      String(mean),
      i < 2 ? '300' : '4',
      new Date(ms + 1000).toISOString(),
      new Date(ms + 3599000).toISOString()
    )
  )
  return `${header.join(',')}\n${cells.join(',')}\n`
}

describe('unit_fake 固定参数跨住宅评价', () => {
  it('显式后续研究窗口可评价新小时，仍拒绝两端之外的数据', () => {
    const window = { startUtc: '2018-01-12T00:00:00Z', endExclusiveUtc: '2018-01-26T00:00:00Z' }
    const result = evaluateIdealClimateTransfer(
      fixture(20, 50, window.startUtc),
      { fit, trainingMean },
      window
    )
    expect(result.selection.selected).toBe(1)
    expect(() => evaluateIdealClimateTransfer(fixture(), { fit, trainingMean }, window)).toThrow()
    expect(() =>
      evaluateIdealClimateTransfer(
        fixture(20, 50, window.endExclusiveUtc),
        { fit, trainingMean },
        window
      )
    ).toThrow()
  })

  it('后续窗口不能包含来源训练时间，也不能反向或隐含时区', () => {
    for (const window of [
      { startUtc: '2017-12-01T00:00:00Z', endExclusiveUtc: '2018-01-26T00:00:00Z' },
      { startUtc: '2018-01-12T00:00:00Z', endExclusiveUtc: '2018-01-11T00:00:00Z' },
      { startUtc: '2018-01-12T00:00:00', endExclusiveUtc: '2018-01-26T00:00:00Z' }
    ]) {
      expect(() => evaluateIdealClimateTransfer(fixture(), { fit, trainingMean }, window)).toThrow()
    }
  })

  it('即使同时包含合格验证小时，也拒绝窗口之前的目标住宅数据', () => {
    const earlier = fixture(20, 50, '2017-12-28T23:00:00Z')
    const combined = earlier + fixture().split('\n')[1] + '\n'
    expect(() => evaluateIdealClimateTransfer(combined, { fit, trainingMean })).toThrow(
      '跨住宅评价只允许固定验证窗口'
    )
  })

  it('一个目标小时也可用固定模型评价，不在目标住宅重新拟合', () => {
    const result = evaluateIdealClimateTransfer(fixture(), { fit, trainingMean })
    expect(result.fit).toEqual(fit)
    expect(result.selection).toMatchObject({ total: 1, selected: 1 })
    expect(result.scores.candidate.temperatureC?.meanAbsoluteError).toBeLessThan(1e-10)
    expect(result.scores.candidate.vpdKpa?.meanAbsoluteError).toBeLessThan(1e-10)
  })

  it('目标住宅真值改变不能改预测或来源住宅的均值对照', () => {
    const a = evaluateIdealClimateTransfer(fixture(), { fit, trainingMean })
    const b = evaluateIdealClimateTransfer(fixture(25, 70), { fit, trainingMean })
    expect(b.predictions).toEqual(a.predictions)
    expect(b.fit).toEqual(a.fit)
    expect(b.trainingMean).toEqual(trainingMean)
    expect(b.scores.candidate.temperatureC?.meanAbsoluteError).toBeCloseTo(9.2, 10)
    expect(b.scores.trainingMean.temperatureC?.meanAbsoluteError).toBe(5)
  })

  it('固定候选非法仍保留对照评分，不用目标真值补候选', () => {
    const invalidFit = {
      ...fit,
      vapor: { intercept: 10, temperatureCoefficient: 0, vaporCoefficient: 0 }
    }
    const result = evaluateIdealClimateTransfer(fixture(), { fit: invalidFit, trainingMean })
    expect(result.scores.candidate).toMatchObject({ total: 1, valid: 0, unavailable: 1 })
    expect(result.scores.trainingMean).toMatchObject({ total: 1, valid: 1 })
    expect(result.scores.outdoor).toMatchObject({ total: 1, valid: 1 })
  })

  it.each(['2017-12-28T23:00:00Z', '2018-01-12T00:00:00Z'])('固定目标窗口不包含%s', start => {
    expect(() =>
      evaluateIdealClimateTransfer(fixture(20, 50, start), { fit, trainingMean })
    ).toThrow()
  })
})
