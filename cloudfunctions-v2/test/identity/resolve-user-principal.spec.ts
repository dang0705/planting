import { describe, expect, test } from 'vitest'

import {
  UnifiedUserPrincipalResolveError,
  resolveUnifiedUserPrincipal,
  type ResolveUnifiedUserPrincipalInput
} from '../../src/identity/domain/resolve-user-principal.js'
import type { UserRef } from '../../src/contracts/types.js'

/**
 * Expected 来源：`principal-capability/v1` 与 `001_identity.sql`。
 *
 * 测试层次：unit_fake。这里用显式快照替代 Repository 和 MySQL，只验证 identity 领域的
 * 主体解析规则；不证明平台凭证校验、Bearer 摘要检索、SQL JOIN 或真实数据库约束。
 */
describe('解析统一用户主体', () => {
  const currentTime = Date.parse('2026-09-20T04:00:00.000Z')
  const currentUser = 'usr_identity_demo_001' as UserRef
  const oneSecondMillis = 1_000
  const twoSecondsMillis = 2_000

  function validInput(): ResolveUnifiedUserPrincipalInput {
    return {
      user: {
        user_id: currentUser,
        status: 'active',
        sessionVersion: 3
      },
      binding: {
        user_id: currentUser,
        platform: 'wechat',
        status: 'active'
      },
      session: {
        user_id: currentUser,
        authenticatedVia: 'wechat',
        status: 'active',
        sessionVersion: 3,
        issuedAtMs: Date.parse('2026-09-20T03:00:00.000Z'),
        expiresAtMs: Date.parse('2026-09-21T03:00:00.000Z')
      },
      nowMs: currentTime
    }
  }

  test('把有效用户、绑定和会话快照解析为不含平台主体标识的公开主体', () => {
    expect(resolveUnifiedUserPrincipal(validInput())).toEqual({
      principalType: 'user',
      user_id: 'usr_identity_demo_001',
      sessionVersion: 3,
      authenticatedVia: 'wechat',
      issuedAt: '2026-09-20T03:00:00.000Z',
      expiresAt: '2026-09-21T03:00:00.000Z'
    })
  })

  test.each<[string, (input: ResolveUnifiedUserPrincipalInput) => void]>([
    ['用户暂停', (input) => (input.user.status = 'suspended')],
    ['绑定撤销', (input) => (input.binding.status = 'revoked')],
    ['会话撤销', (input) => (input.session.status = 'revoked')]
  ])('%s 时拒绝解析', (_Name, change) => {
    const input = validInput()
    change(input)

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(UnifiedUserPrincipalResolveError)
  })

  test('会话版本与用户当前版本不一致时拒绝旧会话', () => {
    const input = validInput()
    input.session.sessionVersion = 2

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(/会话已失效/u)
  })

  test('当前时间恰好等于过期时间时拒绝，不留下边界放行窗口', () => {
    const input = validInput()
    input.nowMs = input.session.expiresAtMs

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(/会话已失效/u)
  })

  test.each([
    [
      '签发时间晚于失效时间',
      { issuedAtMs: currentTime + twoSecondsMillis, expiresAtMs: currentTime + oneSecondMillis }
    ],
    ['当前时间早于签发时间', { issuedAtMs: currentTime + oneSecondMillis }],
    ['签发时间不是有限整数', { issuedAtMs: Number.NaN }]
  ])('%s 时失败关闭', (_Name, sessionPatch) => {
    const input = validInput()
    Object.assign(input.session, sessionPatch)

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(/身份数据不合法/u)
  })

  test('用户、绑定和会话归属不一致时失败关闭', () => {
    const input = validInput()
    input.binding.user_id = 'usr_another_user_001' as UserRef

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(/身份数据不合法/u)
  })

  test('会话认证入口与绑定平台不一致时失败关闭', () => {
    const input = validInput()
    input.session.authenticatedVia = 'douyin'

    expect(() => resolveUnifiedUserPrincipal(input)).toThrowError(/身份数据不合法/u)
  })
})
