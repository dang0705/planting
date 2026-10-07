import { describe, expect, it } from 'vitest'
import {
  buildClimateEnvelope,
  applyClimateEnvelope
} from '../../../models/care/experiments/indoor-climate-envelope.js'
import type { ClimatePrediction } from '../../../models/care/experiments/indoor-climate-validation.js'

// unit_fake；来源：indoor-climate-envelope.md独立算例。无替身，不证明真实住宅精度。
const es = (t: number) => 0.6108 * Math.exp((17.27 * t) / (t + 237.3))
const observed = (temperatureC: number, vapor: number) => ({
  temperatureC,
  relativeHumidityPercent: (100 * vapor) / es(temperatureC)
})
const prediction = (t: number, e: number): ClimatePrediction => ({
  ...observed(t, e),
  status: 'candidate',
  elapsedSeconds: 0,
  productionAdmission: false,
  vpdKpa: es(t) - e
})
const calibration = () => [
  { prediction: prediction(20, 1), observed: observed(18, 0.8) },
  { prediction: prediction(20, 1), observed: observed(23, 1.1) }
]

describe('unit_fake 室内估算经验包络', () => {
  it('从校准实测减点估算得到有方向的残差，不拿平均绝对误差当范围', () => {
    const envelope = buildClimateEnvelope(calibration())
    expect(envelope.temperatureResidualC).toEqual({ min: -2, max: 3 })
    expect(envelope.vaporResidualKpa.min).toBeCloseTo(-0.2, 12)
    expect(envelope.vaporResidualKpa.max).toBeCloseTo(0.1, 12)
    expect(envelope).toMatchObject({
      productionAdmission: false,
      total: 2,
      used: 2,
      unavailable: 0
    })
  })

  it('室外模型点估算经温度和水汽包络得到RH与VPD范围', () => {
    const result = applyClimateEnvelope(prediction(22, 1.2), buildClimateEnvelope(calibration()))
    expect(result).toMatchObject({
      status: 'candidate',
      productionAdmission: false,
      temperatureC: { min: 20, max: 25 }
    })
    if (result.status !== 'candidate') {
      throw new Error('独立算例必须可计算')
    }
    expect(result.relativeHumidityPercent.min).toBeCloseTo(31.56787152310154, 10)
    expect(result.relativeHumidityPercent.max).toBeCloseTo(55.59639108277053, 10)
    expect(result.vpdKpa.min).toBeCloseTo(1.038281270927446, 10)
    expect(result.vpdKpa.max).toBeCloseTo(2.1677777175068473, 10)
    expect(result.method).toBe('empirical_residual_envelope')
  })

  it('缺失校准或全部不可用时拒绝生成零误差范围', () => {
    expect(() => buildClimateEnvelope([])).toThrow()
    expect(() =>
      buildClimateEnvelope([
        {
          prediction: {
            status: 'outside_model_scope',
            elapsedSeconds: 0,
            productionAdmission: false
          },
          observed: observed(20, 1)
        }
      ])
    ).toThrow()
  })

  it.each([null, undefined])('校准集合中的空元素%s明确拒绝，不跳过计数', missing => {
    expect(() => buildClimateEnvelope([missing, ...calibration()] as never)).toThrow()
  })

  it('不可用校准预测保留分母，未来不可用预测不产生范围', () => {
    const missing: ClimatePrediction = {
      status: 'outside_model_scope',
      elapsedSeconds: 0,
      productionAdmission: false
    }
    const envelope = buildClimateEnvelope([
      ...calibration(),
      { prediction: missing, observed: observed(20, 1) }
    ])
    expect(envelope).toMatchObject({ total: 3, used: 2, unavailable: 1 })
    expect(applyClimateEnvelope(missing, envelope)).toMatchObject({
      status: 'outside_model_scope',
      productionAdmission: false
    })
  })

  it.each([null, NaN, -1, 101])('非法校准湿度%s不当作零或裁剪', rh => {
    const rows = calibration()
    rows[0]!.observed.relativeHumidityPercent = rh as number
    expect(() => buildClimateEnvelope(rows)).toThrow()
  })

  it('经验包络出现负水汽或过饱和时不可用，不裁剪后假报覆盖', () => {
    const envelope = buildClimateEnvelope(calibration())
    expect(applyClimateEnvelope(prediction(20, 0.1), envelope).status).toBe('outside_model_scope')
    expect(applyClimateEnvelope(prediction(20, 2.2), envelope).status).toBe('outside_model_scope')
  })

  it('合法零水汽与饱和边界仍可计算', () => {
    for (const e of [0, es(20)]) {
      const point = prediction(20, e)
      const envelope = buildClimateEnvelope([{ prediction: point, observed: observed(20, e) }])
      const result = applyClimateEnvelope(point, envelope)
      expect(result.status).toBe('candidate')
      if (result.status !== 'candidate') {
        throw new Error('边界不可用')
      }
      expect(result.relativeHumidityPercent).toEqual({
        min: e === 0 ? 0 : 100,
        max: e === 0 ? 0 : 100
      })
      expect(result.vpdKpa.min).toBeCloseTo(es(20) - e, 12)
    }
  })

  it('重复计算不改变点预测或校准记录', () => {
    const rows = calibration()
    const before = structuredClone(rows)
    const first = buildClimateEnvelope(rows)
    expect(buildClimateEnvelope(rows)).toEqual(first)
    expect(rows).toEqual(before)
  })
})
