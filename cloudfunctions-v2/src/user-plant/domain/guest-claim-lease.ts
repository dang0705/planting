/**
 * 游客认领命令处理租约时长（毫秒）。
 * 配置目录硬规则 `user-plant.guest_claim.processing_lease_seconds` = 30：正确性依赖完成写入的“租约未过期且持有者匹配”条件，
 * 时长只决定崩溃后的接管等待，不做运营配置；调整须改代码与测试。
 */
export const GUEST_CLAIM_PROCESSING_LEASE_MS = 30 * 1000

/** 租约裁决输入：事务内加锁读到的命令状态与本次请求的服务端候选持有者。 */
export interface GuestClaimLeaseDecisionInput {
  /** 命令状态：requested、processing、completed、failed。 */
  readonly status: string
  /** 当前租约持有者摘要；requested/completed/failed 必须为 null。 */
  readonly leaseOwnerHash: string | null
  /** 当前租约截止时刻 UTC 毫秒；左闭右开，等于当前时刻即视为已过期。 */
  readonly leaseExpiresAtMs: number | null
  /** 已开始处理次数；requested 为 0，其余至少为 1。 */
  readonly attemptCount: number
  /** 命令最近更新时刻 UTC 毫秒；当前时刻不得早于它。 */
  readonly updatedAtMs: number
  /** 服务端可信当前 UTC 毫秒。 */
  readonly nowMs: number
  /** 本次请求由服务端高熵随机生成后取 SHA-256 的候选持有者摘要。 */
  readonly candidateOwnerHash: string
}

/** 租约裁决结果。 */
export type GuestClaimLeaseDecision =
  | {
      /** 取得租约：首次取得或接管已过期租约。 */
      readonly kind: 'acquire'
      /** 写入后的处理次数。 */
      readonly attemptCount: number
      /** 写入后的租约截止时刻：当前时刻 + 30 秒。 */
      readonly leaseExpiresAtMs: number
      /** 是否接管了已过期的他人租约。 */
      readonly takeover: boolean
    }
  | {
      /** 本次候选持有者已经持有未过期租约，不写入。 */
      readonly kind: 'already_owned'
      /** 现有租约截止时刻。 */
      readonly leaseExpiresAtMs: number
    }
  | {
      /** 他人持有未过期租约，不接管（客户端用同一幂等键稍后重试）。 */
      readonly kind: 'held'
    }
  | {
      /** 命令已完成或已失败，不再取得租约。 */
      readonly kind: 'completed' | 'failed'
    }
  | {
      /** 存储数据或输入不合法，调用方必须回滚并按不可用处理。 */
      readonly kind: 'invalid'
    }

const shaPattern = /^[a-f0-9]{64}$/u
/** 安全 UTC 毫秒。 */
const validTime = (value: number) => Number.isSafeInteger(value) && value >= 0 && Number.isFinite(new Date(value).getTime())

/**
 * 处理租约规则（主代理 2026-10-09 裁决）：requested → 首次取得（attempt=1）；processing 且已过期 → 原子接管
 * （attempt+1，换持有者）；processing 未过期且非本人 → 不接管；completed/failed → 不取得。
 */
export function decideGuestClaimLease(input: GuestClaimLeaseDecisionInput): GuestClaimLeaseDecision {
  const { status, leaseOwnerHash, leaseExpiresAtMs, attemptCount, updatedAtMs, nowMs, candidateOwnerHash } = input
  if (!shaPattern.test(candidateOwnerHash) || !validTime(nowMs) || !validTime(updatedAtMs) || nowMs < updatedAtMs
    || !Number.isSafeInteger(attemptCount) || attemptCount < 0) { return { kind: 'invalid' } }
  const expiresAt = nowMs + GUEST_CLAIM_PROCESSING_LEASE_MS
  if (status === 'requested') {
    if (leaseOwnerHash !== null || leaseExpiresAtMs !== null || attemptCount !== 0) { return { kind: 'invalid' } }
    return { kind: 'acquire', attemptCount: 1, leaseExpiresAtMs: expiresAt, takeover: false }
  }
  if (status === 'completed' || status === 'failed') {
    if (leaseOwnerHash !== null || leaseExpiresAtMs !== null || attemptCount < 1) { return { kind: 'invalid' } }
    return { kind: status }
  }
  if (status !== 'processing' || leaseOwnerHash === null || !shaPattern.test(leaseOwnerHash)
    || leaseExpiresAtMs === null || !validTime(leaseExpiresAtMs) || attemptCount < 1) { return { kind: 'invalid' } }
  if (leaseExpiresAtMs <= nowMs) {
    return { kind: 'acquire', attemptCount: attemptCount + 1, leaseExpiresAtMs: expiresAt, takeover: true }
  }
  return leaseOwnerHash === candidateOwnerHash ? { kind: 'already_owned', leaseExpiresAtMs } : { kind: 'held' }
}
