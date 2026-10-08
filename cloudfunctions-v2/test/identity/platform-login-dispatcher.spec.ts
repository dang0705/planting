import { createHmac } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createPlatformLoginDispatcher } from '../../src/identity/provider/platform-login-dispatcher.js'

/** Expected：models/identity/wechat-login-provider-test-matrix.md 多平台登录分派一节。L3 unit_fake：只替换 fetch。 */
const key = Buffer.alloc(32, 9)
const env = {
  WECHAT_MINIPROGRAM_APPID: 'wx0123456789abcdef', WECHAT_MINIPROGRAM_PRIVATE_KEY: 'wx-secret',
  DOUYIN_APPID: 'tt0123456789abcdef', DOUYIN_APP_SECRET: 'tt-secret',
  PLATFORM_SUBJECT_HMAC_KEY_V1: key.toString('base64'),
}
const openid = 'same-openid-value'
const hash = createHmac('sha256', key).update(openid, 'utf8').digest('hex')
const fetchFake = () => vi.fn(async (url: string | URL | Request) => String(url).includes('weixin')
  ? new Response(JSON.stringify({ openid, session_key: 'k' }), { status: 200 })
  : new Response(JSON.stringify({ err_no: 0, data: { openid, session_key: 'k' } }), { status: 200 }))

describe('多平台登录分派｜L3 unit_fake', () => {
  it('I1：微信与抖音分别调用各自端点，证据平台与应用范围不同（跨平台不串号）', async () => {
    const fetch = fetchFake()
    const dispatch = createPlatformLoginDispatcher(env, fetch as unknown as typeof globalThis.fetch)
    expect(await dispatch('wechat', 'wx-code')).toEqual({ platform: 'wechat', appScope: env.WECHAT_MINIPROGRAM_APPID,
      hashCandidates: [{ platformSubjectHash: hash, subjectHashKeyVersion: 'v1' }] })
    expect(await dispatch('douyin', 'tt-code')).toEqual({ platform: 'douyin', appScope: env.DOUYIN_APPID,
      hashCandidates: [{ platformSubjectHash: hash, subjectHashKeyVersion: 'v1' }] })
    expect(String(fetch.mock.calls[0]![0])).toContain('api.weixin.qq.com')
    expect(String(fetch.mock.calls[1]![0])).toBe('https://developer.toutiao.com/api/apps/v2/jscode2session')
  })
  it('I2：只缺抖音配置时微信仍可登录，抖音失败关闭；小红书一律失败关闭', async () => {
    const dispatch = createPlatformLoginDispatcher({ ...env, DOUYIN_APPID: undefined }, fetchFake() as unknown as typeof globalThis.fetch)
    expect((await dispatch('wechat', 'wx-code')).platform).toBe('wechat')
    await expect(dispatch('douyin', 'tt-code')).rejects.toMatchObject({ type: 'INTERNAL_IDENTITY_CONFIGURATION_INVALID' })
    await expect(dispatch('xiaohongshu', 'xhs-code')).rejects.toMatchObject({ type: 'INTERNAL_IDENTITY_CONFIGURATION_INVALID' })
  })
  it('I2：缺 HMAC 密钥时所有平台失败关闭，不调用外部接口', async () => {
    const fetch = fetchFake()
    const dispatch = createPlatformLoginDispatcher({ ...env, PLATFORM_SUBJECT_HMAC_KEY_V1: undefined }, fetch as unknown as typeof globalThis.fetch)
    await expect(dispatch('wechat', 'wx-code')).rejects.toMatchObject({ type: 'INTERNAL_IDENTITY_CONFIGURATION_INVALID' })
    await expect(dispatch('douyin', 'tt-code')).rejects.toMatchObject({ type: 'INTERNAL_IDENTITY_CONFIGURATION_INVALID' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
