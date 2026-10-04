import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { replaySolarWindowRadiation } from '../../src/care/application/replay-solar-window-radiation.js'

const fixture = path.join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json')
const raw = JSON.parse(fs.readFileSync(fixture, 'utf8'))
const context = { series: 'hourly' as const, sourceRef: 'real-public-shanghai-fixture', fetchedAtMs: 1000 }
const location = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'south-window-exterior', tiltDeg: 90, azimuthDeg: 180 } }

/** L3 unit_real_data：真实Provider制品→归一化→模型全时段界限→均值回放；不替换领域计算。 */
describe('unit_real_data 太阳时序到真实均值辐射；Expected：完整时段数学界限及来源合同', () => {
  it('24条真实时段全部匹配，模型限定声明与太阳地点分别保留', () => {
    const result = replaySolarWindowRadiation(raw, context, location)
    expect(result.scope).toBe('model_only')
    expect(result.location).toEqual({ latitudeDeg: 31.23, longitudeDeg: 121.47 })
    expect(result.geometryBounds).toHaveLength(24)
    expect(result.radiation.intervals).toHaveLength(24)
    expect(result.radiation.intervals.every(x => x.state === 'bounded')).toBe(true)
    expect(result.radiation).toMatchObject({ sourceRef: context.sourceRef, timezone: 'Asia/Shanghai', referencePlane: 'south-window-exterior' })
    for (let i = 0; i < 24; i++) {
      expect(result.geometryBounds[i]!.intervalEndMs).toBe(raw.hourly.time[i] * 1000)
      expect(result.geometryBounds[i]!.scope).toBe('model_only')
      expect(result.radiation.intervals[i]!.directWattsPerM2!.lower).toBeGreaterThanOrEqual(0)
      expect(result.radiation.intervals[i]!.directWattsPerM2!.upper).toBeLessThanOrEqual(raw.hourly.direct_normal_irradiance[i])
    }
    expect(result).not.toHaveProperty('dli')
    expect(result).not.toHaveProperty('algorithmRelease')
  })
  it('制品午夜区间确实处于夜间，太阳几何不是手动全域默认', () => {
    const result = replaySolarWindowRadiation(raw, context, location)
    expect(result.geometryBounds[0]).toMatchObject({ lower: 0, upper: 0 })
    expect(result.radiation.intervals[0]).toMatchObject({ directWattsPerM2: { lower: 0, upper: 0 } })
  })
  it('DNI缺失保留missing_radiation，不产生零辐射', () => {
    const candidate = structuredClone(raw); candidate.hourly.direct_normal_irradiance[14] = null
    expect(replaySolarWindowRadiation(candidate, context, location).radiation.intervals[14]).toMatchObject({ state: 'missing_radiation', directWattsPerM2: null })
  })
  it('非法地点即使全部辐射为0也拒绝', () => {
    expect(() => replaySolarWindowRadiation(raw, context, { ...location, latitudeDeg: NaN })).toThrow('位置')
  })
  it('非法原始单位仍由归一化器拒绝，不绕过源合同', () => {
    const candidate = structuredClone(raw); candidate.hourly_units.time = 'iso8601'
    expect(() => replaySolarWindowRadiation(candidate, context, location)).toThrow()
  })
  it.each([
    { ...location, latitudeDeg: NaN },
    { ...location, longitudeDeg: 181 },
    { ...location, plane: { ...location.plane, tiltDeg: -1 } },
  ])('空辐射序列也拒绝非法地点或窗面', site => {
    const candidate = structuredClone(raw)
    for (const field of Object.keys(candidate.hourly)) { candidate.hourly[field] = [] }
    expect(() => replaySolarWindowRadiation(candidate, context, site)).toThrow()
  })
  it('合法空序列保留无覆盖，不伪造太阳时段', () => {
    const candidate = structuredClone(raw)
    for (const field of Object.keys(candidate.hourly)) { candidate.hourly[field] = [] }
    const result = replaySolarWindowRadiation(candidate, context, location)
    expect(result.geometryBounds).toEqual([])
    expect(result.radiation.intervals).toEqual([])
  })
  it('输入制品、地点和窗面不修改', () => {
    const candidate = structuredClone(raw); const site = structuredClone(location); const before = structuredClone([candidate, site])
    replaySolarWindowRadiation(candidate, context, site)
    expect([candidate, site]).toEqual(before)
  })
})
