import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver
} from '../../foundation/database/transaction-runner.js'
import {
  planRewardEventApplication,
  type CareLevelPolicyEntry
} from '../domain/plan-reward-event-application.js'
import type {
  MysqlRewardInboxRepository,
  ReserveRewardInboxInput
} from '../repository/mysql-reward-inbox-repository.js'
import { RewardInboxPersistenceError } from '../repository/mysql-reward-inbox-repository.js'
import type {
  CarePointSourceType,
  MysqlRewardPointsRepository,
  PersistedLevelRewardInput
} from '../repository/mysql-reward-points-repository.js'

/** 一次已完成签名、Schema 与不可变策略解析的积分奖励命令。 */
export type ApplyRewardPointsEventCommand = {
  /** 由生产域至少一次投递的完整奖励事件及首次策略快照。 */
  readonly inbox: ReserveRewardInboxInput
  /** subscription 根据事件发生时间解析出的正整数积分。 */
  readonly pointsAmount: number
  /** 同一奖励策略发布中冻结的养护等级阈值和 AI 奖励。 */
  readonly levelPolicy: readonly CareLevelPolicyEntry[]
  /** 本次新等级 AI grant 的绝对到期时间，UTC 毫秒。 */
  readonly levelRewardExpiresAtMs: number
  /** 当前应用事务的服务端可信时间，UTC 毫秒。 */
  readonly appliedAtMs: number
}

/** 首次完整应用积分奖励后的结果。 */
export type AppliedRewardPointsEventResult = {
  /** 固定为本事务首次完整应用。 */
  readonly kind: 'applied'
  /** 本次积分账本的公开引用。 */
  readonly resultRef: string
  /** 本次实际发放的积分。 */
  readonly pointsAmount: number
  /** 应用后的可用积分。 */
  readonly nextAvailablePoints: number
  /** 应用后的累计净获得积分。 */
  readonly nextLifetimeNetEarned: number
  /** 应用后的最高养护等级。 */
  readonly nextLevelCode: string
  /** 本次首次发放 AI 奖励的等级代码。 */
  readonly awardedLevels: readonly string[]
}

/** 已经应用的奖励事件安全重放结果。 */
export type ReplayedRewardPointsEventResult = {
  /** 固定为没有产生新写入的安全重放。 */
  readonly kind: 'replayed'
  /** 既有奖励事件处理状态，当前积分路径只允许 applied。 */
  readonly status: 'applied'
  /** 既有积分账本公开引用。 */
  readonly resultRef: string
}

/** 积分奖励事件应用用例的封闭结果。 */
export type ApplyRewardPointsEventResult =
  | AppliedRewardPointsEventResult
  | ReplayedRewardPointsEventResult

/** 积分奖励用例使用的事务、Repository 与高熵引用生成端口。 */
export type ApplyRewardPointsEventDependencies<TTransaction extends TransactionExecutionContext> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 原子预留、重放并终结 subscription 奖励 inbox。 */
  readonly inboxRepository: MysqlRewardInboxRepository<TTransaction>
  /** 锁定账户并持久化积分、等级与 AI 奖励。 */
  readonly pointsRepository: MysqlRewardPointsRepository<TTransaction>
  /** 生成本次积分账本的高熵公开引用。 */
  readonly createPointLedgerRef: () => string
  /** 按等级生成终身一次等级奖励公开引用。 */
  readonly createLevelGrantRef: (levelCode: string) => string
  /** 按等级生成 AI 额度批次公开引用。 */
  readonly createAiGrantRef: (levelCode: string) => string
  /** 按等级生成 AI 额度 grant 账本公开引用。 */
  readonly createAiLedgerRef: (levelCode: string) => string
}

const pointSourceByEventType = {
  'user_plant.profile_completed.v1': 'FIRST_PROFILE',
  'care.soil_check_completed.v1': 'DUE_SOIL_CHECK',
  'care.fertilizing_check_completed.v1': 'DUE_FERTILIZER_CHECK',
  'diagnosis.fixed_package_completed.v1': 'FIXED_DIAGNOSIS'
} as const satisfies Record<string, CarePointSourceType>

/** 解析积分事件的稳定账本来源，拒绝 CMS 直接奖励等非积分事件。 */
function resolvePointSource(input: ReserveRewardInboxInput): CarePointSourceType {
  const source = pointSourceByEventType[input.eventType as keyof typeof pointSourceByEventType]
  if (source === undefined) {
    throw new RewardInboxPersistenceError('INTERNAL_DATA_INVALID', '奖励事件不属于积分路径')
  }
  return source
}

/** 把领域规划的等级奖励绑定到本事务生成的公开引用。 */
function buildPersistedLevelRewards<TTransaction extends TransactionExecutionContext>(
  dependencies: ApplyRewardPointsEventDependencies<TTransaction>,
  levelRewards: readonly { readonly levelCode: string; readonly aiReward: number }[],
  expiresAtMs: number
): readonly PersistedLevelRewardInput[] {
  return levelRewards.map(reward => ({
    levelCode: reward.levelCode,
    amount: reward.aiReward,
    levelGrantRef: dependencies.createLevelGrantRef(reward.levelCode),
    aiGrantRef: dependencies.createAiGrantRef(reward.levelCode),
    aiLedgerRef: dependencies.createAiLedgerRef(reward.levelCode),
    expiresAtMs
  }))
}

/**
 * 创建奖励积分事件应用用例。
 *
 * inbox、积分账本、账户投影、等级 AI grant 和 inbox 终态必须共享一个数据库事务；
 * 已应用事件只返回既有结果，绝不再次生成账本或奖励引用。
 */
export function createApplyRewardPointsEventUseCase<
  TTransaction extends TransactionExecutionContext
>(
  dependencies: ApplyRewardPointsEventDependencies<TTransaction>
): (command: ApplyRewardPointsEventCommand) => Promise<ApplyRewardPointsEventResult> {
  return command =>
    runDatabaseTransaction(dependencies.driver, async transaction => {
      const sourceType = resolvePointSource(command.inbox)
      const inboxResult = await dependencies.inboxRepository.reserve(transaction, command.inbox)
      if (inboxResult.kind !== 'reserved') {
        if (
          inboxResult.status !== 'applied' ||
          inboxResult.resultRef === null ||
          !/^cpl_[A-Za-z0-9_-]{8,}$/u.test(inboxResult.resultRef)
        ) {
          throw new RewardInboxPersistenceError(
            'INTERNAL_DATA_INVALID',
            '既有积分奖励事件未处于可重放终态'
          )
        }
        return {
          kind: 'replayed',
          status: 'applied',
          resultRef: inboxResult.resultRef
        }
      }

      const state = await dependencies.pointsRepository.lockState(
        transaction,
        command.inbox.userRef
      )
      const plan = planRewardEventApplication({
        pointsAmount: command.pointsAmount,
        availablePoints: state.availablePoints,
        lifetimeNetEarned: state.lifetimeNetEarned,
        currentLevelCode: state.currentLevelCode,
        previouslyGrantedLevelCodes: state.previouslyGrantedLevelCodes,
        levelPolicy: command.levelPolicy
      })
      const pointLedgerRef = dependencies.createPointLedgerRef()
      const levelRewards = buildPersistedLevelRewards(
        dependencies,
        plan.newLevelRewards,
        command.levelRewardExpiresAtMs
      )
      await dependencies.pointsRepository.apply(transaction, {
        userInternalId: state.userInternalId,
        pointAccountInternalId: state.pointAccountInternalId,
        pointAccountVersion: state.pointAccountVersion,
        aiAccountInternalId: state.aiAccountInternalId,
        aiAccountVersion: state.aiAccountVersion,
        pointLedgerRef,
        sourceType,
        sourceRef: command.inbox.occurrenceRef,
        businessUniqueKey: command.inbox.businessUniqueKey,
        pointsAmount: plan.pointsAmount,
        currentAvailablePoints: state.availablePoints,
        currentLifetimeNetEarned: state.lifetimeNetEarned,
        nextAvailablePoints: plan.nextAvailablePoints,
        nextLifetimeNetEarned: plan.nextLifetimeNetEarned,
        nextLevelCode: plan.nextLevelCode,
        policyVersion: command.inbox.rewardPolicyVersion,
        occurredAtMs: command.inbox.occurredAtMs,
        levelRewards
      })
      await dependencies.inboxRepository.markApplied(
        transaction,
        inboxResult.inboxInternalId,
        pointLedgerRef,
        command.appliedAtMs
      )
      return {
        kind: 'applied',
        resultRef: pointLedgerRef,
        pointsAmount: plan.pointsAmount,
        nextAvailablePoints: plan.nextAvailablePoints,
        nextLifetimeNetEarned: plan.nextLifetimeNetEarned,
        nextLevelCode: plan.nextLevelCode,
        awardedLevels: levelRewards.map(reward => reward.levelCode)
      }
    })
}
