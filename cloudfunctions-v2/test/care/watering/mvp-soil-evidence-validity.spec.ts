import { describe, expect, it } from 'vitest'

import { resolveMvpSoilEvidenceValidUntil } from '../../../src/care/watering/resolve-mvp-soil-evidence-validity.js'
import { resolveMvpMoistureGroup } from '../../../src/care/watering/resolve-mvp-moisture-group.js'

/**
 * L1 unit_fake。Expected：用户 2026-10-09 裁决 U6 与 long-term-care-contract.md §8（独立手算）：
 * 湿/微湿 → 以最快干燥速率消耗「(该状态剩余比例上界 − 下界) × 基线下端」所需时间；推不出 → 观察 + 24h；
 * 干（含仅表土干）→ 有效到晚于观察时刻的已确认浇水事实；统一封顶 72h；v1 → 观察 + 固定 TTL。
 * 夹具：环境需求、栽培保水、个体校准恒为 1 → 每参考日消耗 1 个等效单位；基线 [5, 8]。
 */
const hour = 3_600_000
const observedAt = Date.UTC(2026, 9, 9, 0)
const remainingFraction = { wet: { min: 0.6, max: 1 }, moist: { min: 0.25, max: 0.6 }, surfaceDryOnly: { min: 0, max: 0.5 } }
const v2 = { contractVersion: 'care-watering-mvp/v2' as const, soilEvidenceFallbackHours: 24, soilEvidenceMaxHours: 72, remainingFraction }
const v1 = { contractVersion: 'care-watering-mvp/v1' as const, soilEvidenceTtlHours: 24, remainingFraction }
const baseline = { min: 5, max: 8 }
const group = resolveMvpMoistureGroup('regular', 'SURFACE_DRY')
function hourly(demand: number, hours = 400) {
  const one = { min: 1, max: 1 }
  return Array.from({ length: hours }, (_, i) => ({ start: observedAt + i * hour, end: observedAt + (i + 1) * hour,
    environmentDemand: { min: demand, max: demand }, cultivationRetention: one, personalCalibration: one }))
}
const resolve = (state: 'wet' | 'moist' | 'dry', overrides: Record<string, unknown> = {}) => resolveMvpSoilEvidenceValidUntil({
  policy: v2, baseline, group, observation: { state, scope: 'root_zone', observedAt, reliable: true },
  intervals: hourly(1), lastConfirmedWateringAt: null, ...overrides
} as Parameters<typeof resolveMvpSoilEvidenceValidUntil>[0])

describe('盆土证据有效期 care-watering-mvp/v2', () => {
  it('湿：跨度 (1−0.6)×5 = 2 单位，速率 1/天 → 48 小时', () => expect(resolve('wet')).toBe(observedAt + 48 * hour))
  it('微湿：跨度 (0.6−0.25)×5 = 1.75 单位 → 42 小时', () => expect(resolve('moist')).toBe(observedAt + 42 * hour))
  it('湿：慢速（需求 0.25/天 → 8 天）封顶 72 小时', () => expect(resolve('wet', { intervals: hourly(0.25) })).toBe(observedAt + 72 * hour))
  it('湿：无环境段或环境段不从观察时刻连续覆盖 → 回退 24 小时', () => {
    expect(resolve('wet', { intervals: [] })).toBe(observedAt + 24 * hour)
    expect(resolve('moist', { intervals: hourly(1).slice(3) })).toBe(observedAt + 24 * hour)
  })
  it('干：无后续浇水 → 封顶 72 小时；观察之后浇水 → 到浇水时刻；观察之前的浇水不影响', () => {
    expect(resolve('dry')).toBe(observedAt + 72 * hour)
    expect(resolve('dry', { lastConfirmedWateringAt: observedAt + 10 * hour })).toBe(observedAt + 10 * hour)
    expect(resolve('dry', { lastConfirmedWateringAt: observedAt - 5 * hour })).toBe(observedAt + 72 * hour)
  })
  it('仅表土干（干透型植物）同样按「干」处理', () => {
    const fullDry = resolveMvpMoistureGroup('drought_tolerant', 'FULL_DRY')
    expect(resolve('dry', { group: fullDry, observation: { state: 'dry', scope: 'surface', observedAt, reliable: true } })).toBe(observedAt + 72 * hour)
  })
  it('v1 → 观察 + 固定 TTL', () => expect(resolve('wet', { policy: v1 })).toBe(observedAt + 24 * hour))
})
