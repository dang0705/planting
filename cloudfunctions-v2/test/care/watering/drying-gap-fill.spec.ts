import { describe, expect, it } from 'vitest'

import { assessMvpWatering } from '../../../src/care/application/assess-mvp-watering.js'
import { approvedV3Body, releaseBody, resolvedPolicy } from './v3-policy-fixture.js'

/**
 * 环境数据缺段补齐（用户 2026-10-10 审定；合同 8.11；目录 care.watering.drying_gap_fill_max_hours = 6，hard_rule）。
 * 层次：L3 unit_fake。真实经过 assessMvpWatering → 干燥积分 → 结果投影；环境时段为显式输入。
 * Expected 来源：审定规则「缺段 ≤ 6 小时用该段环境需水最低–最高的保守全区间补上；超过 6 小时仍为无结论」＋独立手算：
 * 保守全区间 = 发布有效域（PPFD 0～1500、VPD 0.1～4 kPa）上的需求包络 [0.2×0.1/1.4, 0.8×L(1500)/L(50)×H峰值 + 0.2×4/1.4]
 *            = [0.0142857, 2.797410]；参考盆泥炭 S=[0.833333, 1.166667]、P=Ae=1。
 * 未覆盖：真实 Open-Meteo 缺段形态、测量起点之前的前导缺口（合同明确不补）。
 */
const hour = 3_600_000
const day = 86_400_000
const now = Date.UTC(2026, 9, 10, 2)
const v3 = resolvedPolicy(approvedV3Body(), now)
const v2 = resolvedPolicy(releaseBody('v2'), now)

type AssessInput = Parameters<typeof assessMvpWatering>[0]
/** 30 天逐小时参考环境；gap 为 [起始小时, 时长] 的缺段，mode 决定缺段形态。 */
function environment(gap: readonly [number, number] | null, mode: 'null_ppfd' | 'hole' = 'null_ppfd') {
  const all = Array.from({ length: 24 * 30 }, (_, i) => ({ start: now + i * hour, end: now + (i + 1) * hour, ppfd: { min: 50, max: 50 } as { min: number, max: number } | null, indoorVpdKpa: { min: 1.4, max: 1.4 } }))
  if (gap === null) { return all }
  const inGap = (i: number) => i >= gap[0] && i < gap[0] + gap[1]
  return mode === 'hole' ? all.filter((_, i) => !inGap(i)) : all.map((item, i) => (inGap(i) ? { ...item, ppfd: null } : item))
}
const assess = (policy: typeof v3, env: ReturnType<typeof environment>) => assessMvpWatering({
  policy, now, baseline: { tier: 'regular', trigger: 'SURFACE_DRY', baselineDays: { min: 5, max: 8 } },
  soil: { state: 'moist', scope: 'root_zone', observedAt: now, reliable: true }, lastConfirmedWateringAt: null,
  pot: { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 15, potBottomDiameterCm: 11, potHeightCm: 13 },
  materials: ['peat'], environment: env, timezone: 'Asia/Shanghai',
} as unknown as AssessInput)
const expectDays = (iso: string | null | undefined, days: number) => {
  expect(iso).toBeTruthy()
  expect(Math.abs(Date.parse(iso!) - (now + days * day))).toBeLessThanOrEqual(1000)
}

describe('v3：环境缺段 ≤ 6 小时保守补齐｜L3 unit_fake', () => {
  // 最早端：0.25d×1.2 + 0.25d×2.797410×1.2 = 1.139223，余 0.110777÷1.2 → 0.5+0.092314 = 0.592314 天。
  // 最晚端：0.25d×0.857143 + 0.25d×0.0142857×0.857143 = 0.217347，余 4.582653÷0.857143 → 0.5+5.346429 = 5.846429 天。
  it('G1 第 6～12 小时 PPFD 缺失（恰好 6 小时）→ 补上保守区间：窗口 +0.592314～+5.846429 天（变宽但不中断）', () => {
    const result = assess(v3, environment([6, 6]))
    expect(result.details.action).toBe('check_later')
    expectDays(result.details.checkWindow?.earliestAt, 0.592314)
    expectDays(result.details.checkWindow?.latestAt, 5.846429)
  })
  it('G2 同一位置时段整段缺失（数组空洞，6 小时）→ 与 G1 相同', () => {
    const result = assess(v3, environment([6, 6], 'hole'))
    expectDays(result.details.checkWindow?.earliestAt, 0.592314)
    expectDays(result.details.checkWindow?.latestAt, 5.846429)
  })
  it('G3 缺段 7 小时（超过 6 小时）→ 仍为无结论：不公开检查窗口', () => {
    const result = assess(v3, environment([6, 7]))
    expect(result.details.checkWindow).toBeNull()
    expect(result.details.action).not.toBe('check_later')
  })
  it('G4 预报覆盖终点之后不是缺段：只覆盖 3 天 → 最晚端开放，不补齐', () => {
    const result = assess(v3, environment(null).slice(0, 72))
    expect(result.details.checkWindow?.earliestAt).toBeTruthy()
    expect(result.details.checkWindow?.latestAt).toBeNull()
  })
  it('G5 v2 已发布语义不变：同样 6 小时缺段仍无结论（补齐自 v3 起生效）', () => {
    expect(assess(v2, environment([6, 6])).details.checkWindow).toBeNull()
  })
})
