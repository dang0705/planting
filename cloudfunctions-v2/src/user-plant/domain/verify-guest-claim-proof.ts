import { createHash, timingSafeEqual } from 'node:crypto'

/** 从锁定会话读取的最小证明状态，不含数据库键。 */
export interface GuestClaimProofRecord {
  /** 游客身份来源；只有 server_issued_guest_token 可认领（guest-token/v1，历史 cloudbase_anonymous 一律拒绝）。 */ readonly identitySource: string
  /** 当前持有证明（服务端自发游客令牌）的SHA-256摘要。 */ readonly proofHash: string
  /** 当前单调递增证明版本。 */ readonly proofVersion: number
  /** 上一版证明摘要，无上一版为null；当前游客令牌不轮换，此路径保留但通常不触发。 */ readonly previousProofHash: string | null
  /** 已存宽限期截止时刻，不在校验时续期。 */ readonly previousProofValidUntilMs: number | null
  /** 会话签发UTC毫秒。 */ readonly issuedAtMs: number
  /** 会话失效UTC毫秒。 */ readonly expiresAtMs: number
  /** 存储状态只允许合同四种状态。 */ readonly status: string
}
/** 认领调用上下文：游客令牌即持有证明（guest-token/v1 §3），原文仅在当前内存中使用。 */
export interface GuestClaimProofInput {
  /** 登录用户请求体携带的原游客令牌，禁止写入SQL、日志、审计或结果。 */ readonly possessionProof: string
  /** 可信服务端UTC时刻。 */ readonly nowMs: number
  /** 已发布轮换策略；缺快照为null，仅阻断上一版证明。 */ readonly proofRotationGraceSeconds: number | null
}
/** 窄内部结果，不能披露证明、令牌或匿名信号信息。 */
export type GuestClaimProofResult = {
  /** 证明与有效会话已同时验证。 */ readonly status: 'verified'
  /** 实际匹配的审计版本。 */ readonly proofVersion: number
} | {
  /** 不匹配统一拒绝；只有持有者能获得过期判断；损坏数据不可用。 */ readonly status: 'not_claimable' | 'expired' | 'unavailable'
}
const shaPattern = /^[a-f0-9]{64}$/u
/** 等长摘要常量时间比较，不比较原始证明字符串。 */
function equalHash(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'))
}
/** 可信毫秒需能安全表示且可形成有效日期。 */
function validTime(value: number): boolean { return Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime()) }
/** 认领事务的会话证明准入；不授予登录或长期植物归属。 */
export function verifyGuestClaimProof(record: GuestClaimProofRecord, input: GuestClaimProofInput): GuestClaimProofResult {
  if (!record || !input || typeof record.identitySource !== 'string' || typeof record.proofHash !== 'string' || !shaPattern.test(record.proofHash)
    || !Number.isSafeInteger(record.proofVersion) || record.proofVersion < 1 || record.proofVersion > 4294967295
    || !validTime(record.issuedAtMs) || !validTime(record.expiresAtMs) || record.expiresAtMs <= record.issuedAtMs
    || !['active', 'completed', 'failed', 'expired'].includes(record.status)
    || !validTime(input.nowMs) || (input.proofRotationGraceSeconds !== null && (!Number.isInteger(input.proofRotationGraceSeconds) || input.proofRotationGraceSeconds < 0 || input.proofRotationGraceSeconds > 300))) { return { status: 'unavailable' } }
  const hasPrevious = record.previousProofHash !== null
  if (hasPrevious !== (record.previousProofValidUntilMs !== null)
    || (hasPrevious && (typeof record.previousProofHash !== 'string' || !shaPattern.test(record.previousProofHash!) || record.proofVersion === 1 || record.previousProofHash === record.proofHash
      || !validTime(record.previousProofValidUntilMs!) || record.previousProofValidUntilMs! <= record.issuedAtMs || record.previousProofValidUntilMs! > record.expiresAtMs))) { return { status: 'unavailable' } }
  // 匿名信号只作防刷，不参与持有证明；历史 CloudBase 匿名会话不能以令牌语义认领。
  if (record.identitySource !== 'server_issued_guest_token') { return { status: 'not_claimable' } }
  if (typeof input.possessionProof !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(input.possessionProof)) { return { status: 'not_claimable' } }
  const decoded = Buffer.from(input.possessionProof, 'base64url')
  if (decoded.byteLength < 32 || decoded.toString('base64url') !== input.possessionProof) { return { status: 'not_claimable' } }
  const proofHash = createHash('sha256').update(input.possessionProof, 'utf8').digest('hex')
  const current = equalHash(record.proofHash, proofHash)
  const previous = hasPrevious && equalHash(record.previousProofHash!, proofHash)
  if (!current && !previous) { return { status: 'not_claimable' } }
  if (input.nowMs < record.issuedAtMs || record.status === 'failed') { return { status: 'not_claimable' } }
  // 上一版失效即不再证明持有权，不能先披露会话到期状态。
  if (!current && (input.proofRotationGraceSeconds === null || input.proofRotationGraceSeconds === 0 || input.nowMs >= record.previousProofValidUntilMs!)) { return { status: 'not_claimable' } }
  if (input.nowMs >= record.expiresAtMs || record.status === 'expired') { return { status: 'expired' } }
  if (current) { return { status: 'verified', proofVersion: record.proofVersion } }
  return { status: 'verified', proofVersion: record.proofVersion - 1 }
}
