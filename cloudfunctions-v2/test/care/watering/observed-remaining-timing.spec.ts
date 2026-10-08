import { describe, expect, it } from 'vitest'
import { replayWateringTiming } from '../../../src/care/application/replay-watering-timing.js'

const origin = Date.UTC(2026, 9, 8)
const day = 86_400_000
/** L3 unit_fake：Expected来自observed-remaining-cycle-contract及人工区间算术，无内部替身。 */
const input = () => ({
  drying: { now: origin, lastConfirmedWateringAt: null,
    baseline: null, intervals: [{ start: origin, end: origin + 10 * day,
      environmentDemand: { min: 1, max: 2 }, cultivationRetention: { min: 1, max: 1 }, personalCalibration: { min: 1, max: 1 } }] },
  wateringPolicyApproved: true, potSafety: 'safe' as const, timezone: 'Asia/Shanghai',
  soil: { state: 'unknown' as const, scope: 'root_zone' as const, reliable: true,
    targetCriteriaConfirmed: false, collectedAt: origin, validUntil: origin + 10 * day },
  observedRemaining: { observedAt: origin, basis: 'equivalent_dry_units' as const,
    referenceConditionsConfirmed: true, mappingValidated: true,
    mappingVersion: 'math-scenario/v1', evidenceRef: 'fixture:qualified-root-zone', remainingDryUnits: { min: 2, max: 4 } },
})
describe('当前盆土状态到剩余日期的真实回放接线', () => {
  it('缺历史浇水仍能从可靠观察估计非零剩余窗口，历史不伪造', () => {
    const result = replayWateringTiming(input())
    expect(result).toMatchObject({ productionAdmission: false,
      drying: { reason: 'missing_origin', progress: null, window: null },
      currentCycleWindow: { status: 'observation_prediction', observedAt: origin,
        window: { earliestCheckAt: origin + day, latestCheckAt: origin + 4 * day } },
      localCheckWindow: { earliestCheckDate: '2026-10-09', latestCheckDate: '2026-10-12' },
      decision: { action: 'check_later', soilGate: 'unknown' },
    })
    expect(result.snapshot.drying.lastConfirmedWateringAt).toBeNull()
  })
  it('同一状态下需求翻倍使日期提前，保水翻倍使日期推后', () => {
    const faster = input(); faster.drying.intervals[0]!.environmentDemand = { min: 2, max: 4 }
    expect(replayWateringTiming(faster).currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + day / 2, latestCheckAt: origin + 2 * day })
    const retained = input(); retained.drying.intervals[0]!.cultivationRetention = { min: 2, max: 2 }
    expect(replayWateringTiming(retained).currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + 2 * day, latestCheckAt: origin + 8 * day })
  })
  it('观察后已经过去的一天被扣除，可能达标只能检查不能自动浇水', () => {
    const value = input(); value.drying.now = origin + day
    const result = replayWateringTiming(value)
    expect(result).toMatchObject({ observedCycle: { remainingDryUnits: { min: 0, max: 3 } },
      currentCycleWindow: { window: { earliestCheckAt: value.drying.now, latestCheckAt: origin + 4 * day } },
      decision: { action: 'check_now', soilGate: 'unknown' } })
  })
  it('未验证的状态映射不能悄悄产生日期', () => {
    const value = input(); value.observedRemaining.mappingValidated = false
    expect(replayWateringTiming(value)).toMatchObject({ localCheckWindow: { earliestCheckDate: null, latestCheckDate: null }, decision: { action: 'insufficient_evidence' } })
  })
  it('安全门保持优先：湿土、排水风险和未发布策略', () => {
    const value = input()
    expect(replayWateringTiming({ ...value, soil: { ...value.soil, state: 'wet' } }).decision.action).toBe('pause_watering')
    expect(replayWateringTiming({ ...value, potSafety: 'drainage_risk' }).decision.action).toBe('review_drainage')
    expect(replayWateringTiming({ ...value, wateringPolicyApproved: false }).decision.action).toBe('temporarily_unavailable')
  })
  it('新观察改变窗口但不覆盖已锁定的旧回放与实际浇水事实', () => {
    const value = input(); const first = replayWateringTiming(value)
    value.observedRemaining.remainingDryUnits = { min: 4, max: 6 }
    const second = replayWateringTiming(value)
    expect(first.currentCycleWindow.window!.earliestCheckAt).toBe(origin + day)
    expect(second.currentCycleWindow.window!.earliestCheckAt).toBe(origin + 2 * day)
    expect(first.snapshotHash).not.toBe(second.snapshotHash)
    expect(replayWateringTiming(first.snapshot)).toEqual(first)
    expect(second.snapshot.drying.lastConfirmedWateringAt).toBeNull()
  })
  it('观察替换有效窗口时，原固定基线与完整历史预测仍分别保留', () => {
    const value = input(); const observedAt = origin + day
    const result = replayWateringTiming({ ...value,
      drying: { ...value.drying, now: observedAt, lastConfirmedWateringAt: origin,
        baseline: { min: 7, max: 14, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true } },
      soil: { ...value.soil, collectedAt: observedAt }, observedRemaining: { ...value.observedRemaining, observedAt },
    })
    expect(result.drying).toMatchObject({ progress: { min: 1, max: 2 }, window: { earliestCheckAt: origin + 3.5 * day, latestCheckAt: null } })
    expect(result.currentCycleWindow.window).toMatchObject({ earliestCheckAt: origin + 2 * day, latestCheckAt: origin + 5 * day })
    expect(result.snapshot.drying.baseline).toMatchObject({ min: 7, max: 14 })
    expect(result.snapshot.drying.lastConfirmedWateringAt).toBe(origin)
  })
})
