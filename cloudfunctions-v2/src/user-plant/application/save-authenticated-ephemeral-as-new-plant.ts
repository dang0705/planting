import { DatabaseCommitResultUnknownError, runDatabaseTransaction, type DatabaseTransactionDriver, type TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { lockAuthenticatedEphemeralNewPlantInput, type AuthenticatedEphemeralNewPlantInput, type AuthenticatedEphemeralNewPlantResult } from '../repository/mysql-authenticated-ephemeral-new-plant-repository.js'

/** 同事务新建与未知提交只读核对的窄依赖，不重建创建领域规则。 */
export interface AuthenticatedEphemeralNewPlantApplicationDependencies<T extends TransactionExecutionContext> {
  /** 唯一事务生命周期驱动，内部失败必须整体回滚。 */ readonly driver: DatabaseTransactionDriver<T>
  /** 复用聚合Repository及绑定三表的真实事务端口。 */ readonly repository: {
    /** 不自行提交的新建保存操作。 */ saveNew(tx: T, input: AuthenticatedEphemeralNewPlantInput): Promise<AuthenticatedEphemeralNewPlantResult>
  }
  /** 新连接只读原结果，没有写入重试方法。 */ readonly commitUnknownReader: {
    /** 缺完整原收据返回null，不猜实际提交状态。 */ readCompleted(input: AuthenticatedEphemeralNewPlantInput): Promise<AuthenticatedEphemeralNewPlantResult | null>
  }
}
/** 存储不可用触发事务回滚，避免提交半植物或半绑定。 */
class NewPlantStorageUnavailableError extends Error {}
/** 严格准入内部结果；历史目标可能不同于本次候选但必须有效。 */
function result(value: AuthenticatedEphemeralNewPlantResult, input: AuthenticatedEphemeralNewPlantInput): AuthenticatedEphemeralNewPlantResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { throw new Error('新建保存结果不合法') }
  if (value.status === 'bound') {
    if (Object.keys(value).length !== 4 || Object.keys(value).some(k => !['status', 'promotionRef', 'userPlantRef', 'boundAtMs'].includes(k))
      || typeof value.promotionRef !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/u.test(value.promotionRef)
      || typeof value.userPlantRef !== 'string' || value.userPlantRef.length > 64 || !/^upl_[A-Za-z0-9_-]{8,}$/u.test(value.userPlantRef)
      || !Number.isSafeInteger(value.boundAtMs) || value.boundAtMs < 0 || value.boundAtMs > input.occurredAtMs) { throw new Error('新建保存成功收据不合法') }
  } else if (Object.keys(value).length !== 1 || !['not_found', 'expired', 'already_bound', 'idempotency_conflict', 'unavailable', 'principal_invalid', 'capability_denied', 'capability_snapshot_expired'].includes(value.status)) { throw new Error('新建保存拒绝结果不合法') }
  return Object.freeze({ ...value })
}
/** 显式新建的应用事务；提交未知只有只读核对，绝不重新创建。 */
export function createAuthenticatedEphemeralNewPlantApplicationService<T extends TransactionExecutionContext>(d: AuthenticatedEphemeralNewPlantApplicationDependencies<T>) {
  return async (raw: AuthenticatedEphemeralNewPlantInput): Promise<AuthenticatedEphemeralNewPlantResult> => {
    const input = lockAuthenticatedEphemeralNewPlantInput(raw)
    try {
      return await runDatabaseTransaction(d.driver, async tx => {
        const saved = result(await d.repository.saveNew(tx, input), input)
        if (saved.status === 'unavailable') { throw new NewPlantStorageUnavailableError('新建保存存储不可用') }
        return saved
      })
    } catch (cause) {
      if (cause instanceof NewPlantStorageUnavailableError) { return { status: 'unavailable' } }
      if (!(cause instanceof DatabaseCommitResultUnknownError)) { throw cause }
      try {
        const receipt = await d.commitUnknownReader.readCompleted(input)
        if (receipt === null) { return { status: 'unavailable' } }
        const checked = result(receipt, input)
        return checked.status === 'bound' || checked.status === 'idempotency_conflict' ? checked : { status: 'unavailable' }
      } catch { return { status: 'unavailable' } }
    }
  }
}
