import { describe, expect, it } from 'vitest'
import { deriveJointDryingResponse, type JointResponseParameters } from '../../../models/care/experiments/joint-drying-response.js'

/** L1 unit_fake；独立解析Expected见joint-drying-response-contract.md，不以SUT生成答案。 */
const parameters: JointResponseParameters = {
  version: 'light-log-vpd-hypothesis/v1', sourceRef: 'synthetic:joint-response', referenceRef: 'synthetic:reference',
  referencePpfd: 100, referenceVpdKpa: 1, lightHalfSaturationPpfd: 100, vpdSensitivity: 0.5,
  referenceTranspirationShare: 0.75, validPpfd: { min: 0, max: 1000 }, validVpdKpa: { min: 0, max: 10 },
}
const point = (value: number) => ({ min: value, max: value })
const input = (q: number, d: number) => ({ parameters, ppfd: point(q), vpdKpa: point(d), soilEvaporation: { referenceRef: parameters.referenceRef, range: point(1) } })

describe('光照与VPD非线性研究候选', () => {
  it.each([[100, 1, 1], [200, 1, 1.25], [100, Math.E, 0.25 + 3 * Math.E / 8], [100, Math.E ** 2, 0.25], [0, 1, 0.25], [100, 0, 0.25]])('q=%s、D=%s的独立手算需求', (q, d, expected) => {
    const result = deriveJointDryingResponse(input(q, d))
    expect(result.status).toBe('candidate')
    expect(result.productionAdmission).toBe(false)
    if (result.status !== 'candidate') { throw new Error('缺少候选') }
    expect(result.environmentDemand.min).toBeCloseTo(expected, 12)
    expect(result.environmentDemand.max).toBeCloseTo(expected, 12)
  })
  it('范围包括内部VPD峰值，不只计算两端', () => {
    const result = deriveJointDryingResponse({ ...input(100, 1), vpdKpa: { min: 1, max: Math.E ** 2 } })
    expect(result.status).toBe('candidate')
    if (result.status !== 'candidate') { throw new Error('缺少候选') }
    expect(result.environmentDemand.min).toBeCloseTo(0.25, 12)
    expect(result.environmentDemand.max).toBeCloseTo(0.25 + 3 * Math.E / 8, 12)
  })
  it('缺土壤蒸发证据不把叶片项冒充整盆需求', () => {
    expect(deriveJointDryingResponse({ ...input(100, 1), soilEvaporation: null }).status).toBe('insufficient_evidence')
  })
  it.each(['parameters', 'ppfd', 'vpdKpa'] as const)('缺%s不补默认', key => {
    expect(deriveJointDryingResponse({ ...input(100, 1), [key]: null }).status).toBe('insufficient_evidence')
  })
  it('超出实验范围不钳制为有效值', () => {
    expect(deriveJointDryingResponse(input(100, 11)).status).toBe('outside_model_scope')
  })
  it('不同参考条件的蒸发项不可混合', () => {
    expect(() => deriveJointDryingResponse({ ...input(100, 1), soilEvaporation: { referenceRef: 'other', range: point(1) } })).toThrow()
  })
  it.each([NaN, Infinity, -1, null])('拒绝非法PPFD %s', value => {
    expect(() => deriveJointDryingResponse({ ...input(100, 1), ppfd: point(value as number) })).toThrow()
  })
  it.each(['referencePpfd', 'referenceVpdKpa', 'lightHalfSaturationPpfd', 'vpdSensitivity'] as const)('拒绝%s为零', key => {
    expect(() => deriveJointDryingResponse({ ...input(100, 1), parameters: { ...parameters, [key]: 0 } })).toThrow()
  })
  it('同一输入重放一致且不改原输入', () => {
    const value = input(100, 1); const copy = structuredClone(value)
    expect(deriveJointDryingResponse(value)).toEqual(deriveJointDryingResponse(copy))
    expect(value).toEqual(copy)
  })
  it('正光照下溢不得冒充有效零光照', () => {
    expect(() => deriveJointDryingResponse(input(Number.MIN_VALUE, 1))).toThrow()
  })
})
