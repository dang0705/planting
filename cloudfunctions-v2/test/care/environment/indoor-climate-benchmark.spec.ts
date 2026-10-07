import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadClimateBenchmarkCsv, runClimateBenchmark } from '../../../models/care/experiments/indoor-climate-benchmark.js'

/** L3 unit_real_data：UCI CC-BY 4.0原始字段的固定子集；只验证无泄漏离线回放，不证明中国住宅/真实预报/HTTP精度。 */
const csv = readFileSync(resolve(__dirname, '../../../models/care/fixtures/uci-living-room-winter.csv'), 'utf8')
const split = '2016-02-09 00:00:00'
describe('unit_real_data 室内气候固定校准段与独立验证段', () => {
  it('数据字段与时间范围来自原始制品，按日历先后分段且不重叠', () => {
    const rows = loadClimateBenchmarkCsv(csv)
    expect(rows).toHaveLength(6049)
    expect(rows[0]).toMatchObject({ sourceDate: '2016-01-12 00:00:00', elapsedSeconds: 0 })
    expect(rows.at(-1)).toMatchObject({ sourceDate: '2016-02-23 00:00:00', elapsedSeconds: 42 * 86400 })
    const result = runClimateBenchmark(rows, split)
    expect(result.calibration).toMatchObject({ rows: 4032, transitions: 4031, lastRecord: '2016-02-08 23:50:00' })
    expect(result.validation).toMatchObject({ rows: 2017, predictions: 2016, firstRecord: split, indoorAnchors: 1 })
    expect(result.productionAdmission).toBe(false)
    // 哈希仅检查数据可追溯性；不是模型输出的Expected或精度门槛。
    expect(createHash('sha256').update(csv).digest('hex')).toBe('268be2fc6e8367cd0c8c9530db148a7735991ef16543968da47df116960ed965')
  })
  it('验证段未来室内真值改变不影响拟合参数或递推值，只改变评分', () => {
    const rows = loadClimateBenchmarkCsv(csv)
    const changed = rows.map((row) => row.sourceDate > split ? { ...row, indoor: { temperatureC: 30, relativeHumidityPercent: 30 } } : row)
    const original = runClimateBenchmark(rows, split); const altered = runClimateBenchmark(changed, split)
    expect(altered.fit).toEqual(original.fit)
    expect(altered.predictionSha256).toBe(original.predictionSha256)
    expect(altered.scores.candidate).not.toEqual(original.scores.candidate)
  })
  it('缺值不能通过Number空串变成零；不接受未知表头或非法日期', () => {
    const header = 'date,T2,RH_2,T_out,RH_out,Press_mm_hg\n'
    expect(() => loadClimateBenchmarkCsv(header + '2016-01-12 00:00:00,,40,10,60,750\n')).toThrow()
    expect(() => loadClimateBenchmarkCsv(header + '2016-02-30 00:00:00,20,40,10,60,750\n')).toThrow()
    expect(() => loadClimateBenchmarkCsv('wrong\n')).toThrow()
  })
  it('重复与缺段拒绝；不通过丢弃记录改善误差', () => {
    const rows = loadClimateBenchmarkCsv(csv)
    expect(() => runClimateBenchmark(rows.filter((_, index) => index !== 100), split)).toThrow()
    expect(() => runClimateBenchmark([rows[0]!, ...rows], split)).toThrow()
    expect(() => runClimateBenchmark(rows, rows[0]!.sourceDate)).toThrow()
  })
})
