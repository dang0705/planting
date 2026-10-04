import { describe, expect, test } from 'vitest'

import { createPublicContractValidators } from '../../src/contracts/index.js'

/** 登录请求 DTO 校验器的最小测试访问类型；缺失时由 Expected 断言给出行为失败。 */
type IdentitySessionContractValidators = {
  /** 严格校验一次性微信 code 请求正文。 */
  readonly createIdentitySessionRequest?: (input: unknown) => boolean
  /** 严格校验首次登录成功时披露的会话数据。 */
  readonly createIdentitySessionResponse?: (input: unknown) => boolean
}

const validators = createPublicContractValidators() as unknown as IdentitySessionContractValidators

/**
 * Expected 来源：`identity-session-issuance.md` §2 的字段级请求/响应合同。
 * 测试层次：L1 `unit_fake`；只调用公开 AJV DTO 校验器，不经过 HTTP、Provider、事务或数据库。
 * 只替换外部 IO，不替换合同或校验逻辑；明确不证明登录会话已经持久化。
 */
describe('微信登录公开 DTO 合同', () => {
  test('仅接受单字段 `{ code }` 请求并拒绝任何额外字段', () => {
    const validate = validators.createIdentitySessionRequest
    expect(typeof validate).toBe('function')
    if (!validate) {
      return
    }

    expect(validate({ code: 'wx-one-time-code' })).toBe(true)
    expect(validate({ code: '' })).toBe(false)
    expect(validate({ code: 'wx-one-time-code', appScope: 'client-controlled' })).toBe(false)
    expect(validate({ code: 'wx-one-time-code', openid: 'client-controlled' })).toBe(false)
    expect(validate({ code: 123 })).toBe(false)
    expect(validate(null)).toBe(false)
  })

  test('成功响应数据只允许 accessToken 与 expiresAt', () => {
    const validate = validators.createIdentitySessionResponse
    expect(typeof validate).toBe('function')
    if (!validate) {
      return
    }

    expect(
      validate({
        accessToken: 'high-entropy-bearer-for-contract-test',
        expiresAt: '2026-09-27T15:00:00.000Z'
      })
    ).toBe(true)
    expect(
      validate({
        accessToken: 'high-entropy-bearer-for-contract-test',
        expiresAt: '2026-09-27T15:00:00.000Z',
        user_id: 'usr_private-reference'
      })
    ).toBe(false)
    expect(validate({ accessToken: '', expiresAt: '2026-09-27T15:00:00.000Z' })).toBe(false)
    expect(validate({ accessToken: 'token', expiresAt: 'not-a-date' })).toBe(false)
  })
})
