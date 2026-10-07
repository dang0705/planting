import { describe, expect, it } from 'vitest'
import {
  fitOutdoorOnlyClimate,
  predictOutdoorOnlyClimate
} from '../../../models/care/experiments/outdoor-only-climate.js'

/** unit_fake：独立人工平面与FAO关系验证研究算法；无替身，无真实住宅精度或HTTP证明。 */
const saturation = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
const point = (temperatureC: number, vaporKpa: number) => ({
  temperatureC,
  relativeHumidityPercent: (100 * vaporKpa) / saturation(temperatureC)
})
// 来源：indoor-outdoor-comparison.md 的独立构造，系数不是从被测系统回填。
const samples = [0, 10, 20].flatMap(t =>
  [0.2, 0.4, 0.6].map(e => ({
    outdoor: point(t, e),
    indoor: point(10 + 0.5 * t + 2 * e, 0.2 + 0.02 * t + 0.3 * e)
  }))
)

describe('unit_fake 无室内初态的离线气候对照', () => {
  it('还原独立二维格点的温度和水汽压平面', () => {
    const fit = fitOutdoorOnlyClimate(samples)
    expect(fit.productionAdmission).toBe(false)
    expect(fit.sampleCount).toBe(9)
    for (const [actual, expected] of [
      [fit.temperature.intercept, 10],
      [fit.temperature.temperatureCoefficient, 0.5],
      [fit.temperature.vaporCoefficient, 2],
      [fit.vapor.intercept, 0.2],
      [fit.vapor.temperatureCoefficient, 0.02],
      [fit.vapor.vaporCoefficient, 0.3]
    ]) {
      expect(actual).toBeCloseTo(expected!, 10)
    }
  })

  it('只用室外输入预测，没有室内初态；RH由新温度和水汽压恢复', () => {
    const result = predictOutdoorOnlyClimate(point(10, 0.4), fitOutdoorOnlyClimate(samples), 3600)
    expect(result).toMatchObject({
      status: 'candidate',
      productionAdmission: false,
      elapsedSeconds: 3600
    })
    if (result.status !== 'candidate') {throw new Error('应有候选结果')}
    expect(result.temperatureC).toBeCloseTo(15.8, 10)
    expect(result.relativeHumidityPercent).toBeCloseTo((100 * 0.52) / saturation(15.8), 10)
    expect(result.vpdKpa).toBeCloseTo(saturation(15.8) - 0.52, 10)
  })

  it.each([-0.1, 10])('水汽预测=%s不钳制为合法RH', value => {
    const fit = fitOutdoorOnlyClimate(samples)
    expect(
      predictOutdoorOnlyClimate(
        point(10, 0.4),
        { ...fit, vapor: { intercept: value, temperatureCoefficient: 0, vaporCoefficient: 0 } },
        0
      )
    ).toMatchObject({ status: 'outside_model_scope', productionAdmission: false })
  })

  it('有效零水汽压保持零RH和非零VPD', () => {
    const fit = fitOutdoorOnlyClimate(samples)
    const result = predictOutdoorOnlyClimate(
      point(10, 0.4),
      { ...fit, vapor: { intercept: 0, temperatureCoefficient: 0, vaporCoefficient: 0 } },
      0
    )
    expect(result).toMatchObject({ status: 'candidate', relativeHumidityPercent: 0 })
  })

  it('恒定或共线解释变量不能识别二维模型', () => {
    expect(() =>
      fitOutdoorOnlyClimate(samples.map(s => ({ ...s, outdoor: point(10, 0.4) })))
    ).toThrow(RangeError)
    expect(() =>
      fitOutdoorOnlyClimate(
        [0, 10, 20].map(t => ({ outdoor: point(t, 0.2 + 0.01 * t), indoor: point(20, 1) }))
      )
    ).toThrow(RangeError)
  })

  it.each([{ rows: [] }, { rows: samples.slice(0, 2) }])(
    '空或不足三个样本不产生默认模型',
    ({ rows }) => {
      expect(() => fitOutdoorOnlyClimate(rows)).toThrow(RangeError)
    }
  )

  it.each([-1, 101, NaN, null])('非法训练湿度=%s不变成零值', rh => {
    const bad = samples.map(s => ({ ...s, indoor: { ...s.indoor, relativeHumidityPercent: rh } }))
    expect(() => fitOutdoorOnlyClimate(bad as never)).toThrow()
  })

  it('训练不改输入，重复运行还原同一系数', () => {
    const frozen = samples.map(s =>
      Object.freeze({
        indoor: Object.freeze({ ...s.indoor }),
        outdoor: Object.freeze({ ...s.outdoor })
      })
    )
    expect(fitOutdoorOnlyClimate(Object.freeze(frozen))).toEqual(fitOutdoorOnlyClimate(frozen))
    expect(frozen).toEqual(samples)
  })
})
