import { createSecretKey } from 'node:crypto'

import { describe, expect, test, vi } from 'vitest'

import {
  createVerifyPlatformCredentialUseCase,
  PlatformCredentialEvidenceError
} from '../../src/identity/provider/platform-credential-evidence.js'

const currentSecret = createSecretKey(Buffer.from('current-secret-identity-test', 'utf8'))
const retiringSecret = createSecretKey(Buffer.from('retiring-secret-identity-test', 'utf8'))

/**
 * Expected 来源：`principal-capability/v1` 的 Provider 先验真、平台主体 HMAC-SHA-256、
 * 当前与退役中密钥同时加载，以及原始凭证/主体/密钥均不得进入下游证据。
 * 测试层次：L2 / `unit_fake`；替换外部 Provider，保留真实 HMAC 和应用编排。
 * 明确未覆盖：CloudBase Auth、微信/抖音/小红书/手机号真实凭证、密钥托管和 MySQL。
 */
describe('平台凭证验证与主体摘要证据', () => {
  test('按当前与退役中密钥顺序生成不含原始主体的候选摘要', async () => {
    const credential = Object.freeze({ authorizationCode: 'opaque-login-code-001' })
    const provider = {
      verify: vi.fn(async () => ({
        platform: 'wechat' as const,
        appScope: 'wx-app-qhz',
        normalizedSubject: 'openid-normalized-001'
      }))
    }
    const verifyCredential = createVerifyPlatformCredentialUseCase({
      provider,
      keyRing: {
        current: { keyVersion: 'identity-hmac.2026-09-21.1', secretKey: currentSecret },
        retiring: [{ keyVersion: 'identity-hmac.2026-06-01.1', secretKey: retiringSecret }]
      }
    })

    const evidence = await verifyCredential({
      platform: 'wechat',
      appScope: 'wx-app-qhz',
      credential
    })

    expect(provider.verify).toHaveBeenCalledWith({
      platform: 'wechat',
      appScope: 'wx-app-qhz',
      credential
    })
    expect(evidence).toEqual({
      platform: 'wechat',
      appScope: 'wx-app-qhz',
      hashCandidates: [
        {
          platformSubjectHash: 'b79b7f19e0015e34be019b05f1163e667782ac0b1b251de7d41d2befce800861',
          subjectHashKeyVersion: 'identity-hmac.2026-09-21.1'
        },
        {
          platformSubjectHash: 'c01e66e2ab2dc2cf4025bb79ac7ac8b63673155095f90fc0d553c0408efea8d3',
          subjectHashKeyVersion: 'identity-hmac.2026-06-01.1'
        }
      ]
    })
    expect(JSON.stringify(evidence)).not.toContain('openid-normalized-001')
    expect(JSON.stringify(evidence)).not.toContain('opaque-login-code-001')
    expect(JSON.stringify(evidence)).not.toContain('secret-identity-test')
  })

  test('拒绝 Provider 返回不同平台或应用范围，避免跨应用主体混淆', async () => {
    const provider = {
      verify: vi.fn(async () => ({
        platform: 'douyin' as const,
        appScope: 'other-app',
        normalizedSubject: 'provider-subject-001'
      }))
    }
    const verifyCredential = createVerifyPlatformCredentialUseCase({
      provider,
      keyRing: {
        current: { keyVersion: 'identity-hmac.2026-09-21.1', secretKey: currentSecret },
        retiring: []
      }
    })

    await expect(
      verifyCredential({ platform: 'wechat', appScope: 'wx-app-qhz', credential: 'opaque' })
    ).rejects.toEqual(
      new PlatformCredentialEvidenceError(
        'INTERNAL_IDENTITY_PROVIDER_INVALID',
        '平台凭证验证结果与请求范围不一致'
      )
    )
  })

  test('拒绝空主体、非法范围和重复密钥版本，不生成任何摘要证据', async () => {
    const emptySubjectProvider = {
      verify: vi.fn(async () => ({
        platform: 'phone' as const,
        appScope: 'qhz-phone',
        normalizedSubject: '   '
      }))
    }
    const validKeyRing = {
      current: { keyVersion: 'identity-hmac.2026-09-21.1', secretKey: currentSecret },
      retiring: []
    }

    await expect(
      createVerifyPlatformCredentialUseCase({
        provider: emptySubjectProvider,
        keyRing: validKeyRing
      })({ platform: 'phone', appScope: 'qhz-phone', credential: 'opaque' })
    ).rejects.toMatchObject({ type: 'INTERNAL_IDENTITY_PROVIDER_INVALID' })

    expect(() =>
      createVerifyPlatformCredentialUseCase({
        provider: emptySubjectProvider,
        keyRing: {
          current: { keyVersion: 'identity-hmac.same', secretKey: currentSecret },
          retiring: [{ keyVersion: 'identity-hmac.same', secretKey: retiringSecret }]
        }
      })
    ).toThrowError(
      new PlatformCredentialEvidenceError(
        'INTERNAL_IDENTITY_CONFIGURATION_INVALID',
        '平台主体 HMAC 密钥版本不得重复'
      )
    )

    await expect(
      createVerifyPlatformCredentialUseCase({
        provider: emptySubjectProvider,
        keyRing: validKeyRing
      })({ platform: 'phone', appScope: '../invalid', credential: 'opaque' })
    ).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
    expect(emptySubjectProvider.verify).toHaveBeenCalledTimes(Number('1'))
  })
})
