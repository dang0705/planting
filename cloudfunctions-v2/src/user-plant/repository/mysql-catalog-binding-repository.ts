import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 事务内加锁读到的本人用户植物；内部主键只用于同事务外键写入，不得公开。 */
export interface LockedOwnedUserPlant {
  /** 所属统一用户内部主键十进制文本。 */
  readonly userInternalId: string
  /** 用户植物内部主键十进制文本。 */
  readonly plantInternalId: string
  /** 生命周期；删除中/已删除不返回。 */
  readonly lifecycle: 'active' | 'archived'
  /** 植物创建 UTC 毫秒。 */
  readonly createdAtMs: number
  /** 用户植物版本号。 */
  readonly plantVersion: number
  /** 档案版本号；无档案为 null。 */
  readonly profileVersion: number | null
}

/** 追加品种绑定输入。 */
export interface AppendCatalogBindingInput {
  /** 已在事务内加锁且归属校验通过的用户植物。 */
  readonly plant: LockedOwnedUserPlant
  /** 服务端高熵绑定引用（cbd_）。 */
  readonly bindingRef: string
  /** 已确认存在于 Tropicals 目录的引用。 */
  readonly catalogTaxonRef: string
  /** 绑定生效 UTC 毫秒（服务端时钟）。 */
  readonly boundAtMs: number
}

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('用户植物写入需要显式事务') }
  return transaction.connection
}

/** 按 user_id + 公开引用 FOR UPDATE 锁植物行（连同档案版本）；用于 user-plant 与 care 的长期写用例。 */
export async function lockOwnedUserPlant(transaction: Transaction, userRef: string, userPlantRef: string): Promise<LockedOwnedUserPlant | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT CAST(p.user_internal_id AS CHAR) AS user_internal_id, CAST(p.id AS CHAR) AS plant_internal_id, p.lifecycle_status,
        CAST(p.created_at_ms AS CHAR) AS created_at_ms, p.version AS plant_version, f.version AS profile_version
      FROM user_plants p
      JOIN users u ON u.id = p.user_internal_id AND u.status = 'active'
      LEFT JOIN user_plant_profiles f ON f.user_plant_internal_id = p.id AND f.user_internal_id = p.user_internal_id
      WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')
      FOR UPDATE`,
    [userRef, userPlantRef]
  )
  if (rows.length === 0) { return null }
  const row = rows[0]!
  const created = Number(row.created_at_ms)
  const plantVersion = Number(row.plant_version)
  const profileVersion = row.profile_version === null || row.profile_version === undefined ? null : Number(row.profile_version)
  if (rows.length !== 1 || typeof row.user_internal_id !== 'string' || typeof row.plant_internal_id !== 'string'
    || (row.lifecycle_status !== 'active' && row.lifecycle_status !== 'archived') || !Number.isSafeInteger(created)
    || !Number.isSafeInteger(plantVersion) || (profileVersion !== null && !Number.isSafeInteger(profileVersion))) {
    throw new Error('用户植物锁定读回不合法')
  }
  return { userInternalId: row.user_internal_id, plantInternalId: row.plant_internal_id, lifecycle: row.lifecycle_status,
    createdAtMs: created, plantVersion, profileVersion }
}

/** 事务内最新品种绑定引用（与只读上下文对照，T6）；无绑定为 null。 */
export async function readLatestBindingRef(transaction: Transaction, plant: LockedOwnedUserPlant): Promise<string | null> {
  const rows = await connectionOf(transaction).query(
    `SELECT binding_ref FROM user_plant_catalog_bindings WHERE user_internal_id = ? AND user_plant_internal_id = ?
      ORDER BY bound_at_ms DESC, id DESC LIMIT 1`, [plant.userInternalId, plant.plantInternalId])
  return rows.length === 0 ? null : String(rows[0]!.binding_ref)
}

/** 只追加一行品种绑定（026）；影响行数不为 1 视为未确定。 */
export async function appendCatalogBinding(transaction: Transaction, input: AppendCatalogBindingInput): Promise<void> {
  const written = await connectionOf(transaction).execute(
    `INSERT INTO user_plant_catalog_bindings (binding_ref, user_internal_id, user_plant_internal_id, catalog_taxon_ref, bound_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [input.bindingRef, input.plant.userInternalId, input.plant.plantInternalId, input.catalogTaxonRef, input.boundAtMs, input.boundAtMs, input.boundAtMs]
  )
  if (written.affectedRows !== 1) { throw new Error('品种绑定写入未确定') }
}
