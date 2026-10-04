import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { replayWindowDirectRadiation } from '../../src/care/application/replay-window-direct-radiation.js'
import { findProjectRoot } from '../support/project-root.js'

/** L3：真实归一化器与数学界限组合；外部请求由原始已取得制品替代，无数据库/生产HTTP。 */
const fixtureDirectory = path.join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures')
const rawText = readFileSync(path.join(fixtureDirectory, 'open-meteo-hourly-radiation.json'), 'utf8')
const raw = JSON.parse(rawText)
const metadata = JSON.parse(readFileSync(path.join(fixtureDirectory, 'open-meteo-hourly-radiation.metadata.json'), 'utf8'))
const context = { series: 'hourly' as const, sourceRef: 'fixture:open-meteo-hourly-radiation', fetchedAtMs: Date.parse(metadata.fetchedAt) }
const referencePlane = 'explicit-window-exterior'
const envelope = (endSeconds: number) => ({ intervalStartMs: endSeconds * 1000 - 3600000, intervalEndMs: endSeconds * 1000, semantics: 'whole_interval_bound' as const, referencePlane, evidenceRef: 'physical-envelope-zero-to-one', lower: 0, upper: 1 })
const geometry = () => raw.hourly.time.map(envelope)

describe('unit_real_data 窗面直射回放；Expected：真实Provider制品、独立物理包络与离线合同', () => {
  it('原始制品哈希正确，24条均值保留来源与UTC时间，不加时区偏移', () => {
    expect(createHash('sha256').update(rawText).digest('hex')).toBe(metadata.sha256)
    const result = replayWindowDirectRadiation(raw, context, referencePlane, geometry())
    expect(result.intervals).toHaveLength(24)
    expect(result.intervals[0]).toMatchObject({ intervalStartMs: 1791039600000, intervalEndMs: 1791043200000, state: 'bounded', directWattsPerM2: { lower: 0, upper: 0 } })
    expect(result).toMatchObject({ sourceRef: context.sourceRef, fetchedAtMs: context.fetchedAtMs, timezone: 'Asia/Shanghai', utcOffsetSeconds: 28800, evidenceKind: 'model_estimate_or_forecast', referencePlane })
    expect(result).not.toHaveProperty('dli')
    expect(result).not.toHaveProperty('midpoint')
    for (let i = 0; i < 24; i++) {
      expect(result.intervals[i]!.directWattsPerM2).toEqual({ lower: 0, upper: raw.hourly.direct_normal_irradiance[i] })
      expect(result.intervals[i]!.geometryEvidenceRef).toBe('physical-envelope-zero-to-one')
    }
  })
  it('缺几何不能偷偷补0至1，保留所有真实辐射时段', () => {
    const result = replayWindowDirectRadiation(raw, context, referencePlane, [])
    expect(result.intervals).toHaveLength(24)
    expect(result.intervals.every(x => x.state === 'missing_geometry_bound' && x.directWattsPerM2 === null && x.geometryEvidenceRef === null)).toBe(true)
  })
  it('仅部分几何时段匹配，其余标缺失', () => {
    const result = replayWindowDirectRadiation(raw, context, referencePlane, [envelope(raw.hourly.time[0])])
    expect(result.intervals[0]!.state).toBe('bounded')
    expect(result.intervals[1]!.state).toBe('missing_geometry_bound')
  })
  it('DNI缺失时与有效零区分，已验证几何来源保留', () => {
    const candidate = structuredClone(raw)
    candidate.hourly.direct_normal_irradiance[0] = null
    const result = replayWindowDirectRadiation(candidate, context, referencePlane, geometry())
    expect(result.intervals[0]).toMatchObject({ state: 'missing_radiation', directWattsPerM2: null, geometryEvidenceRef: 'physical-envelope-zero-to-one' })
    expect(result.intervals[1]).toMatchObject({ state: 'bounded', directWattsPerM2: { lower: 0, upper: 0 } })
  })
  it('辐射与几何都缺失时同时记录两种缺口', () => {
    const candidate = structuredClone(raw)
    candidate.hourly.direct_normal_irradiance[0] = null
    expect(replayWindowDirectRadiation(candidate, context, referencePlane, []).intervals[0]!.missingInputs).toEqual(['geometry', 'dni'])
  })
  it('重复几何即使相同也拒绝，不设置隐式优先级', () => {
    const one = envelope(raw.hourly.time[0])
    expect(() => replayWindowDirectRadiation(raw, context, referencePlane, [one, one])).toThrow('重复')
  })
  it('几何的窗面错配拒绝，不把另一个窗口当作目标', () => {
    expect(() => replayWindowDirectRadiation(raw, context, referencePlane, [{ ...envelope(raw.hourly.time[0]), referencePlane: 'another-window' }])).toThrow('窗面')
  })
  it('未使用的几何时段或只错1毫秒也拒绝', () => {
    expect(() => replayWindowDirectRadiation(raw, context, referencePlane, [envelope(0)])).toThrow('时段')
    expect(() => replayWindowDirectRadiation(raw, context, referencePlane, [{ ...envelope(raw.hourly.time[0]), intervalStartMs: 1791039600001 }])).toThrow('时段')
  })
  it('无效几何不能因DNI缺失而跳过校验', () => {
    const candidate = structuredClone(raw)
    candidate.hourly.direct_normal_irradiance[0] = null
    expect(() => replayWindowDirectRadiation(candidate, context, referencePlane, [{ ...envelope(raw.hourly.time[0]), upper: 2 }])).toThrow('几何')
  })
  it('空参考平面拒绝', () => {
    expect(() => replayWindowDirectRadiation(raw, context, ' ', [])).toThrow('窗面')
  })
  it('Provider单位错误由真实归一化器拒绝，错误不回显原始制品', () => {
    const candidate = structuredClone(raw)
    candidate.hourly_units.direct_normal_irradiance = 'secret-wrong-unit'
    expect(() => replayWindowDirectRadiation(candidate, context, referencePlane, geometry())).toThrow()
    try { replayWindowDirectRadiation(candidate, context, referencePlane, geometry()) } catch (error) { expect(String(error)).not.toContain('secret-wrong-unit') }
  })
  it('乱序几何按时段匹配，不按数组下标；不修改制品或几何', () => {
    const input = structuredClone(raw)
    const bounds = geometry().map((value: ReturnType<typeof envelope>) => ({ ...value, evidenceRef: `interval-${value.intervalEndMs}` })).reverse()
    const before = structuredClone([input, bounds])
    const result = replayWindowDirectRadiation(input, context, referencePlane, bounds)
    expect(result.intervals[0]!.intervalEndMs).toBe(1791043200000)
    expect(result.intervals.every(x => x.state === 'bounded')).toBe(true)
    for (const interval of result.intervals) {
      expect(interval.geometryEvidenceRef).toBe(`interval-${interval.intervalEndMs}`)
    }
    expect([input, bounds]).toEqual(before)
  })
  it('独立已提供几何上下界进入真实非零辐射结果，不总是返回普适包络', () => {
    const bounds = geometry()
    bounds[14] = { ...bounds[14], lower: 0.2, upper: 0.6 }
    const result = replayWindowDirectRadiation(raw, context, referencePlane, bounds)
    // 制品第14项DNI为25，依据非负积分不等式为[5,15]。
    expect(result.intervals[14]!.directWattsPerM2).toEqual({ lower: 5, upper: 15 })
  })
})
