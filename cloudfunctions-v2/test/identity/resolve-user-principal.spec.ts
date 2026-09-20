import { describe, expect, test } from 'vitest'

import {
  统一用户主体解析错误,
  解析统一用户主体,
  type 解析统一用户主体输入
} from '../../src/identity/domain/resolve-user-principal.js'
import type { UserRef } from '../../src/contracts/types.js'

/**
 * Expected 来源：`principal-capability/v1` 与 `001_identity.sql`。
 *
 * 测试层次：unit_fake。这里用显式快照替代 Repository 和 MySQL，只验证 identity 领域的
 * 主体解析规则；不证明平台凭证校验、Bearer 摘要检索、SQL JOIN 或真实数据库约束。
 */
describe('解析统一用户主体', () => {
  const 当前时间 = Date.parse('2026-09-20T04:00:00.000Z')
  const 当前用户 = 'usr_identity_demo_001' as UserRef
  const 一秒毫秒数 = 1_000
  const 两秒毫秒数 = 2_000

  function 有效输入(): 解析统一用户主体输入 {
    return {
      user: {
        user_id: 当前用户,
        status: 'active',
        sessionVersion: 3
      },
      binding: {
        user_id: 当前用户,
        platform: 'wechat',
        status: 'active'
      },
      session: {
        user_id: 当前用户,
        authenticatedVia: 'wechat',
        status: 'active',
        sessionVersion: 3,
        issuedAtMs: Date.parse('2026-09-20T03:00:00.000Z'),
        expiresAtMs: Date.parse('2026-09-21T03:00:00.000Z')
      },
      nowMs: 当前时间
    }
  }

  test('把有效用户、绑定和会话快照解析为不含平台主体标识的公开主体', () => {
    expect(解析统一用户主体(有效输入())).toEqual({
      principalType: 'user',
      user_id: 'usr_identity_demo_001',
      sessionVersion: 3,
      authenticatedVia: 'wechat',
      issuedAt: '2026-09-20T03:00:00.000Z',
      expiresAt: '2026-09-21T03:00:00.000Z'
    })
  })

  test.each<[string, (输入: 解析统一用户主体输入) => void]>([
    ['用户暂停', (输入) => (输入.user.status = 'suspended')],
    ['绑定撤销', (输入) => (输入.binding.status = 'revoked')],
    ['会话撤销', (输入) => (输入.session.status = 'revoked')]
  ])('%s 时拒绝解析', (_名称, 修改) => {
    const 输入 = 有效输入()
    修改(输入)

    expect(() => 解析统一用户主体(输入)).toThrowError(统一用户主体解析错误)
  })

  test('会话版本与用户当前版本不一致时拒绝旧会话', () => {
    const 输入 = 有效输入()
    输入.session.sessionVersion = 2

    expect(() => 解析统一用户主体(输入)).toThrowError(/会话已失效/u)
  })

  test('当前时间恰好等于过期时间时拒绝，不留下边界放行窗口', () => {
    const 输入 = 有效输入()
    输入.nowMs = 输入.session.expiresAtMs

    expect(() => 解析统一用户主体(输入)).toThrowError(/会话已失效/u)
  })

  test.each([
    [
      '签发时间晚于失效时间',
      { issuedAtMs: 当前时间 + 两秒毫秒数, expiresAtMs: 当前时间 + 一秒毫秒数 }
    ],
    ['当前时间早于签发时间', { issuedAtMs: 当前时间 + 一秒毫秒数 }],
    ['签发时间不是有限整数', { issuedAtMs: Number.NaN }]
  ])('%s 时失败关闭', (_名称, sessionPatch) => {
    const 输入 = 有效输入()
    Object.assign(输入.session, sessionPatch)

    expect(() => 解析统一用户主体(输入)).toThrowError(/身份数据不合法/u)
  })

  test('用户、绑定和会话归属不一致时失败关闭', () => {
    const 输入 = 有效输入()
    输入.binding.user_id = 'usr_another_user_001' as UserRef

    expect(() => 解析统一用户主体(输入)).toThrowError(/身份数据不合法/u)
  })

  test('会话认证入口与绑定平台不一致时失败关闭', () => {
    const 输入 = 有效输入()
    输入.session.authenticatedVia = 'douyin'

    expect(() => 解析统一用户主体(输入)).toThrowError(/身份数据不合法/u)
  })
})
