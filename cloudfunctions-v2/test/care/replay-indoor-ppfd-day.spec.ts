import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { replayIndoorPpfdDay } from '../../src/care/application/replay-indoor-ppfd-day.js'

const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
const target = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'window', tiltDeg: 90, azimuthDeg: 180 }, plantReference: 'plant', plant: { xM: 0, yM: 0, perpendicularDistanceM: 1 }, apertures: [{ reference: 'window', leftM: -1, rightM: 1, bottomM: 0, topM: 1 }], skyModel: 'isotropic' as const }
const losses = { glass: { sourceRef: 'explicit-unattenuated-experiment', direct: { lower: 1, upper: 1 }, diffuse: { lower: 1, upper: 1 } }, curtain: { sourceRef: 'explicit-open-curtain-experiment', direct: { lower: 1, upper: 1 }, diffuse: { lower: 1, upper: 1 } } }
const policy = { sourceRef: 'synthetic-coefficient-for-integration-test', unit: 'micromol_per_joule' as const, direct: { lower: 2, upper: 3 }, diffuse: { lower: 4, upper: 5 } }
const day = { date: '2026-10-04', timezone: 'Asia/Shanghai', startMs: Date.parse('2026-10-03T16:00:00Z'), endMs: Date.parse('2026-10-04T16:00:00Z') }
const factor = Math.SQRT2 / Math.PI * Math.atan(1 / Math.SQRT2)

/** unit_fake：在真实字段合同上构造恒定辐射数学场景；不是实际天气或获准转换系数。 */
describe('unit_fake 双通道PPFD和完整当地日期积分', () => {
  const synthetic = (): typeof raw => {
    const edge = structuredClone(raw)
    edge.hourly.time = Array.from({ length: 24 }, (_, i) => day.startMs / 1000 + (i + 1) * 3600)
    edge.hourly.direct_normal_irradiance = Array(24).fill(0)
    edge.hourly.diffuse_radiation = Array(24).fill(200)
    edge.hourly.shortwave_radiation = Array(24).fill(200)
    return edge
  }
  it('恒定已知散射按专属系数换算，24小时积分为PPFD×86400/百万', () => {
    const result = replayIndoorPpfdDay(synthetic(), context, target, losses, policy, day)
    expect(result.total.status).toBe('complete')
    expect(result.total.coveredMs).toBe(86_400_000)
    expect(result.dailyIntegralMolPerM2?.lower).toBeCloseTo(200 * factor * 4 * 86400 / 1_000_000, 10)
    expect(result.dailyIntegralMolPerM2?.upper).toBeCloseTo(200 * factor * 5 * 86400 / 1_000_000, 10)
    expect(result.intervals[0]?.directPpfd).toEqual({ lower: 0, upper: 0 })
    expect(result.intervals[0]?.diffusePpfd?.lower).toBeCloseTo(200 * factor * 4, 10)
    expect(result.productionAdmission).toBe(false)
  })
  it('未知散射换算不猜系数，不把可用直射当完整总量', () => {
    const result = replayIndoorPpfdDay(synthetic(), context, target, losses, { ...policy, diffuse: null }, day)
    expect(result.diffuse.status).toBe('none')
    expect(result.direct.status).toBe('complete')
    expect(result.total.status).toBe('none')
    expect(result.dailyIntegralMolPerM2).toBeNull()
  })
  it('一条缺辐射变为明确缺段，禁止补零或输出全天DLI', () => {
    const edge = synthetic(); edge.hourly.diffuse_radiation[5] = null
    const result = replayIndoorPpfdDay(edge, context, target, losses, policy, day)
    expect(result.total.status).toBe('partial')
    expect(result.total.coveredMs).toBe(23 * 3600_000)
    expect(result.total.missingIntervals).toEqual([{ startMs: day.startMs + 5 * 3600_000, endMs: day.startMs + 6 * 3600_000 }])
    expect(result.dailyIntegralMolPerM2).toBeNull()
  })
  it('只接受完整当地日，不把任意24小时或半日改名DLI', () => {
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, policy, { ...day, startMs: day.startMs + 3600_000 })).toThrow()
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, policy, { ...day, date: '2026-10-05' })).toThrow()
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, policy, { ...day, date: '2026-02-30' })).toThrow()
  })
  it.each([{ lower: -1, upper: 2 }, { lower: 3, upper: 2 }, { lower: 0, upper: Infinity }])('拒绝非法系数区间%s', diffuse => {
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, { ...policy, diffuse }, day)).toThrow()
  })
  it('来源、单位和时区必须明确，不暗用Lux或主机时区', () => {
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, { ...policy, sourceRef: '' }, day)).toThrow()
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, { ...policy, unit: 'lux_per_watt' } as never, day)).toThrow()
    expect(() => replayIndoorPpfdDay(synthetic(), context, target, losses, policy, { ...day, timezone: 'invalid-zone' })).toThrow()
  })
  it('夏令时切换允许23小时的完整当地日，不硬编码24小时', () => {
    const dst = { date: '2026-03-08', timezone: 'America/New_York', startMs: Date.parse('2026-03-08T05:00:00Z'), endMs: Date.parse('2026-03-09T04:00:00Z') }
    const edge = synthetic();edge.timezone='America/New_York';edge.utc_offset_seconds=-14400
    // 同一真实合同字段上的合成23小时区间，所有并列数组同步裁剪。
    for (const key of Object.keys(edge.hourly)) { edge.hourly[key] = edge.hourly[key].slice(0, 23) }
    edge.hourly.time=Array.from({length:23},(_,i)=>dst.startMs/1000+(i+1)*3600)
    expect(replayIndoorPpfdDay(edge, context, target, losses, policy, dst).total.coveredMs).toBe(23*3600_000)
  })
})

/** unit_real_data：实际24时段到双通道PPFD及日覆盖；数值系数仍是明确合成实验，不证明现场光谱或 HTTP。 */
describe('unit_real_data 实际天气完整链路与当地日缺段', () => {
  it('原始制品缺当地日最后一小时，不能产生完整DLI', () => {
    const result = replayIndoorPpfdDay(raw, context, target, losses, policy, day)
    expect(result.total.status).toBe('partial')
    expect(result.total.coveredMs).toBe(23*3600_000)
    expect(result.dailyIntegralMolPerM2).toBeNull()
    expect(result.total.missingIntervals).toEqual([{startMs:day.endMs-3600_000,endMs:day.endMs}])
    result.intervals.forEach((interval,index)=>{
      const dhi=raw.hourly.diffuse_radiation[index]
      if(dhi===null){ expect(interval.diffusePpfd).toBeNull() }else{ expect(interval.diffusePpfd?.lower).toBeCloseTo(dhi*factor*4,10) }
    })
  })
})
