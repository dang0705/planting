import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createWechatLoginVerifier } from '../../src/identity/provider/wechat-login-verifier.js'
import { PlatformCredentialEvidenceError } from '../../src/identity/provider/platform-credential-evidence.js'

/** Expected：models/identity/wechat-login-provider-test-matrix.md 微信登录验真工厂一节。L3 unit_fake：只替换 fetch。 */
const keyBytes = Buffer.alloc(32, 7)
const env = { WECHAT_MINIPROGRAM_APPID: 'wx0123456789abcdef', WECHAT_MINIPROGRAM_PRIVATE_KEY: 'fixture-secret', PLATFORM_SUBJECT_HMAC_KEY_V1: keyBytes.toString('base64') }
const openid = 'o6_bmjrPTlm6_2sgVt7hMZOPfL2M'
const respond = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

describe('微信登录验真工厂｜L3 unit_fake', () => {
  it('Happy：只返回 HMAC 摘要与密钥版本 v1，不含 openid 原文', async () => {
    const verify = createWechatLoginVerifier(env, respond({ openid, session_key: 'k' }) as unknown as typeof fetch)
    const evidence = await verify('fixture-code')
    expect(evidence).toEqual({ platform: 'wechat', appScope: env.WECHAT_MINIPROGRAM_APPID, hashCandidates: [
      { platformSubjectHash: createHmac('sha256', keyBytes).update(openid, 'utf8').digest('hex'), subjectHashKeyVersion: 'v1' },
    ] })
    expect(JSON.stringify(evidence)).not.toContain(openid)
  })
  it.each([
    ['缺 AppID', { ...env, WECHAT_MINIPROGRAM_APPID: '' }],
    ['缺 AppSecret', { ...env, WECHAT_MINIPROGRAM_PRIVATE_KEY: undefined }],
    ['缺 HMAC 密钥', { ...env, PLATFORM_SUBJECT_HMAC_KEY_V1: undefined }],
    ['HMAC 密钥过短', { ...env, PLATFORM_SUBJECT_HMAC_KEY_V1: Buffer.alloc(16, 1).toString('base64') }],
  ])('I2：%s → 创建时拒绝', (_name, badEnv) => {
    expect(() => createWechatLoginVerifier(badEnv as never, respond({ openid }) as unknown as typeof fetch)).toThrow(PlatformCredentialEvidenceError)
  })
  it('I3：微信 40029 → PRINCIPAL_INVALID', async () => {
    const verify = createWechatLoginVerifier(env, respond({ errcode: 40029, errmsg: 'invalid code' }) as unknown as typeof fetch)
    await expect(verify('fixture-code')).rejects.toMatchObject({ type: 'PRINCIPAL_INVALID' })
  })
})
