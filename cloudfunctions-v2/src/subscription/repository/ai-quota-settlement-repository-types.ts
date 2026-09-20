import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'

/** 额度结算 Repository 的稳定内部错误类型。 */
export type AiQuotaSettlementPersistenceErrorType =
  | 'INTERNAL_DATA_INVALID'
  | 'SETTLEMENT_CONFLICT'
  | 'COMMIT_RESULT_UNKNOWN'
  | 'WRITE_CONFLICT'

/** 额度结算持久化错误只能由应用层映射为脱敏公开错误。 */
export class AiQuotaSettlementPersistenceError extends Error {
  /** 稳定内部错误类型。 */
  readonly type: AiQuotaSettlementPersistenceErrorType

  constructor(type: AiQuotaSettlementPersistenceErrorType, message: string) {
    super(message)
    this.name = 'AI额度结算持久化错误'
    this.type = type
  }
}

/** 锁定额度预占时允许读回的最小行。 */
export type AiQuotaSettlementReservationSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'settlement_reservation'
  /** 预占 BIGINT 内部主键的十进制文本。 */
  readonly reservation_internal_id: string
  /** 高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 原预占额度的正整数文本。 */
  readonly estimated_amount: string
  /** 已结算额度文本；非终态固定为空。 */
  readonly settled_amount: string | null
  /** 已核验实际成本微元文本；未核验时为空。 */
  readonly actual_cost_micros: string | null
  /** 脱敏用量证据引用；未核验时为空。 */
  readonly usage_evidence_ref: string | null
  /** 平台承担成本微元的非负整数文本。 */
  readonly platform_absorbed_cost_micros: string
  /** 当前预占生命周期状态。 */
  readonly reservation_status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 预占乐观锁版本的正整数文本。 */
  readonly reservation_version: string
}

/** 锁定分摊和对应额度批次时允许读回的最小行。 */
export type AiQuotaSettlementAllocationSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'settlement_allocation'
  /** 分摊 BIGINT 内部主键的十进制文本。 */
  readonly allocation_internal_id: string
  /** 额度批次 BIGINT 内部主键的十进制文本。 */
  readonly grant_internal_id: string
  /** 高熵额度批次公开引用。 */
  readonly grant_ref: string
  /** 额度批次乐观锁版本的正整数文本。 */
  readonly grant_version: string
  /** 当前额度批次状态。 */
  readonly grant_status: 'active' | 'partially_used' | 'used' | 'expired' | 'reversed'
  /** 批次当前可用额度的非负整数文本。 */
  readonly grant_available_amount: string
  /** 批次当前预占额度的非负整数文本。 */
  readonly grant_reserved_amount: string
  /** 批次当前已消费额度的非负整数文本。 */
  readonly grant_consumed_amount: string
  /** 本分摊仍待结算或释放的正整数文本。 */
  readonly allocation_remaining_amount: string
  /** 本分摊累计已结算额度的非负整数文本。 */
  readonly allocation_settled_amount: string
  /** 本分摊累计已释放额度的非负整数文本。 */
  readonly allocation_released_amount: string
}

/** 额度结算 Repository 可读回的受控 SQL 行。 */
export type AiQuotaSettlementSqlRow =
  | AiQuotaSettlementReservationSqlRow
  | AiQuotaSettlementAllocationSqlRow

/** 参数化 SQL 写入的最小结果。 */
export type AiQuotaSettlementSqlWriteResult = {
  /** SQL 实际影响的行数。 */
  readonly affectedRows: number
}

/** 额度结算 Repository 使用的参数化 SQL 执行端口。 */
export type AiQuotaSettlementSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务内执行参数化查询。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly AiQuotaSettlementSqlRow[]>
  /** 在调用方事务内执行参数化写入。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<AiQuotaSettlementSqlWriteResult>
}

/** 已锁定额度预占的内部快照。 */
export type LockedAiQuotaSettlementReservation = {
  /** 预占 BIGINT 内部主键文本。 */
  readonly reservationInternalId: string
  /** 高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 该预占最初锁定的正整数额度，用于校验所有分摊金额守恒。 */
  readonly estimatedAmount: number
  /** 已结算额度；非终态为空。 */
  readonly settledAmount: number | null
  /** 已核验实际成本微元；未核验时为空。 */
  readonly actualCostMicros: number | null
  /** 脱敏用量证据引用；未核验时为空。 */
  readonly usageEvidenceRef: string | null
  /** 平台承担的成本微元。 */
  readonly platformAbsorbedCostMicros: number
  /** 当前预占生命周期状态。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 预占乐观锁版本。 */
  readonly reservationVersion: number
}

/** 已锁定分摊及对应额度批次的内部快照。 */
export type LockedAiQuotaSettlementAllocation = {
  /** 分摊 BIGINT 内部主键文本。 */
  readonly allocationInternalId: string
  /** 额度批次 BIGINT 内部主键文本。 */
  readonly grantInternalId: string
  /** 高熵额度批次公开引用。 */
  readonly grantRef: string
  /** 额度批次乐观锁版本。 */
  readonly grantVersion: number
  /** 当前额度批次状态。 */
  readonly grantStatus: 'active' | 'partially_used'
  /** 批次当前可用额度。 */
  readonly grantAvailableAmount: number
  /** 批次当前预占额度。 */
  readonly grantReservedAmount: number
  /** 批次当前已消费额度。 */
  readonly grantConsumedAmount: number
  /** 本分摊仍待结算或释放的额度。 */
  readonly remainingAmount: number
  /** 本分摊累计已结算额度。 */
  readonly settledAmount: number
  /** 本分摊累计已释放额度。 */
  readonly releasedAmount: number
}

/** 锁定预占所需的内部归属条件。 */
export type LockAiQuotaSettlementReservationInput = {
  /** 已由账户锁验证的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 要结算的高熵额度预占公开引用。 */
  readonly reservationRef: string
}

/** 锁定全部分摊所需的内部条件。 */
export type LockAiQuotaSettlementAllocationsInput = {
  /** 已由账户锁验证的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 已锁定预占的 BIGINT 内部主键文本。 */
  readonly reservationInternalId: string
  /** 预占记录声明的总额，用于校验分摊守恒。 */
  readonly estimatedAmount: number
}

/** 一条已获领域批准的分摊终态及账本引用。 */
export type PersistAiQuotaSettlementAllocationInput = {
  /** 分摊 BIGINT 内部主键文本。 */
  readonly allocationInternalId: string
  /** 额度批次 BIGINT 内部主键文本。 */
  readonly grantInternalId: string
  /** 高熵额度批次公开引用。 */
  readonly grantRef: string
  /** 额度批次锁定时版本。 */
  readonly grantVersion: number
  /** 本次处理前仍被锁定的额度。 */
  readonly remainingAmount: number
  /** 本次新增的结算额度。 */
  readonly settledAmount: number
  /** 本次新增的释放额度。 */
  readonly releasedAmount: number
  /** 非零结算对应的不可变账本公开引用。 */
  readonly settleLedgerRef?: string
  /** 非零释放对应的不可变账本公开引用。 */
  readonly releaseLedgerRef?: string
}

/** 原子应用确定性结算或释放计划所需的内部输入。 */
export type ApplyAiQuotaSettlementInput = {
  /** 统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 额度账户 BIGINT 内部主键文本。 */
  readonly accountInternalId: string
  /** 额度账户锁定时版本。 */
  readonly accountVersion: number
  /** 预占 BIGINT 内部主键文本。 */
  readonly reservationInternalId: string
  /** 高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 预占锁定时版本。 */
  readonly reservationVersion: number
  /** 原预占额度总额。 */
  readonly estimatedAmount: number
  /** 本次结算额度总额。 */
  readonly settledAmount: number
  /** 本次释放额度总额。 */
  readonly releasedAmount: number
  /** 供应商实际成本微元。 */
  readonly actualCostMicros: number
  /** 脱敏供应商用量证据引用。 */
  readonly usageEvidenceRef: string
  /** 服务端可信业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 全部分摊的确定性终态。 */
  readonly allocations: readonly PersistAiQuotaSettlementAllocationInput[]
}

/** 标记待对账所需的内部输入。 */
export type MarkPendingAiQuotaReconciliationInput = {
  /** 统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 预占 BIGINT 内部主键文本。 */
  readonly reservationInternalId: string
  /** 高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 预占锁定时版本。 */
  readonly reservationVersion: number
  /** 供应商实际成本微元。 */
  readonly actualCostMicros: number
  /** 脱敏供应商用量证据引用。 */
  readonly usageEvidenceRef: string
  /** 暂由平台承担的超额成本微元。 */
  readonly platformAbsorbedCostMicros: number
  /** 服务端可信业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** MySQL AI 额度结算 Repository 端口。 */
export type MysqlAiQuotaSettlementRepository<TTransaction extends TransactionExecutionContext> = {
  /** 锁定指定用户的额度预占。 */
  readonly lockReservation: (
    transaction: TTransaction,
    input: LockAiQuotaSettlementReservationInput
  ) => Promise<LockedAiQuotaSettlementReservation>
  /** 按原消费顺序锁定预占的全部分摊和批次。 */
  readonly lockAllocations: (
    transaction: TTransaction,
    input: LockAiQuotaSettlementAllocationsInput
  ) => Promise<readonly LockedAiQuotaSettlementAllocation[]>
  /** 原子应用结算、释放、账本和账户投影。 */
  readonly applySettlement: (
    transaction: TTransaction,
    input: ApplyAiQuotaSettlementInput
  ) => Promise<void>
  /** 超额成本只标记待对账，不提前改变用户额度。 */
  readonly markPendingReconciliation: (
    transaction: TTransaction,
    input: MarkPendingAiQuotaReconciliationInput
  ) => Promise<void>
}
