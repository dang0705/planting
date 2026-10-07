import { describe, expect, it } from 'vitest'
import { replayWateringTiming } from '../../../src/care/application/replay-watering-timing.js'
const origin = Date.UTC(2026, 9, 1)
const day = 86_400_000
const input = () => ({ drying: { now: origin + day, lastConfirmedWateringAt: origin, baseline: { min: 2, max: 4, basis: 'equivalent_dry_units' as const, referenceConditionsConfirmed: true }, intervals: [{ start: origin, end: origin + 5 * day, environmentDemand: { min: 1, max: 1 }, cultivationRetention: { min: 1, max: 1 }, personalCalibration: { min: 1, max: 1 } }] }, wateringPolicyApproved: true, potSafety: 'safe' as const, soil: null })
/** L3 unit_fake：真实积分→盆土裁决→输入快照；无数据库/Provider/发布替身。 */
describe('浇水日期链路的内部离线闭环', () => {
  it('明确输入通过实际倍率积分得到检查日期和检查行为', () => {
    const result = replayWateringTiming(input())
    expect(result).toMatchObject({ productionAdmission: false, drying: { progress: { min: 1, max: 1 }, window: { earliestCheckAt: origin + 2 * day, latestCheckAt: origin + 4 * day } }, decision: { action: 'check_later' } })
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/)
    expect(result).not.toHaveProperty('amountRange')
  })
  it('当前湿土覆盖日期预测；缺历史起点仍保留安全判断', () => {
    const value = input()
    const result = replayWateringTiming({ ...value, drying: { ...value.drying, lastConfirmedWateringAt: null }, soil: { state: 'wet', scope: 'surface', reliable: true, targetCriteriaConfirmed: false, collectedAt: origin, validUntil: origin + 2 * day } })
    expect(result).toMatchObject({ drying: { progress: null, window: null }, decision: { action: 'pause_watering', windowState: null } })
  })
  it('调用后修改原始输入不改变锁定回放', () => {
    const value = input(); const result = replayWateringTiming(value)
    value.drying.intervals[0]!.environmentDemand.min = 99
    expect(result.snapshot.drying.intervals[0]!.environmentDemand.min).toBe(1)
    expect(replayWateringTiming(result.snapshot)).toEqual(result)
  })
  it('时间与水量分支并列，湿土仍否决行动且净缺口不当施水量', () => {
    const value = input()
    const result = replayWateringTiming({ ...value,
      soil: { state: 'wet', scope: 'root_zone', reliable: true, targetCriteriaConfirmed: false, collectedAt: origin, validUntil: origin + 2 * day },
      waterDeficit: { volumeBasis: 'effective_substrate', effectiveSubstrateVolumeMl: { min: 2000, max: 2000 }, currentVwc: { min: 0.15, max: 0.15 }, targetVwc: { min: 0.30, max: 0.30 }, rootZoneEvidenceValid: true },
    })
    expect(result.decision.action).toBe('pause_watering')
    expect(result.waterDeficit!.netDeficitMl!.max).toBeCloseTo(300, 10)
    expect(result.waterDeficit!.appliedAmountMl).toBeNull()
    expect(result.snapshot.waterDeficit!.effectiveSubstrateVolumeMl!.min).toBe(2000)
  })
})
