import { describe, expect, it } from 'vitest'
import { deriveMeasuredIndoorVpdRange } from '../../../src/care/environment/derive-indoor-vpd-range.js'

/** L1 unit_fake：FAO公式单调性、手算Expected、冻结来源边界；无替身及真实采集证明。 */
const input = () => {
  const common = {
    observedAtMs: 1000,
    positionRef: 'plant-zone',
    sourceScope: 'plant_zone' as const,
    inputSnapshotRef: 'locked-snapshot',
    evidenceKind: 'measurement' as const,
    confirmed: true
  }
  return {
    temperature: {
      ...common,
      unit: 'celsius' as const,
      range: { min: 0, max: 0 },
      sourceRef: 'temperature-observation'
    },
    humidity: {
      ...common,
      unit: 'percent' as const,
      range: { min: 40, max: 60 },
      sourceRef: 'humidity-observation'
    }
  }
}

describe('unit_fake 室内同刻证据到VPD保守包络', () => {
  it('0°C与40至60%RH按相反湿度端点求界，不取中点', () => {
    const result = deriveMeasuredIndoorVpdRange(input())
    expect(result).toMatchObject({
      status: 'available',
      productionAdmission: false,
      unit: 'kPa',
      evidenceKind: 'measurement',
      semantics: 'range_enclosure_not_confidence_interval',
      sourceRefs: { temperature: 'temperature-observation', humidity: 'humidity-observation' },
      observedAtMs: 1000,
      positionRef: 'plant-zone',
      inputSnapshotRef: 'locked-snapshot'
    })
    if (result.status !== 'available') {
      throw new Error('应得到范围')
    }
    expect(result.vpdKpa.min).toBeCloseTo(0.24432, 12)
    expect(result.vpdKpa.max).toBeCloseTo(0.36648, 12)
    expect(result.temperatureRangeC).toEqual({ min: 0, max: 0 })
    expect(result.humidityRangePercent).toEqual({ min: 40, max: 60 })
  })

  it.each([
    [0, 0, 0, 100, 0, 0.6108],
    [-10, -5, 50, 75, 0.07142774554, 0.21058824601],
    [20, 20, 50, 50, 1.16914063546, 1.16914063546]
  ])('独立端点算例T[%s,%s]RH[%s,%s]', (tmin, tmax, hmin, hmax, lower, upper) => {
    const x = input()
    x.temperature.range = { min: tmin, max: tmax }
    x.humidity.range = { min: hmin, max: hmax }
    const result = deriveMeasuredIndoorVpdRange(x)
    if (result.status !== 'available') {
      throw new Error('应得到范围')
    }
    expect(result.vpdKpa.min).toBeCloseTo(lower, 10)
    expect(result.vpdKpa.max).toBeCloseTo(upper, 10)
  })

  it.each(['temperature', 'humidity'] as const)(
    '%s缺范围保持缺失，未确认/估算/室外保持未准入',
    side => {
      const x = input()
      for (const [patch, reason] of [
        [{ range: null }, 'missing_temperature_or_humidity'],
        [{ confirmed: false }, 'unconfirmed_measurement'],
        [{ evidenceKind: 'estimate' }, 'unapproved_estimate'],
        [{ sourceScope: 'outdoor' }, 'outdoor_source']
      ] as const) {
        expect(
          deriveMeasuredIndoorVpdRange({ ...x, [side]: { ...x[side], ...patch } } as never)
        ).toMatchObject({ status: 'insufficient_evidence', reason, productionAdmission: false })
      }
    }
  )

  it.each([
    [{ observedAtMs: 1001 }, 'time_mismatch'],
    [{ positionRef: 'another-position' }, 'space_mismatch'],
    [{ sourceScope: 'indoor' }, 'space_mismatch'],
    [{ inputSnapshotRef: 'another-snapshot' }, 'snapshot_mismatch']
  ])('不跨时间/空间/快照拼接：%s', (patch, reason) => {
    const x = input()
    expect(
      deriveMeasuredIndoorVpdRange({ ...x, humidity: { ...x.humidity, ...patch } } as never)
    ).toMatchObject({ status: 'insufficient_evidence', reason })
  })

  it.each([
    ['temperature', { range: { min: null, max: 20 } }],
    ['temperature', { range: { min: '0', max: 20 } }],
    ['temperature', { range: { min: 20, max: 10 } }],
    ['temperature', { range: { min: 0, max: Infinity } }],
    ['temperature', { range: { min: -237.3, max: 0 } }],
    ['humidity', { range: { min: -1, max: 50 } }],
    ['humidity', { range: { min: 40, max: 101 } }],
    ['temperature', { unit: 'kelvin' }],
    ['humidity', { unit: 'fraction' }],
    ['humidity', { sourceRef: '' }],
    ['humidity', { observedAtMs: Number.MAX_SAFE_INTEGER }]
  ] as const)('%s非法字段拒绝，不钳制：%s', (side, patch) => {
    const x = input()
    expect(() =>
      deriveMeasuredIndoorVpdRange({ ...x, [side]: { ...x[side], ...patch } } as never)
    ).toThrow()
  })

  it('冻结输入可用，结果不与原始范围共享可变对象', () => {
    const x = input()
    const before = structuredClone(x)
    Object.freeze(x.temperature.range)
    Object.freeze(x.humidity.range)
    Object.freeze(x.temperature)
    Object.freeze(x.humidity)
    Object.freeze(x)
    const result = deriveMeasuredIndoorVpdRange(x)
    expect(x).toEqual(before)
    if (result.status !== 'available') {
      throw new Error('应得到范围')
    }
    expect(result.temperatureRangeC).not.toBe(x.temperature.range)
    expect(result.humidityRangePercent).not.toBe(x.humidity.range)
  })
})
