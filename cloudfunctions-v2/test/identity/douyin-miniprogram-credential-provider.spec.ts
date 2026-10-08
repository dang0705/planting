import { describe, expect, it, vi } from 'vitest'
import { createDouyinMiniprogramCredentialProvider } from '../../src/identity/provider/douyin-miniprogram-credential-provider.js'
import { PlatformCredentialEvidenceError } from '../../src/identity/provider/platform-credential-evidence.js'

/** Expected：models/identity/wechat-login-provider-test-matrix.md 抖音一节。L3 unit_fake：只替换 fetch。 */
const appId = 'tt0123456789abcdef'
const appSecret = 'fixture-douyin-secret'
const code = 'fixture-douyin-code'
const openid = 'douyin-openid-0001'
const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
const provider = (fetch: ReturnType<typeof vi.fn>, totalDeadlineMs = 5000) =>
  createDouyinMiniprogramCredentialProvider({ fetch: fetch as unknown as typeof globalThis.fetch, appId, appSecret, totalDeadlineMs })
const verify = (fetch: ReturnType<typeof vi.fn>, overrides: Record<string, unknown> = {}) =>
  provider(fetch).verify({ platform: 'douyin', appScope: appId, credential: code, ...overrides } as never)
async function expectError(promise: Promise<unknown>, type: string) {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(PlatformCredentialEvidenceError)
  expect((error as PlatformCredentialEvidenceError).type).toBe(type)
  const text = `${(error as Error).message} ${JSON.stringify(error)}`
  for (const secret of [appSecret, code, openid]) { expect(text).not.toContain(secret) }
}

describe('抖音 jscode2session 适配器｜L3 unit_fake', () => {
  it('I1：code 登录 POST JSON，只返回规范主体', async () => {
    const fetch = json({ err_no: 0, err_tips: 'success', data: { openid, session_key: 'k', unionid: 'u', anonymous_openid: '' } })
    expect(await verify(fetch)).toEqual({ platform: 'douyin', appScope: appId, normalizedSubject: openid })
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://developer.toutiao.com/api/apps/v2/jscode2session')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ appid: appId, secret: appSecret, code })
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })
  it('I1：匿名换取只传 anonymous_code，返回 anonymous_openid', async () => {
    const fetch = json({ err_no: 0, data: { openid: '', anonymous_openid: 'anon-0001' } })
    expect(await provider(fetch).exchangeAnonymousCode('anon-code-1')).toBe('anon-0001')
    expect(JSON.parse(String((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ appid: appId, secret: appSecret, anonymous_code: 'anon-code-1' })
  })
  it.each([40018, 40019])('I3：err_no %i → 凭证无效', async errNo => {
    await expectError(verify(json({ err_no: errNo, err_tips: 'bad code' })), 'PRINCIPAL_INVALID')
  })
  it.each([-1, 40015, 40017, 99999])('I3：err_no %i → Provider 不可用', async errNo => {
    await expectError(verify(json({ err_no: errNo, err_tips: 'x' })), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
  })
  it('I3：HTTP 非 2xx、网络错误、超时 → Provider 不可用，只调用 1 次', async () => {
    const failing = json({}, 500)
    await expectError(verify(failing), 'INTERNAL_IDENTITY_PROVIDER_INVALID'); expect(failing).toHaveBeenCalledTimes(1)
    await expectError(verify(vi.fn(async () => { throw new Error(`down ${appSecret}`) })), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    let aborted = false
    const hanging = vi.fn((_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) })
    }))
    await expectError(provider(hanging, 20).verify({ platform: 'douyin', appScope: appId, credential: code }), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    expect(aborted).toBe(true)
  })
  it('I2：缺 openid / 缺 anonymous_openid → Provider 不可用', async () => {
    await expectError(verify(json({ err_no: 0, data: { openid: '' } })), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
    await expectError(provider(json({ err_no: 0, data: {} })).exchangeAnonymousCode('anon-code-1'), 'INTERNAL_IDENTITY_PROVIDER_INVALID')
  })
  it.each([[{ platform: 'wechat' }], [{ appScope: 'ttOther' }], [{ credential: '' }], [{ credential: 'x'.repeat(257) }]])('I4 Reverse：%j 不发请求', async overrides => {
    const fetch = json({ err_no: 0, data: { openid } })
    await expectError(verify(fetch, overrides), 'PRINCIPAL_INVALID')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('创建期：AppID 或 AppSecret 缺失立即拒绝', () => {
    expect(() => createDouyinMiniprogramCredentialProvider({ fetch: globalThis.fetch, appId: '', appSecret, totalDeadlineMs: 5000 })).toThrow(PlatformCredentialEvidenceError)
  })
})
