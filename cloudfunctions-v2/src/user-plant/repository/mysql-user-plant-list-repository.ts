import type { UserPlantDto, UserPlantRef, UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { ListableUserPlantLifecycle, UserPlantListCursor } from '../domain/user-plant-list-query.js'
import {
  projectReadPlantRow,
  READ_PLANT_PROJECTION_SQL,
  UserPlantPersistenceError,
  type UserPlantReadProjectionSqlRow
} from './mysql-user-plant-repository.js'

/** 列表查询只需要的参数化 SQL 执行端口（在调用方只读事务内执行）。 */
export type UserPlantListSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 执行参数化查询并返回只读投影行。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly UserPlantReadProjectionSqlRow[]>
}

/** 列表查询输入；fetchLimit 由应用层传入“页大小 + 1”，用于判断是否还有下一页。 */
export type ListOwnedUserPlantsQuery = {
  /** 已验真的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 允许出现的生命周期（active/archived 子集）；deleting/deleted 永不出现。 */
  readonly lifecycles: readonly ListableUserPlantLifecycle[]
  /** 本次最多读取的行数（1～51）。 */
  readonly fetchLimit: number
  /** 上一页最后一项位置；null 表示第一页。 */
  readonly after: UserPlantListCursor | null
}

/** 列表 Repository 端口。 */
export type MysqlUserPlantListRepository<TTransaction extends TransactionExecutionContext> = {
  /** 按“创建时间倒序、同毫秒公开引用二进制倒序”读取本人可见植物。 */
  readonly listOwnedUserPlants: (transaction: TTransaction, query: ListOwnedUserPlantsQuery) => Promise<UserPlantDto[]>
}

const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const maxFetchLimit = 51

/**
 * 创建用户植物列表 Repository：user-plant 域列表 SQL 的唯一入口。
 * 归属用 `user_id` 公开引用限定；每行复用单株读取的同一投影与校验，损坏数据失败关闭而不是静默跳过。
 */
export function createMysqlUserPlantListRepository<TTransaction extends TransactionExecutionContext>(
  executor: UserPlantListSqlExecutor<TTransaction>
): MysqlUserPlantListRepository<TTransaction> {
  return {
    async listOwnedUserPlants(transaction, query) {
      const lifecycles = [...new Set(query.lifecycles)]
      if (!userRefFormat.test(query.userRef) || lifecycles.length === 0
        || lifecycles.some(lifecycle => lifecycle !== 'active' && lifecycle !== 'archived')
        || !Number.isSafeInteger(query.fetchLimit) || query.fetchLimit < 1 || query.fetchLimit > maxFetchLimit) {
        throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物列表查询输入不合法')
      }
      const parameters: unknown[] = [query.userRef, ...lifecycles]
      let cursorSql = ''
      if (query.after !== null) {
        cursorSql = ' AND (`p`.`created_at_ms` < ? OR (`p`.`created_at_ms` = ? AND BINARY `p`.`public_user_plant_id` < BINARY ?))'
        parameters.push(query.after.createdAtMs, query.after.createdAtMs, query.after.userPlantRef)
      }
      parameters.push(query.fetchLimit)
      const rows = await executor.executeQuery(
        transaction,
        `${READ_PLANT_PROJECTION_SQL}
       WHERE \`u\`.\`public_user_id\` = ?
         AND \`u\`.\`status\` = 'active' AND \`u\`.\`_openid\` = '' AND \`p\`.\`_openid\` = ''
         AND \`p\`.\`lifecycle_status\` IN (${lifecycles.map(() => '?').join(', ')})${cursorSql}
       ORDER BY \`p\`.\`created_at_ms\` DESC, BINARY \`p\`.\`public_user_plant_id\` DESC
       LIMIT ?`,
        parameters
      )
      if (rows.length > query.fetchLimit) {
        throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物列表读回超过上限')
      }
      return rows.map(row => {
        if (row.kind !== 'read-plant' || typeof row.public_user_plant_id !== 'string') {
          throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物列表行不完整')
        }
        const plant = projectReadPlantRow(row, row.public_user_plant_id as UserPlantRef)
        if (!lifecycles.includes(plant.lifecycle as ListableUserPlantLifecycle)) {
          throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物列表生命周期不在筛选范围')
        }
        return plant
      })
    }
  }
}
