import { createHash } from 'node:crypto'
import { expect, test } from 'vitest'
import { verifyGuestClaimProof } from '../../src/user-plant/domain/verify-guest-claim-proof.js'

/**
 * L1/unit_fake：Expected 来自 guest-session-claim/v1 与 guest-token/v1 §3（主代理 2026-10-09 裁决 A/B/C：游客令牌即持有证明；
 * 匿名主体只作防刷不作证明；只接受 server_issued_guest_token；上一版宽限路径保留但当前令牌不轮换）。实际摘要算法，无替身。
 */
const currentProof = Buffer.alloc(32, 17).toString('base64url')
const previousProof = Buffer.alloc(32, 23).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const record = () => ({ identitySource: 'server_issued_guest_token', proofHash: hash(currentProof), proofVersion: 2, previousProofHash: hash(previousProof), previousProofValidUntilMs: 3000, issuedAtMs: 1000, expiresAtMs: 9000, status: 'active' })
const input = () => ({ possessionProof: currentProof, nowMs: 2000, proofRotationGraceSeconds: 300 as number | null })
test('当前证明只返回已校验版本，无受限数据', () => expect(verifyGuestClaimProof(record(), input())).toEqual({ status: 'verified', proofVersion: 2 }))
test('有效上一版只返回版本减1', () => expect(verifyGuestClaimProof(record(), { ...input(), possessionProof: previousProof })).toEqual({ status: 'verified', proofVersion: 1 }))
test.each([0, null])('策略%s不接受上一版，当前版仍有效', grace => {
  expect(verifyGuestClaimProof(record(), { ...input(), possessionProof: previousProof, proofRotationGraceSeconds: grace })).toEqual({ status: 'not_claimable' })
  expect(verifyGuestClaimProof(record(), { ...input(), proofRotationGraceSeconds: grace })).toEqual({ status: 'verified', proofVersion: 2 })
})
test('上一版宽限期截止拒绝，不因策略重新延长', () => expect(verifyGuestClaimProof(record(), { ...input(), possessionProof: previousProof, nowMs: 3000 })).toEqual({ status: 'not_claimable' }))
test.each(['legacy_source', 'unknown_source', 'wrong_proof', 'padding', 'short', 'future', 'failed'] as const)('不合法持有%s统一拒绝', kind => {
  const r = record(), i = input()
  // 裁决 A：历史 cloudbase_anonymous 会话一律不可认领。
  if (kind === 'legacy_source') { r.identitySource = 'cloudbase_anonymous' }
  if (kind === 'unknown_source') { r.identitySource = 'other' }
  if (kind === 'wrong_proof') { i.possessionProof = Buffer.alloc(32, 3).toString('base64url') }
  if (kind === 'padding') { i.possessionProof += '=' }
  if (kind === 'short') { i.possessionProof = Buffer.alloc(31).toString('base64url') }
  if (kind === 'future') { i.nowMs = 999 }
  if (kind === 'failed') { r.status = 'failed' }
  expect(verifyGuestClaimProof(r, i)).toEqual({ status: 'not_claimable' })
})
test('会话到期同时拒绝全部证明；非持有者不能看到过期状态', () => {
  expect(verifyGuestClaimProof(record(), { ...input(), nowMs: 9000 })).toEqual({ status: 'expired' })
  expect(verifyGuestClaimProof(record(), { ...input(), nowMs: 9000, possessionProof: Buffer.alloc(32, 3).toString('base64url') })).toEqual({ status: 'not_claimable' })
  expect(verifyGuestClaimProof({ ...record(), identitySource: 'cloudbase_anonymous' }, { ...input(), nowMs: 9000 })).toEqual({ status: 'not_claimable' })
})
test('匿名信号摘要不是证明输入：多余字段不影响也不被读取', () => {
  expect(verifyGuestClaimProof(record(), input())).toEqual({ status: 'verified', proofVersion: 2 })
  expect(Object.keys(input())).not.toContain('anonymousSubjectHash')
})
test('completed仍可持有，expired不可继续', () => {
  expect(verifyGuestClaimProof({ ...record(), status: 'completed' }, input())).toEqual({ status: 'verified', proofVersion: 2 })
  expect(verifyGuestClaimProof({ ...record(), status: 'expired' }, input())).toEqual({ status: 'expired' })
})
test.each(['version_zero', 'unsafe_version', 'half_previous', 'same_hash', 'previous_on_first', 'invalid_deadline', 'bad_hash', 'unsafe_time', 'unknown_state'] as const)('损坏存储%s不能准入', kind => {
  const r = record()
  if (kind === 'version_zero') { r.proofVersion = 0 }
  if (kind === 'unsafe_version') { r.proofVersion = 4294967296 }
  if (kind === 'half_previous') { r.previousProofHash = null as never }
  if (kind === 'same_hash') { r.previousProofHash = r.proofHash }
  if (kind === 'previous_on_first') { r.proofVersion = 1 }
  if (kind === 'invalid_deadline') { r.previousProofValidUntilMs = 9001 }
  if (kind === 'bad_hash') { r.proofHash = 'malformed' }
  if (kind === 'unsafe_time') { r.expiresAtMs = Number.MAX_SAFE_INTEGER + 1 }
  if (kind === 'unknown_state') { r.status = 'unknown' }
  expect(verifyGuestClaimProof(r, input())).toEqual({ status: 'unavailable' })
})
test.each([301, -1, 0.5, Number.NaN])('非法发布宽限期%s不作为默认', grace => expect(verifyGuestClaimProof(record(), { ...input(), proofRotationGraceSeconds: grace })).toEqual({ status: 'unavailable' }))
test('对象冒充摘要不能通过或抛出原始内部错误', () => {
  expect(verifyGuestClaimProof({ ...record(), proofHash: { toString: () => hash(currentProof) } as never }, input())).toEqual({ status: 'unavailable' })
})
test('上一版失效后不能获得会话过期信息；当前证明仍可辨认会话到期', () => {
  expect(verifyGuestClaimProof(record(), { ...input(), possessionProof: previousProof, nowMs: 9000 })).toEqual({ status: 'not_claimable' })
  expect(verifyGuestClaimProof(record(), { ...input(), nowMs: 9000 })).toEqual({ status: 'expired' })
})
