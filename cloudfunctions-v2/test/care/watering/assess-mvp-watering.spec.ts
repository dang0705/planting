import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findProjectRoot } from '../../support/project-root.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../../src/foundation/json/canonical-json-sha256.js'
import { resolveMvpWateringPolicy } from '../../../src/configuration/mvp-watering-policy.js'
import { assessMvpWatering } from '../../../src/care/application/assess-mvp-watering.js'

/**
 * Expected：models/care/mvp-watering-test-matrix.md 第 E 节（合同第1～6节＋独立手算）。
 * 层次 L3 unit_fake：内部协作链全部真实；光照/VPD 时段为显式输入，不经过 Provider、数据库、HTTP。
 */
const day = 86_400_000
const now = Date.UTC(2026, 9, 8, 2)
const payload = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v1.json'), 'utf8')) as CanonicalJsonObject
const resolution = resolveMvpWateringPolicy({ ...payload, releaseVersion: 'care-watering-mvp/v1.0.0',
  contentSha256: calculateCanonicalJsonSha256(payload), releaseStatus: 'active', effectiveAt: '2026-10-01T00:00:00Z' }, new Date(now).toISOString())
if (resolution.status !== 'available') { throw new Error('夹具策略必须可解析') }
const policy = resolution.snapshot
const baseline = { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } } as const
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 16, potBottomDiameterCm: 12, potHeightCm: 14 }
/** 从 start 起每小时一个时段，共 hours 个。 */
function hourly(start: number, hours: number, ppfd: number | null = 50, vpd: number | null = 1.4) {
  return Array.from({ length: hours }, (_, i) => ({ start: start + i * 3_600_000, end: start + (i + 1) * 3_600_000,
    ppfd: ppfd === null ? null : { min: ppfd, max: ppfd }, indoorVpdKpa: vpd === null ? null : { min: vpd, max: vpd } }))
}
const assess = (overrides: Record<string, unknown> = {}) => assessMvpWatering({
  policy, now, baseline, lastConfirmedWateringAt: null, pot, materials: ['peat', 'perlite'],
  soil: { state: 'moist', scope: 'root_zone', observedAt: now, reliable: true },
  environment: hourly(now, 240), timezone: 'Asia/Shanghai', ...overrides,
} as Parameters<typeof assessMvpWatering>[0])
const at = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null)
/** 既有积分把交点按毫秒向后取整（replay-dry-progress.ts:150，保守不早报），浮点下允许 1ms 误差。 */
const expectAtMs = (iso: string | null | undefined, expected: number) => {
  const value = at(iso)
  expect(value).not.toBeNull()
  expect(Math.abs(value! - expected)).toBeLessThanOrEqual(1)
}

describe('MVP 浇水组合用例｜L3 unit_fake', () => {
  it('I1：根区微湿 → 检查窗口 +1～+6 天，当地日期 10-09～10-14，无水量，低置信', () => {
    const result = assess()
    expect(result).toMatchObject({ capabilityType: 'watering', status: 'ready', confidence: 'low' })
    expect(result.details.action).toBe('check_later')
    expectAtMs(result.details.checkWindow?.earliestAt, now + day)
    expectAtMs(result.details.checkWindow?.latestAt, now + 6 * day)
    expect(result.details.checkWindow).toMatchObject({ purpose: 'soil_check', timezone: 'Asia/Shanghai', earliestDate: '2026-10-09', latestDate: '2026-10-14' })
    expect(result.details.amountMl).toBeNull()
    expect(result.evidenceSummary.join('')).toContain('文献')
  })
  it('I1：根区干＋有孔内盆＋泥炭珍珠岩 → 可以浇水，建议 40～300mL', () => {
    const result = assess({ soil: { state: 'dry', scope: 'root_zone', observedAt: now, reliable: true } })
    expect(result.status).toBe('ready')
    expect(result.details.action).toBe('water_allowed')
    expect(result.details.amountMl).toEqual({ min: 40, max: 300 })
    expect(result.details.netDeficitMl?.min).toBeCloseTo(31.967, 2)
    expect(result.details.netDeficitMl?.max).toBeCloseTo(241.607, 2)
  })
  it('I1：无观察、2 天前确认浇水 → 窗口 +2～+8 天', () => {
    const result = assess({ soil: null, lastConfirmedWateringAt: now - 2 * day, environment: hourly(now - 2 * day, 24 * 12) })
    expect(result.details.action).toBe('check_later')
    expectAtMs(result.details.checkWindow?.earliestAt, now + 2 * day)
    expectAtMs(result.details.checkWindow?.latestAt, now + 8 * day)
  })
  it('I2：无活动发布 → 暂不可用，不给行动建议', () => {
    const result = assess({ policy: null })
    expect(result.status).toBe('temporarily_unavailable')
    expect(result.recommendedActions).toEqual([])
    expect(result.details.amountMl).toBeNull()
  })
  it('I2：无植物基线 → 缺证据', () => {
    const result = assess({ baseline: null })
    expect(result.status).toBe('insufficient_evidence')
    expect(result.details.checkWindow).toBeNull()
  })
  it('I2：无观察也无浇水记录 → 缺证据，不以今天补起点', () => {
    const result = assess({ soil: null })
    expect(result.status).toBe('insufficient_evidence')
    expect(result.details.checkWindow).toBeNull()
  })
  it('I2：无室内 VPD 时用兜底区间，窗口变宽（最早 <1 天，最晚 >6 天）', () => {
    const result = assess({ environment: hourly(now, 240, 50, null) })
    expect(result.status).toBe('ready')
    expect(at(result.details.checkWindow?.earliestAt)!).toBeLessThan(now + day)
    expect(at(result.details.checkWindow?.latestAt)!).toBeGreaterThan(now + 6 * day)
  })
  it('I2：环境只覆盖 3 天 → 最早端存在，最晚端开放', () => {
    const result = assess({ environment: hourly(now, 72) })
    expectAtMs(result.details.checkWindow?.earliestAt, now + day)
    expect(result.details.checkWindow?.latestAt).toBeNull()
  })
  it('方向：光照翻倍使最早检查时刻提前', () => {
    const brighter = assess({ environment: hourly(now, 240, 100) })
    expect(at(brighter.details.checkWindow?.earliestAt)!).toBeLessThan(now + day)
  })
  it('Reverse：根区湿 → 暂停浇水，不给水量', () => {
    const result = assess({ soil: { state: 'wet', scope: 'root_zone', observedAt: now, reliable: true } })
    expect(result.details.action).toBe('pause_watering')
    expect(result.details.amountMl).toBeNull()
  })
  it('Reverse：根区干但无排水孔 → 检查排水，不给水量', () => {
    const result = assess({ soil: { state: 'dry', scope: 'root_zone', observedAt: now, reliable: true }, pot: { ...pot, drainageAvailable: false } })
    expect(result.details.action).toBe('review_drainage')
    expect(result.details.amountMl).toBeNull()
  })
  it('I3：结果不含策略摘要、来源路径或内部引用', () => {
    const serialized = JSON.stringify(assess({ soil: { state: 'dry', scope: 'root_zone', observedAt: now, reliable: true } }))
    expect(serialized).not.toContain(policy.contentSha256)
    expect(serialized).not.toContain('mvp-literature-parameters')
    expect(serialized).not.toContain('care-watering-mvp/v1.0.0')
  })
})
