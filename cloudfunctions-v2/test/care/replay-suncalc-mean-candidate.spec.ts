import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { findProjectRoot } from '../support/project-root.js'
import { estimateThreePointMean, replaySunCalcMeanCandidate } from '../../src/care/application/replay-suncalc-mean-candidate.js'

const context = { series: 'hourly' as const, sourceRef: 'saved-open-meteo-fixture', fetchedAtMs: Date.parse('2026-10-04T11:14:48Z') }
const location = { latitudeDeg: 31.23, longitudeDeg: 121.47, plane: { reference: 'south-window-exterior', tiltDeg: 90, azimuthDeg: 180 } }
const fixture = () => JSON.parse(readFileSync(path.join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8'))

describe('unit_fake 三点求积平均值；Expected来自NIST公式与独立积分', () => {
  it.each([
    ['常量', () => 0.75, 0.75],
    ['线性', (x: number) => x, 0.5],
    ['二次', (x: number) => x * x, 1/3],
    ['四次', (x: number) => x ** 4, 0.2],
    ['五次', (x: number) => x ** 5, 1/6]
  ] as const)('%s平均值不漏除以区间长度', (_name, evaluate, expected) => {
    expect(estimateThreePointMean(evaluate)).toBeCloseTo(expected, 12)
  })
  it('零和一边界保持，不制造负投影或大于一的投影', () => {
    expect(estimateThreePointMean(() => 0)).toBe(0)
    expect(estimateThreePointMean(() => 1)).toBeCloseTo(1,12)
  })
  it('短时直射可能被所有节点漏掉，数值零不是全程无光的保证', () => {
    // 解析实际平均为0.01，三节点都不在该短区间；不从SUT推导Expected。
    expect(estimateThreePointMean(x => x > 0.1 && x < 0.11 ? 1 : 0)).toBe(0)
  })
  it.each([NaN, Infinity, -0.1, 1.1])('拒绝非法投影%s', invalid => {
    expect(() => estimateThreePointMean(() => invalid)).toThrow()
  })
})

describe('unit_real_data 真实响应→归一化→SunCalc→候选均值；网络由已保存制品替换', () => {
  it('24条真实区间保留时间、来源、物理范围与明确实验假设', () => {
    const raw=fixture(); const result=replaySunCalcMeanCandidate(raw,context,location)
    expect(result.scope).toBe('offline_candidate')
    expect(result.productionAdmission).toBe(false)
    expect(result.radiation.sourceRef).toBe(context.sourceRef)
    expect(result.radiation.timezone).toBe('Asia/Shanghai')
    expect(result.intervals).toHaveLength(24)
    expect(result.location).toEqual({ latitudeDeg:31.23,longitudeDeg:121.47 })
    for (const [index, interval] of result.intervals.entries()) {
      expect(interval.intervalEndMs).toBe(raw.hourly.time[index]*1000)
      expect(interval.intervalStartMs).toBe(raw.hourly.time[index]*1000-3600000)
      expect(interval.assumption).toBe('piecewise_constant_dni')
      expect(interval.numericalGuarantee).toBe('not_certified')
      expect(interval.referencePlane).toBe('south-window-exterior')
      expect(interval.nonnegativePhysicalEnvelope).toEqual({lower:0,upper:raw.hourly.direct_normal_irradiance[index]})
      expect(interval.constantDniEstimateWattsPerM2).toBeGreaterThanOrEqual(0)
      expect(interval.constantDniEstimateWattsPerM2).toBeLessThanOrEqual(raw.hourly.direct_normal_irradiance[index])
      expect(interval.samples).toHaveLength(3)
      for (const sample of interval.samples) {
        expect(sample.atMs).toBeGreaterThan(interval.intervalStartMs)
        expect(sample.atMs).toBeLessThan(interval.intervalEndMs)
        expect(sample.solarMethod).toBe('suncalc@2.1.0')
      }
    }
  })
  it('构造Edge：缺DNI保持null，有效零保持零', () => {
    const raw=fixture(); raw.hourly.direct_normal_irradiance[0]=null
    const result=replaySunCalcMeanCandidate(raw,context,location)
    expect(result.intervals[0]!.constantDniEstimateWattsPerM2).toBeNull()
    expect(result.intervals[0]!.nonnegativePhysicalEnvelope).toBeNull()
    expect(result.intervals[1]!.constantDniEstimateWattsPerM2).toBe(0)
  })
  it('构造Edge：空序列仍检查地点和窗面，不补覆盖', () => {
    const raw=fixture(); for(const key of Object.keys(raw.hourly)) { raw.hourly[key]=[] }
    expect(replaySunCalcMeanCandidate(raw,context,location).intervals).toEqual([])
    expect(()=>replaySunCalcMeanCandidate(raw,context,{...location,latitudeDeg:NaN})).toThrow()
    expect(()=>replaySunCalcMeanCandidate(raw,context,{...location,plane:{...location.plane,reference:''}})).toThrow()
  })
  it('不修改真实输入制品', () => {
    const raw=fixture(); const before=JSON.stringify(raw)
    replaySunCalcMeanCandidate(raw,context,location)
    expect(JSON.stringify(raw)).toBe(before)
  })
})
