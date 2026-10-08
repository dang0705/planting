import { createHmac, createSecretKey, hkdfSync } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { GuestSessionInsert } from '../../src/identity/application/issue-guest-session.js'
import { createGuestSessionRouteHandler, deriveGuestIssuanceSourceKey } from '../../src/identity/http/guest-session-route.js'

/**
 * Expected：models/identity/guest-token-test-matrix.md「游客签发 HTTP 入口」——
 * guest-token-contract.md §1/§5/§6（用户冻结 DTO＋已确认配置＋CloudBase 官方 XFF 文档）。
 * L3 unit_fake：替换游客存储、抖音匿名换取与策略端口；真实 node:http、DTO 校验、来源摘要与签发规则。
 */
const now = Date.UTC(2026, 9, 9, 3)
const hour = 3_600_000
const masterKey = Buffer.alloc(32, 9)
/** 独立按 §6 计算的期望摘要：HKDF-SHA256(info=qinghuazhi/guest-issuance-source/v1) → HMAC-SHA256(前缀+值)。 */
const derivedKey = Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), 'qinghuazhi/guest-issuance-source/v1', 32))
const expectedDigest = (value: string) => createHmac('sha256', derivedKey).update(value, 'utf8').digest('hex')
const policy = { ttlHours: 168, ratePerHour: 10, douyinAnonymousSignalEnabled: true }

type Overrides = Partial<{
  count: number
  policy: typeof policy | null
  exchange: ((code: string) => Promise<string>) | null
  insert: () => Promise<void>
}>
let server: Server | null = null
afterEach(async () => { const current = server; server = null; if (current) { await new Promise(resolve => current.close(resolve)) } })

async function harness(overrides: Overrides = {}) {
  const repository = {
    countIssuedSince: vi.fn().mockResolvedValue(overrides.count ?? 0),
    insert: vi.fn(async (_record: GuestSessionInsert) => { await (overrides.insert ?? (async () => undefined))() }),
  }
  const exchange = overrides.exchange === undefined ? vi.fn(async () => 'douyin-anon-openid-1') : overrides.exchange
  const audits: unknown[] = []
  const handler = createGuestSessionRouteHandler({
    repository,
    resolveGuestPolicy: async () => (overrides.policy === undefined ? policy : overrides.policy),
    exchangeDouyinAnonymousCode: exchange,
    issuanceSourceKey: deriveGuestIssuanceSourceKey(masterKey),
    randomBytes: size => Buffer.alloc(size, size === 32 ? 1 : 2),
    now: () => now,
    writeAudit: event => { audits.push(event) },
  })
  server = createServer((request, response) => { handler(request, response, {}).catch(() => undefined) })
  await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as AddressInfo).port
  const call = async (body: unknown, headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.9' }, contentType = 'application/json') => {
    const response = await fetch(`http://127.0.0.1:${port}/api/v2/identity/guest-sessions`, {
      method: 'POST', headers: { 'content-type': contentType, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })
    return { status: response.status, cacheControl: response.headers.get('cache-control'), text: await response.text() }
  }
  return { repository, exchange, audits, call }
}
const expectedToken = Buffer.alloc(32, 1).toString('base64url')
const expectedRef = `gst_${Buffer.alloc(16, 2).toString('base64url')}`

describe('游客签发 HTTP 入口｜L3 unit_fake', () => {
  it('H1：小红书 → 200 一次性令牌；限流键为 IP 摘要，匿名摘要 null', async () => {
    const h = await harness()
    const result = await h.call({ platform: 'xiaohongshu' })
    expect(result.status).toBe(200)
    expect(result.cacheControl).toBe('no-store')
    expect(JSON.parse(result.text)).toEqual({ data: { guestToken: expectedToken, guestSessionRef: expectedRef, expiresAt: new Date(now + 168 * hour).toISOString() } })
    expect(expectedToken).toMatch(/^[A-Za-z0-9_-]{43}$/u)
    expect(h.repository.countIssuedSince).toHaveBeenCalledWith(expectedDigest('client_ip:203.0.113.9'), now - hour)
    expect(h.repository.insert.mock.calls[0]![0]).toMatchObject({ issuanceSourceHash: expectedDigest('client_ip:203.0.113.9'), anonymousSubjectHash: null })
    expect(h.exchange).not.toHaveBeenCalled()
  })
  it('H2：抖音带 anonymousCode → 匿名摘要优先作限流键', async () => {
    const h = await harness()
    expect((await h.call({ platform: 'douyin', anonymousCode: 'anon-code-1' })).status).toBe(200)
    expect(h.exchange).toHaveBeenCalledWith('anon-code-1')
    const anonymousDigest = expectedDigest('douyin_anonymous:douyin-anon-openid-1')
    expect(h.repository.insert.mock.calls[0]![0]).toMatchObject({ issuanceSourceHash: anonymousDigest, anonymousSubjectHash: anonymousDigest })
  })
  it('H3：抖音匿名换取失败 → 仍 200，回落 IP 限流', async () => {
    const h = await harness({ exchange: vi.fn(async () => { throw new Error('40019') }) })
    expect((await h.call({ platform: 'douyin', anonymousCode: 'anon-code-1' })).status).toBe(200)
    expect(h.repository.insert.mock.calls[0]![0]).toMatchObject({ issuanceSourceHash: expectedDigest('client_ip:203.0.113.9'), anonymousSubjectHash: null })
  })
  it('H4：策略关闭匿名信号 → 不调用换取', async () => {
    const h = await harness({ policy: { ...policy, douyinAnonymousSignalEnabled: false } })
    expect((await h.call({ platform: 'douyin', anonymousCode: 'anon-code-1' })).status).toBe(200)
    expect(h.exchange).not.toHaveBeenCalled()
    expect(h.repository.insert.mock.calls[0]![0]).toMatchObject({ issuanceSourceHash: expectedDigest('client_ip:203.0.113.9'), anonymousSubjectHash: null })
  })
  it('X1：XFF 多段取最右段', async () => {
    const h = await harness()
    await h.call({ platform: 'xiaohongshu' }, { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' })
    expect(h.repository.countIssuedSince).toHaveBeenCalledWith(expectedDigest('client_ip:203.0.113.9'), now - hour)
  })
  it.each([
    ['wechat 平台', { platform: 'wechat' }, 'application/json'],
    ['未知平台', { platform: 'alipay' }, 'application/json'],
    ['小红书带 anonymousCode', { platform: 'xiaohongshu', anonymousCode: 'x' }, 'application/json'],
    ['多余字段', { platform: 'douyin', userId: 'u1' }, 'application/json'],
    ['非 JSON 媒体类型', { platform: 'douyin' }, 'text/plain'],
    ['坏 JSON', '{"platform":', 'application/json'],
  ])('V1：%s → 400，不读写存储', async (_label, body, contentType) => {
    const h = await harness()
    const result = await h.call(body, undefined, contentType)
    expect(result.status).toBe(400)
    expect(JSON.parse(result.text)).toEqual({ error: { type: 'VALIDATION_FAILED', message: expect.any(String) } })
    expect(h.repository.countIssuedSince).not.toHaveBeenCalled()
    expect(h.repository.insert).not.toHaveBeenCalled()
  })
  it('R1：同来源一小时已 10 次 → 429 RATE_LIMITED，不写入', async () => {
    const h = await harness({ count: 10 })
    const result = await h.call({ platform: 'xiaohongshu' })
    expect(result.status).toBe(429)
    expect(JSON.parse(result.text).error.type).toBe('RATE_LIMITED')
    expect(h.repository.insert).not.toHaveBeenCalled()
  })
  it('S1：无游客策略 → 503，不换取、不写入', async () => {
    const h = await harness({ policy: null })
    const result = await h.call({ platform: 'douyin', anonymousCode: 'anon-code-1' })
    expect(result.status).toBe(503)
    expect(JSON.parse(result.text).error.type).toBe('SERVICE_UNAVAILABLE')
    expect(h.exchange).not.toHaveBeenCalled()
    expect(h.repository.insert).not.toHaveBeenCalled()
  })
  it.each([[{}], [{ 'x-forwarded-for': 'not-an-ip' }], [{ 'x-forwarded-for': '203.0.113.9, ' }]])('S2：来源 IP 缺失或非法且无匿名信号 → 503（%j）', async headers => {
    const h = await harness()
    expect((await h.call({ platform: 'xiaohongshu' }, headers)).status).toBe(503)
    expect(h.repository.insert).not.toHaveBeenCalled()
  })
  it('S3：存储写入失败 → 503，响应不含令牌', async () => {
    const h = await harness({ insert: async () => { throw new Error('duplicate') } })
    const result = await h.call({ platform: 'xiaohongshu' })
    expect(result.status).toBe(503)
    expect(result.text).not.toContain(expectedToken)
  })
  it('脱敏：审计事件不含令牌、IP、anonymousCode', async () => {
    const h = await harness()
    await h.call({ platform: 'douyin', anonymousCode: 'anon-code-secret' })
    await h.call({ platform: 'wechat' })
    const serialized = JSON.stringify(h.audits)
    expect(h.audits.length).toBe(2)
    for (const secret of [expectedToken, '203.0.113.9', 'anon-code-secret', 'douyin-anon-openid-1']) { expect(serialized).not.toContain(secret) }
  })
  it('派生密钥：短于 32 字节的主密钥被拒绝', () => {
    expect(() => deriveGuestIssuanceSourceKey(Buffer.alloc(16, 1))).toThrow()
    expect(deriveGuestIssuanceSourceKey(masterKey).export()).toEqual(createSecretKey(derivedKey).export())
  })
})
