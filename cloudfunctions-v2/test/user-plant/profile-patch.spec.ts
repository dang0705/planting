import { expect, test } from 'vitest'
import { lockUserPlantProfilePatch } from '../../src/user-plant/domain/profile-patch.js'

/** L1/unit_fake，无替身；Expected来自统一计划省略/清除语义、严格字段边界及profile-patch-contract。
 * 不证明HTTP、身份、持久化、完整档案或新增未冻结字段。 */
const pot = { actualInnerPotConfirmed: null, drainageAvailable: false, potTopDiameterCm: null, potBottomDiameterCm: 10, potHeightCm: 12 }
test('只改昵称保留省略形态，空字符串明确清除', () => {
  expect(lockUserPlantProfilePatch({ version: 1, nickname: '' })).toEqual({ version: 1, nickname: '' })
})
test('只改测量保留省略昵称，冻结独立嵌套副本', () => {
  const input = { version: 2, measuredPot: { ...pot } }, value = lockUserPlantProfilePatch(input)
  input.measuredPot.potHeightCm = 99
  expect(value).toEqual({ version: 2, measuredPot: pot }); expect(Object.isFrozen(value)).toBe(true); expect(Object.isFrozen(value.measuredPot)).toBe(true)
})
test.each([{}, { version: 1 }, { version: 0, nickname: '青' }, { version: 1.5, nickname: '青' }, { version: '1', nickname: '青' }, { version: 4294967296, nickname: '青' }, { version: 1, nickname: null }, { version: 1, measuredPot: null }, { version: 1, measuredPot: {} }, { version: 1, nickname: '🌱'.repeat(81) }, { version: 1, nickname: '青', identityStatus: 'confirmed' }, { version: 1, nickname: '青', profileVersion: 'fake' }, { version: 1, nickname: '青', dli: 10 }])('非法/空更新拒绝：%j', input => {
  expect(() => lockUserPlantProfilePatch(input)).toThrow()
})
test('80个Unicode码点和最大合法旧版本不被截断', () => {
  expect(lockUserPlantProfilePatch({ version: 4294967295, nickname: '🌱'.repeat(80) })).toEqual({ version: 4294967295, nickname: '🌱'.repeat(80) })
})
