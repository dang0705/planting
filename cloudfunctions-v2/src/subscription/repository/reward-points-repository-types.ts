import type { UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'

/** 积分奖励账本允许的稳定来源枚举。 */
export type CarePointSourceType =
  | 'FIRST_PROFILE'
  | 'DUE_SOIL_CHECK'
  | 'DUE_FERTILIZER_CHECK'
  | 'FIXED_DIAGNOSIS'

/** 积分账户与 AI 账户联合锁读回行。 */
export type RewardPointsAccountSqlRow = {
  /** 固定的联合账户行判别值。 */
  readonly kind: 'account'
  /** 统一用户 BIGINT 内部主键文本。 */
  readonly user_internal_id: string
  /** 统一用户当前状态。 */
  readonly user_status: string
  /** 积分账户 BIGINT 内部主键文本。 */
  readonly point_account_internal_id: string
  /** 当前可用积分的十进制文本。 */
  readonly available_points: string
  /** 累计净获得积分的十进制文本。 */
  readonly lifetime_net_earned: string
  /** 当前养护等级代码。 */
  readonly level_code: string
  /** 积分账户乐观并发版本文本。 */
  readonly point_account_version: string
  /** AI 额度账户 BIGINT 内部主键文本。 */
  readonly ai_account_internal_id: string
  /** AI 额度账户当前可用额度文本。 */
  readonly ai_available_amount: string
  /** AI 额度账户当前预占额度文本。 */
  readonly ai_reserved_amount: string
  /** AI 额度账户历史已消费额度文本。 */
  readonly ai_consumed_amount: string
  /** AI 额度账户乐观并发版本文本。 */
  readonly ai_account_version: string
}

/** 已经终身发放的养护等级行。 */
export type RewardPointsLevelSqlRow = {
  /** 固定的等级发放行判别值。 */
  readonly kind: 'level'
  /** 已经发放过 AI 奖励的等级代码。 */
  readonly level_code: string
}

/** 奖励积分 Repository 查询可能返回的封闭行。 */
export type RewardPointsSqlRow = RewardPointsAccountSqlRow | RewardPointsLevelSqlRow

/** 参数化 SQL 写入结果。 */
export type RewardPointsSqlWriteResult = {
  /** SQL 实际影响行数。 */
  readonly affectedRows: number
}

/** 奖励积分 Repository 使用的参数化 SQL 端口。 */
export type RewardPointsSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务内执行锁定查询。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly RewardPointsSqlRow[]>
  /** 在调用方事务内执行参数化写入。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<RewardPointsSqlWriteResult>
}

/** 已锁定的积分、等级与 AI 额度账户快照。 */
export type LockedRewardPointsState = {
  /** 统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 积分账户 BIGINT 内部主键文本。 */
  readonly pointAccountInternalId: string
  /** 积分账户乐观并发版本。 */
  readonly pointAccountVersion: number
  /** 积分账户当前可以使用的积分余额。 */
  readonly availablePoints: number
  /** 当前累计净获得积分。 */
  readonly lifetimeNetEarned: number
  /** 当前养护等级代码。 */
  readonly currentLevelCode: string
  /** AI 额度账户 BIGINT 内部主键文本。 */
  readonly aiAccountInternalId: string
  /** AI 额度账户乐观并发版本。 */
  readonly aiAccountVersion: number
  /** AI 额度账户当前可用额度。 */
  readonly aiAvailableAmount: number
  /** 已经终身发放过奖励的等级代码。 */
  readonly previouslyGrantedLevelCodes: readonly string[]
}

/** 一项待原子发放的等级 AI 奖励。 */
export type PersistedLevelRewardInput = {
  /** 首次达到的等级代码。 */
  readonly levelCode: string
  /** 本级发放的正整数 AI 额度。 */
  readonly amount: number
  /** 等级奖励记录的高熵公开引用。 */
  readonly levelGrantRef: string
  /** AI 额度批次的高熵公开引用。 */
  readonly aiGrantRef: string
  /** AI 额度 grant 账本的高熵公开引用。 */
  readonly aiLedgerRef: string
  /** 本批等级奖励的绝对到期时间，UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** 将一次积分奖励及跨级 AI 奖励持久化的可信内部输入。 */
export type ApplyRewardPointsInput = {
  /** 统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 已锁定积分账户 BIGINT 内部主键文本。 */
  readonly pointAccountInternalId: string
  /** 已锁定积分账户乐观并发版本。 */
  readonly pointAccountVersion: number
  /** 已锁定 AI 额度账户 BIGINT 内部主键文本。 */
  readonly aiAccountInternalId: string
  /** 已锁定 AI 额度账户乐观并发版本。 */
  readonly aiAccountVersion: number
  /** 本次积分 grant 账本的高熵公开引用。 */
  readonly pointLedgerRef: string
  /** 合同冻结的积分来源代码。 */
  readonly sourceType: CarePointSourceType
  /** 产生积分事实的稳定业务引用。 */
  readonly sourceRef: string
  /** 跨事件重放唯一的奖励业务键。 */
  readonly businessUniqueKey: string
  /** 服务端奖励策略解析出的正整数积分。 */
  readonly pointsAmount: number
  /** 锁定时的可用积分。 */
  readonly currentAvailablePoints: number
  /** 锁定时的累计净获得积分。 */
  readonly currentLifetimeNetEarned: number
  /** 应用领域计划后的可用积分。 */
  readonly nextAvailablePoints: number
  /** 应用领域计划后的累计净获得积分。 */
  readonly nextLifetimeNetEarned: number
  /** 应用领域计划后的最高养护等级。 */
  readonly nextLevelCode: string
  /** 首次收件时锁定的不可变奖励策略版本。 */
  readonly policyVersion: string
  /** 业务事实发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 本次跨越且尚未发放过的等级 AI 奖励。 */
  readonly levelRewards: readonly PersistedLevelRewardInput[]
}

/** 奖励积分持久化错误的稳定内部类别。 */
export type RewardPointsPersistenceErrorType =
  | 'INTERNAL_DATA_INVALID'
  | 'PRINCIPAL_INVALID'
  | 'WRITE_CONFLICT'

/** 奖励积分 Repository 的内部错误，不得直接进入公开响应。 */
export class RewardPointsPersistenceError extends Error {
  /** 稳定内部错误类别。 */
  readonly type: RewardPointsPersistenceErrorType

  constructor(type: RewardPointsPersistenceErrorType, message: string) {
    super(message)
    this.name = '奖励积分持久化错误'
    this.type = type
  }
}

/** 奖励积分 MySQL Repository 端口。 */
export type MysqlRewardPointsRepository<TTransaction extends TransactionExecutionContext> = {
  /** 锁定统一用户的积分、AI 账户和已发等级快照。 */
  readonly lockState: (
    transaction: TTransaction,
    userRef: UserRef
  ) => Promise<LockedRewardPointsState>
  /** 在同一事务中追加积分与等级奖励事实并更新投影。 */
  readonly apply: (transaction: TTransaction, input: ApplyRewardPointsInput) => Promise<void>
}
