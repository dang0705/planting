import type { UserRef } from '../../contracts/types.js'
import type { ExistingAiQuotaReservation } from '../repository/mysql-ai-quota-reservation-repository.js'

/** 提交结果未知后，由全新数据库连接读回的预占幂等快照。 */
export type AiQuotaReservationCommitUnknownRecord = ExistingAiQuotaReservation & {
  /** 首次规范化预占命令的 SHA-256，用于拒绝异参重放。 */
  readonly requestHash: string
}

/** 预占提交未知只读查询的完整唯一作用域。 */
export type ReadAiQuotaReservationAfterCommitUnknownInput = {
  /** 已验证统一用户公开引用；Repository 必须据此限制数据归属。 */
  readonly userRef: UserRef
  /** 首次预占所属产品动作的稳定标识。 */
  readonly productActionId: string
  /** 首次预占使用的业务幂等键。 */
  readonly idempotencyKey: string
}

/** 只允许使用新连接、无锁读取额度预占的 Repository。 */
export type AiQuotaReservationCommitUnknownReadOnlyRepository = {
  /** 按用户、产品动作和幂等键读取已提交记录；禁止写库或复用旧事务。 */
  readonly read: (
    input: ReadAiQuotaReservationAfterCommitUnknownInput
  ) => Promise<AiQuotaReservationCommitUnknownRecord | null>
}

/** 对账当前预占提交结果所需的请求证据。 */
export type ReconcileAiQuotaReservationCommitInput =
  ReadAiQuotaReservationAfterCommitUnknownInput & {
    /** 当前规范化预占命令的 SHA-256。 */
    readonly requestHash: string
  }

/** 提交结果未知后，由新连接读回的结算终态快照。 */
export type AiQuotaSettlementCommitUnknownRecord = {
  /** 额度预占高熵公开引用。 */
  readonly reservationRef: string
  /** 当前预占状态；`reserved` 表示事务结果仍无法证明。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 首次锁定的正整数预占额度。 */
  readonly estimatedAmount: number
  /** 已提交结算额度；预占或待对账状态为空。 */
  readonly settledAmount: number | null
  /** 已提交供应商实际成本微元；仍预占时为空。 */
  readonly actualCostMicros: number | null
  /** 已提交脱敏用量证据引用；仍预占时为空。 */
  readonly usageEvidenceRef: string | null
  /** 已提交平台承担成本微元。 */
  readonly platformAbsorbedCostMicros: number
}

/** 结算提交未知只读查询的用户归属和预占作用域。 */
export type ReadAiQuotaSettlementAfterCommitUnknownInput = {
  /** 已验证统一用户公开引用；Repository 必须据此限制数据归属。 */
  readonly userRef: UserRef
  /** 待核验终态的额度预占高熵公开引用。 */
  readonly reservationRef: string
}

/** 只允许使用新连接、无锁读取额度结算终态的 Repository。 */
export type AiQuotaSettlementCommitUnknownReadOnlyRepository = {
  /** 按统一用户和预占引用读取已提交记录；禁止写库或复用旧事务。 */
  readonly read: (
    input: ReadAiQuotaSettlementAfterCommitUnknownInput
  ) => Promise<AiQuotaSettlementCommitUnknownRecord | null>
}

/** 对账结算提交结果所需的不可变供应商证据。 */
export type ReconcileAiQuotaSettlementCommitInput =
  ReadAiQuotaSettlementAfterCommitUnknownInput & {
    /** 成本策略折算出的目标结算额度。 */
    readonly settledAmount: number
    /** 供应商实际可审计成本，人民币微元。 */
    readonly actualCostMicros: number
    /** 脱敏供应商用量证据引用。 */
    readonly usageEvidenceRef: string
    /** 超额时暂由平台承担的成本微元。 */
    readonly platformAbsorbedCostMicros: number
  }

/** 新连接对账不能证明首次事务结果时的内部原因。 */
export type AiQuotaCommitUnknownReason =
  | 'missing'
  | 'processing'
  | 'request_hash_mismatch'
  | 'evidence_mismatch'
  | 'read_failed'

/** 预占提交结果未知后的封闭对账结果。 */
export type AiQuotaReservationCommitUnknownResult =
  | {
      /** 已证明相同预占提交，可由应用层安全重放。 */
      readonly kind: 'replay'
      /** 已提交预占的公开业务快照。 */
      readonly reservation: ExistingAiQuotaReservation
    }
  | {
      /** 当前数据不足以证明提交结果，应用层必须失败关闭。 */
      readonly kind: 'unresolved'
      /** 只供内部观测使用的失败分类。 */
      readonly reason: AiQuotaCommitUnknownReason
    }

/** 结算提交结果未知后的封闭对账结果。 */
export type AiQuotaSettlementCommitUnknownResult =
  | {
      /** 已证明相同结算终态提交，可由应用层安全重放。 */
      readonly kind: 'replay'
      /** 已提交的预占生命周期终态。 */
      readonly status: 'settled' | 'released' | 'pending_reconciliation'
      /** 已提交结算额度；待对账时为空。 */
      readonly settledAmount: number | null
    }
  | {
      /** 当前数据不足以证明提交结果，应用层必须失败关闭。 */
      readonly kind: 'unresolved'
      /** 只供内部观测使用的失败分类。 */
      readonly reason: AiQuotaCommitUnknownReason
    }

/** 使用新连接只读证明额度预占是否已经提交。 */
export async function reconcileAiQuotaReservationCommitResult(
  repository: AiQuotaReservationCommitUnknownReadOnlyRepository,
  input: ReconcileAiQuotaReservationCommitInput
): Promise<AiQuotaReservationCommitUnknownResult> {
  let record: AiQuotaReservationCommitUnknownRecord | null
  try {
    record = await repository.read(input)
  } catch {
    return { kind: 'unresolved', reason: 'read_failed' }
  }
  if (record === null) {
    return { kind: 'unresolved', reason: 'missing' }
  }
  if (record.requestHash !== input.requestHash) {
    return { kind: 'unresolved', reason: 'request_hash_mismatch' }
  }
  const { requestHash: _requestHash, ...reservation } = record
  return { kind: 'replay', reservation }
}

/** 使用新连接只读证明额度结算终态是否已经提交。 */
export async function reconcileAiQuotaSettlementCommitResult(
  repository: AiQuotaSettlementCommitUnknownReadOnlyRepository,
  input: ReconcileAiQuotaSettlementCommitInput
): Promise<AiQuotaSettlementCommitUnknownResult> {
  let record: AiQuotaSettlementCommitUnknownRecord | null
  try {
    record = await repository.read(input)
  } catch {
    return { kind: 'unresolved', reason: 'read_failed' }
  }
  if (record === null) {
    return { kind: 'unresolved', reason: 'missing' }
  }
  if (record.status === 'reserved') {
    return { kind: 'unresolved', reason: 'processing' }
  }
  const amountMatches =
    record.status === 'pending_reconciliation'
      ? record.settledAmount === null && input.settledAmount > record.estimatedAmount
      : record.settledAmount === input.settledAmount
  if (
    record.reservationRef !== input.reservationRef ||
    !amountMatches ||
    record.actualCostMicros !== input.actualCostMicros ||
    record.usageEvidenceRef !== input.usageEvidenceRef ||
    record.platformAbsorbedCostMicros !== input.platformAbsorbedCostMicros
  ) {
    return { kind: 'unresolved', reason: 'evidence_mismatch' }
  }
  return {
    kind: 'replay',
    status: record.status,
    settledAmount: record.settledAmount
  }
}
