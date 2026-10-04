import { describe, expect, it } from 'vitest'
import { integratePpfdIntervals } from '../../src/care/light/integrate-ppfd-intervals.js'

/** unit_fake：独立单位基准，不替代真实辐射 Provider、窗面传播或正式 Care HTTP。 */
const source = '统一计划 6.1/6.2；MSU Indoor lighting guide：PPFD × 实际秒数 ÷ 1,000,000'
const hour = 3_600_000
const window = { startMs: 0, endMs: hour, referencePlane: 'plant_position' }
const interval = (startMs = 0, endMs = hour, lower = 100, upper = 100) => ({
  startMs,
  endMs,
  referencePlane: 'plant_position',
  semantics: 'interval_mean' as const,
  ppfdMicromolPerM2PerSecond: { lower, upper }
})

describe(`unit_fake 光照区间积分；Expected 来源：${source}`, () => {
  it('100 PPFD 持续一小时为 0.36 mol，不继承辐射换算系数', () => {
    const result = integratePpfdIntervals(window, [interval()])
    expect(result.status).toBe('complete')
    expect(result.completeIntegralMolPerM2?.lower).toBeCloseTo(0.36)
    expect(result.completeIntegralMolPerM2?.upper).toBeCloseTo(0.36)
    expect(result.coveredMs).toBe(hour)
  })
  it('全天恒定 100 PPFD 的独立基准为 8.64 mol', () => {
    const result = integratePpfdIntervals({ ...window, endMs: 24 * hour }, [interval(0, 24 * hour)])
    expect(result.completeIntegralMolPerM2?.lower).toBeCloseTo(8.64)
  })
  it('上下界分别积分，不用中值冒充区间', () => {
    const result = integratePpfdIntervals(window, [interval(0, hour, 50, 150)])
    expect(result.completeIntegralMolPerM2).toEqual({ lower: 0.18, upper: 0.54 })
  })
  it('有效零光照仍覆盖区间', () => {
    const result = integratePpfdIntervals(window, [interval(0, hour, 0, 0)])
    expect(result.status).toBe('complete')
    expect(result.completeIntegralMolPerM2).toEqual({ lower: 0, upper: 0 })
  })
  it('null 不转换成有效零光照', () => {
    const result = integratePpfdIntervals(window, [
      { ...interval(), ppfdMicromolPerM2PerSecond: null }
    ])
    expect(result.status).toBe('none')
    expect(result.coveredMs).toBe(0)
    expect(result.completeIntegralMolPerM2).toBeNull()
    expect(result.missingIntervals).toEqual([{ startMs: 0, endMs: hour }])
  })
  it('缺中间一小时，只报告已知积分，不填全天值', () => {
    const result = integratePpfdIntervals({ ...window, endMs: 3 * hour }, [
      interval(2 * hour, 3 * hour),
      interval()
    ])
    expect(result.status).toBe('partial')
    expect(result.knownIntegralMolPerM2.lower).toBeCloseTo(0.72)
    expect(result.completeIntegralMolPerM2).toBeNull()
    expect(result.coveredMs).toBe(2 * hour)
    expect(result.missingIntervals).toEqual([{ startMs: hour, endMs: 2 * hour }])
  })
  it('完全相同的区间去重，不重复积分', () => {
    const result = integratePpfdIntervals(window, [interval(), interval()])
    expect(result.completeIntegralMolPerM2?.lower).toBeCloseTo(0.36)
  })
  it('同一时段不同 PPFD 不静默择一', () => {
    expect(() => integratePpfdIntervals(window, [interval(), interval(0, hour, 200, 200)])).toThrow(
      '重叠'
    )
  })
  it('部分重叠拒绝重复计权', () => {
    expect(() =>
      integratePpfdIntervals(window, [interval(), interval(hour / 2, hour + 1)])
    ).toThrow('重叠')
  })
  it('按目标区间裁切，不将每条数据当一整小时', () => {
    const result = integratePpfdIntervals(window, [
      interval(-hour, hour / 2),
      interval(hour / 2, 2 * hour)
    ])
    expect(result.completeIntegralMolPerM2?.lower).toBeCloseTo(0.36)
  })
  it('毫秒部分时段按实际秒数积分', () => {
    const result = integratePpfdIntervals({ ...window, endMs: 500 }, [interval(0, 500)])
    expect(result.completeIntegralMolPerM2?.lower).toBeCloseTo(0.00005)
  })
  it('瞬时样本不能伪装区间平均值', () => {
    expect(() =>
      integratePpfdIntervals(window, [{ ...interval(), semantics: 'instantaneous' as never }])
    ).toThrow('平均')
  })
  it('不同参考平面不得混合积分', () => {
    expect(() =>
      integratePpfdIntervals(window, [{ ...interval(), referencePlane: 'window_plane' }])
    ).toThrow('参考平面')
  })
  it.each([
    [-1, 1],
    [2, 1],
    [NaN, 1],
    [0, Infinity]
  ])('非法 PPFD 区间 %s/%s 不参与计算', (lower, upper) => {
    expect(() => integratePpfdIntervals(window, [interval(0, hour, lower, upper)])).toThrow('PPFD')
  })
  it('非法起止时刻必须拒绝', () => {
    expect(() => integratePpfdIntervals(window, [interval(hour, 0)])).toThrow('时间')
    expect(() => integratePpfdIntervals({ ...window, endMs: NaN }, [])).toThrow('时间')
  })
  it('空序列保持无证据，不补零积分', () => {
    const result = integratePpfdIntervals(window, [])
    expect(result.status).toBe('none')
    expect(result.completeIntegralMolPerM2).toBeNull()
  })
  it('不改变调用方输入及排序', () => {
    const input = Object.freeze([
      Object.freeze(interval(hour / 2, hour)),
      Object.freeze(interval(0, hour / 2))
    ])
    integratePpfdIntervals(window, input)
    expect(input[0]?.startMs).toBe(hour / 2)
  })
})
