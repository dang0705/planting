import { createHash, timingSafeEqual } from 'node:crypto'

/** 从锁定会话读取的最小证明状态，不含数据库键。 */
export interface GuestClaimProofRecord {
  /** 经匿名平台验真的主体摘要。 */ readonly anonymousSubjectHash: string
  /** 当前持有证明的SHA-256摘要。 */ readonly proofHash: string
  /** 当前单调递增证明版本。 */ readonly proofVersion: number
  /** 上一版证明摘要，无上一版为null。 */ readonly previousProofHash: string | null
  /** 已存宽限期截止时刻，不在校验时续期。 */ readonly previousProofValidUntilMs: number | null
  /** 会话签发UTC毫秒。 */ readonly issuedAtMs: number
  /** 会话失效UTC毫秒。 */ readonly expiresAtMs: number
  /** 存储状态只允许合同四种状态。 */ readonly status: string
}
/** 服务端验真后的调用上下文，原始证明仅在当前内存中使用。 */
export interface GuestClaimProofInput {
  /** 受控匿名身份适配得到的摘要，不接受未经验真的客户端声明。 */ readonly anonymousSubjectHash: string
  /** 从固定请求头读取，禁止写入SQL、日志或结果。 */ readonly possessionProof: string
  /** 可信服务端UTC时刻。 */ readonly nowMs: number
  /** 已发布轮换策略；缺快照为null，仅阻断上一版证明。 */ readonly proofRotationGraceSeconds: number | null
}
/** 窄内部结果，不能披露证明或匿名主体信息。 */
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
  if (!record || !input || typeof record.anonymousSubjectHash !== 'string' || typeof record.proofHash !== 'string' || !shaPattern.test(record.anonymousSubjectHash) || !shaPattern.test(record.proofHash)
    || !Number.isSafeInteger(record.proofVersion) || record.proofVersion < 1 || record.proofVersion > 4294967295
    || !validTime(record.issuedAtMs) || !validTime(record.expiresAtMs) || record.expiresAtMs <= record.issuedAtMs
    || !['active', 'completed', 'failed', 'expired'].includes(record.status)
    || !validTime(input.nowMs) || (input.proofRotationGraceSeconds !== null && (!Number.isInteger(input.proofRotationGraceSeconds) || input.proofRotationGraceSeconds < 0 || input.proofRotationGraceSeconds > 300))) { return { status: 'unavailable' } }
  const hasPrevious = record.previousProofHash !== null
  if (hasPrevious !== (record.previousProofValidUntilMs !== null)
    || (hasPrevious && (typeof record.previousProofHash !== 'string' || !shaPattern.test(record.previousProofHash!) || record.proofVersion === 1 || record.previousProofHash === record.proofHash
      || !validTime(record.previousProofValidUntilMs!) || record.previousProofValidUntilMs! <= record.issuedAtMs || record.previousProofValidUntilMs! > record.expiresAtMs))) { return { status: 'unavailable' } }
  if (typeof input.anonymousSubjectHash !== 'string' || !shaPattern.test(input.anonymousSubjectHash)
    || !equalHash(record.anonymousSubjectHash, input.anonymousSubjectHash)) { return { status: 'not_claimable' } }
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
