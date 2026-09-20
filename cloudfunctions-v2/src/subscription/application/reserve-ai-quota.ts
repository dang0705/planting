import type { UserGenerativeCapability, UserRef } from '../../contracts/types.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { planAiQuotaAllocation } from '../domain/plan-ai-quota-allocation.js'
import type {
  ApplyAllocatedReservationInput,
  ExistingAiQuotaReservation,
  MysqlAiQuotaReservationRepository
} from '../repository/mysql-ai-quota-reservation-repository.js'
import { AiQuotaReservationPersistenceError } from '../repository/mysql-ai-quota-reservation-repository.js'

/** 一次生成式 AI 产品动作发起额度预占的可信内部命令。 */
export type ReserveAiQuotaCommand = {
  /** 已由身份域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 一次用户产品动作的稳定标识。 */
  readonly productActionId: string
  /** 已发布且不可变的成本策略版本。 */
  readonly costPolicyVersion: string
  /** 本次产品动作实际需要的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 成本策略计算出的正整数最大预占额度。 */
  readonly estimatedAmount: number
  /** 当前产品动作作用域内的幂等键。 */
  readonly idempotencyKey: string
  /** 规范化内部命令的 SHA-256 摘要。 */
  readonly requestHash: string
  /** 预占租约失效时间，UTC 毫秒；必须来自已冻结策略。 */
  readonly expiresAtMs: number
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 首次成功预占后的稳定应用结果。 */
export type ReservedAiQuotaResult = {
  /** 判定类别；表示本事务首次创建了预占。 */
  readonly kind: 'reserved'
  /** 本次创建的高熵额度预占公开引用。 */
  readonly reservationRef: string
  /** 本次完整锁定的正整数额度。 */
  readonly estimatedAmount: number
  /** 本次预占对应的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 本次锁定的不可变成本策略版本。 */
  readonly costPolicyVersion: string
  /** 本次预占租约的失效时间，UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** 同键同摘要安全重放后的稳定应用结果。 */
export type ReplayedAiQuotaResult = ExistingAiQuotaReservation & {
  /** 判定类别；表示未产生任何新写入。 */
  readonly kind: 'replayed'
}

/** 可用额度不足时的无副作用应用结果。 */
export type InsufficientAiQuotaResult = {
  /** 判定类别；表示不得产生预占或账本写入。 */
  readonly kind: 'insufficient_quota'
  /** 本次产品动作要求锁定的额度。 */
  readonly estimatedAmount: number
  /** 所有当前有效且能力匹配批次的可用额度。 */
  readonly availableAmount: number
  /** 距离完整预占仍缺少的额度。 */
  readonly shortfallAmount: number
}

/** 额度预占用例的封闭结果。 */
export type ReserveAiQuotaResult =
  | ReservedAiQuotaResult
  | ReplayedAiQuotaResult
  | InsufficientAiQuotaResult

/** 额度预占用例使用的事务、Repository 与高熵引用生成端口。 */
export type ReserveAiQuotaDependencies<TTransaction extends TransactionExecutionContext> = {
  /** 管理唯一数据库事务生命周期。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 在调用方事务中执行额度账户、批次和账本持久化。 */
  readonly repository: MysqlAiQuotaReservationRepository<TTransaction>
  /** 生成一次额度预占的高熵公开引用。 */
  readonly createReservationRef: () => string
  /** 为一个已选额度批次生成不可变账本公开引用。 */
  readonly createLedgerRef: (grantRef: string) => string
}

/** 将领域计划重新绑定到已锁定批次的内部键与版本。 */
function buildPersistedAllocations(
  grants: Awaited<
    ReturnType<MysqlAiQuotaReservationRepository<TransactionExecutionContext>['readEligibleGrants']>
  >,
  allocations: readonly { readonly grantRef: string; readonly reservedAmount: number }[],
  createLedgerRef: (grantRef: string) => string
): ApplyAllocatedReservationInput['allocations'] {
  return allocations.map(allocation => {
    const lockedGrant = grants.find(grant => grant.grantRef === allocation.grantRef)
    if (lockedGrant === undefined) {
      throw new AiQuotaReservationPersistenceError(
        'INTERNAL_DATA_INVALID',
        '额度分摊无法绑定已锁定批次'
      )
    }
    return {
      grantInternalId: lockedGrant.grantInternalId,
      grantVersion: lockedGrant.grantVersion,
      grantRef: lockedGrant.grantRef,
      reservedAmount: allocation.reservedAmount,
      ledgerRef: createLedgerRef(lockedGrant.grantRef)
    }
  })
}

/**
 * 创建额度预占应用用例。
 *
 * 用例严格执行账户锁、幂等读回、批次锁、纯领域分摊和原子持久化顺序；余额不足只提交
 * 锁定读取，任何 Repository 写入失败都由共享事务执行器回滚。
 */
export function createReserveAiQuotaUseCase<TTransaction extends TransactionExecutionContext>(
  dependencies: ReserveAiQuotaDependencies<TTransaction>
): (command: ReserveAiQuotaCommand) => Promise<ReserveAiQuotaResult> {
  return command =>
    runDatabaseTransaction(dependencies.driver, async transaction => {
      const account = await dependencies.repository.lockAccount(transaction, command.userRef)
      const existingReservation = await dependencies.repository.readExistingReservation(
        transaction,
        {
          userInternalId: account.userInternalId,
          productActionId: command.productActionId,
          idempotencyKey: command.idempotencyKey,
          requestHash: command.requestHash
        }
      )
      if (existingReservation !== null) {
        return { kind: 'replayed', ...existingReservation }
      }

      const grants = await dependencies.repository.readEligibleGrants(transaction, {
        userInternalId: account.userInternalId,
        capability: command.capability,
        occurredAtMs: command.occurredAtMs
      })
      const plan = planAiQuotaAllocation({
        capability: command.capability,
        estimatedAmount: command.estimatedAmount,
        occurredAtMs: command.occurredAtMs,
        grants
      })
      if (plan.kind === 'insufficient_quota') {
        return {
          kind: plan.kind,
          estimatedAmount: plan.estimatedAmount,
          availableAmount: plan.availableAmount,
          shortfallAmount: plan.shortfallAmount
        }
      }

      const reservationRef = dependencies.createReservationRef()
      await dependencies.repository.applyAllocatedReservation(transaction, {
        userInternalId: account.userInternalId,
        accountInternalId: account.accountInternalId,
        accountVersion: account.accountVersion,
        reservationRef,
        productActionId: command.productActionId,
        costPolicyVersion: command.costPolicyVersion,
        capability: command.capability,
        estimatedAmount: command.estimatedAmount,
        idempotencyKey: command.idempotencyKey,
        requestHash: command.requestHash,
        expiresAtMs: command.expiresAtMs,
        occurredAtMs: command.occurredAtMs,
        allocations: buildPersistedAllocations(
          grants,
          plan.allocations,
          dependencies.createLedgerRef
        )
      })

      return {
        kind: 'reserved',
        reservationRef,
        estimatedAmount: command.estimatedAmount,
        capability: command.capability,
        costPolicyVersion: command.costPolicyVersion,
        expiresAtMs: command.expiresAtMs
      }
    })
}
