import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeQweatherV7Hourly } from '../../../src/care/environment/normalize-qweather-hourly.js'

/** L1 unit_real_data：原样官方示例制品；不是实时响应，无替身，不证明HTTP或预报质量。 */
const raw = readFileSync(
  resolve(__dirname, '../../../models/care/fixtures/qweather-v7-hourly-documentation.json'),
  'utf8'
)
const context = {
  endpoint: '/v7/weather/24h' as const,
  unit: 'm' as const,
  requestLocation: '101010100',
  capturedAt: '2026-10-08T04:00:00+08:00',
  sourceKind: 'provider_documentation_fixture' as const
}
const changeRow = (changes: Record<string, unknown>, index = 0) => {
  const payload = JSON.parse(raw)
  Object.assign(payload.hourly[index], changes)
  return JSON.stringify(payload)
}

describe('unit_real_data 和风v7官方小时示例标准化', () => {
  it('保存有效时间/更新时间/捕获时间，百分湿度不被乘100', () => {
    const result = normalizeQweatherV7Hourly(raw, context)
    expect(result).toMatchObject({
      provider: 'qweather',
      spatialScope: 'outdoor',
      evidenceKind: 'forecast',
      aggregation: 'unspecified',
      providerUpdatedAt: '2021-02-16T05:35:00.000Z',
      capturedAt: '2026-10-07T20:00:00.000Z',
      sourceKind: 'provider_documentation_fixture',
      requestLocation: '101010100',
      sourceSha256: createHash('sha256').update(raw).digest('hex'),
      samples: [
        {
          forecastTime: '2021-02-16T07:00:00.000Z',
          providerForecastTime: '2021-02-16T15:00+08:00',
          temperatureC: 2,
          relativeHumidityPercent: 11,
          unavailableFields: []
        },
        {
          forecastTime: '2021-02-16T08:00:00.000Z',
          temperatureC: 1,
          relativeHumidityPercent: 11,
          unavailableFields: []
        }
      ]
    })
    expect(result).not.toHaveProperty('publishedAt')
    expect(result.samples[0]).not.toHaveProperty('intervalEnd')
    expect(result).not.toHaveProperty('vpdKpa')
  })
})

describe('unit_fake 和风证据边界（在已知字段上构造风险）', () => {
  it('有效零温度、零湿度与缺失严格分开', () => {
    expect(
      normalizeQweatherV7Hourly(changeRow({ temp: '0', humidity: '0' }), context).samples[0]
    ).toMatchObject({ temperatureC: 0, relativeHumidityPercent: 0, unavailableFields: [] })
    expect(
      normalizeQweatherV7Hourly(changeRow({ temp: null, humidity: '' }), context).samples[0]
    ).toMatchObject({
      temperatureC: null,
      relativeHumidityPercent: null,
      unavailableFields: ['temperature', 'humidity']
    })
  })

  it.each([true, 11, 'NaN', 'Infinity', '0x10', '1e2'])('错误数字格式%s不偷偷转换', value => {
    expect(
      normalizeQweatherV7Hourly(changeRow({ temp: value, humidity: value }), context).samples[0]
    ).toMatchObject({
      temperatureC: null,
      relativeHumidityPercent: null,
      unavailableFields: ['temperature', 'humidity']
    })
  })

  it('非法范围保留缺失，合法小数湿度仍是百分数', () => {
    expect(
      normalizeQweatherV7Hourly(changeRow({ temp: '-999', humidity: '101' }), context).samples[0]
    ).toMatchObject({ temperatureC: null, relativeHumidityPercent: null })
    expect(
      normalizeQweatherV7Hourly(changeRow({ temp: '20.5', humidity: '0.11' }), context).samples[0]
    ).toMatchObject({ temperatureC: 20.5, relativeHumidityPercent: 0.11 })
  })

  it('缺字段与缺小时均不补造值或删除有效时刻', () => {
    const payload = JSON.parse(raw)
    delete payload.hourly[0].humidity
    payload.hourly[1].fxTime = '2021-02-16T20:00+08:00'
    const result = normalizeQweatherV7Hourly(JSON.stringify(payload), context)
    expect(result.samples).toHaveLength(2)
    expect(result.samples[0]).toMatchObject({
      temperatureC: 2,
      relativeHumidityPercent: null,
      unavailableFields: ['humidity']
    })
    expect(result.samples[1]!.forecastTime).toBe('2021-02-16T12:00:00.000Z')
  })

  it.each(['2021-02-30T15:00+08:00', '2021-02-16T15:00', 'not-a-time', null])(
    '非法或无时区时间%s拒绝',
    value => {
      expect(() => normalizeQweatherV7Hourly(changeRow({ fxTime: value }), context)).toThrow()
    }
  )

  it('带偏移跨日转UTC，不再追加设备时区或夏令时', () => {
    const payload = JSON.parse(raw)
    payload.hourly = [{ fxTime: '2021-02-16T00:00+0800', temp: '0', humidity: '100' }]
    expect(
      normalizeQweatherV7Hourly(JSON.stringify(payload), context).samples[0]!.forecastTime
    ).toBe('2021-02-15T16:00:00.000Z')
  })

  it.each(['2021-02-16T07:00Z', '2021-02-16T06:00Z'])(
    '同一UTC时刻重复或倒序%s不能覆盖旧样本',
    time => {
      expect(() => normalizeQweatherV7Hourly(changeRow({ fxTime: time }, 1), context)).toThrow()
    }
  )

  it.each([null, [], {}, { code: '403' }, { code: '200', hourly: [] }])(
    '错误根响应不能生成可用天气',
    payload => {
      expect(() => normalizeQweatherV7Hourly(JSON.stringify(payload), context)).toThrow()
    }
  )

  it('空数组和非对象样本不被忽略', () => {
    for (const hourly of [[], [null], [true]]) {
      expect(() =>
        normalizeQweatherV7Hourly(JSON.stringify({ ...JSON.parse(raw), hourly }), context)
      ).toThrow()
    }
  })

  it('未声明公制、另一API版本或缺捕获来源时拒绝', () => {
    for (const changes of [
      { unit: 'i' },
      { unit: undefined },
      { endpoint: '/weather/v1/hourly/1/2' },
      { capturedAt: '' },
      { requestLocation: '' },
      { sourceKind: undefined }
    ]) {
      expect(() => normalizeQweatherV7Hourly(raw, { ...context, ...changes } as never)).toThrow()
    }
  })

  it('只输出白名单字段，重复运行不改输入', () => {
    const payload = JSON.parse(raw)
    payload.secret = 'not-a-credential'
    payload.hourly[0].unused = 'ignored'
    const body = JSON.stringify(payload)
    const frozenContext = Object.freeze({ ...context })
    const result = normalizeQweatherV7Hourly(body, frozenContext)
    expect(JSON.stringify(result)).not.toContain('not-a-credential')
    expect(JSON.stringify(result)).not.toContain('ignored')
    expect(normalizeQweatherV7Hourly(body, frozenContext)).toEqual(result)
    expect(body).toBe(JSON.stringify(payload))
  })
})
