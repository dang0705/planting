import { createHash } from 'node:crypto'

import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import { createResolveUserPrincipalUseCase } from '../../src/identity/application/resolve-user-principal.js'

const rawBearer = 'raw-bearer-identity-application-001'
const currentTime = Date.parse('2026-09-20T04:00:00.000Z')

/**
 * Expected 来源：`principal-capability/v1` 的“登录后仅凭青花植会话解析用户”与 Bearer 不落库。
 * 测试层次：L2 / `unit_fake`；替换 Repository，保留真实 SHA-256 与领域裁决。
 * 明确未覆盖：登录时的平台验真、真实 MySQL、日志适配器、CloudBase 和 HTTP。
 */
describe('统一用户 Principal 应用用例', () => {
  test('在内存中摘要 Bearer，并把 Repository 快照交给纯领域裁决', async () => {
    const repository = {
      read: vi.fn(async () => ({
        user: {
          user_id: 'usr_identity_app_001' as UserRef,
          status: 'active' as const,
          sessionVersion: 2
        },
        binding: {
          user_id: 'usr_identity_app_001' as UserRef,
          platform: 'wechat' as const,
          status: 'active' as const
        },
        session: {
          user_id: 'usr_identity_app_001' as UserRef,
          authenticatedVia: 'wechat' as const,
          status: 'active' as const,
          sessionVersion: 2,
          issuedAtMs: Date.parse('2026-09-20T03:00:00.000Z'),
          expiresAtMs: Date.parse('2026-09-21T03:00:00.000Z')
        }
      }))
    }
    const resolvePrincipal = createResolveUserPrincipalUseCase({ repository })

    await expect(
      resolvePrincipal({
        bearerToken: rawBearer,
        nowMs: currentTime
      })
    ).resolves.toEqual({
      principalType: 'user',
      user_id: 'usr_identity_app_001',
      sessionVersion: 2,
      authenticatedVia: 'wechat',
      issuedAt: '2026-09-20T03:00:00.000Z',
      expiresAt: '2026-09-21T03:00:00.000Z'
    })
    expect(repository.read).toHaveBeenCalledWith({
      sessionRefHash: createHash('sha256').update(rawBearer).digest('hex')
    })
    expect(JSON.stringify(repository.read.mock.calls)).not.toContain(rawBearer)
  })

  test('会话不存在或 Bearer 非法时返回稳定主体错误', async () => {
    const repository = { read: vi.fn(async () => null) }
    const resolvePrincipal = createResolveUserPrincipalUseCase({ repository })
    const validInput = {
      bearerToken: rawBearer,
      nowMs: currentTime
    }

    await expect(resolvePrincipal(validInput)).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    await expect(
      resolvePrincipal({
        ...validInput,
        bearerToken: 'short'
      })
    ).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    expect(repository.read).toHaveBeenCalledTimes(1)
  })

  test('同一 Bearer 只执行一次会话摘要查询，不随平台密钥轮换重复查询', async () => {
    const snapshot = {
      user: {
        user_id: 'usr_identity_rotation_001' as UserRef,
        status: 'active' as const,
        sessionVersion: 4
      },
      binding: {
        user_id: 'usr_identity_rotation_001' as UserRef,
        platform: 'wechat' as const,
        status: 'active' as const
      },
      session: {
        user_id: 'usr_identity_rotation_001' as UserRef,
        authenticatedVia: 'wechat' as const,
        status: 'active' as const,
        sessionVersion: 4,
        issuedAtMs: Date.parse('2026-09-20T03:00:00.000Z'),
        expiresAtMs: Date.parse('2026-09-21T03:00:00.000Z')
      }
    }
    const repository = { read: vi.fn(async () => snapshot) }
    const resolvePrincipal = createResolveUserPrincipalUseCase({ repository })
    const command = { bearerToken: rawBearer, nowMs: currentTime }

    await expect(resolvePrincipal(command)).resolves.toMatchObject({
      user_id: 'usr_identity_rotation_001',
      sessionVersion: 4
    })
    expect(repository.read).toHaveBeenCalledTimes(1)
  })
})
