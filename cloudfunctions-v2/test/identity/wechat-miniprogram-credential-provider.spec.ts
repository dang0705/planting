import { describe, expect, it, vi } from 'vitest'
import { createWechatMiniprogramCredentialProvider } from '../../src/identity/provider/wechat-miniprogram-credential-provider.js'
import { PlatformCredentialEvidenceError } from '../../src/identity/provider/platform-credential-evidence.js'

/**
 * Expected：models/identity/wechat-login-provider-test-matrix.md（微信 code2Session 官方文档＋已批准档案＋宪章脱敏）。
 * 层次 L3 unit_fake：只替换 fetch 边界；不调用真实微信接口。
 */
const appId = 'wx0123456789abcdef'
const appSecret = 'fixture-app-secret-value'
const code = 'fixture-js-code-0001'
const openid = 'o6_bmjrPTlm6_2sgVt7hMZOPfL2M'
const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
const provider = (fetch: ReturnType<typeof vi.fn>, totalDeadlineMs = 5000) =>
  createWechatMiniprogramCredentialProvider({ fetch: fetch as unknown as typeof globalThis.fetch, appId, appSecret, totalDeadlineMs })
const verify = (fetch: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) =>
  provider(fetch).verify({ platform: 'wechat', appScope: appId, credential: code, ...overrides } as never)
/** 断言稳定错误类型，且错误不携带任何敏感原值。 */
async function expectError(promise: Promise<unknown>, type: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(PlatformCredentialEvidenceError)
  expect((error as PlatformCredentialEvidenceError).type).toBe(type)
  const text = `${(error as Error).message} ${JSON.stringify(error)}`
  for (const secret of [appSecret, code, openid, 'session-key-value']) { expect(text).not.toContain(secret) }
}

describe('微信小程序 code2Session 适配器｜L3 unit_fake', () => {
  it('I1：拼装官方参数，成功只返回规范主体，丢弃 session_key 与 unionid', async () => {
    const fetch = json({ openid, session_key: 'session-key-value', unionid: 'union-x' })
    const result = await verify(fetch)
    expect(result).toEqual({ platform: 'wechat', appScope: appId, normalizedSubject: openid })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
  it.each([40029, 40163])('I3：errcode %i 表示凭证无效', async errcode => {
    await expectError(verify(json({ errcode, errmsg: 'invalid code' })), 'PRINCIPAL_INVALID')
  })
  it.each([45011, -1, 40226, 99999])('I3：errcode %i 为 Provider 不可用', async errcode => {
    await expectError(verify(json({ errcode, errmsg: 'busy' })), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
  })
  it('I3：HTTP 非 2xx 与网络错误为 Provider 不可用，只调用 1 次', async () => {
    const failing = json({}, 502)
    await expectError(verify(failing), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    expect(failing).toHaveBeenCalledTimes(1)
    const network = vi.fn(async () => { throw new Error(`connect failed secret=${appSecret}`) })
    await expectError(verify(network), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    expect(network).toHaveBeenCalledTimes(1)
  })
  it('I3：超过总时限为 Provider 不可用，并取消请求', async () => {
    let aborted = false
    const hanging = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) })
    }))
    await expectError(provider(hanging, 20).verify({ platform: 'wechat', appScope: appId, credential: code }), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    expect(aborted).toBe(true)
  })
  it.each([[{ session_key: 'session-key-value' }], [{ openid: '' }], [{ openid: ` ${openid}` }]])('I2：成功响应缺少有效 openid %j', async body => {
    await expectError(verify(json(body)), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
  })
  it('I2：响应不是 JSON 为 Provider 不可用', async () => {
    await expectError(verify(vi.fn(async () => new Response('<html>', { status: 200 }))), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
  })
  it.each([[{ platform: 'douyin' }], [{ appScope: 'wxOtherApp000000' }]])('I4 Reverse：平台或应用范围不符 %j 时不发请求', async overrides => {
    const fetch = json({ openid })
    await expectError(verify(fetch, overrides), 'PRINCIPAL_INVALID')
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([[''], [123], ['x'.repeat(129)]])('U3 Reverse：非法 code %j 不发请求', async credential => {
    const fetch = json({ openid })
    await expectError(verify(fetch, { credential }), 'PRINCIPAL_INVALID')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('创建期：AppID 或 AppSecret 缺失立即拒绝', () => {
    for (const config of [{ appId: '', appSecret }, { appId, appSecret: '' }]) {
      expect(() => createWechatMiniprogramCredentialProvider({ fetch: globalThis.fetch, totalDeadlineMs: 5000, ...config }))
        .toThrow(PlatformCredentialEvidenceError)
    }
  })
})
