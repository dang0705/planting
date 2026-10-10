import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { LockedOwnedUserPlant } from './mysql-catalog-binding-repository.js'

/** 标记删除输入：植物已在同一事务内按 user_id + 公开引用加锁并通过版本比对。 */
export interface MarkUserPlantDeletingInput {
  /** 已加锁的本人植物（含内部主键，只在本事务内使用，不得公开）。 */
  readonly plant: LockedOwnedUserPlant
  /** 调用方提交且已与锁定版本比对一致的版本。 */
  readonly expectedVersion: number
  /** 标记删除的服务端 UTC 毫秒。 */
  readonly deletedAtMs: number
}

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/**
 * 把 active/archived 植物标记为 deleting 并递增版本（user-plant.md「删除公开接口」）。
 * 条件写同时限定 owner、内部主键、原生命周期与版本，影响行数不为 1 视为未确定并抛错，由外层事务整体回滚。
 * 本期不删除档案、资产、养护、诊断或认领记录，也不推进到 deleted（清理清单另行冻结）。
 */
export async function markUserPlantDeleting(transaction: Transaction, input: MarkUserPlantDeletingInput): Promise<void> {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('用户植物删除需要显式事务') }
  const written = await transaction.connection.execute(
    `UPDATE user_plants SET lifecycle_status = 'deleting', version = version + 1, updated_at_ms = ?
      WHERE id = ? AND user_internal_id = ? AND version = ? AND lifecycle_status IN ('active', 'archived') AND _openid = ''`,
    [input.deletedAtMs, input.plant.plantInternalId, input.plant.userInternalId, input.expectedVersion]
  )
  if (written.affectedRows !== 1) { throw new Error('用户植物标记删除未确定') }
}
