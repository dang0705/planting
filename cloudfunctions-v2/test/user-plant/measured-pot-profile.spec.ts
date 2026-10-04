import { describe, expect, test } from 'vitest'
import { lockMeasuredPotProfile } from '../../src/user-plant/domain/measured-pot-profile.js'
import { deriveMeasuredPot } from '../../src/care/cultivation/derive-measured-pot.js'

/** L1/unit_fake：无替身。Expected来自批准计划6.5内盆/非法尺寸/未知边界、
 * 已冻结实测盆器合同及圆台700π毫升的独立数学基准。
 * 本次实际经过严格输入准入→不可变事实→现有盆器计算；不证明用户实测、
 * 完整档案、数据库、认证、保水策略或公开HTTP。 */
const facts = {
  actualInnerPotConfirmed: true,
  drainageAvailable: true,
  potTopDiameterCm: 20,
  potBottomDiameterCm: 10,
  potHeightCm: 12,
}

describe('用户植物实测盆器事实子结构', () => {
  test('保留厘米事实、冻结独立副本，现有计算输出700π毫升', () => {
    const input = { ...facts }
    const profile = lockMeasuredPotProfile(input)
    input.potHeightCm = 100
    expect(profile).toEqual(facts)
    expect(profile).not.toBe(input)
    expect(Object.isFrozen(profile)).toBe(true)
    const result = deriveMeasuredPot(profile)
    expect(result.geometry?.containerVolumeMl).toBeCloseTo(700 * Math.PI, 10)
    expect(result.waterRetention).toBeNull()
  })

  test('未知状态与尺寸必须显式null，既不猜值也不标完整', () => {
    const profile = lockMeasuredPotProfile({
      actualInnerPotConfirmed: null, drainageAvailable: null,
      potTopDiameterCm: null, potBottomDiameterCm: null, potHeightCm: null,
    })
    expect(deriveMeasuredPot(profile)).toEqual({
      geometry: null, safety: 'insufficient_evidence', substrateVolumeMl: null, waterRetention: null,
    })
  })

  test.each([false, null])('外盆或未确认内盆=%s，保存事实不猜内盆容积', actualInnerPotConfirmed => {
    const profile = lockMeasuredPotProfile({ ...facts, actualInnerPotConfirmed })
    expect(deriveMeasuredPot(profile).geometry).toBeNull()
  })

  test('已确认无排水孔的事实保留，下游返回排水风险', () => {
    const profile = lockMeasuredPotProfile({ ...facts, drainageAvailable: false })
    expect(profile.drainageAvailable).toBe(false)
    expect(deriveMeasuredPot(profile).safety).toBe('drainage_risk')
  })

  test.each(Object.keys(facts))('缺少%s不能当作null或默认值', field => {
    const input: Record<string, unknown> = { ...facts }
    delete input[field]
    expect(() => lockMeasuredPotProfile(input)).toThrow(TypeError)
  })

  test.each(['actualInnerPotConfirmed', 'drainageAvailable'])('%s拒绝字符串和数值真假转换', field => {
    for (const value of ['true', 'false', 0, 1, {}, []]) {
      expect(() => lockMeasuredPotProfile({ ...facts, [field]: value })).toThrow(TypeError)
    }
  })

  test.each(['potTopDiameterCm', 'potBottomDiameterCm', 'potHeightCm'])('%s只接受厘米有限正数或null', field => {
    for (const value of [0, -1, '12', true, NaN, Infinity, undefined]) {
      expect(() => lockMeasuredPotProfile({ ...facts, [field]: value })).toThrow(TypeError)
    }
  })

  test.each(['user_id', 'waterRetention', 'containerVolumeMl', 'schemaVersion'])('客户端附加%s字段必须拒绝，不能静默授权', field => {
    expect(() => lockMeasuredPotProfile({ ...facts, [field]: 1 })).toThrow(TypeError)
  })

  test('非法对象、类实例和非JSON值不能被压成合法事实', () => {
    for (const value of [null, [], 'pot', undefined, new Date(), Object.assign(new (class {})(), facts), { ...facts, toJSON: () => facts }]) {
      expect(() => lockMeasuredPotProfile(value)).toThrow(TypeError)
    }
  })
})
