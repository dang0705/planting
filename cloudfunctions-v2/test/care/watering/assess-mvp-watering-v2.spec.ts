import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assessMvpWatering } from '../../../src/care/application/assess-mvp-watering.js'
import { resolveMvpWateringPolicy } from '../../../src/configuration/mvp-watering-policy.js'
import { calculateCanonicalJsonSha256, type CanonicalJsonObject } from '../../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * L3 unit_fake。Expected：用户 2026-10-09 裁决 U6（long-term-care-contract.md §8）+ mvp 矩阵 I1（根区干＋16/12/14 有孔内盆＋泥炭珍珠岩 → 可以浇水 40～300 mL）。
 * v2：「干」观察有效到晚于观察的浇水事实，封顶 72h；v1 兼容：固定 24h。真实组合用例，环境时段为显式输入。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 12)
const policyOf = (version: 'v1' | 'v2') => {
  const body = JSON.parse(readFileSync(join(findProjectRoot(), `cloudfunctions-v2/models/care/mvp-watering-policy-release.${version}.json`), 'utf8')) as CanonicalJsonObject
  const resolution = resolveMvpWateringPolicy({ ...body, releaseVersion: `${version}.0`, contentSha256: calculateCanonicalJsonSha256(body), releaseStatus: 'active', effectiveAt: '2026-10-01T00:00:00Z' }, new Date(now).toISOString())
  if (resolution.status !== 'available') { throw new Error('夹具策略必须可解析') }
  return resolution.snapshot
}
const environment = Array.from({ length: 300 }, (_, i) => ({ start: now - 100 * hour + i * hour, end: now - 99 * hour + i * hour, ppfd: { min: 50, max: 50 }, indoorVpdKpa: { min: 1.4, max: 1.4 } }))
const assess = (version: 'v1' | 'v2', observedHoursAgo: number, lastWateringHoursAgo: number | null = null) => assessMvpWatering({
  policy: policyOf(version), now, baseline: { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } },
  soil: { state: 'dry', scope: 'root_zone', observedAt: now - observedHoursAgo * hour, reliable: true },
  lastConfirmedWateringAt: lastWateringHoursAgo === null ? null : now - lastWateringHoursAgo * hour,
  pot: { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 16, potBottomDiameterCm: 12, potHeightCm: 14 },
  materials: ['peat', 'perlite'], environment, timezone: 'Asia/Shanghai'
})

describe('MVP 浇水 v2 盆土证据有效期', () => {
  it('v2：根区干观察 30 小时前、之后无浇水 → 仍可浇水 40～300 mL', () => {
    const result = assess('v2', 30)
    expect(result.details.action).toBe('water_allowed')
    expect(result.details.amountMl).toEqual({ min: 40, max: 300 })
  })
  it('v2：根区干观察 80 小时前（超过封顶 72h）→ 不再给可以浇水', () => {
    expect(assess('v2', 80).details.action).not.toBe('water_allowed')
  })
  it('v2：根区干观察后又确认浇过水 → 干观察失效，不给可以浇水', () => {
    expect(assess('v2', 30, 10).details.action).not.toBe('water_allowed')
  })
  it('v1 兼容：根区干观察 30 小时前（超过固定 24h）→ 不给可以浇水', () => {
    expect(assess('v1', 30).details.action).not.toBe('water_allowed')
  })
})
