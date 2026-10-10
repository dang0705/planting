import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { LockedOwnedUserPlant } from './mysql-catalog-binding-repository.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 显式事务守卫：身份写入只能在调用方事务内执行。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('用户植物身份写入需要显式事务') }
  return transaction.connection
}

/** 读取已加锁植物当前确认的身份公开引用；未确认为 null。 */
export async function readCurrentConfirmedIdentityRef(transaction: Transaction, plant: LockedOwnedUserPlant): Promise<string | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT p.current_identity_status, i.public_identity_ref FROM user_plants p
      LEFT JOIN plant_identities i ON i.id = p.confirmed_identity_internal_id
      WHERE p.id = ? AND p.user_internal_id = ?`, [plant.plantInternalId, plant.userInternalId])
  if (rows.length !== 1) { throw new Error('用户植物身份读回不唯一') }
  const row = rows[0]!
  if (row.current_identity_status !== 'confirmed') { return null }
  if (typeof row.public_identity_ref !== 'string') { throw new Error('已确认植物缺少身份引用') }
  return row.public_identity_ref
}

/** 写入身份确认所需输入。 */
export interface ConfirmIdentityWriteInput {
  /** 已在事务内加锁且归属、生命周期、版本均已校验的植物。 */
  readonly plant: LockedOwnedUserPlant
  /** 目标规范身份公开引用（已在事务前通过发布准入）。 */
  readonly plantIdentityRef: string
  /** 服务端生成的高熵确认引用 idc_…，作为历史来源引用。 */
  readonly confirmationRef: string
  /** 调用方提交且已比对一致的版本。 */
  readonly expectedVersion: number
  /** 服务端当前 UTC 毫秒。 */
  readonly nowMs: number
}

/**
 * 同一事务：旧 confirmed 历史 → superseded；追加新 confirmed 历史；更新当前身份投影并版本 +1。
 * 返回 false 表示目标身份行已不可用（事务前判定之后被隔离），调用方据此返回 404 且整体不写。
 */
export async function writeIdentityConfirmation(transaction: Transaction, input: ConfirmIdentityWriteInput): Promise<boolean> {
  const connection = connectionOf(transaction)
  const identities = await connection.query(
    "SELECT CAST(id AS CHAR) AS identity_id FROM plant_identities WHERE BINARY public_identity_ref = BINARY ? AND review_status = 'ACTIVE' AND _openid = '' FOR SHARE",
    [input.plantIdentityRef])
  if (identities.length === 0) { return false }
  if (identities.length !== 1 || typeof identities[0]!.identity_id !== 'string') { throw new Error('规范身份读回不唯一') }
  const identityId = identities[0]!.identity_id
  await connection.execute(
    "UPDATE user_plant_identity_history SET history_status = 'superseded', updated_at_ms = ? WHERE user_internal_id = ? AND user_plant_internal_id = ? AND history_status = 'confirmed'",
    [input.nowMs, input.plant.userInternalId, input.plant.plantInternalId])
  const inserted = await connection.execute(
    `INSERT INTO user_plant_identity_history (user_internal_id, user_plant_internal_id, plant_identity_internal_id, history_status, source_type, source_ref, decided_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, 'confirmed', 'user', ?, ?, ?, ?)`,
    [input.plant.userInternalId, input.plant.plantInternalId, identityId, input.confirmationRef, input.nowMs, input.nowMs, input.nowMs])
  if (inserted.affectedRows !== 1) { throw new Error('身份历史写入未确定') }
  const updated = await connection.execute(
    `UPDATE user_plants SET current_identity_status = 'confirmed', confirmed_identity_internal_id = ?, version = version + 1, updated_at_ms = ?
      WHERE id = ? AND user_internal_id = ? AND version = ? AND lifecycle_status = 'active' AND _openid = ''`,
    [identityId, input.nowMs, input.plant.plantInternalId, input.plant.userInternalId, input.expectedVersion])
  if (updated.affectedRows !== 1) { throw new Error('用户植物身份投影更新未确定') }
  return true
}
