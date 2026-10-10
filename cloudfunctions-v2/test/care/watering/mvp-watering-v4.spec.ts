import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { assessMvpWatering } from '../../../src/care/application/assess-mvp-watering.js'
import { resolveMvpWateringRuntimeRules } from '../../../src/configuration/mvp-watering-policy.js'
import type { CanonicalJsonObject } from '../../../src/foundation/json/canonical-json-sha256.js'
import { findProjectRoot } from '../../support/project-root.js'
import { approvedV3Body, releaseBody, resolvedPolicy } from './v3-policy-fixture.js'

/**
 * L3 / unit_fake（真实 assessMvpWatering → 干燥积分 → 结果投影；环境时段为显式输入）。
 * Expected 来源：用户 2026-10-10 裁定「缺段补齐 6 小时与光照系数并入现有浇水策略新版本 care-watering-mvp/v4，v3 行为保持可复算」；
 * 配置目录 care.watering.drying_gap_fill_max_hours=6、care.watering.plant_light_max_ppfd_per_ghi=2.3、care.watering.indoor_climate_window_hours=24。
 * v4 正文 = v3 已审定正文 + 三个运行字段（取值等于原代码常量），因此同一输入下 v4 与 v3 的公开结果必须完全一致。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 10, 2)
const v4Body = JSON.parse(readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/models/care/mvp-watering-policy-release.v4.json'), 'utf8')) as CanonicalJsonObject
const v3 = resolvedPolicy(approvedV3Body(), now)
const v4 = resolvedPolicy(v4Body, now)
const v2 = resolvedPolicy(releaseBody('v2'), now)

type AssessInput = Parameters<typeof assessMvpWatering>[0]
/** 30 天逐小时参考环境，可在指定小时段制造 PPFD 缺段。 */
function environment(gap: readonly [number, number] | null) {
  return Array.from({ length: 24 * 30 }, (_, i) => ({ start: now + i * hour, end: now + (i + 1) * hour,
    ppfd: gap !== null && i >= gap[0] && i < gap[0] + gap[1] ? null : { min: 50, max: 50 }, indoorVpdKpa: { min: 1.4, max: 1.4 } }))
}
const assess = (policy: typeof v3, gap: readonly [number, number] | null) => assessMvpWatering({
  policy, now, baseline: { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } },
  soil: { state: 'moist', scope: 'root_zone', observedAt: now, reliable: true }, lastConfirmedWateringAt: null,
  pot: { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 15, potBottomDiameterCm: 11, potHeightCm: 13 },
  materials: ['peat'], environment: environment(gap), timezone: 'Asia/Shanghai',
} as unknown as AssessInput)
/** 去掉随版本变化的元数据，只比较公开计算结果。 */
const comparable = (result: ReturnType<typeof assess>) => {
  const { policyVersion: _policyVersion, ...rest } = result as unknown as Record<string, unknown>
  return rest
}

describe('care-watering-mvp/v4：运行参数并入浇水策略', () => {
  it('v4 正文 = v3 审定正文 + 三个运行字段（取值等于原代码常量）', () => {
    const { contractVersion: v4Version, dryingGapFillMaxHours, maximumPpfdPerGhi, indoorClimateWindowHours, ...v4Rest } = v4Body as Record<string, unknown>
    const { contractVersion: v3Version, ...v3Rest } = approvedV3Body() as Record<string, unknown>
    expect([v4Version, v3Version]).toEqual(['care-watering-mvp/v4', 'care-watering-mvp/v3'])
    expect({ dryingGapFillMaxHours, maximumPpfdPerGhi, indoorClimateWindowHours }).toEqual({ dryingGapFillMaxHours: 6, maximumPpfdPerGhi: 2.3, indoorClimateWindowHours: 24 })
    expect(v4Rest).toEqual(v3Rest)
  })

  it('运行规则：v4 读正文；v3 按版本语义固定为 6 / 2.3 / 24；v1、v2 不补缺段', () => {
    expect(resolveMvpWateringRuntimeRules(v4)).toEqual({ dryingGapFillMaxHours: 6, maximumPpfdPerGhi: 2.3, indoorClimateWindowHours: 24 })
    expect(resolveMvpWateringRuntimeRules(v3)).toEqual({ dryingGapFillMaxHours: 6, maximumPpfdPerGhi: 2.3, indoorClimateWindowHours: 24 })
    expect(resolveMvpWateringRuntimeRules(v2)).toEqual({ dryingGapFillMaxHours: null, maximumPpfdPerGhi: 2.3, indoorClimateWindowHours: 24 })
  })

  it.each([
    ['无缺段', null],
    ['恰好 6 小时缺段（补齐）', [6, 6] as const],
    ['7 小时缺段（不补齐）', [6, 7] as const],
  ])('%s：v4 与 v3 公开结果完全一致（迁移前后行为不变）', (_name, gap) => {
    expect(comparable(assess(v4, gap))).toEqual(comparable(assess(v3, gap)))
  })

  it('v4 发布把缺段补齐改为 8 小时时，7 小时缺段被补齐（证明取值来自策略而非代码）', () => {
    const widened = resolvedPolicy({ ...v4Body, dryingGapFillMaxHours: 8 } as CanonicalJsonObject, now)
    expect(assess(v4, [6, 7]).details.checkWindow).toBeNull()
    expect(assess(widened, [6, 7]).details.checkWindow).not.toBeNull()
  })
})
