import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { fetchOpenMeteoRadiation } from '../../src/care/provider/open-meteo-radiation-client.js'
import { normalizeOpenMeteoRadiation } from '../../src/care/light/normalize-open-meteo-radiation.js'

/**
 * Expected：models/care/mvp-watering-test-matrix.md 第 F 节（Open-Meteo 官方参数＋配置目录 open_meteo 档案）。
 * 层次 L3 unit_fake：只替换 fetch 边界；Happy 响应体为真实公开制品，交给真实标准化器。未覆盖真实网络。
 */
const artifact = readFileSync(join(findProjectRoot(), 'cloudfunctions-v2/test/care/fixtures/open-meteo-hourly-radiation.json'), 'utf8')
const query = { latitude: 31.2478, longitude: 121.5, pastDays: 1, forecastDays: 7 }
const now = () => 1_791_000_000_000
const respond = (body: string, status = 200) => vi.fn(async () => new Response(body, { status, headers: { 'content-type': 'application/json' } }))

describe('Open-Meteo 辐射预报适配器｜L3 unit_fake', () => {
  it('I1：拼装官方查询参数并返回原始响应，真实制品可被标准化', async () => {
    const fetch = respond(artifact)
    const result = await fetchOpenMeteoRadiation({ fetch, now, totalDeadlineMs: 8000 }, query)
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://api.open-meteo.com/v1/forecast')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      latitude: '31.2478', longitude: '121.5', hourly: 'shortwave_radiation,direct_normal_irradiance,diffuse_radiation',
      timeformat: 'unixtime', timezone: 'auto', past_days: '1', forecast_days: '7',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({ status: 'ok', raw: JSON.parse(artifact), fetchedAtMs: now() })
    if (result.status !== 'ok') { throw new Error('unreachable') }
    const normalized = normalizeOpenMeteoRadiation(result.raw, { series: 'hourly', sourceRef: 'open_meteo', fetchedAtMs: result.fetchedAtMs })
    expect(normalized.timezone).toBe('Asia/Shanghai')
  })
  it('I2：响应不是 JSON 对象 → invalid_body', async () => {
    expect(await fetchOpenMeteoRadiation({ fetch: respond('not json'), now, totalDeadlineMs: 8000 }, query)).toEqual({ status: 'unavailable', reason: 'invalid_body' })
    expect(await fetchOpenMeteoRadiation({ fetch: respond('[1,2]'), now, totalDeadlineMs: 8000 }, query)).toEqual({ status: 'unavailable', reason: 'invalid_body' })
  })
  it('I3：HTTP 非 2xx → http_error，只调用 1 次', async () => {
    const fetch = respond('{"error":true,"reason":"Too many requests"}', 429)
    expect(await fetchOpenMeteoRadiation({ fetch, now, totalDeadlineMs: 8000 }, query)).toEqual({ status: 'unavailable', reason: 'http_error' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('I3：网络错误 → network，不抛出、不泄漏错误文本', async () => {
    const fetch = vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND secret-host') })
    const result = await fetchOpenMeteoRadiation({ fetch, now, totalDeadlineMs: 8000 }, query)
    expect(result).toEqual({ status: 'unavailable', reason: 'network' })
    expect(JSON.stringify(result)).not.toContain('secret-host')
  })
  it('I3：超过总时限 → timeout，并取消请求', async () => {
    let aborted = false
    const fetch = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => { aborted = true; reject(new DOMException('aborted', 'AbortError')) })
    }))
    expect(await fetchOpenMeteoRadiation({ fetch, now, totalDeadlineMs: 20 }, query)).toEqual({ status: 'unavailable', reason: 'timeout' })
    expect(aborted).toBe(true)
  })
  it.each([
    [{ ...query, latitude: 91 }], [{ ...query, longitude: -181 }], [{ ...query, forecastDays: 17 }],
    [{ ...query, pastDays: -1 }], [{ ...query, forecastDays: 1.5 }], [{ ...query, latitude: Number.NaN }],
  ])('U3：非法查询 %j 拒绝且不发起请求', async bad => {
    const fetch = respond(artifact)
    await expect(fetchOpenMeteoRadiation({ fetch, now, totalDeadlineMs: 8000 }, bad)).rejects.toThrow(TypeError)
    expect(fetch).not.toHaveBeenCalled()
  })
})
