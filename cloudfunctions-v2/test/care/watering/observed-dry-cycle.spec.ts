import { describe, expect, it } from 'vitest'
import { replayObservedDryCycle, type ObservedDryCycleInput } from '../../../src/care/watering/replay-observed-dry-cycle.js'
const day = 86_400_000
const origin = Date.UTC(2026, 9, 8)
const input = (): ObservedDryCycleInput => ({ now: origin, lastConfirmedWateringAt: null,
  soil: { state: 'unknown', scope: 'root_zone', reliable: true, targetCriteriaConfirmed: false, collectedAt: origin, validUntil: origin + 10 * day },
  state: { observedAt: origin, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true, mappingValidated: true,
    mappingVersion: 'math/v1', evidenceRef: 'fixture:root-zone', remainingDryUnits: { min: 2, max: 4 } },
  intervals: [{ start: origin, end: origin + 10 * day, environmentDemand: { min: 1, max: 2 }, cultivationRetention: { min: 1, max: 1 }, personalCalibration: { min: 1, max: 1 } }],
})
/** L1 unit_fake：独立区间算术与用户确认的观察资格；不测试图像识别或真实映射精度。 */
describe('观察起点的剩余干燥积分', () => {
  it('分段扣除观察后的真实已覆盖时间，不用最后一段替代整段', () => {
    const v = input(); const base = v.intervals[0]!
    const result = replayObservedDryCycle({ ...v, now: origin + day, intervals: [
      { ...base, end: origin + day / 2 },
      { ...base, start: origin + day / 2, environmentDemand: { min: 2, max: 4 } },
    ] })
    expect(result).toMatchObject({ status: 'ready_candidate', consumedSinceObservation: { min: 1.5, max: 3 }, remainingDryUnits: { min: 0, max: 2.5 },
      window: { earliestCheckAt: origin + day, latestCheckAt: origin + 2.25 * day } })
  })
  it('未来缺段保留已覆盖端点，不以覆盖终点充当最晚日期', () => {
    const v = input(); const base = v.intervals[0]!
    expect(replayObservedDryCycle({ ...v, intervals: [{ ...base, end: origin + 2 * day }, { ...base, start: origin + 3 * day }] }))
      .toMatchObject({ window: { earliestCheckAt: origin + day, latestCheckAt: null, coverageEnd: origin + 2 * day } })
  })
  it('至今缺段不输出当前状态，空未来区间不伪造日期', () => {
    const v = input(); const base = v.intervals[0]!
    expect(replayObservedDryCycle({ ...v, now: origin + day, intervals: [{ ...base, start: origin + day }] }))
      .toMatchObject({ reason: 'history_gap', remainingDryUnits: null, window: null })
    expect(replayObservedDryCycle({ ...v, intervals: [] })).toMatchObject({ remainingDryUnits: { min: 2, max: 4 }, window: { earliestCheckAt: null, latestCheckAt: null } })
  })
  it.each([0, 1])('零速度端点保留未知上界 (%s)', min => {
    const v = input(); const base = v.intervals[0]!
    const result = replayObservedDryCycle({ ...v, intervals: [{ ...base, environmentDemand: { min: 0, max: min === 0 ? 0 : 2 } }] })
    expect(result.window).toMatchObject({ earliestCheckAt: min === 0 ? null : origin + day, latestCheckAt: null })
  })
  it('有效零剩余量表示现在检查，不能制造过去交点', () => {
    const v = input()
    expect(replayObservedDryCycle({ ...v, state: { ...v.state!, remainingDryUnits: { min: 0, max: 0 } }, intervals: [] })).toMatchObject({ window: { earliestCheckAt: origin, latestCheckAt: origin } })
  })
  it.each(['missing', 'surface', 'unreliable', 'expired', 'unmapped', 'unreferenced', 'mismatched', 'prior', 'same_time'])('证据不合格不能生成剩余日期：%s', scenario => {
    const v = input()
    const value = { ...v, soil: { ...v.soil! }, state: { ...v.state! } }
    if (scenario === 'missing') { return expect(replayObservedDryCycle({ ...value, state: null }).window).toBeNull() }
    if (scenario === 'surface') { value.soil.scope = 'surface' }
    if (scenario === 'unreliable') { value.soil.reliable = false }
    if (scenario === 'expired') { value.now = origin + 10 * day }
    if (scenario === 'unmapped') { value.state.mappingValidated = false }
    if (scenario === 'unreferenced') { value.state.referenceConditionsConfirmed = false }
    if (scenario === 'mismatched') { value.state.observedAt = origin - 1 }
    if (scenario === 'prior') { value.lastConfirmedWateringAt = origin + 1; value.now = origin + 1 }
    if (scenario === 'same_time') { value.lastConfirmedWateringAt = origin }
    expect(replayObservedDryCycle(value)).toMatchObject({ status: 'insufficient_evidence', remainingDryUnits: null, window: null })
  })
  it('未来观察、反序数值、错误量纲和缺少来源均明确拒绝', () => {
    const v = input()
    expect(() => replayObservedDryCycle({ ...v, soil: { ...v.soil!, collectedAt: origin + 1 } })).toThrow()
    for (const patch of [{ remainingDryUnits: { min: 2, max: 1 } }, { remainingDryUnits: { min: null, max: 4 } }, { basis: 'nominal_calendar_days' }, { evidenceRef: '' }, { mappingVersion: '' }, { mappingValidated: 'true' }]) {
      expect(() => replayObservedDryCycle({ ...v, state: { ...v.state!, ...patch } } as unknown as ObservedDryCycleInput)).toThrow()
    }
  })
  it('重放稳定且不改写观察输入，异常不留下半成品', () => {
    const v = input(); const original = structuredClone(v)
    const a = replayObservedDryCycle(v); expect(replayObservedDryCycle(v)).toEqual(a); expect(v).toEqual(original)
    expect(() => replayObservedDryCycle({ ...v, intervals: [...v.intervals, ...v.intervals] })).toThrow()
    expect(v).toEqual(original)
  })
})
