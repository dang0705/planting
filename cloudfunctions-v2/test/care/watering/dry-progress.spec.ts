import { describe, expect, it } from 'vitest'
import { replayDryProgress, type DryProgressInput } from '../../../src/care/watering/replay-dry-progress.js'
const day = 86_400_000
const origin = Date.UTC(2026, 9, 1)
const range = (min: number, max = min) => ({ min, max })
const interval = (start: number, end: number, demand = range(1), retention = range(1), calibration = range(1)) => ({ start, end, environmentDemand: demand, cultivationRetention: retention, personalCalibration: calibration })
const input = () => ({ now: origin + day / 2, lastConfirmedWateringAt: origin, baseline: { basis: 'equivalent_dry_units' as const, referenceConditionsConfirmed: true, min: 1, max: 2 }, intervals: [interval(origin, origin + 3 * day)] })
/** L1 unit_fake：批准的DryUnit公式、区间算术及时间积分；不替换计算边界。 */
describe('等效干燥进度与检查窗口离线回放', () => {
  it('半天不取整；未来阈值在区间内部精确定位', () => {
    expect(replayDryProgress(input())).toMatchObject({ status: 'ready_candidate', productionAdmission: false, progress: range(0.5), window: { earliestCheckAt: origin + day, latestCheckAt: origin + 2 * day } })
  })
  it('需求乘校准除保水，独立端点保留不确定性', () => {
    const v = input(); v.intervals = [interval(origin, origin + 5 * day, range(1, 2), range(2, 4), range(1, 1.5))]
    expect(replayDryProgress(v)).toMatchObject({ progress: range(0.125, 0.75), window: { earliestCheckAt: origin + day / 1.5, latestCheckAt: null } })
  })
  it('跨区间累加并裁掉浇水前的时间，输入顺序不改变结果', () => {
    const v = input(); v.now = origin + 2 * day; v.intervals = [interval(origin + day, origin + 4 * day, range(2)), interval(origin - day, origin + day)]
    expect(replayDryProgress(v)).toMatchObject({ progress: range(3), window: { earliestCheckAt: v.now, latestCheckAt: v.now } })
  })
  it('有效零需求不当缺失，未覆盖阈值不外推日期', () => {
    const v = input(); v.intervals = [interval(origin, origin + 3 * day, range(0))]
    expect(replayDryProgress(v)).toMatchObject({ status: 'ready_candidate', progress: range(0), window: { earliestCheckAt: null, latestCheckAt: null } })
  })
  it('缺实际起点或参考依据时，不伪造零进度或改名旧天数', () => {
    expect(replayDryProgress({ ...input(), lastConfirmedWateringAt: null })).toMatchObject({ status: 'insufficient_evidence', progress: null, window: null })
    expect(replayDryProgress({ ...input(), baseline: { ...input().baseline!, referenceConditionsConfirmed: false } })).toMatchObject({ status: 'insufficient_evidence' })
    expect(() => replayDryProgress({ ...input(), baseline: { ...input().baseline!, basis: 'nominal_calendar_days' } } as unknown as DryProgressInput)).toThrow()
  })
  it('历史缺段不输出完整进度；未来缺段不能跨过去猜日期', () => {
    const v = input(); v.now = origin + day; v.intervals = [interval(origin, origin + day / 2), interval(origin + day, origin + 3 * day)]
    expect(replayDryProgress(v)).toMatchObject({ status: 'insufficient_evidence', reason: 'history_gap', progress: null })
    const future = input(); future.intervals = [interval(origin, origin + day * 0.75), interval(origin + day, origin + 4 * day)]
    expect(replayDryProgress(future)).toMatchObject({ progress: range(0.5), window: { earliestCheckAt: null, latestCheckAt: null, coverageEnd: origin + day * 0.75 } })
  })
  it('重叠重复区间、脏类型和非正保水/校准拒绝', () => {
    const v = input(); v.intervals = [interval(origin, origin + day), interval(origin, origin + day)]
    expect(() => replayDryProgress(v)).toThrow()
    for (const retention of [range(0), range(-1), range(2, 1), range(Infinity)]) {
      expect(() => replayDryProgress({ ...input(), intervals: [interval(origin, origin + day, range(1), retention)] })).toThrow()
    }
    expect(() => replayDryProgress({ ...input(), now: Number.MAX_SAFE_INTEGER })).toThrow()
    expect(() => replayDryProgress({ ...input(), intervals: [interval(origin, origin + day, range(Number.MAX_VALUE), range(Number.MIN_VALUE))] })).toThrow()
  })
  it('正增量或正阈值交点下溢不能冒充零值', () => {
    const baseline = { basis: 'equivalent_dry_units' as const, referenceConditionsConfirmed: true, min: 1, max: 2 }
    expect(() => replayDryProgress({ now: 1, lastConfirmedWateringAt: 0, baseline, intervals: [interval(0, 1, range(Number.MIN_VALUE))] })).toThrow()
    expect(() => replayDryProgress({ now: 0, lastConfirmedWateringAt: 0, baseline: { ...baseline, min: Number.MIN_VALUE, max: Number.MIN_VALUE }, intervals: [interval(0, 1, range(1e308))] })).toThrow()
  })
  it('最终结果有限时，不因乘法中间量溢出而拒绝', () => {
    const result = replayDryProgress({ now: 1, lastConfirmedWateringAt: 0, baseline: { basis: 'equivalent_dry_units', referenceConditionsConfirmed: true, min: 1, max: 2 }, intervals: [interval(0, 1, range(1e308), range(2), range(2))] })
    expect(result.progress!.min).toBeCloseTo(1e308 / day, -285)
    expect(result.progress!.max).toBeCloseTo(1e308 / day, -285)
  })
  it('巨大但有效阈值未被预报覆盖时不计算溢出的外推交点', () => {
    expect(replayDryProgress({ now: 0, lastConfirmedWateringAt: 0, baseline: { basis: 'equivalent_dry_units', referenceConditionsConfirmed: true, min: 1e308, max: 1e308 }, intervals: [interval(0, day, range(1))] })).toMatchObject({ window: { earliestCheckAt: null, latestCheckAt: null, coverageEnd: day } })
  })
  it('同值需求与保水相消，极小中间舍入不能改变校准值', () => {
    expect(replayDryProgress({ now: day, lastConfirmedWateringAt: 0, baseline: { basis: 'equivalent_dry_units', referenceConditionsConfirmed: true, min: 1, max: 2 }, intervals: [interval(0, day, range(2 * Number.MIN_VALUE), range(2 * Number.MIN_VALUE), range(0.75))] })).toMatchObject({ progress: range(0.75) })
  })
})
