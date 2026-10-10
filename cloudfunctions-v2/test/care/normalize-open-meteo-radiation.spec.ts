import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'
import { findProjectRoot } from '../support/project-root.js'

/** 独立外部真相：Open-Meteo 官方文档规定均值属于此前时段，unixtime 为 UTC 秒。 */
const context = {
  series: 'hourly' as const,
  sourceRef: 'public-radiation-fixture',
  fetchedAtMs: 1_000
}
const raw = () => ({
  timezone: 'Asia/Shanghai',
  utc_offset_seconds: 28800,
  hourly_units: {
    time: 'unixtime',
    shortwave_radiation: 'W/m²',
    direct_normal_irradiance: 'W/m²',
    diffuse_radiation: 'W/m²'
  },
  hourly: {
    time: [3600, 7200],
    shortwave_radiation: [100, 0],
    direct_normal_irradiance: [80, 0],
    diffuse_radiation: [20, 0]
  }
})

describe('unit_fake 辐射归一化；Expected：Open-Meteo 已核验外部合同', () => {
  it('一小时标签是结束时刻；不加上海UTC偏移', () => {
    const result = normalizeOpenMeteoRadiation(raw(), context)
    expect(result.intervals[0]).toMatchObject({
      intervalStartMs: 0,
      intervalEndMs: 3600000,
      ghiWattsPerM2: 100,
      dniWattsPerM2: 80,
      dhiWattsPerM2: 20,
      semantics: 'interval_mean'
    })
    expect(result.timezone).toBe('Asia/Shanghai')
    expect(result.utcOffsetSeconds).toBe(28800)
    expect(result.evidenceKind).toBe('model_estimate_or_forecast')
  })
  it('15分钟分辨率仍是前一个区间，不当作瞬时值', () => {
    const base = raw()
    const result = normalizeOpenMeteoRadiation(
      {
        timezone: base.timezone,
        utc_offset_seconds: base.utc_offset_seconds,
        minutely_15_units: base.hourly_units,
        minutely_15: { ...base.hourly, time: [900, 1800] }
      },
      { ...context, series: 'minutely_15' }
    )
    expect(result.intervals[0]).toMatchObject({ intervalStartMs: 0, intervalEndMs: 900000 })
    expect(result.resolutionMs).toBe(900000)
  })
  it('有效零值保留，null不补零', () => {
    const input = raw()
    const withNull = { ...input, hourly: { ...input.hourly, diffuse_radiation: [null, 0] } }
    const result = normalizeOpenMeteoRadiation(withNull, context)
    expect(result.intervals[0]?.dhiWattsPerM2).toBeNull()
    expect(result.intervals[1]?.dhiWattsPerM2).toBe(0)
  })
  it('未选择的瞬时或其他分辨率字段不覆盖所选均值', () => {
    const input = raw()
    expect(
      normalizeOpenMeteoRadiation(
        {
          ...input,
          hourly: { ...input.hourly, shortwave_radiation_instant: [999, 999] },
          minutely_15: {}
        },
        context
      ).intervals[0]?.ghiWattsPerM2
    ).toBe(100)
  })
  it('乱序排序而不修改输入', () => {
    const input = raw()
    input.hourly.time.reverse()
    const before = structuredClone(input)
    const result = normalizeOpenMeteoRadiation(input, context)
    expect(result.intervals.map(v => v.intervalEndMs)).toEqual([3600000, 7200000])
    expect(input).toEqual(before)
  })
  it('缺时间标签保留缺段，不延长前一个区间', () => {
    const input = raw()
    input.hourly.time = [3600, 10800]
    expect(
      normalizeOpenMeteoRadiation(input, context).intervals.map(v => [
        v.intervalStartMs,
        v.intervalEndMs
      ])
    ).toEqual([
      [0, 3600000],
      [7200000, 10800000]
    ])
  })
  it('完全相同样本去重；同标签不同辐射拒绝', () => {
    const input = raw()
    input.hourly.time = [3600, 3600]
    expect(() => normalizeOpenMeteoRadiation(input, context)).toThrow('冲突')
    input.hourly.shortwave_radiation[1] = 100
    input.hourly.direct_normal_irradiance[1] = 80
    input.hourly.diffuse_radiation[1] = 20
    expect(normalizeOpenMeteoRadiation(input, context).intervals).toHaveLength(1)
  })
  it('不规则重叠区间拒绝，不猜测优先级', () => {
    const input = raw()
    input.hourly.time = [3600, 5400]
    expect(() => normalizeOpenMeteoRadiation(input, context)).toThrow('重叠')
  })
  it('错误时间格式、辐射单位、缺字段或数组长度不齐均拒绝', () => {
    const input = raw()
    for (const invalid of [
      { ...input, hourly_units: { ...input.hourly_units, time: 'iso8601' } },
      { ...input, hourly_units: { ...input.hourly_units, shortwave_radiation: 'kW/m²' } },
      { ...input, hourly: { ...input.hourly, diffuse_radiation: [] } },
      { ...input, hourly: { time: input.hourly.time } }
    ]) {
      expect(() => normalizeOpenMeteoRadiation(invalid, context)).toThrow('辐射')
    }
  })
  // 修订 2026-10-10（radiation-interval-contract.md）：单个负值按该分量缺值处理，不再拒绝整份响应；非数值与非有限数仍拒绝。
  it('单个负辐射值 → 该分量该时段为 null，其余保留', () => {
    const input = raw()
    const result = normalizeOpenMeteoRadiation({ ...input, hourly: { ...input.hourly, diffuse_radiation: [-3, 0] } }, context)
    expect(result.intervals[0]).toMatchObject({ ghiWattsPerM2: 100, dniWattsPerM2: 80, dhiWattsPerM2: null })
    expect(result.intervals[1]).toMatchObject({ dhiWattsPerM2: 0 })
  })
  it.each([NaN, Infinity, '100'])('非法辐射%s拒绝', value => {
    const input = raw()
    expect(() =>
      normalizeOpenMeteoRadiation(
        { ...input, hourly: { ...input.hourly, shortwave_radiation: [value, 0] } },
        context
      )
    ).toThrow('辐射')
  })
  it('ISO文字或不安全Unix秒拒绝', () => {
    const input = raw()
    for (const times of [['2026-10-04T00:00'], [Number.MAX_SAFE_INTEGER]]) {
      expect(() =>
        normalizeOpenMeteoRadiation(
          {
            ...input,
            hourly: {
              time: times,
              shortwave_radiation: [0],
              direct_normal_irradiance: [0],
              diffuse_radiation: [0]
            }
          },
          context
        )
      ).toThrow()
    }
  })
  it('无效地点时区、获取时间或来源拒绝，不使用主机默认时区', () => {
    expect(() =>
      normalizeOpenMeteoRadiation({ ...raw(), timezone: 'not-a-zone' }, context)
    ).toThrow('时区')
    expect(() => normalizeOpenMeteoRadiation(raw(), { ...context, fetchedAtMs: NaN })).toThrow(
      '来源'
    )
    expect(() => normalizeOpenMeteoRadiation(raw(), { ...context, sourceRef: '' })).toThrow('来源')
  })
  it('没有所选序列时不自动改用另一种', () => {
    expect(() => normalizeOpenMeteoRadiation(raw(), { ...context, series: 'minutely_15' })).toThrow(
      '辐射'
    )
  })
  it('空数组表示没有样本，不合成一条零辐射', () => {
    const input = raw()
    input.hourly = {
      time: [],
      shortwave_radiation: [],
      direct_normal_irradiance: [],
      diffuse_radiation: []
    }
    expect(normalizeOpenMeteoRadiation(input, context).intervals).toEqual([])
  })
})

describe('unit_real_data 公开Open-Meteo响应制品；未覆盖在线Provider发布', () => {
  it('真实小时制品按UTC秒原样保留分量，首区间属于标签之前一小时', () => {
    const fixturePath = path.join(
      findProjectRoot(),
      'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'
    )
    const fixtureBytes = fs.readFileSync(fixturePath)
    const fixture = JSON.parse(fixtureBytes.toString('utf8'))
    const metadata = JSON.parse(
      fs.readFileSync(fixturePath.replace('.json', '.metadata.json'), 'utf8')
    )
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe(metadata.sha256)
    const result = normalizeOpenMeteoRadiation(fixture, {
      ...context,
      sourceRef: metadata.sha256,
      fetchedAtMs: Date.parse(metadata.fetchedAt)
    })
    expect(result.intervals).toHaveLength(24)
    expect(result.intervals[0]?.intervalEndMs).toBe(fixture.hourly.time[0] * 1000)
    expect(result.intervals[0]?.intervalStartMs).toBe(fixture.hourly.time[0] * 1000 - 3600000)
    expect(result.intervals.map(v => v.dniWattsPerM2)).toEqual(
      fixture.hourly.direct_normal_irradiance
    )
    expect(result.intervals.map(v => v.ghiWattsPerM2)).toEqual(fixture.hourly.shortwave_radiation)
    expect(result.intervals.map(v => v.dhiWattsPerM2)).toEqual(fixture.hourly.diffuse_radiation)
    const localDayStartMs = fixture.hourly.time[0] * 1000
    const inDay = result.intervals.filter(v => v.intervalStartMs >= localDayStartMs)
    expect(inDay).toHaveLength(23)
    expect(result.intervals.at(-1)?.intervalEndMs).toBe(localDayStartMs + 23 * 3600000)
  })
})

describe('真实 Open-Meteo 响应含负散射值（线上 normalize_failed 根因，2026-10-10）｜unit_real_data', () => {
  // Expected：radiation-interval-contract.md 修订 2026-10-10；制品 open-meteo-hourly-radiation-negative-dhi.json（函数同参数抓取）。
  const fixtureDirectory = path.join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures')
  const text = fs.readFileSync(path.join(fixtureDirectory, 'open-meteo-hourly-radiation-negative-dhi.json'), 'utf8')
  const metadata = JSON.parse(fs.readFileSync(path.join(fixtureDirectory, 'open-meteo-hourly-radiation-negative-dhi.metadata.json'), 'utf8')) as { sha256: string }
  it('制品摘要与元数据一致', () => {
    expect(createHash('sha256').update(text).digest('hex')).toBe(metadata.sha256)
  })
  it('整份 408 小时响应可标准化；两个负散射时段 DHI 为 null、GHI 保留', () => {
    const result = normalizeOpenMeteoRadiation(JSON.parse(text), { series: 'hourly', sourceRef: 'open_meteo_forecast_v1', fetchedAtMs: 1_000 })
    expect(result.intervals).toHaveLength(408)
    const at = (iso: string) => result.intervals.find(item => item.intervalEndMs === Date.parse(iso))
    expect(at('2026-10-18T23:00:00Z')).toMatchObject({ ghiWattsPerM2: 10, dhiWattsPerM2: null })
    expect(at('2026-10-19T00:00:00Z')).toMatchObject({ ghiWattsPerM2: 50, dhiWattsPerM2: null })
    expect(at('2026-10-10T01:00:00Z')?.ghiWattsPerM2).toBe(455)
  })
})

