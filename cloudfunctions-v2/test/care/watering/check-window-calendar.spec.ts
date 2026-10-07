import { describe, expect, it } from 'vitest'
import { projectCheckWindowDates } from '../../../src/care/watering/project-check-window-dates.js'
import { replayWateringTiming } from '../../../src/care/application/replay-watering-timing.js'

/** L1/L3 unit_fake；Expected来自计划4.3.1及独立UTC/当地日历，无日期或积分替身。 */
describe('检查窗口转换为植物所在地日期', () => {
  const window = { earliestCheckAt: Date.parse('2026-10-01T16:30:00Z'), latestCheckAt: Date.parse('2026-10-02T15:30:00Z'), coverageEnd: Date.parse('2026-10-03T00:00:00Z') }
  it.each([
    ['Asia/Shanghai', '2026-10-02', '2026-10-02', '2026-10-03'],
    ['America/Los_Angeles', '2026-10-01', '2026-10-02', '2026-10-02'],
  ])('同一UTC窗口按%s表达，不使用服务器默认日期', (timezone, first, last, coverage) => {
    expect(projectCheckWindowDates(window, timezone)).toEqual({ status: 'ready_candidate', reason: null, timezone, earliestCheckDate: first, latestCheckDate: last, coverageEndDate: coverage })
  })
  it('秋季夏令时重复小时仍是同一个当地日期', () => {
    expect(projectCheckWindowDates({ earliestCheckAt: Date.parse('2026-11-01T05:30:00Z'), latestCheckAt: Date.parse('2026-11-01T06:30:00Z'), coverageEnd: Date.parse('2026-11-02T05:00:00Z') }, 'America/New_York')).toMatchObject({ earliestCheckDate: '2026-11-01', latestCheckDate: '2026-11-01', coverageEndDate: '2026-11-02' })
  })
  it('只有最早阈值被覆盖时不补最晚日期', () => {
    expect(projectCheckWindowDates({ ...window, latestCheckAt: null }, 'Asia/Shanghai')).toMatchObject({ status: 'ready_candidate', earliestCheckDate: '2026-10-02', latestCheckDate: null })
  })
  it('两个阈值都未覆盖时不拿预报终点充当日期', () => {
    expect(projectCheckWindowDates({ ...window, earliestCheckAt: null, latestCheckAt: null }, 'Asia/Shanghai')).toMatchObject({ status: 'insufficient_evidence', reason: 'threshold_not_covered', earliestCheckDate: null, latestCheckDate: null, coverageEndDate: '2026-10-03' })
  })
  it('缺时区或窗口不生成日期', () => {
    expect(projectCheckWindowDates(window, null)).toMatchObject({ reason: 'missing_timezone', earliestCheckDate: null, coverageEndDate: null })
    expect(projectCheckWindowDates(null, 'Asia/Shanghai')).toMatchObject({ reason: 'missing_window', earliestCheckDate: null, coverageEndDate: null })
  })
  it.each(['', 'Mars/Olympus', undefined, 8])('拒绝非法时区 %s', timezone => {
    expect(() => projectCheckWindowDates(window, timezone as never)).toThrow()
  })
  it.each([NaN, 1.5, Infinity, '2026-10-01'])('拒绝非法UTC毫秒 %s', value => {
    expect(() => projectCheckWindowDates({ ...window, earliestCheckAt: value as never }, 'UTC')).toThrow()
  })
  it('拒绝反序、超出覆盖终点及公历表达范围的窗口', () => {
    expect(() => projectCheckWindowDates({ ...window, earliestCheckAt: window.latestCheckAt + 1 }, 'UTC')).toThrow()
    expect(() => projectCheckWindowDates({ ...window, latestCheckAt: window.coverageEnd + 1 }, 'UTC')).toThrow()
    expect(() => projectCheckWindowDates({ earliestCheckAt: null, latestCheckAt: null, coverageEnd: 8640000000000000 }, 'UTC')).toThrow()
  })
  it('真实积分→当地日期→湿土否决；时区进入不可变快照', () => {
    const start = Date.parse('2026-10-01T16:30:00Z')
    const input = {
      timezone: 'Asia/Shanghai',
      drying: { now: start + 86400000, lastConfirmedWateringAt: start, baseline: { min: 2, max: 3, basis: 'equivalent_dry_units' as const, referenceConditionsConfirmed: true }, intervals: [{ start, end: start + 4 * 86400000, environmentDemand: { min: 1, max: 1 }, cultivationRetention: { min: 1, max: 1 }, personalCalibration: { min: 1, max: 1 } }] },
      wateringPolicyApproved: true, potSafety: 'safe' as const,
      soil: { state: 'wet' as const, scope: 'root_zone' as const, reliable: true, targetCriteriaConfirmed: false, collectedAt: start, validUntil: start + 4 * 86400000 },
    }
    const result = replayWateringTiming(input)
    expect(result).toMatchObject({ localCheckWindow: { earliestCheckDate: '2026-10-04', latestCheckDate: '2026-10-05' }, decision: { action: 'pause_watering' }, productionAdmission: false })
    input.timezone = 'UTC'
    expect(result.snapshot.timezone).toBe('Asia/Shanghai')
    expect(replayWateringTiming(result.snapshot)).toEqual(result)
  })
  it.each([
    [1, 1, 1, '2026-10-05', '2026-10-07'],
    [2, 1, 1, '2026-10-03', '2026-10-04'],
    [1, 2, 1, '2026-10-09', '2026-10-13'],
    [1, 1, 2, '2026-10-03', '2026-10-04'],
  ])('固定基线随环境%s、保水%s、个体校准%s得到动态日期', (demand, retention, calibration, first, last) => {
    // 独立手算：固定4～6干燥单位，推进速度为需求×校准÷保水；数值仅为数学样例。
    const start = Date.parse('2026-10-01T00:00:00Z')
    const result = replayWateringTiming({ timezone: 'Asia/Shanghai',
      drying: { now: start + 86400000, lastConfirmedWateringAt: start, baseline: { min: 4, max: 6, basis: 'equivalent_dry_units', referenceConditionsConfirmed: true }, intervals: [{ start, end: start + 14 * 86400000, environmentDemand: { min: demand, max: demand }, cultivationRetention: { min: retention, max: retention }, personalCalibration: { min: calibration, max: calibration } }] },
      wateringPolicyApproved: null, potSafety: 'safe', soil: null,
    })
    expect(result.localCheckWindow).toMatchObject({ earliestCheckDate: first, latestCheckDate: last })
    expect(result.snapshot.drying.baseline).toMatchObject({ min: 4, max: 6 })
    expect(result.decision.action).toBe('temporarily_unavailable')
  })
})
