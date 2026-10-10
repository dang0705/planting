import type { UserPlantRef, UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { UserPlantPersistenceError } from './mysql-user-plant-repository.js'
import { lifecycleSourceRefFor, timelineItemRefFor } from '../domain/timeline.js'

const zero = Number('0')
const one = Number('1')
const userPublicRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const userPlantPublicRefFormat = /^upl_[A-Za-z0-9_-]{8,}$/u
const positiveIntegerTextFormat = /^[1-9][0-9]*$/u
const activeLifecycleStatuses = ['active', 'archived'] as const

/** 普通用户可以执行的生命周期状态；删除状态只由受控清理流程管理。 */
export type UserPlantMutableLifecycleStatus = (typeof activeLifecycleStatuses)[number]

/** 锁定用户植物生命周期时允许从 SQL 读回的最小行。 */
export type UserPlantLifecycleSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'lifecycle-plant'
  /** 只允许普通用户可操作的 active 或 archived 状态。 */
  readonly lifecycle_status: string
  /** 用户植物乐观锁版本的十进制文本。 */
  readonly version: string
}

/** 生命周期 CAS 写入返回的最小 MySQL 结果。 */
export type UserPlantLifecycleSqlWriteResult = {
  /** 参数化 UPDATE 实际影响的行数。 */
  readonly affectedRows: number
}

/** 用户植物生命周期 Repository 使用的事务内参数化 SQL 执行端口。 */
export type UserPlantLifecycleSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在当前事务内读取并按需锁定 SQL 行；Repository 不接触连接池。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly UserPlantLifecycleSqlRow[]>
  /** 在调用方事务内执行 CAS 更新并返回真实影响行数。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<UserPlantLifecycleSqlWriteResult>
}

/** 已完成 owner-scoped 锁定的生命周期快照。 */
export type LockedUserPlantLifecycle = {
  /** 当前用户植物生命周期，仅允许 active 或 archived。 */
  readonly lifecycle: UserPlantMutableLifecycleStatus
  /** 当前用户植物版本；必须为可安全表达的正整数。 */
  readonly version: number
}

/** 用户植物生命周期条件更新所需的受控字段。 */
export type CompareAndSwapUserPlantLifecycleInput = {
  /** 已由 identity 域解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** 当前用户选择操作的植物高熵公开引用。 */
  readonly userPlantRef: UserPlantRef
  /** 查询时锁定的原生命周期，作为 CAS 第二重保护条件。 */
  readonly expectedLifecycle: UserPlantMutableLifecycleStatus
  /** 客户端基于已读公开 DTO 提交的预期版本。 */
  readonly expectedVersion: number
  /** 本次受限命令目标状态，只能是归档或恢复。 */
  readonly targetLifecycle: UserPlantMutableLifecycleStatus
  /** 命令发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 用户植物生命周期 Repository 的事务内操作端口。 */
export type MysqlUserPlantLifecycleRepository<TTransaction extends TransactionExecutionContext> = {
  /** 按统一用户和公开植物引用同时过滤并锁定可操作生命周期；删除中/已删除统一视为不可见。 */
  readonly lockOwnedLifecycle: (
    transaction: TTransaction,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ) => Promise<LockedUserPlantLifecycle>
  /** 按 owner、公开引用、原状态和预期版本原子更新；零行表示竞争或陈旧状态。 */
  readonly compareAndSwapLifecycle: (
    transaction: TTransaction,
    input: CompareAndSwapUserPlantLifecycleInput
  ) => Promise<boolean>
}

/** 确认版本文本是可精确转换的正整数，拒绝损坏或越界数据库值。 */
function resolvePositiveVersion(value: string): number {
  if (!positiveIntegerTextFormat.test(value)) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物版本不合法')
  }
  const version = Number(value)
  if (!Number.isSafeInteger(version) || version <= zero) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物版本不合法')
  }
  return version
}

/** 校验公开用户与用户植物引用，避免把任意值带入 Repository。 */
function assertPublicReferences(userRef: UserRef, userPlantRef: UserPlantRef): void {
  if (!userPublicRefFormat.test(userRef)) {
    throw new UserPlantPersistenceError('PRINCIPAL_INVALID', '登录状态无效')
  }
  if (!userPlantPublicRefFormat.test(userPlantRef)) {
    throw new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '用户植物不可见')
  }
}

/** 校验数据库行唯一性和 SQL 判别字段，避免把损坏数据当作可写对象。 */
function resolveLifecycleRow(rows: readonly UserPlantLifecycleSqlRow[]): LockedUserPlantLifecycle {
  if (rows.length === zero) {
    throw new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '用户植物不可见')
  }
  if (rows.length !== one || rows[zero]?.kind !== 'lifecycle-plant') {
    throw new UserPlantPersistenceError(
      'INTERNAL_DATA_INVALID',
      '用户植物生命周期读回不唯一或不完整'
    )
  }
  const row = rows[zero]
  if (row.lifecycle_status !== 'active' && row.lifecycle_status !== 'archived') {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物生命周期不合法')
  }
  return {
    lifecycle: row.lifecycle_status,
    version: resolvePositiveVersion(row.version)
  }
}

/** 校验 CAS 输入并把损坏的内部调用失败关闭。 */
function assertCompareAndSwapInput(input: CompareAndSwapUserPlantLifecycleInput): void {
  assertPublicReferences(input.userRef, input.userPlantRef)
  if (
    !Number.isSafeInteger(input.expectedVersion) ||
    input.expectedVersion <= zero ||
    !Number.isSafeInteger(input.occurredAtMs) ||
    input.occurredAtMs < zero ||
    (input.expectedLifecycle !== 'active' && input.expectedLifecycle !== 'archived') ||
    (input.targetLifecycle !== 'active' && input.targetLifecycle !== 'archived')
  ) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物生命周期更新输入不合法')
  }
}

/**
 * 创建归档/恢复专用 MySQL Repository。
 *
 * 锁定与 CAS 都以统一用户公开引用和植物公开引用联合限定，且删除中、已删除对象不会被普通
 * 生命周期命令看见；CAS 继续检查原状态与版本，避免任何绕过锁或陈旧版本的覆盖。
 *
 * @param executor 仅在受控事务上下文内执行参数化 SQL 的适配器。
 * @returns 提供 owner-scoped 行锁和单次 CAS 的生命周期 Repository。
 */
export function createMysqlUserPlantLifecycleRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: UserPlantLifecycleSqlExecutor<TTransaction>
): MysqlUserPlantLifecycleRepository<TTransaction> {
  return {
    async lockOwnedLifecycle(transaction, userRef, userPlantRef) {
      assertPublicReferences(userRef, userPlantRef)
      const rows = await executor.executeQuery(
        transaction,
        `SELECT 'lifecycle-plant' AS \`kind\`, \`p\`.\`lifecycle_status\`,
                CAST(\`p\`.\`version\` AS CHAR) AS \`version\`
         FROM \`user_plants\` AS \`p\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`p\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ?
           AND \`u\`.\`status\` = 'active'
           AND \`p\`.\`public_user_plant_id\` = ?
           AND \`p\`.\`lifecycle_status\` IN ('active', 'archived')
         FOR UPDATE`,
        [userRef, userPlantRef]
      )
      return resolveLifecycleRow(rows)
    },

    async compareAndSwapLifecycle(transaction, input) {
      assertCompareAndSwapInput(input)
      const result = await executor.executeWrite(
        transaction,
        `UPDATE \`user_plants\` AS \`p\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`p\`.\`user_internal_id\`
         SET \`p\`.\`lifecycle_status\` = ?,
             \`p\`.\`version\` = \`p\`.\`version\` + 1,
             \`p\`.\`updated_at_ms\` = ?
         WHERE \`u\`.\`public_user_id\` = ?
           AND \`u\`.\`status\` = 'active'
           AND \`p\`.\`public_user_plant_id\` = ?
           AND \`p\`.\`lifecycle_status\` = ?
           AND \`p\`.\`version\` = ?`,
        [
          input.targetLifecycle,
          input.occurredAtMs,
          input.userRef,
          input.userPlantRef,
          input.expectedLifecycle,
          input.expectedVersion
        ]
      )
      if (result.affectedRows === one) {
        // user-plant-timeline.md §5：同一事务写一条归档/恢复时间线；来源引用由“植物 + 新版本”确定性生成。
        const itemType = input.targetLifecycle === 'archived' ? 'plant_archived' : 'plant_restored'
        const sourceRef = lifecycleSourceRefFor(input.userPlantRef, input.expectedVersion + one)
        const projected = await executor.executeWrite(
          transaction,
          `INSERT INTO \`user_plant_timeline_projection\`
             (\`timeline_item_ref\`, \`user_internal_id\`, \`user_plant_internal_id\`, \`source_domain\`, \`source_ref\`, \`item_type\`,
              \`occurred_at_ms\`, \`summary_json\`, \`projection_version\`, \`created_at_ms\`, \`updated_at_ms\`)
           SELECT ?, \`p\`.\`user_internal_id\`, \`p\`.\`id\`, 'user-plant', ?, ?, ?, CAST(? AS JSON), 1, ?, ?
           FROM \`user_plants\` AS \`p\` JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`p\`.\`user_internal_id\`
           WHERE \`u\`.\`public_user_id\` = ? AND \`p\`.\`public_user_plant_id\` = ?`,
          [timelineItemRefFor('user-plant', sourceRef), sourceRef, itemType, input.occurredAtMs, JSON.stringify({ itemType }),
            input.occurredAtMs, input.occurredAtMs, input.userRef, input.userPlantRef]
        )
        if (projected.affectedRows !== one) {
          throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '生命周期时间线写入未确定')
        }
        return true
      }
      if (result.affectedRows === zero) {
        return false
      }
      throw new UserPlantPersistenceError(
        'INTERNAL_DATA_INVALID',
        '用户植物生命周期更新影响行数不合法'
      )
    }
  }
}
