import type { UserGenerativeCapability, UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { AiQuotaGrantCandidate } from '../domain/plan-ai-quota-allocation.js'

/** 额度预占持久化层可以产生的稳定内部错误类型。 */
export type AiQuotaReservationPersistenceErrorType =
  | 'PRINCIPAL_INVALID'
  | 'INTERNAL_DATA_INVALID'
  | 'IDEMPOTENCY_CONFLICT'
  | 'WRITE_CONFLICT'

/** Repository 错误只能由应用层映射为脱敏公开错误。 */
export class AiQuotaReservationPersistenceError extends Error {
  /** 稳定内部错误类型；不得把 SQL、内部主键或原始请求写入公开响应。 */
  readonly type: AiQuotaReservationPersistenceErrorType

  constructor(type: AiQuotaReservationPersistenceErrorType, message: string) {
    super(message)
    this.name = 'AI额度预占持久化错误'
    this.type = type
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type AiQuotaReservationSqlWriteResult = {
  /** 参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/** 锁定用户额度账户时允许读回的最小行。 */
export type AiQuotaReservationAccountSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'account'
  /** AI 额度账户 BIGINT 内部主键的十进制文本。 */
  readonly account_internal_id: string
  /** 统一用户 BIGINT 内部主键的十进制文本，只在 Repository 内传递。 */
  readonly user_internal_id: string
  /** 统一用户当前状态。 */
  readonly user_status: 'active' | 'suspended' | 'deleting' | 'deleted'
  /** 账户投影当前可用额度的非负十进制文本。 */
  readonly available_amount: string
  /** 账户投影当前预占额度的非负十进制文本。 */
  readonly reserved_amount: string
  /** 账户投影乐观锁版本的正整数文本。 */
  readonly account_version: string
}

/** 锁定额度批次时允许读回的最小行。 */
export type AiQuotaReservationGrantSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'grant'
  /** 额度批次 BIGINT 内部主键的十进制文本。 */
  readonly grant_internal_id: string
  /** 高熵额度批次公开引用。 */
  readonly grant_ref: string
  /** 批次发放总额的非负十进制文本。 */
  readonly granted_amount: string
  /** 当前可用额度的非负十进制文本。 */
  readonly available_amount: string
  /** 当前已预占额度的非负十进制文本。 */
  readonly reserved_amount: string
  /** 当前已结算额度的非负十进制文本。 */
  readonly consumed_amount: string
  /** 当前可消费批次状态。 */
  readonly grant_status: 'active' | 'partially_used' | 'used' | 'expired' | 'reversed'
  /** 批次乐观锁版本的正整数文本。 */
  readonly grant_version: string
  /** 批次生效时间的非负十进制文本。 */
  readonly granted_at_ms: string
  /** 批次开区间失效时间的非负十进制文本。 */
  readonly expires_at_ms: string
  /** MySQL JSON 驱动返回的字符串或已解析数组。 */
  readonly capability_scope_json: string | readonly unknown[]
}

/** 已有额度预占按幂等唯一键读回的最小行。 */
export type AiQuotaReservationExistingSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'reservation'
  /** 已存在的高熵额度预占公开引用。 */
  readonly reservation_ref: string
  /** 首次规范化命令的 SHA-256。 */
  readonly request_hash: string
  /** 当前额度预占生命周期状态。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 首次锁定预占额度的正整数文本。 */
  readonly estimated_amount: string
  /** 首次预占的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 首次锁定的不可变成本策略版本。 */
  readonly cost_policy_version: string
  /** 预占租约失效时间的非负十进制文本。 */
  readonly expires_at_ms: string
}

/** 额度预占 Repository 的受控 SQL 行联合类型。 */
export type AiQuotaReservationSqlRow =
  | AiQuotaReservationAccountSqlRow
  | AiQuotaReservationGrantSqlRow
  | AiQuotaReservationExistingSqlRow

/** 额度预占 Repository 使用的参数化 SQL 执行端口。 */
export type AiQuotaReservationSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务中执行参数化查询；行锁服从同一事务生命周期。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly AiQuotaReservationSqlRow[]>
  /** 在调用方事务中执行参数化 INSERT 或 UPDATE。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<AiQuotaReservationSqlWriteResult>
}

/** 锁定统一用户额度账户后的快照。 */
export type LockedAiQuotaAccount = {
  /** 已锁定额度账户的 BIGINT 内部主键文本。 */
  readonly accountInternalId: string
  /** 已锁定额度账户的乐观锁版本。 */
  readonly accountVersion: number
  /** 统一用户 BIGINT 内部主键文本；只允许继续传给同一事务内 Repository。 */
  readonly userInternalId: string
  /** 锁定时账户投影记录的可用额度。 */
  readonly availableAmount: number
  /** 锁定时账户投影记录的预占额度。 */
  readonly reservedAmount: number
}

/** 锁定统一用户和可用额度批次后的领域输入。 */
export type LockedAiQuotaGrantCandidate = AiQuotaGrantCandidate & {
  /** 已锁定额度批次的 BIGINT 内部主键文本。 */
  readonly grantInternalId: string
  /** 已锁定额度批次的乐观锁版本。 */
  readonly grantVersion: number
}

/** 锁定可用额度批次所需的可信查询条件。 */
export type ReadEligibleAiQuotaGrantsInput = {
  /** 已由账户锁查询验证的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 当前产品动作要求的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 读取已有预占幂等结果所需的内部唯一作用域。 */
export type ReadExistingAiQuotaReservationInput = {
  /** 已由账户锁查询验证的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 一次用户产品动作的稳定标识。 */
  readonly productActionId: string
  /** 规范化产品动作幂等键。 */
  readonly idempotencyKey: string
  /** 本次规范化内部命令的 SHA-256。 */
  readonly requestHash: string
}

/** 同键同摘要时允许安全重放的已有预占摘要。 */
export type ExistingAiQuotaReservation = {
  /** 首次创建的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 当前额度预占生命周期状态。 */
  readonly status: 'reserved' | 'settled' | 'released' | 'pending_reconciliation'
  /** 首次锁定的正整数额度。 */
  readonly estimatedAmount: number
  /** 首次预占的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 首次锁定的不可变成本策略版本。 */
  readonly costPolicyVersion: string
  /** 首次预占的租约失效时间，UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** 一条已获领域批准的预占分摊及其不可变账本引用。 */
export type PersistedAiQuotaAllocationInput = {
  /** 已锁定额度批次的 BIGINT 内部主键文本。 */
  readonly grantInternalId: string
  /** 已锁定额度批次的乐观锁版本。 */
  readonly grantVersion: number
  /** 被分摊的额度批次公开引用。 */
  readonly grantRef: string
  /** 从该批次转入预占的正整数额度。 */
  readonly reservedAmount: number
  /** 本次 reserve 账本记录的高熵公开引用。 */
  readonly ledgerRef: string
}

/** 在同一事务持久化完整预占计划所需的内部输入。 */
export type ApplyAllocatedReservationInput = {
  /** 已在同一事务锁定的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 已在同一事务锁定的额度账户 BIGINT 内部主键文本。 */
  readonly accountInternalId: string
  /** 锁定额度账户时读到的乐观锁版本。 */
  readonly accountVersion: number
  /** 服务端生成的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 一次用户产品动作的稳定标识。 */
  readonly productActionId: string
  /** 已发布且不可变的成本策略版本。 */
  readonly costPolicyVersion: string
  /** 本次产品动作要求的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 领域计划已经证明可完整分摊的正整数额度。 */
  readonly estimatedAmount: number
  /** 产品动作幂等键；不得包含凭证或用户隐私。 */
  readonly idempotencyKey: string
  /** 规范化内部命令的 SHA-256。 */
  readonly requestHash: string
  /** 预占租约失效时间，UTC 毫秒；必须来自已冻结策略。 */
  readonly expiresAtMs: number
  /** 本次预占发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 总和严格等于 estimatedAmount 的完整分摊。 */
  readonly allocations: readonly PersistedAiQuotaAllocationInput[]
}

/** MySQL AI 额度预占 Repository 的首个事务切片端口。 */
export type MysqlAiQuotaReservationRepository<TTransaction extends TransactionExecutionContext> = {
  /** 锁定用户唯一额度账户，作为该用户全部预占命令的串行化闩锁。 */
  readonly lockAccount: (
    transaction: TTransaction,
    userRef: UserRef
  ) => Promise<LockedAiQuotaAccount>
  /** 在账户锁之后读取并裁决已有幂等预占；不存在时返回 null。 */
  readonly readExistingReservation: (
    transaction: TTransaction,
    input: ReadExistingAiQuotaReservationInput
  ) => Promise<ExistingAiQuotaReservation | null>
  /** 在账户锁之后按固定顺序锁定当前能力可消费的批次。 */
  readonly readEligibleGrants: (
    transaction: TTransaction,
    input: ReadEligibleAiQuotaGrantsInput
  ) => Promise<readonly LockedAiQuotaGrantCandidate[]>
  /** 把完整领域分摊原子应用到 reservation、grant、allocation、ledger 与账户投影。 */
  readonly applyAllocatedReservation: (
    transaction: TTransaction,
    input: ApplyAllocatedReservationInput
  ) => Promise<void>
}
