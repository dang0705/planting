import { describe, expect, it } from 'vitest'
import { deriveLuxCompositeAnchor, applyLuxCompositeAnchor } from '../../src/care/light/lux-composite-anchor.js'
import { integratePpfdIntervals } from '../../src/care/light/integrate-ppfd-intervals.js'

/** unit_fake／L1：Expected 来自极简输入合同及独立区间除法；不是实测制品或正式策略。 */
const input = () => ({
  mode: 'shared_channel_candidate' as const,
  plantReference: 'plant-position', windowReference: 'window-plane',
  observation: { atMs: 1_000, plantReference: 'plant-position', sourceRef: 'synthetic-meter', source: 'meter' as const, confirmed: true, unit: 'lux' as const, lux: { lower: 200, upper: 200 } },
  window: { atMs: 1_000, windowReference: 'window-plane', sourceRef: 'synthetic-window', semantics: 'instantaneous' as const, unit: 'lux' as const, lux: { lower: 1000, upper: 1000 } },
})
const channels = () => ({ plantReference: 'plant-position', windowReference: 'window-plane', directPpfd: { lower: 10, upper: 10 }, diffusePpfd: { lower: 5, upper: 5 } })

function anchor() {
  const result = deriveLuxCompositeAnchor(input())
  if (result.status !== 'available') { throw new Error('数学制品应提供可用候选') }
  return result
}

describe('unit_fake 极简Lux共享候选，不拆两套系数', () => {
  it('同刻比例接双通道与实际秒数积分，不再次叠加玻璃', () => {
    const candidate = anchor()
    expect(candidate.factor).toEqual({ lower: 0.2, upper: 0.2 })
    expect(candidate.productionAdmission).toBe(false)
    const result = applyLuxCompositeAnchor(candidate, channels())
    expect(result).toEqual({ directPpfd: { lower: 2, upper: 2 }, diffusePpfd: { lower: 1, upper: 1 }, totalPpfd: { lower: 3, upper: 3 } })
    const integrated = integratePpfdIntervals({ startMs: 0, endMs: 86_400_000, referencePlane: 'plant-position' }, [{ startMs: 0, endMs: 86_400_000, referencePlane: 'plant-position', semantics: 'interval_mean', ppfdMicromolPerM2PerSecond: result.totalPpfd }])
    expect(integrated.completeIntegralMolPerM2?.lower).toBeCloseTo(0.2592, 10)
  })
  it('区间除法保留上下界', () => {
    const value = input(); value.observation.lux = { lower: 180, upper: 220 }; value.window.lux = { lower: 900, upper: 1100 }
    expect(deriveLuxCompositeAnchor(value)).toMatchObject({ factor: { lower: 180 / 1100, upper: 220 / 900 } })
  })
  it('有效零位置读数不当缺失，且不强制比值不大于1', () => {
    const value = input(); value.observation.lux = { lower: 0, upper: 0 }
    expect(deriveLuxCompositeAnchor(value)).toMatchObject({ factor: { lower: 0, upper: 0 } })
    value.observation.lux = { lower: 1200, upper: 1200 }
    expect(deriveLuxCompositeAnchor(value)).toMatchObject({ factor: { lower: 1.2, upper: 1.2 } })
  })
  it.each([null, { lower: 0, upper: 0 }, { lower: 0, upper: 100 }])('窗面分母缺失或包含零时不造有限因子：%j', lux => {
    expect(deriveLuxCompositeAnchor({ ...input(), window: { ...input().window, lux } })).toMatchObject({ status: 'insufficient_evidence' })
  })
  it('缺失、未确认与实验摄像头不伪装可靠测量', () => {
    for (const observation of [{ ...input().observation, lux: null }, { ...input().observation, confirmed: false }, { ...input().observation, source: 'experimental_camera' as const }]) {
      expect(deriveLuxCompositeAnchor({ ...input(), observation })).toMatchObject({ status: 'insufficient_evidence' })
    }
  })
  it('时刻、引用、瞬时语义、单位和非法区间拒绝', () => {
    for (const value of [
      { ...input(), window: { ...input().window, atMs: 1001 } },
      { ...input(), observation: { ...input().observation, plantReference: 'other' } },
      { ...input(), window: { ...input().window, semantics: 'interval_mean' } },
      { ...input(), observation: { ...input().observation, unit: 'W/m²' } },
      { ...input(), observation: { ...input().observation, lux: { lower: -1, upper: 10 } } },
    ]) { expect(() => deriveLuxCompositeAnchor(value as never)).toThrow() }
  })
  it('位置改变拒绝复用；缺通道不当零', () => {
    expect(() => applyLuxCompositeAnchor(anchor(), { ...channels(), plantReference: 'moved' })).toThrow()
    expect(applyLuxCompositeAnchor(anchor(), { ...channels(), diffusePpfd: null })).toEqual({ directPpfd: { lower: 2, upper: 2 }, diffusePpfd: null, totalPpfd: null })
  })
})
