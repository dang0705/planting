import { describe, expect, it } from 'vitest'
import { deriveMeasuredPot } from '../../src/care/cultivation/derive-measured-pot.js'

/**
 * unit_fake：Expected 来自批准计划的内盆与缺证据边界、圆台体积公式及 1 cm³=1 mL。
 * 真实经过尺寸计算与既有盆器安全门；无替身，不证明真实测量、持水量或 HTTP。
 */
describe('unit_fake 实测内盆几何与排水安全', () => {
  const measured = {
    actualInnerPotConfirmed: true,
    drainageAvailable: true,
    potTopDiameterCm: 20,
    potBottomDiameterCm: 10,
    potHeightCm: 12,
  } as const

  it('圆台直径转半径，容积为 700π mL；不输出持水倍率', () => {
    const result = deriveMeasuredPot(measured)
    expect(result.safety).toBe('safe')
    expect(result.geometry?.containerVolumeMl).toBeCloseTo(700 * Math.PI, 10)
    expect(result.geometry?.containerVolumeLiters).toBeCloseTo(0.7 * Math.PI, 12)
    expect(result.substrateVolumeMl).toBeNull()
    expect(result.waterRetention).toBeNull()
  })

  it('等径盆是圆柱：半径 5cm、高 10cm，体积 250π mL', () => {
    const result = deriveMeasuredPot({ ...measured, potTopDiameterCm: 10, potBottomDiameterCm: 10, potHeightCm: 10 })
    expect(result.geometry?.containerVolumeMl).toBeCloseTo(250 * Math.PI, 10)
  })

  it('尺寸整体翻倍，体积按立方增长', () => {
    const result = deriveMeasuredPot({ ...measured, potTopDiameterCm: 40, potBottomDiameterCm: 20, potHeightCm: 24 })
    expect(result.geometry?.containerVolumeMl).toBeCloseTo(5600 * Math.PI, 9)
  })

  it.each(['potTopDiameterCm', 'potBottomDiameterCm', 'potHeightCm'] as const)('%s 缺失不猜测尺寸', field => {
    const result = deriveMeasuredPot({ ...measured, [field]: null })
    expect(result.geometry).toBeNull()
    expect(result.safety).toBe('insufficient_evidence')
  })

  it.each([false, null] as const)('未确认实际内盆（%s）不把外盆体积归给植物', actualInnerPotConfirmed => {
    expect(deriveMeasuredPot({ ...measured, actualInnerPotConfirmed })).toMatchObject({
      geometry: null, safety: 'insufficient_evidence',
    })
  })

  it.each([[false, 'drainage_risk'], [null, 'insufficient_evidence']] as const)('有效尺寸但排水=%s → %s', (drainageAvailable, safety) => {
    const result = deriveMeasuredPot({ ...measured, drainageAvailable })
    expect(result.geometry).not.toBeNull()
    expect(result.safety).toBe(safety)
  })

  it.each(['potTopDiameterCm', 'potBottomDiameterCm', 'potHeightCm'] as const)('%s 拒绝非法数值而非宽松转换', field => {
    for (const invalid of [undefined, 0, -1, NaN, Infinity, '12', true]) {
      expect(() => deriveMeasuredPot({ ...measured, [field]: invalid } as never)).toThrow(TypeError)
    }
  })

  it('正数计算溢出不能形成有效几何', () => {
    expect(() => deriveMeasuredPot({ ...measured, potTopDiameterCm: Number.MAX_VALUE })).toThrow(RangeError)
  })

  it('极小正数计算下溢不能伪装零体积', () => {
    expect(() => deriveMeasuredPot({ ...measured, potTopDiameterCm: Number.MIN_VALUE, potBottomDiameterCm: Number.MIN_VALUE })).toThrow(RangeError)
  })

  it('未知尺寸不掩盖另一尺寸的非法值', () => {
    expect(() => deriveMeasuredPot({ ...measured, potHeightCm: null, potTopDiameterCm: -1 })).toThrow(TypeError)
  })

  it('缺尺寸时仍拒绝非法排水证据', () => {
    expect(() => deriveMeasuredPot({ ...measured, potHeightCm: null, drainageAvailable: 'true' } as never)).toThrow(TypeError)
  })

  it('冻结输入可用，计算不写回尺寸事实', () => {
    const input = Object.freeze({ ...measured })
    expect(deriveMeasuredPot(input).safety).toBe('safe')
    expect(input).toEqual(measured)
  })

  it('拒绝缺失或非对象输入', () => {
    for (const invalid of [null, undefined, [], 'pot']) {
      expect(() => deriveMeasuredPot(invalid as never)).toThrow(TypeError)
    }
  })
})
