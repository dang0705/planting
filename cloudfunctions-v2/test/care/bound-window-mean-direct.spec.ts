import { describe, expect, it } from 'vitest'
import { boundWindowMeanDirect } from '../../src/care/light/bound-window-mean-direct.js'

/** unit_fake：非负量乘法的不等式、独立相关性反例与已批准区间/参考平面合同。 */
const interval = () => ({ intervalStartMs: 0, intervalEndMs: 3600000, semantics: 'interval_mean' as const, dniWattsPerM2: 100, ghiWattsPerM2: 70, dhiWattsPerM2: 20 })
const bound = () => ({ intervalStartMs: 0, intervalEndMs: 3600000, semantics: 'whole_interval_bound' as const, referencePlane: 'south-window-exterior', evidenceRef: 'independent-whole-interval-proof', lower: 0.2, upper: 0.6 })

describe('unit_fake 区间平均直射界限；Expected：非负量积分不等式', () => {
  it('100均值乘全区间0.2至0.6界限得到20至60，不返回猜测中值', () => {
    const result = boundWindowMeanDirect(interval(), bound())
    expect(result.directWattsPerM2).toEqual({ lower: 20, upper: 60 })
    expect(result.referencePlane).toBe('south-window-exterior')
    expect(result.geometryEvidenceRef).toBe('independent-whole-interval-proof')
    expect(result.intervalStartMs).toBe(0)
    expect(result.intervalEndMs).toBe(3600000)
    expect(result.semantics).toBe('interval_mean_bounds')
    expect(result).not.toHaveProperty('midpoint')
  })
  it('同样平均DNI与投影范围容纳相关性造成的两个不同真实均值', () => {
    const result = boundWindowMeanDirect(interval(), { ...bound(), lower: 0, upper: 1 })
    expect(result.directWattsPerM2).toEqual({ lower: 0, upper: 100 })
    // 两个半时段的手算结果为0和100；均值乘平均投影得到50无法代表两者。
    for (const actualMean of [0, 100]) {
      expect(result.directWattsPerM2?.lower).toBeLessThanOrEqual(actualMean)
      expect(result.directWattsPerM2?.upper).toBeGreaterThanOrEqual(actualMean)
    }
  })
  it('固定完整时段投影时界限可以退化为一个值', () => {
    expect(boundWindowMeanDirect(interval(), { ...bound(), lower: 0.5, upper: 0.5 }).directWattsPerM2).toEqual({ lower: 50, upper: 50 })
  })
  it('有效零DNI保持[0,0]，明确缺失仍为null', () => {
    expect(boundWindowMeanDirect({ ...interval(), dniWattsPerM2: 0 }, bound()).directWattsPerM2).toEqual({ lower: 0, upper: 0 })
    expect(boundWindowMeanDirect({ ...interval(), dniWattsPerM2: null }, bound()).directWattsPerM2).toBeNull()
  })
  it('点采样不能冒充整段几何界限', () => {
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), semantics: 'instantaneous' as never })).toThrow('全区间')
  })
  it('瞬时辐射不能冒充区间均值', () => {
    expect(() => boundWindowMeanDirect({ ...interval(), semantics: 'instantaneous' as never }, bound())).toThrow('均值')
  })
  it('时间起点或终点错配拒绝', () => {
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), intervalStartMs: 1 })).toThrow('时段')
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), intervalEndMs: 7200000 })).toThrow('时段')
  })
  it('空窗面或几何来源引用拒绝', () => {
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), referencePlane: ' ' })).toThrow('几何')
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), evidenceRef: '' })).toThrow('几何')
  })
  it.each([-1, 1.1, NaN, Infinity])('非法投影上界%s拒绝', upper => {
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), upper })).toThrow('几何')
  })
  it('下界为负或高于上界拒绝', () => {
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), lower: -0.1 })).toThrow('几何')
    expect(() => boundWindowMeanDirect(interval(), { ...bound(), lower: 0.8 })).toThrow('几何')
  })
  it.each([-1, NaN, Infinity, '100'])('非法DNI%s拒绝', value => {
    expect(() => boundWindowMeanDirect({ ...interval(), dniWattsPerM2: value as never }, bound())).toThrow('辐射')
  })
  it('非法或倒置时段拒绝', () => {
    expect(() => boundWindowMeanDirect({ ...interval(), intervalStartMs: 0.5 }, bound())).toThrow('时段')
    expect(() => boundWindowMeanDirect({ ...interval(), intervalEndMs: 0 }, { ...bound(), intervalEndMs: 0 })).toThrow('时段')
  })
  it('不读取GHI或DHI重算直射，不修改输入', () => {
    const radiation = interval(); const geometry = bound(); const before = structuredClone([radiation, geometry])
    expect(boundWindowMeanDirect({ ...radiation, ghiWattsPerM2: null, dhiWattsPerM2: null }, geometry).directWattsPerM2).toEqual({ lower: 20, upper: 60 })
    boundWindowMeanDirect(radiation, geometry)
    expect([radiation, geometry]).toEqual(before)
  })
})
