import { describe, expect, it } from 'vitest'
import { replayWateringTiming } from '../../../src/care/application/replay-watering-timing.js'
import type { WateringTimingReplayInput } from '../../../src/care/application/replay-watering-timing.js'

/** L3 unit_fake：批准计划4.3与目标干燥/盆土安全合同；驱动真实回放应用→积分→观察→日期/行动，无计算替身。 */
const day = 86_400_000
const origin = Date.parse('2026-10-01T00:00:00Z')
const scenario = (): WateringTimingReplayInput => ({
  timezone: 'Asia/Shanghai', wateringPolicyApproved: true, potSafety: 'safe',
  drying: { now: origin + day, lastConfirmedWateringAt: origin, baseline: { min: 3, max: 5, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true }, intervals: [{ start: origin, end: origin + 7 * day, environmentDemand: { min: 1, max: 1 }, cultivationRetention: { min: 1, max: 1 }, personalCalibration: { min: 1, max: 1 } }] },
  soil: { state: 'target_dry', scope: 'root_zone', reliable: true, targetCriteriaConfirmed: true, collectedAt: origin + day - 1000, validUntil: origin + 2 * day },
})

describe('当前盆土证据对有效检查窗口的影响', () => {
  it('可靠根区已达目标使有效窗口为现在，保留原未来预测和固定基线', () => {
    const input = scenario(); const result = replayWateringTiming(input)
    expect(result.localCheckWindow).toMatchObject({ earliestCheckDate: '2026-10-02', latestCheckDate: '2026-10-02' })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'target_observed', observedAt: input.soil!.collectedAt, window: { earliestCheckAt: input.drying.now, latestCheckAt: input.drying.now } }, decision: { action: 'water_allowed', windowState: null } })
    expect(result.drying).toMatchObject({ progress: { min: 1, max: 1 }, window: { earliestCheckAt: origin + 3 * day, latestCheckAt: origin + 5 * day } })
    expect(result.snapshot.drying.baseline).toEqual(input.drying.baseline)
  })
  it('缺浇水历史和基线也可承认当前目标，不补造完整循环', () => {
    const input = scenario(); const result = replayWateringTiming({ ...input, drying: { ...input.drying, lastConfirmedWateringAt: null, baseline: null, intervals: [] } })
    expect(result).toMatchObject({ drying: { status: 'insufficient_evidence', progress: null, window: null }, currentCycleWindow: { status: 'target_observed' }, localCheckWindow: { earliestCheckDate: '2026-10-02' }, productionAdmission: false })
    expect(result.snapshot.drying.lastConfirmedWateringAt).toBeNull()
  })
  it.each(['wet', 'waterlogged'] as const)('根区%s反驳已到窗口，撤回日期，不把湿土重置为零或猜新日期', (state) => {
    const input = scenario()
    const result = replayWateringTiming({ ...input, drying: { ...input.drying, baseline: { ...input.drying.baseline!, min: 0.5, max: 1 } }, soil: { ...input.soil!, state, targetCriteriaConfirmed: false } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'prediction_conflict', window: null }, decision: { action: 'pause_watering', windowState: null }, localCheckWindow: { earliestCheckDate: null, latestCheckDate: null } })
    expect(result.drying.progress).toEqual({ min: 1, max: 1 })
    expect(result.drying.window!.earliestCheckAt).toBe(input.drying.now)
  })
  it('根区湿态与未来窗口未矛盾时保留历史预测，不能宣称已算出湿态剩余量', () => {
    const input = scenario(); const result = replayWateringTiming({ ...input, soil: { ...input.soil!, state: 'wet', targetCriteriaConfirmed: false } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'prediction_only', observedAt: null }, localCheckWindow: { earliestCheckDate: '2026-10-04', latestCheckDate: '2026-10-06' }, decision: { action: 'pause_watering' } })
  })
  it.each([
    { scope: 'surface' as const }, { reliable: false }, { validUntil: origin + day },
    { targetCriteriaConfirmed: false }, { state: 'unknown' as const },
  ])('无有效根区目标资格不覆盖预测 %j', (change) => {
    const input = scenario(); const result = replayWateringTiming({ ...input, soil: { ...input.soil!, ...change } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'prediction_only' }, localCheckWindow: { earliestCheckDate: '2026-10-04' } })
  })
  it('表土湿只影响安全门，不冒充根区反证撤回日期', () => {
    const input = scenario(); const result = replayWateringTiming({ ...input, drying: { ...input.drying, baseline: { ...input.drying.baseline!, min: 0.5, max: 1 } }, soil: { ...input.soil!, state: 'wet', scope: 'surface' } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'prediction_only' }, decision: { action: 'pause_watering' }, localCheckWindow: { earliestCheckDate: '2026-10-02' } })
  })
  it('缺历史且只有湿态时不生成剩余天数', () => {
    const input = scenario(); const result = replayWateringTiming({ ...input, drying: { ...input.drying, lastConfirmedWateringAt: null }, soil: { ...input.soil!, state: 'wet' } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'insufficient_evidence', window: null }, localCheckWindow: { earliestCheckDate: null } })
  })
  it.each([origin - 1000, origin])('实际浇水之前或同刻的盆土证据%s不覆盖新循环，也不继续授予浇水许可', (collectedAt) => {
    const input = scenario(); const result = replayWateringTiming({ ...input, soil: { ...input.soil!, collectedAt } })
    expect(result).toMatchObject({ currentCycleWindow: { status: 'prediction_only', ignoredObservationReason: 'not_after_confirmed_watering' }, decision: { action: 'check_later' }, localCheckWindow: { earliestCheckDate: '2026-10-04' } })
    expect(result.snapshot.soil!.collectedAt).toBe(collectedAt)
  })
  it('当前目标成立仍不能越过未发布和未知盆器边界', () => {
    expect(replayWateringTiming({ ...scenario(), wateringPolicyApproved: false })).toMatchObject({ currentCycleWindow: { status: 'target_observed' }, decision: { action: 'temporarily_unavailable' } })
    const unknownPot = replayWateringTiming({ ...scenario(), potSafety: 'insufficient_evidence' })
    expect(unknownPot.decision.action).toBe('insufficient_evidence')
    expect(replayWateringTiming({ ...scenario(), potSafety: 'drainage_risk' }).decision.action).toBe('review_drainage')
  })
  it('更新证据形成新快照，旧窗口可重放且不改变原始输入', () => {
    const input = scenario(); const before = structuredClone(input)
    const oldResult = replayWateringTiming({ ...input, soil: null })
    const newResult = replayWateringTiming(input)
    expect(newResult.snapshotHash).not.toBe(oldResult.snapshotHash)
    expect(newResult.localCheckWindow.earliestCheckDate).not.toBe(oldResult.localCheckWindow.earliestCheckDate)
    expect(replayWateringTiming(oldResult.snapshot)).toEqual(oldResult)
    expect(input).toEqual(before)
  })
})
