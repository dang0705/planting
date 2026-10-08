import { describe, expect, it } from 'vitest'
import { deriveMvpPlantLightIntervals } from '../../../src/care/watering/derive-mvp-plant-light.js'

/**
 * Expected：models/care/mvp-watering-test-matrix.md 第 H 节（合同 2a 节单通道比例法＋手算）。
 * 层次 L1 unit_fake：辐射为已标准化对象，不经过网络或数据库。
 */
const hour = 3_600_000
const t0 = Date.UTC(2026, 9, 8, 0)
const policy = { luxPerPpfd: { min: 50, max: 58 }, luxAnchorMinGhiWm2: 50,
  luxUncertainty: { meter: 0.1, camera_estimate: 0.3 }, luxAnchorMaxAgeDays: 30 }
const interval = (i: number, ghi: number | null) => ({ intervalStartMs: t0 + i * hour, intervalEndMs: t0 + (i + 1) * hour,
  semantics: 'interval_mean' as const, ghiWattsPerM2: ghi, dniWattsPerM2: null, dhiWattsPerM2: null })
const radiation = (ghis: readonly (number | null)[]) => ({ sourceRef: 'open_meteo', fetchedAtMs: t0, timezone: 'Asia/Shanghai',
  utcOffsetSeconds: 28800, resolutionMs: hour, series: 'hourly' as const, evidenceKind: 'model_estimate_or_forecast' as const,
  intervals: ghis.map((ghi, i) => interval(i, ghi)) })
const reading = (lux: number, source: 'meter' | 'camera_estimate' = 'meter', at = t0 + 30 * 60_000) => ({ lux, measuredAtMs: at, source })
const derive = (overrides: Record<string, unknown> = {}) => deriveMvpPlantLightIntervals({
  policy, radiation: radiation([200, 400, 0, null]), lightReading: reading(1080), indoorClimate: null, now: t0 + 2 * hour, ...overrides,
} as Parameters<typeof deriveMvpPlantLightIntervals>[0])

describe('MVP 单通道植物光照｜L1 unit_fake', () => {
  it('Happy：测光仪 1080 lux、测量时段 GHI=200 → GHI=400 时段 PPFD 33.52～47.52，GHI=0 时段为 0，缺 GHI 时段跳过', () => {
    const result = derive()
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('unreachable') }
    expect(result.intervals.map(item => item.start)).toEqual([t0, t0 + hour, t0 + 2 * hour])
    expect(result.intervals[0]!.ppfd!.min).toBeCloseTo(16.7586, 3)
    expect(result.intervals[0]!.ppfd!.max).toBeCloseTo(23.76, 3)
    expect(result.intervals[1]!.ppfd!.min).toBeCloseTo(33.5172, 3)
    expect(result.intervals[1]!.ppfd!.max).toBeCloseTo(47.52, 3)
    expect(result.intervals[2]!.ppfd).toEqual({ min: 0, max: 0 })
    expect(result.intervals.every(item => item.indoorVpdKpa === null)).toBe(true)
  })
  it('U2：摄像头估算 ±30% → 测量时段 PPFD 12.07～26.0', () => {
    const result = derive({ lightReading: reading(1000, 'camera_estimate') })
    if (result.status !== 'available') { throw new Error('unreachable') }
    expect(result.intervals[0]!.ppfd!.min).toBeCloseTo(12.069, 3)
    expect(result.intervals[0]!.ppfd!.max).toBeCloseTo(26, 3)
  })
  it('U1：无 Lux 或测量时刻不在辐射覆盖内 → 缺证据', () => {
    expect(derive({ lightReading: null })).toEqual({ status: 'insufficient_evidence', reason: 'light_reading' })
    expect(derive({ lightReading: reading(1080, 'meter', t0 + 10 * hour), now: t0 + 11 * hour }))
      .toEqual({ status: 'insufficient_evidence', reason: 'anchor_radiation' })
    expect(derive({ radiation: radiation([null, 400]) })).toEqual({ status: 'insufficient_evidence', reason: 'anchor_radiation' })
  })
  it('U3：测量时段太暗、读数与室外矛盾或读数过期 → 缺证据', () => {
    expect(derive({ radiation: radiation([40, 400]) })).toEqual({ status: 'insufficient_evidence', reason: 'anchor_too_dark' })
    expect(derive({ lightReading: reading(30000) })).toEqual({ status: 'insufficient_evidence', reason: 'anchor_inconsistent' })
    expect(derive({ now: t0 + 31 * 24 * hour })).toEqual({ status: 'insufficient_evidence', reason: 'light_reading_stale' })
  })
  it('U2 VPD：室内 23.5°C/45% 实测只用于测量后 24 小时内的时段', () => {
    const measuredAtMs = t0 + hour
    const result = derive({ radiation: radiation([200, 400, 0, 100, ...Array(24).fill(100)]),
      indoorClimate: { temperatureC: 23.5, relativeHumidityPercent: 45, measuredAtMs }, now: t0 + 2 * hour })
    if (result.status !== 'available') { throw new Error('unreachable') }
    const byStart = new Map(result.intervals.map(item => [item.start, item.indoorVpdKpa]))
    expect(byStart.get(t0)).toBeNull()
    expect(byStart.get(t0 + hour)!.min).toBeCloseTo(1.5925, 3)
    expect(byStart.get(t0 + 24 * hour)!.max).toBeCloseTo(1.5925, 3)
    expect(byStart.get(t0 + 25 * hour)).toBeNull()
  })
})
