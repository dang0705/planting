import { describe, expect, test, vi } from 'vitest'

import { createMysqlUserPrincipalRepository } from '../../src/identity/repository/mysql-user-principal-repository.js'

const query = {
  sessionRefHash: 'b'.repeat(Number('64'))
}

/**
 * Expected 来源：`principal-capability/v1` 与 `001_identity.sql` 的会话摘要检索和三方归属约束。
 * 测试层次：L2 / `unit_fake`；替换参数化 SQL 执行器。
 * 明确未覆盖：真实 MySQL JOIN、Provider 凭证验证、HMAC 密钥托管和 HTTP。
 */
describe('统一用户 Principal MySQL Repository', () => {
  test('只使用受控摘要查询并映射最小领域快照', async () => {
    const executeQuery = vi.fn(async () => [
      {
        user_ref: 'usr_identity_repo_001',
        user_status: 'active' as const,
        user_session_version: '3',
        binding_user_ref: 'usr_identity_repo_001',
        platform: 'wechat' as const,
        binding_status: 'active' as const,
        session_user_ref: 'usr_identity_repo_001',
        authenticated_via: 'wechat' as const,
        session_status: 'active' as const,
        session_version: '3',
        issued_at_ms: '1789873200000',
        expires_at_ms: '1789959600000'
      }
    ])
    const repository = createMysqlUserPrincipalRepository({ executeQuery })

    await expect(repository.read(query)).resolves.toEqual({
      user: { user_id: 'usr_identity_repo_001', status: 'active', sessionVersion: 3 },
      binding: {
        user_id: 'usr_identity_repo_001',
        platform: 'wechat',
        status: 'active'
      },
      session: {
        user_id: 'usr_identity_repo_001',
        authenticatedVia: 'wechat',
        status: 'active',
        sessionVersion: 3,
        issuedAtMs: 1789873200000,
        expiresAtMs: 1789959600000
      }
    })
    expect(executeQuery).toHaveBeenCalledWith(expect.any(String), [query.sessionRefHash])
    expect(JSON.stringify(executeQuery.mock.calls)).not.toContain('raw-bearer')
  })

  test('不存在时返回空，重复行或损坏整数时失败关闭', async () => {
    const validRow = {
      user_ref: 'usr_identity_repo_001',
      user_status: 'active' as const,
      user_session_version: '3',
      binding_user_ref: 'usr_identity_repo_001',
      platform: 'wechat' as const,
      binding_status: 'active' as const,
      session_user_ref: 'usr_identity_repo_001',
      authenticated_via: 'wechat' as const,
      session_status: 'active' as const,
      session_version: '3',
      issued_at_ms: '1789873200000',
      expires_at_ms: '1789959600000'
    }
    const missing = createMysqlUserPrincipalRepository({ executeQuery: vi.fn(async () => []) })
    const duplicated = createMysqlUserPrincipalRepository({
      executeQuery: vi.fn(async () => [validRow, validRow])
    })
    const damaged = createMysqlUserPrincipalRepository({
      executeQuery: vi.fn(async () => [{ ...validRow, session_version: '9007199254740992' }])
    })

    await expect(missing.read(query)).resolves.toBeNull()
    await expect(duplicated.read(query)).rejects.toMatchObject({
      type: 'INTERNAL_IDENTITY_DATA_INVALID'
    })
    await expect(damaged.read(query)).rejects.toMatchObject({
      type: 'INTERNAL_IDENTITY_DATA_INVALID'
    })
  })
})
