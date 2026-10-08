import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { compareMassForecasts } from '../../../models/care/experiments/gravimetric-forecast-benchmark.js'

/** L1 unit_real_data：原作者四次称重及三段保存差值；无替身，不证明普通盆栽、未来天气、日期或施水量。 */
const fixture = JSON.parse(readFileSync(resolve(__dirname, '../../../models/care/fixtures/arabidopsis-pot-mass.json'), 'utf8')) as {
  records: { sourceRow: number; weightsG: number[]; authorLossG: number[] }[]
}

describe('unit_real_data 逐盆称重的固定起点预测对照', () => {
  it('保留72行和原作者216段差值，第2行预测只使用前两次称重', () => {
    expect(fixture.records).toHaveLength(72)
    for (const row of fixture.records) {
      for (let index = 0; index < 3; index++) {
        expect(row.weightsG[index]! - row.weightsG[index + 1]!).toBeCloseTo(row.authorLossG[index]!, 10)
      }
    }
    const result = compareMassForecasts(fixture.records)
    const first = result.predictions[0]!
    expect(first.sourceRow).toBe(2)
    // 原表 E/F/K/P：27.403、26.831、26.112、25.632；独立手算。
    expect(first.persistenceG).toEqual([26.831, 26.831])
    expect(first.recentLossG[0]).toBeCloseTo(26.259, 10)
    expect(first.recentLossG[1]).toBeCloseTo(25.687, 10)
    expect(result.productionAdmission).toBe(false)
  })

  it('两步误差对应独立Python从原始工作簿核算的结果', () => {
    const result = compareMassForecasts(fixture.records)
    expect(result.scores.persistence[0]!.maeG).toBeCloseTo(1.4389416666666668, 10)
    expect(result.scores.persistence[1]!.maeG).toBeCloseTo(2.954109722222222, 10)
    expect(result.scores.recentLoss[0]!.maeG).toBeCloseTo(0.2572861111111113, 10)
    expect(result.scores.recentLoss[1]!.maeG).toBeCloseTo(0.5733875000000004, 10)
    expect(result.scores.recentLoss[0]!.biasG).toBeCloseTo(-0.02771388888888869, 10)
    expect(result.scores.recentLoss[1]!.biasG).toBeCloseTo(0.020798611111111785, 10)
    expect(result.comparisons).toEqual([
      { observationStep: 1, persistenceBetter: 3, recentLossBetter: 69, ties: 0 },
      { observationStep: 2, persistenceBetter: 3, recentLossBetter: 69, ties: 0 },
    ])
  })

  it('未来称重变化只影响评分，不能反向改变已作预测', () => {
    const altered = fixture.records.map(row => ({ ...row, weightsG: [row.weightsG[0]!, row.weightsG[1]!, 100, 101] }))
    const result = compareMassForecasts(fixture.records)
    const changed = compareMassForecasts(altered)
    expect(changed.predictions).toEqual(result.predictions)
    expect(changed.scores).not.toEqual(result.scores)
  })

  it('有效零重量、重量增加和负预测保留原值，不伪装成安全耗水量', () => {
    const result = compareMassForecasts([{ sourceRow: 1, weightsG: [4, 1, 0, 0] }, { sourceRow: 2, weightsG: [0, 1, 2, 3] }])
    expect(result.predictions[0]!.recentLossG).toEqual([-2, -5])
    expect(result.predictions[1]!.recentLossG).toEqual([2, 3])
    expect(result.scores.recentLoss.map(score => score.negativePredictions)).toEqual([1, 1])
  })

  it('空集合、记录洞、空重量、非法数值、重复盆记录拒绝且不修改输入', () => {
    const original = structuredClone(fixture.records)
    expect(() => compareMassForecasts([])).toThrow()
    for (const weightsG of [[1, 2, 3], [1, null, 3, 4], [1, NaN, 3, 4], [1, Infinity, 3, 4], [1, -1, 3, 4]]) {
      expect(() => compareMassForecasts([{ sourceRow: 1, weightsG }] as never)).toThrow()
    }
    expect(() => compareMassForecasts([null] as never)).toThrow()
    expect(() => compareMassForecasts(new Array(1))).toThrow()
    expect(() => compareMassForecasts([original[0]!, original[0]!])).toThrow()
    expect(compareMassForecasts(original)).toEqual(compareMassForecasts(original))
    expect(original).toEqual(fixture.records)
  })
})
