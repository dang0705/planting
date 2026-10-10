import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { serializeCanonicalJson, type CanonicalJsonValue } from '../../foundation/json/canonical-json-sha256.js'
import { CARE_CONTEXT_GROUP_KEYS, lockStoredEnvironmentGroup, type EnvironmentGroups } from '../domain/environment-profile.js'

type Transaction = MysqlTransactionContext<Mysql2QueryConnection>
/** 存于 `user_plant_care_contexts` 的三个分组。 */
export type CareContextGroupKey = (typeof CARE_CONTEXT_GROUP_KEYS)[number]
/** 三个分组的修改：省略保留、null 清除、对象替换。 */
export type CareContextGroupPatch = { readonly [TKey in CareContextGroupKey]?: EnvironmentGroups[TKey] | null }
/** 保存后的最终状态：未设置的分组省略。 */
export type CareContextGroups = { readonly [TKey in CareContextGroupKey]?: EnvironmentGroups[TKey] }

/** 归属键：已验真统一用户与路径中的植物公开引用。 */
export interface EnvironmentOwnerInput {
  /** identity 解析出的统一用户公开引用。 */ readonly userRef: string
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
}
/** 保存位置/光照/通风的输入。 */
export interface SaveCareContextInput extends EnvironmentOwnerInput {
  /** 本次修改（省略保留、null 清除）。 */ readonly patch: CareContextGroupPatch
  /** 服务端当前 UTC 毫秒。 */ readonly occurredAtMs: number
}
/** 完整度判定证据。 */
export interface CompletenessEvidence {
  /** 用户植物当前身份状态原值。 */ readonly identityStatus: string
  /** 本株首次完整时间；未完成为 null。 */ readonly profileCompletedAtMs: number | null
  /** 同一用户是否已有其他植物完成过档案（含归档、删除中）。 */ readonly userPreviouslyCompletedProfile: boolean
}
/** 写入首次完成时间的输入。 */
export interface MarkProfileCompletedInput extends EnvironmentOwnerInput {
  /** 首次完整时刻（服务端 UTC 毫秒）。 */ readonly completedAtMs: number
  /** 判定时锁定的完整度策略版本。 */ readonly profileVersion: string
}

/** 按分组映射的列名（DDL 003）。 */
const column = { location: 'location_json', lighting: 'light_environment_json', ventilation: 'ventilation_environment_json' } as const
/** 本合同不采集栽培方式，列为 NOT NULL，固定占位且不公开（user-plant-environment-profile/v1 §2）。 */
const cultivationPlaceholder = 'unspecified'

/** 显式事务守卫。 */
function connectionOf(transaction: Transaction): Mysql2QueryConnection {
  if (transaction.transactionContext !== true || !transaction.connection) { throw new TypeError('环境档案写入需要显式事务') }
  return transaction.connection
}
/** 读取同事务中已加锁植物的内部归属键；只在本 Repository 内使用。 */
async function ownerKeys(connection: Mysql2QueryConnection, userRef: string, userPlantRef: string): Promise<{ userId: string; plantId: string }> {
  const rows = await connection.query(
    `SELECT CAST(u.id AS CHAR) AS user_id, CAST(p.id AS CHAR) AS plant_id FROM users u JOIN user_plants p ON p.user_internal_id = u.id
      WHERE BINARY u.public_user_id = BINARY ? AND BINARY p.public_user_plant_id = BINARY ? AND p.lifecycle_status IN ('active', 'archived')`,
    [userRef, userPlantRef])
  if (rows.length !== 1 || typeof rows[0]!.user_id !== 'string' || typeof rows[0]!.plant_id !== 'string') { throw new Error('环境档案归属读回不唯一') }
  return { userId: rows[0]!.user_id, plantId: rows[0]!.plant_id }
}
/** 分组值转库内 JSON 文本；未设置/清除写 JSON null。 */
const toJson = (value: unknown) => (value === undefined || value === null ? 'null' : serializeCanonicalJson(value as CanonicalJsonValue))

/**
 * 环境档案与完整度证据的唯一 SQL 入口（user-plant-environment-profile/v1）。
 * 只能在档案保存同一事务、且植物与用户行已由档案 Repository 加锁之后调用。
 */
export function createMysqlUserPlantEnvironmentRepository() {
  return {
    /** 锁定并按修改写入位置/光照/通风；无修改时只读。返回保存后的最终状态并经读回核对。 */
    async saveCareContext(transaction: Transaction, input: SaveCareContextInput): Promise<CareContextGroups> {
      const connection = connectionOf(transaction)
      const { userId, plantId } = await ownerKeys(connection, input.userRef, input.userPlantRef)
      const rows = await connection.query(
        `SELECT location_json, light_environment_json, ventilation_environment_json, _openid FROM user_plant_care_contexts
          WHERE user_internal_id = ? AND user_plant_internal_id = ? FOR UPDATE`, [userId, plantId])
      if (rows.length > 1 || (rows.length === 1 && rows[0]!._openid !== '')) { throw new Error('养护环境记录不唯一或技术字段非法') }
      const current: Record<string, unknown> = {}
      for (const key of CARE_CONTEXT_GROUP_KEYS) {
        const stored = rows.length === 1 ? lockStoredEnvironmentGroup(key, rows[0]![column[key]]) : undefined
        if (stored !== undefined) { current[key] = stored }
      }
      const changedKeys = CARE_CONTEXT_GROUP_KEYS.filter(key => key in input.patch)
      if (changedKeys.length === 0) { return Object.freeze(current) as CareContextGroups }
      const next: Record<string, unknown> = { ...current }
      for (const key of changedKeys) {
        const value = input.patch[key]
        if (value === null || value === undefined) { delete next[key] } else { next[key] = value }
      }
      const written = rows.length === 0
        ? await connection.execute(
          `INSERT INTO user_plant_care_contexts (user_internal_id, user_plant_internal_id, location_json, cultivation_method, light_environment_json, ventilation_environment_json, version, created_at_ms, updated_at_ms)
            VALUES (?, ?, CAST(? AS JSON), ?, CAST(? AS JSON), CAST(? AS JSON), 1, ?, ?)`,
          [userId, plantId, toJson(next.location), cultivationPlaceholder, toJson(next.lighting), toJson(next.ventilation), input.occurredAtMs, input.occurredAtMs])
        : await connection.execute(
          `UPDATE user_plant_care_contexts SET location_json = CAST(? AS JSON), light_environment_json = CAST(? AS JSON), ventilation_environment_json = CAST(? AS JSON),
            version = version + 1, updated_at_ms = ? WHERE user_internal_id = ? AND user_plant_internal_id = ?`,
          [toJson(next.location), toJson(next.lighting), toJson(next.ventilation), input.occurredAtMs, userId, plantId])
      if (written.affectedRows !== 1) { throw new Error('养护环境写入未确定') }
      const readback = await connection.query(
        'SELECT location_json, light_environment_json, ventilation_environment_json FROM user_plant_care_contexts WHERE user_internal_id = ? AND user_plant_internal_id = ?', [userId, plantId])
      if (readback.length !== 1) { throw new Error('养护环境读回不唯一') }
      for (const key of CARE_CONTEXT_GROUP_KEYS) {
        const stored = lockStoredEnvironmentGroup(key, readback[0]![column[key]])
        if (toJson(stored) !== toJson(next[key])) { throw new Error('养护环境读回与本次写入不一致') }
      }
      return Object.freeze(next) as CareContextGroups
    },

    /** 完整度判定所需证据：当前身份状态、本株首次完成时间、同用户其他植物是否已完成过。 */
    async readCompletenessEvidence(transaction: Transaction, input: EnvironmentOwnerInput): Promise<CompletenessEvidence> {
      const connection = connectionOf(transaction)
      const { userId, plantId } = await ownerKeys(connection, input.userRef, input.userPlantRef)
      const rows = await connection.query(
        `SELECT p.current_identity_status, CAST(f.profile_completed_at_ms AS CHAR) AS completed_at_ms,
            (SELECT COUNT(*) FROM user_plant_profiles o WHERE o.user_internal_id = p.user_internal_id AND o.user_plant_internal_id <> p.id AND o.profile_completed_at_ms IS NOT NULL) AS others_completed
          FROM user_plants p JOIN user_plant_profiles f ON f.user_plant_internal_id = p.id AND f.user_internal_id = p.user_internal_id
          WHERE p.id = ? AND p.user_internal_id = ?`, [plantId, userId])
      if (rows.length !== 1 || typeof rows[0]!.current_identity_status !== 'string') { throw new Error('完整度证据读回不唯一') }
      const completed = rows[0]!.completed_at_ms
      if (completed !== null && (typeof completed !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(completed))) { throw new Error('首次完成时间损坏') }
      return { identityStatus: rows[0]!.current_identity_status, profileCompletedAtMs: completed === null ? null : Number(completed), userPreviouslyCompletedProfile: Number(rows[0]!.others_completed) > 0 }
    },

    /** 首次完整时写入完成时间与策略版本；已有完成时间不覆盖（条件写影响行数必须为 1）。 */
    async markProfileCompleted(transaction: Transaction, input: MarkProfileCompletedInput): Promise<void> {
      const connection = connectionOf(transaction)
      const { userId, plantId } = await ownerKeys(connection, input.userRef, input.userPlantRef)
      const written = await connection.execute(
        `UPDATE user_plant_profiles SET profile_completed_at_ms = ?, profile_completeness_version = ?
          WHERE user_internal_id = ? AND user_plant_internal_id = ? AND profile_completed_at_ms IS NULL`,
        [input.completedAtMs, input.profileVersion, userId, plantId])
      if (written.affectedRows !== 1) { throw new Error('首次完成时间写入未确定') }
    }
  }
}

/** 环境 Repository 端口类型。 */
export type MysqlUserPlantEnvironmentRepository = ReturnType<typeof createMysqlUserPlantEnvironmentRepository>
