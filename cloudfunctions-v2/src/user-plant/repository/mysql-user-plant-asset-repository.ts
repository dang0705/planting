import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { LockedOwnedUserPlant } from './mysql-catalog-binding-repository.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 登记封面的持久化输入（文件已在事务前完成下载复核）。 */
export interface RegisterCoverInput {
  /** 已在事务内加锁并校验归属的植物。 */ readonly plant: LockedOwnedUserPlant
  /** 服务端生成的高熵资产公开引用 ast_…。 */ readonly assetRef: string
  /** CloudBase 私有 fileID（只落库，不公开）。 */ readonly fileId: string
  /** 已复核的文件内容 SHA-256。 */ readonly contentSha256: string
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
  /** 被换下的旧封面允许清理的 UTC 毫秒（现在 + 7 天）。 */ readonly cleanupAfterMs: number
}

/** 登记结果：新建、已是当前封面（不变）、文件已被别处登记。 */
export type RegisterCoverResult =
  | {
    /** 新建或已是当前封面。 */ readonly kind: 'registered' | 'already_active'
    /** 当前有效封面的公开引用。 */ readonly assetRef: string
    /** 当前有效封面的登记 UTC 毫秒。 */ readonly createdAtMs: number
  }
  | {
    /** 文件已登记给其他植物或用户。 */ readonly kind: 'file_taken'
  }

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('封面登记需要显式事务') }
  return transaction.connection
}

/**
 * 登记封面（user-plant-cover-asset/v1 §1/§3）：同一事务内锁定该文件既有登记 → 已是本植物当前封面则不变 →
 * 已登记给别处则拒绝 → 否则把本植物旧的 active 封面转 pending_cleanup（写清理时间）并插入新 active。植物行锁保证每株至多一张 active。
 */
export async function registerCover(transaction: Transaction, input: RegisterCoverInput): Promise<RegisterCoverResult> {
  const connection = connectionOf(transaction)
  const existing = await connection.query(
    `SELECT asset_ref, CAST(user_internal_id AS CHAR) AS user_id, CAST(user_plant_internal_id AS CHAR) AS plant_id, status, CAST(created_at_ms AS CHAR) AS created_at_ms
      FROM user_plant_assets WHERE BINARY storage_file_id = BINARY ? FOR UPDATE`, [input.fileId])
  if (existing.length > 0) {
    const row = existing[0]!
    if (row.user_id === input.plant.userInternalId && row.plant_id === input.plant.plantInternalId && row.status === 'active') {
      return { kind: 'already_active', assetRef: String(row.asset_ref), createdAtMs: Number(row.created_at_ms) }
    }
    return { kind: 'file_taken' }
  }
  await connection.execute(
    `UPDATE user_plant_assets SET status = 'pending_cleanup', cleanup_after_ms = ?, updated_at_ms = ?
      WHERE user_internal_id = ? AND user_plant_internal_id = ? AND asset_purpose = 'profile' AND status = 'active'`,
    [input.cleanupAfterMs, input.nowMs, input.plant.userInternalId, input.plant.plantInternalId])
  const inserted = await connection.execute(
    `INSERT INTO user_plant_assets (asset_ref, user_internal_id, user_plant_internal_id, storage_file_id, asset_purpose, status, content_hash, cleanup_after_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, 'profile', 'active', ?, NULL, ?, ?)`,
    [input.assetRef, input.plant.userInternalId, input.plant.plantInternalId, input.fileId, input.contentSha256, input.nowMs, input.nowMs])
  if (inserted.affectedRows !== 1) { throw new Error('封面登记写入未确定') }
  const active = await connection.query(
    "SELECT COUNT(*) AS n FROM user_plant_assets WHERE user_internal_id = ? AND user_plant_internal_id = ? AND asset_purpose = 'profile' AND status = 'active'",
    [input.plant.userInternalId, input.plant.plantInternalId])
  if (Number(active[0]?.n) !== 1) { throw new Error('有效封面数量不唯一') }
  return { kind: 'registered', assetRef: input.assetRef, createdAtMs: input.nowMs }
}

/** 本人可见植物的当前有效封面（私有 fileID 只给服务端换链接用，绝不公开）。 */
export interface ActiveCover {
  /** 当前有效封面的公开引用 ast_…。 */ readonly assetRef: string
  /** CloudBase 私有 fileID。 */ readonly fileId: string
}

/** 只读读取当前有效封面；植物不可见或无封面返回 null。 */
export function createMysqlActiveCoverReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return (userRef: string, userPlantRef: string): Promise<ActiveCover | null> => withReadConnection(source, async connection => {
    const rows = await connection.query(
      `SELECT a.asset_ref, a.storage_file_id FROM user_plant_assets a
        JOIN user_plants p ON p.id = a.user_plant_internal_id AND p.user_internal_id = a.user_internal_id
        JOIN users u ON u.id = p.user_internal_id
        WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')
          AND a.asset_purpose = 'profile' AND a.status = 'active' AND a._openid = ''`, [userRef, userPlantRef])
    if (rows.length === 0) { return null }
    if (rows.length !== 1 || typeof rows[0]!.asset_ref !== 'string' || typeof rows[0]!.storage_file_id !== 'string') { throw new Error('有效封面读回不唯一') }
    return { assetRef: rows[0]!.asset_ref, fileId: rows[0]!.storage_file_id }
  })
}
