import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { UnifiedUserPrincipalResolveError } from '../../src/identity/domain/resolve-user-principal.js'
import { parseGuestBearer, resolveGuestPrincipal } from '../../src/identity/application/resolve-guest-principal.js'

/** Expected：models/identity/guest-token-test-matrix.md「游客令牌解析」（guest-token/v1 §2 冻结合同）。L3 unit_fake：只替换存储。 */
const nowMs = Date.UTC(2026, 9, 9, 2)
const hour = 3_600_000
const token = Buffer.alloc(32, 7).toString('base64url')
const session = { guestSessionRef: 'gst_AAAAAAAAAAAAAAAAAAAAAA', issuedAtMs: nowMs - hour, expiresAtMs: nowMs + 167 * hour }
function repositoryReturning(result: unknown) {
  return { findActiveByProofHash: vi.fn().mockResolvedValue(result) }
}
async function expectInvalid(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (caught: unknown) => caught)
  expect(error).toBeInstanceOf(UnifiedUserPrincipalResolveError)
  expect((error as UnifiedUserPrincipalResolveError).type).toBe('PRINCIPAL_INVALID')
  expect((error as Error).message).not.toContain(token)
}

describe('游客令牌解析｜L3 unit_fake', () => {
  it('I1 Happy：找到会话 → GuestPrincipal；存储只收到 SHA-256 与 nowMs', async () => {
    const repository = repositoryReturning(session)
    expect(await resolveGuestPrincipal({ repository }, { guestToken: token, nowMs })).toEqual({
      principalType: 'guest', guestSessionRef: session.guestSessionRef, authProvider: 'server_issued_guest_token',
      issuedAt: new Date(session.issuedAtMs).toISOString(), expiresAt: new Date(session.expiresAtMs).toISOString(),
    })
    expect(repository.findActiveByProofHash).toHaveBeenCalledWith(createHash('sha256').update(token).digest('hex'), nowMs)
    expect(JSON.stringify(repository.findActiveByProofHash.mock.calls)).not.toContain(token)
  })
  it.each(['', token.slice(1), `${token}A`, `${token.slice(0, 42)}+`, `${token.slice(0, 42)}=`])('U3：令牌格式非法（%s）→ PRINCIPAL_INVALID，不查存储', async bad => {
    const repository = repositoryReturning(session)
    await expectInvalid(resolveGuestPrincipal({ repository }, { guestToken: bad, nowMs }))
    expect(repository.findActiveByProofHash).not.toHaveBeenCalled()
  })
  it('Reverse：存储找不到 → PRINCIPAL_INVALID（消息不含令牌）', async () => {
    await expectInvalid(resolveGuestPrincipal({ repository: repositoryReturning(null) }, { guestToken: token, nowMs }))
  })
  it('U2：读回 expiresAtMs = nowMs 拒绝；nowMs + 1 通过', async () => {
    await expectInvalid(resolveGuestPrincipal({ repository: repositoryReturning({ ...session, expiresAtMs: nowMs }) }, { guestToken: token, nowMs }))
    const principal = await resolveGuestPrincipal({ repository: repositoryReturning({ ...session, expiresAtMs: nowMs + 1 }) }, { guestToken: token, nowMs })
    expect(principal.expiresAt).toBe(new Date(nowMs + 1).toISOString())
  })
  it('I5：存储抛错 → 原错误向上抛出，不伪装成 PRINCIPAL_INVALID', async () => {
    const failure = new Error('connection lost')
    const repository = { findActiveByProofHash: vi.fn().mockRejectedValue(failure) }
    await expect(resolveGuestPrincipal({ repository }, { guestToken: token, nowMs })).rejects.toBe(failure)
  })
  it('前缀：guest.<token> → token；用户 Bearer 与仅前缀 → null', () => {
    expect(parseGuestBearer(`guest.${token}`)).toBe(token)
    expect(parseGuestBearer(token)).toBeNull()
    expect(parseGuestBearer('guest.')).toBeNull()
    expect(parseGuestBearer('Guest.' + token)).toBeNull()
  })
})
