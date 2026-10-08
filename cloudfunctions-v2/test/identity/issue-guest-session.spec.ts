import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { issueGuestSession } from '../../src/identity/application/issue-guest-session.js'

/** Expected：models/identity/guest-token-test-matrix.md（guest-token/v1 冻结合同＋已确认配置）。L3 unit_fake。 */
const now = Date.UTC(2026, 9, 8, 2)
const hour = 3_600_000
const sourceHash = 'a'.repeat(64)
const tokenBytes = Buffer.alloc(32, 1)
const refBytes = Buffer.alloc(16, 2)
const expectedToken = tokenBytes.toString('base64url')
function deps(count = 0, policy: { ttlHours: number; ratePerHour: number } | null = { ttlHours: 168, ratePerHour: 10 }) {
  const repository = { countIssuedSince: vi.fn().mockResolvedValue(count), insert: vi.fn().mockResolvedValue(undefined) }
  const randomBytes = vi.fn().mockReturnValueOnce(tokenBytes).mockReturnValueOnce(refBytes)
  return { repository, randomBytes, now: () => now, policy }
}
const input = (platform = 'douyin') => ({ platform, issuanceSourceHash: sourceHash, anonymousSignalHash: 'b'.repeat(64) })

describe('游客令牌签发｜L3 unit_fake', () => {
  it.each(['douyin', 'xiaohongshu'])('Happy：%s 签发一次性令牌，存储只含摘要', async platform => {
    const d = deps()
    const result = await issueGuestSession(d, { ...input(platform), anonymousSignalHash: platform === 'douyin' ? 'b'.repeat(64) : null })
    expect(result).toEqual({ status: 'issued', guestToken: expectedToken, guestSessionRef: `gst_${refBytes.toString('base64url')}`,
      expiresAt: new Date(now + 168 * hour).toISOString() })
    expect(d.repository.insert).toHaveBeenCalledWith({
      guestSessionRef: `gst_${refBytes.toString('base64url')}`, identitySource: 'server_issued_guest_token',
      possessionProofHash: createHash('sha256').update(expectedToken).digest('hex'), possessionProofVersion: 1,
      anonymousSubjectHash: platform === 'douyin' ? 'b'.repeat(64) : null, issuanceSourceHash: sourceHash,
      status: 'active', issuedAtMs: now, expiresAtMs: now + 168 * hour,
    })
    expect(JSON.stringify(d.repository.insert.mock.calls)).not.toContain(expectedToken)
  })
  it.each([['wechat', sourceHash], ['unknown', sourceHash], ['douyin', 'not-a-hash']])('Reverse：平台 %s / 限流键 %s 非法 → invalid，不读写存储', async (platform, hash) => {
    const d = deps()
    expect(await issueGuestSession(d, { platform, issuanceSourceHash: hash, anonymousSignalHash: null })).toEqual({ status: 'invalid' })
    expect(d.repository.countIssuedSince).not.toHaveBeenCalled()
    expect(d.repository.insert).not.toHaveBeenCalled()
  })
  it('U2：过去一小时 9 次仍签发，10 次限流且不写入；窗口起点为 now − 1 小时', async () => {
    const ok = deps(9)
    expect((await issueGuestSession(ok, input())).status).toBe('issued')
    expect(ok.repository.countIssuedSince).toHaveBeenCalledWith(sourceHash, now - hour)
    const limited = deps(10)
    expect(await issueGuestSession(limited, input())).toEqual({ status: 'rate_limited' })
    expect(limited.repository.insert).not.toHaveBeenCalled()
  })
  it('I2：无已发布策略 → unavailable，不写入', async () => {
    const d = deps(0, null)
    expect(await issueGuestSession(d, input())).toEqual({ status: 'unavailable' })
    expect(d.repository.insert).not.toHaveBeenCalled()
  })
  it('I5：写入失败 → unavailable，结果不含令牌', async () => {
    const d = deps(); d.repository.insert.mockRejectedValue(new Error('db down'))
    const result = await issueGuestSession(d, input())
    expect(result).toEqual({ status: 'unavailable' })
    expect(JSON.stringify(result)).not.toContain(expectedToken)
  })
})
