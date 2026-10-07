import { describe, expect, it } from 'vitest'
import { runIdealOutdoorComparison } from '../../../models/care/experiments/ideal-outdoor-comparison.js'

/** L1 unit_fake。Expected来自固定研究协议及独立构造的已知平面；无真实住宅精度/HTTP证明。 */
const prefixes = ['indoor_temperature', 'indoor_rh', 'outdoor_temperature', 'outdoor_rh'] as const
const fields = ['mean', 'min', 'max', 'samples', 'first_utc', 'last_utc'] as const
const headers = [
  'interval_start_utc',
  'interval_end_utc',
  ...prefixes.flatMap(p => fields.map(f => `${p}_${f}`))
]
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
function row(date: string, t: number, e: number): Record<string, string> {
  const start = Date.parse(date)
  const tin = 10 + 0.5 * t + 2 * e,
    ein = 0.2 + 0.02 * t + 0.3 * e
  const values = [tin, (100 * ein) / es(tin), t, (100 * e) / es(t)]
  const result: Record<string, string> = {
    interval_start_utc: date,
    interval_end_utc: new Date(start + 3600000).toISOString()
  }
  prefixes.forEach((prefix, i) => {
    for (const key of ['mean', 'min', 'max']) {result[`${prefix}_${key}`] = String(values[i])}
    result[`${prefix}_samples`] = i < 2 ? '300' : '4'
    result[`${prefix}_first_utc`] = new Date(start + 1000).toISOString()
    result[`${prefix}_last_utc`] = new Date(start + 3599000).toISOString()
  })
  return result
}
const training = [0, 10, 20].flatMap((t, i) =>
  [0.2, 0.4, 0.6].map((e, j) => row(new Date(Date.UTC(2017, 11, 1, i * 3 + j)).toISOString(), t, e))
)
const validation = [
  row('2017-12-29T00:00:00.000Z', 10, 0.4),
  row('2017-12-29T01:00:00.000Z', 20, 0.6)
]
const csv = (rows: Record<string, string>[]) =>
  [headers.join(','), ...rows.map(r => headers.map(k => r[k]).join(','))].join('\n')

describe('unit_fake 固定时段的室内估算研究比较', () => {
  it('验证边界归验证段，恢复独立平面，缺失小时不伪称连续', () => {
    const result = runIdealOutdoorComparison(csv([...training, ...validation]))
    expect(result.selection.training).toMatchObject({
      total: 9,
      selected: 9,
      runs: 1,
      longestRunHours: 9
    })
    expect(result.selection.validation).toMatchObject({
      total: 2,
      selected: 2,
      runs: 1,
      longestRunHours: 2
    })
    expect(result.fit.sampleCount).toBe(9)
    expect(result.scores.candidate.valid).toBe(2)
    expect(result.scores.candidate.temperatureC?.meanAbsoluteError).toBeLessThan(1e-10)
    expect(result.scores.candidate.vpdKpa?.meanAbsoluteError).toBeLessThan(1e-10)
  })

  it('改变验证室内真值只改变评分，不能改变拟合、均值对照或预测', () => {
    const first = runIdealOutdoorComparison(csv([...training, ...validation]))
    const altered = validation.map(r => ({
      ...r,
      indoor_temperature_mean: '25',
      indoor_temperature_min: '25',
      indoor_temperature_max: '25',
      indoor_rh_mean: '50',
      indoor_rh_min: '50',
      indoor_rh_max: '50'
    }))
    const second = runIdealOutdoorComparison(csv([...training, ...altered]))
    expect(second.fit).toEqual(first.fit)
    expect(second.trainingMean).toEqual(first.trainingMean)
    expect(second.predictions).toEqual(first.predictions)
    expect(second.scores.candidate.temperatureC?.meanAbsoluteError).toBeGreaterThan(4)
  })

  it.each([
    ['indoor_temperature_mean', '', 'missing_values'],
    ['indoor_temperature_samples', '269', 'indoor_coverage'],
    ['outdoor_temperature_samples', '3', 'outdoor_coverage'],
    ['outdoor_rh_min', '-999', 'humidity_range'],
    ['outdoor_rh_max', '101', 'humidity_range'],
    ['indoor_rh_first_utc', '2017-12-29T00:00:02.000Z', 'unpaired_samples']
  ])('%s=%s按独立协议排除，评分分母保留其他有效小时', (key, value, reason) => {
    const changed = [{ ...validation[0], [key]: value }, validation[1]!]
    const result = runIdealOutdoorComparison(csv([...training, ...changed]))
    expect(result.selection.validation).toMatchObject({
      total: 2,
      selected: 1,
      excluded: { [reason]: 1 }
    })
    expect(result.scores.candidate.total).toBe(1)
    expect(result.scores.trainingMean.total).toBe(1)
  })

  it('270个配对室内样本可入选；有效零湿度不当缺失', () => {
    const changed = {
      ...validation[0]!,
      indoor_temperature_samples: '270',
      indoor_rh_samples: '270',
      outdoor_rh_mean: '0',
      outdoor_rh_min: '0',
      outdoor_rh_max: '0'
    }
    const result = runIdealOutdoorComparison(csv([...training, changed]))
    expect(result.selection.validation.selected).toBe(1)
  })

  it('未列入协议的浮点均值末位误差不造成额外筛选', () => {
    const r = {
      ...validation[0]!,
      indoor_temperature_mean: '15.79999999999995',
      indoor_temperature_min: '15.8',
      indoor_temperature_max: '15.8'
    }
    expect(runIdealOutdoorComparison(csv([...training, r])).selection.validation.selected).toBe(1)
  })

  it('非法水汽预测计不可用，均值和室外对照仍评价全部合格小时', () => {
    const extrapolation = row('2017-12-29T02:00:00.000Z', -20, 0)
    for (const key of ['mean', 'min', 'max']) {
      extrapolation[`indoor_temperature_${key}`] = '20'
      extrapolation[`indoor_rh_${key}`] = '50'
    }
    const result = runIdealOutdoorComparison(csv([...training, ...validation, extrapolation]))
    expect(result.scores.candidate).toMatchObject({ total: 3, valid: 2, unavailable: 1 })
    expect(result.scores.trainingMean).toMatchObject({ total: 3, valid: 3 })
    expect(result.scores.outdoor).toMatchObject({ total: 3, valid: 3 })
  })

  it('重复/乱序时段、未声明UTC和损坏列数拒绝执行', () => {
    expect(() =>
      runIdealOutdoorComparison(csv([...training, ...validation, validation[1]!]))
    ).toThrow()
    expect(() => runIdealOutdoorComparison(csv([...training].reverse()))).toThrow()
    expect(() =>
      runIdealOutdoorComparison(
        csv([...training, { ...validation[0], interval_start_utc: '2017-12-29T00:00:00' }])
      )
    ).toThrow()
    expect(() => runIdealOutdoorComparison(csv([...training, ...validation]) + ',1')).toThrow()
  })
})
