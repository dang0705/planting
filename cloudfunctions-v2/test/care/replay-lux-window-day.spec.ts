import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { replayLuxWindowDay } from '../../src/care/application/replay-lux-window-day.js'

const start = Date.parse('2026-10-03T16:00:00Z')
const context = { series: 'hourly' as const, sourceRef: 'explicit-math-fixture', fetchedAtMs: start }
const site = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'south-window', tiltDeg: 90, azimuthDeg: 180 } }
const day = { date: '2026-10-04', timezone: 'Asia/Shanghai', startMs: start, endMs: start + 86_400_000 }
const base = () => ({
  raw: { timezone: 'Asia/Shanghai', utc_offset_seconds: 28800, hourly_units: { time: 'unixtime', shortwave_radiation: 'W/m²', direct_normal_irradiance: 'W/m²', diffuse_radiation: 'W/m²' }, hourly: { time: Array.from({ length: 24 }, (_, i) => start / 1000 + (i + 1) * 3600), shortwave_radiation: Array(24).fill(100), direct_normal_irradiance: Array(24).fill(0), diffuse_radiation: Array(24).fill(100) } },
  context, location: site, day, plantReference: 'plant-position', skyModel: 'isotropic' as const,
  observation: { atMs: start + 43_200_000, plantReference: 'plant-position', sourceRef: 'synthetic-meter', source: 'meter' as const, confirmed: true, unit: 'lux' as const, lux: { lower: 10, upper: 10 } },
  instant: { atMs: start + 43_200_000, sourceRef: 'synthetic-instant', semantics: 'instantaneous' as const, unit: 'W/m²' as const, dniWattsPerM2: { lower: 0, upper: 0 }, dhiWattsPerM2: { lower: 100, upper: 100 } },
  conversion: { sourceRef: 'explicit-experiment-not-released', luxPerWattPerM2: { direct: { lower: 2, upper: 2 }, diffuse: { lower: 2, upper: 2 } }, micromolPerJoule: { direct: { lower: 4, upper: 4 }, diffuse: { lower: 4, upper: 4 } } },
})

/** L3 unit_fake：真模块完整协作，无替身；独立Expected见离线数学合同。 */
describe('unit_fake 极简Lux连接SunCalc和双通道日回放', () => {
  it('只有位置、朝向和Lux的用户事实即可连接，不需要专业衰减输入', () => {
    const result = replayLuxWindowDay(base())
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('合成制品应可回放') }
    expect(result.productionAdmission).toBe(false)
    expect(result.anchor.factor.lower).toBeCloseTo(0.1, 12)
    expect(result.intervals).toHaveLength(24)
    expect(result.intervals[0]!.diffusePpfd!.lower).toBeCloseTo(20, 12)
    expect(result.intervals[0]!.directPpfd).toEqual({ lower: 0, upper: 0 })
    expect(result.dailyIntegralMolPerM2!.lower).toBeCloseTo(1.728, 10)
    expect(result.solar.intervals[0]!.samples[0]!.solarMethod).toBe('suncalc@2.1.0')
    expect(result).not.toHaveProperty('glass')
  })
  it('有完整辐射但Lux不可靠时不默认为无衰减', () => {
    expect(replayLuxWindowDay({ ...base(), observation: { ...base().observation, source: 'experimental_camera' } })).toMatchObject({ status: 'insufficient_evidence', anchor: { reason: 'experimental_source' }, productionAdmission: false })
  })
  it('同刻瞬时缺DHI，不能借小时均值补标定', () => {
    expect(replayLuxWindowDay({ ...base(), instant: { ...base().instant, dhiWattsPerM2: null } })).toMatchObject({ status: 'insufficient_evidence', anchor: { reason: 'missing_lux' } })
  })
  it('缺少平均DHI保留未知，单通道可用不等于全天完整', () => {
    const input = base(); input.raw.hourly.diffuse_radiation[4] = null
    const result = replayLuxWindowDay(input)
    if (result.status !== 'available') { throw new Error('锚点仍可用') }
    expect(result.intervals[4]!.diffusePpfd).toBeNull()
    expect(result.intervals[4]!.totalPpfd).toBeNull()
    expect(result.total.coveredMs).toBe(23 * 3600_000)
    expect(result.dailyIntegralMolPerM2).toBeNull()
  })
  it('平均参考、错时刻、错单位与地点时区拒绝', () => {
    for (const input of [
      { ...base(), instant: { ...base().instant, semantics: 'interval_mean' } },
      { ...base(), instant: { ...base().instant, atMs: base().instant.atMs + 1 } },
      { ...base(), instant: { ...base().instant, unit: 'lux' } },
      { ...base(), day: { ...day, timezone: 'UTC', date: '2026-10-04', startMs: Date.parse('2026-10-04T00:00:00Z'), endMs: Date.parse('2026-10-05T00:00:00Z') } },
    ]) { expect(() => replayLuxWindowDay(input as never)).toThrow() }
  })
  it('全零平均天气是有效积分零，不是缺失', () => {
    const input = base(); input.raw.hourly.diffuse_radiation.fill(0)
    const result = replayLuxWindowDay(input)
    if (result.status !== 'available') { throw new Error('锚点仍可用') }
    expect(result.dailyIntegralMolPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('空天气仍校验当地日和地点，合法空序列无覆盖', () => {
    const input = base(); for (const key of Object.keys(input.raw.hourly)) { input.raw.hourly[key as keyof typeof input.raw.hourly] = [] }
    expect(() => replayLuxWindowDay({ ...input, day: { ...day, startMs: start + 1 } })).toThrow()
    expect(() => replayLuxWindowDay({ ...input, location: { ...site, latitudeDeg: NaN } })).toThrow()
    const result = replayLuxWindowDay(input)
    if (result.status !== 'available') { throw new Error('锚点仍可用') }
    expect(result.total.status).toBe('none')
    expect(result.dailyIntegralMolPerM2).toBeNull()
  })
  it('午夜跳时的真实当地日从01:00开始，仍按23小时积分', () => {
    // IANA America/Sao_Paulo 2018-11-04午夜跳时；明确UTC边界，不用SUT生成Expected。
    const input = base(); const begin = 1_541_300_400_000; const end = 1_541_383_200_000
    input.day = { date: '2018-11-04', timezone: 'America/Sao_Paulo', startMs: begin, endMs: end }
    input.raw.timezone = 'America/Sao_Paulo'; input.raw.utc_offset_seconds = -7200
    input.raw.hourly = { time: Array.from({ length: 23 }, (_, i) => begin / 1000 + (i + 1) * 3600), shortwave_radiation: Array(23).fill(100), direct_normal_irradiance: Array(23).fill(0), diffuse_radiation: Array(23).fill(100) }
    input.location = { latitudeDeg: -23.55, longitudeDeg: -46.63, plane: { ...site.plane } }
    input.observation.atMs = begin + 43_200_000; input.instant.atMs = input.observation.atMs
    const result = replayLuxWindowDay(input)
    if (result.status !== 'available') { throw new Error('合成锚点应可用') }
    expect(result.total.coveredMs).toBe(82_800_000)
    expect(result.dailyIntegralMolPerM2!.lower).toBeCloseTo(1.656, 10)
  })
  it('锁定标定输入，调用后修改事实也不改历史回放', () => {
    const input = base(); const result = replayLuxWindowDay(input)
    if (result.status !== 'available') { throw new Error('数学制品应可用') }
    input.observation.lux.lower = 99; input.instant.dhiWattsPerM2.lower = 999; input.location.plane.azimuthDeg = 0
    expect(result.calibration.observation.lux).toEqual({ lower: 10, upper: 10 })
    expect(result.calibration.instant.dhiWattsPerM2).toEqual({ lower: 100, upper: 100 })
    expect(result.calibration.location.plane.azimuthDeg).toBe(180)
  })
  it('调用不修改制品与事实', () => {
    const input = base(); const before = structuredClone(input)
    replayLuxWindowDay(input)
    expect(input).toEqual(before)
  })
})

/** L3 unit_real_data：真实平均天气制品；Lux/瞬时值仍是合成制品，不能冒充现场测量。 */
describe('unit_real_data 保存天气到Lux锚点日回放', () => {
  it('原制品在当地日只有23小时，不伪造全天DLI', () => {
    const raw = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))
    const result = replayLuxWindowDay({ ...base(), raw, context: { ...context, sourceRef: 'saved-open-meteo-hourly-radiation' } })
    if (result.status !== 'available') { throw new Error('合成锚点应可回放') }
    expect(result.solar.radiation.sourceRef).toBe('saved-open-meteo-hourly-radiation')
    expect(result.total.coveredMs).toBe(23 * 3600_000)
    expect(result.total.status).toBe('partial')
    expect(result.dailyIntegralMolPerM2).toBeNull()
    expect(result.solar.intervals[14]!.samples.every(x => x.solarMethod === 'suncalc@2.1.0')).toBe(true)
  })
})
