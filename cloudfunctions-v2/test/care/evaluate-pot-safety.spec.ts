import { describe, expect, it } from 'vitest'
import { evaluatePotSafety } from '../../src/care/cultivation/evaluate-pot-safety.js'

/** unit_fake：独立 Expected 来自批准计划第六节与 pot-safety-contract；无替身、无数据库或真实盆土测量。 */
describe('unit_fake 实际内盆安全条件；独立证据准入合同', () => {
  const values = [true, false, null] as const
  for (const actualInnerPotConfirmed of values) {
    for (const potGeometryValid of values) {
      for (const drainageAvailable of values) {
        // 预期由合同判定表固定，不从被测函数或 DMN 运行输出取得。
        const expected = actualInnerPotConfirmed === true && potGeometryValid === true
          ? drainageAvailable === true ? 'safe'
            : drainageAvailable === false ? 'drainage_risk' : 'insufficient_evidence'
          : 'insufficient_evidence'
        it(`内盆=${actualInnerPotConfirmed} 几何=${potGeometryValid} 排水=${drainageAvailable} → ${expected}`, () => {
          expect(evaluatePotSafety({ actualInnerPotConfirmed, potGeometryValid, drainageAvailable })).toBe(expected)
        })
      }
    }
  }

  it.each(['actualInnerPotConfirmed', 'potGeometryValid', 'drainageAvailable'] as const)(
    '%s 非法真值不能形成安全结果', field => {
      for (const invalid of [undefined, 1, 0, 'true', 'false', {}, []]) {
        const input = { actualInnerPotConfirmed: true, potGeometryValid: true, drainageAvailable: true }
        Object.assign(input, { [field]: invalid })
        expect(() => evaluatePotSafety(input)).toThrow(TypeError)
      }
    }
  )
  it('拒绝缺失输入对象', () => {
    expect(() => evaluatePotSafety(null as never)).toThrow(TypeError)
  })
  it('计算不修改输入事实', () => {
    const input = Object.freeze({ actualInnerPotConfirmed: true, potGeometryValid: true, drainageAvailable: false })
    expect(evaluatePotSafety(input)).toBe('drainage_risk')
    expect(input).toEqual({ actualInnerPotConfirmed: true, potGeometryValid: true, drainageAvailable: false })
  })
})
