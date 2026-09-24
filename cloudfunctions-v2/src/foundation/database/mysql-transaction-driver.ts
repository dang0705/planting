import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type RollbackFailureEvent,
  type TransactionExecutionContext
} from './transaction-runner.js'

/**
 * MySQL 单连接所需的最小事务生命周期端口。
 * 运行时驱动通过结构化注入实现此端口；本文件不绑定 mysql2 或 CloudBase 连接工厂。
 */
export type MysqlTransactionConnectionPort = {
  /** 开启 MySQL 事务；失败时驱动仍会尝试执行一次清理回滚。 */
  beginTransaction: () => Promise<void>
  /** 提交当前事务；Promise 拒绝一律表示调用方无法确认提交结果。 */
  commit: () => Promise<void>
  /** 回滚当前事务；失败时连接会被销毁而不是归还连接池。 */
  rollback: () => Promise<void>
  /** 将健康且事务已结束的连接归还连接池。 */
  release: () => void
  /** 永久销毁连接，禁止将状态不明或事务未清理的连接复用。 */
  destroy: () => void
}

/**
 * 事务驱动使用的最小连接池端口。
 * 仅要求提供独占连接；连接池大小、超时和 CloudBase 配置由后续运行时工厂负责。
 */
export type MysqlConnectionPoolPort<TConnection extends MysqlTransactionConnectionPort> = {
  /** 获取供单个事务独占使用的连接。 */
  getConnection: () => Promise<TConnection>
}

/**
 * Foundation Repository 在事务内使用的上下文。
 * 连接句柄仅供服务端 Repository/SQL 适配器使用，不得进入业务响应或日志字段。
 */
export type MysqlTransactionContext<TConnection extends MysqlTransactionConnectionPort> =
  TransactionExecutionContext & {
    /** 当前事务独占连接；仅供 Repository 执行 SQL，不得暴露给路由或公开 API。 */
    readonly connection: TConnection
  }

/**
 * MySQL 回滚失败事件的内部记录器。
 * 记录器只供脱敏日志/告警使用，其自身失败不得覆盖最初的事务错误。
 */
export type MysqlRollbackFailureRecorder<TConnection extends MysqlTransactionConnectionPort> = (
  event: RollbackFailureEvent<MysqlTransactionContext<TConnection>>
) => void | Promise<void>

/**
 * 创建基于结构化 MySQL 连接池的事务驱动。
 *
 * 提交命令一旦发出，任何 Promise 拒绝都按“结果未知”处理：销毁旧连接，不回滚、不重跑，
 * 由上层使用新连接执行只读对账。BEGIN/业务失败则尝试回滚；回滚失败时销毁连接并保留
 * 最初错误。此适配器只负责事务生命周期，不负责创建连接池、执行 SQL 或选择业务路由。
 *
 * @param pool 已配置并注入的独占连接池端口。
 * @param recordRollbackFailure 回滚清理失败的内部观测回调。
 * @returns 可交给通用事务运行器的 MySQL 生命周期驱动。
 */
export function createMysqlTransactionDriver<TConnection extends MysqlTransactionConnectionPort>(
  pool: MysqlConnectionPoolPort<TConnection>,
  recordRollbackFailure: MysqlRollbackFailureRecorder<TConnection>
): DatabaseTransactionDriver<MysqlTransactionContext<TConnection>> {
  const transactionStates = new WeakMap<
    MysqlTransactionContext<TConnection>,
    'active' | 'finalized'
  >()

  /** 创建由本驱动持有的上下文并登记为活动事务。 */
  function createTransactionContext(connection: TConnection): MysqlTransactionContext<TConnection> {
    const transaction: MysqlTransactionContext<TConnection> = {
      transactionContext: true,
      connection: connection
    }
    transactionStates.set(transaction, 'active')
    return transaction
  }

  /** 仅接受本驱动创建且尚未结束的事务，避免重复提交、回滚或归还连接。 */
  function assertActiveTransaction(transaction: MysqlTransactionContext<TConnection>): void {
    if (transactionStates.get(transaction) !== 'active') {
      throw new Error('MySQL 事务上下文无效或已经结束')
    }
  }

  /** 先标记结束，再尽力销毁连接，避免清理异常覆盖事务原始错误。 */
  function destroyConnection(transaction: MysqlTransactionContext<TConnection>): void {
    transactionStates.set(transaction, 'finalized')
    try {
      transaction.connection.destroy()
    } catch {
      // 连接已不可信；销毁接口自身异常不能覆盖事务结果或业务错误。
    }
  }

  /** 先标记结束，再尝试连接池归还；归还失败时销毁连接但不改变事务结果。 */
  function releaseConnection(transaction: MysqlTransactionContext<TConnection>): void {
    transactionStates.set(transaction, 'finalized')
    try {
      transaction.connection.release()
    } catch {
      destroyConnection(transaction)
    }
  }

  /** 记录内部回滚失败；观测端不可用时仍须让原始数据库/业务错误继续向上传播。 */
  async function safelyRecordRollbackFailure(
    event: RollbackFailureEvent<MysqlTransactionContext<TConnection>>
  ): Promise<void> {
    try {
      await recordRollbackFailure(event)
    } catch {
      // 观测失败不能取代真正导致本次事务失败的错误。
    }
  }

  return {
    beginTransaction: async () => {
      const connection = await pool.getConnection()
      const transaction = createTransactionContext(connection)

      try {
        await connection.beginTransaction()
        return transaction
      } catch (beginError: unknown) {
        try {
          await connection.rollback()
          releaseConnection(transaction)
        } catch (rollbackError: unknown) {
          destroyConnection(transaction)
          await safelyRecordRollbackFailure({
            transaction: transaction,
            originalError: beginError,
            rollbackError: rollbackError
          })
        }
        throw beginError
      }
    },
    commitTransaction: async transaction => {
      assertActiveTransaction(transaction)
      try {
        await transaction.connection.commit()
      } catch {
        destroyConnection(transaction)
        throw new DatabaseCommitResultUnknownError('数据库提交结果未知，必须使用新连接进行只读对账')
      }
      releaseConnection(transaction)
    },
    rollbackTransaction: async transaction => {
      assertActiveTransaction(transaction)
      try {
        await transaction.connection.rollback()
      } catch (rollbackError: unknown) {
        destroyConnection(transaction)
        throw rollbackError
      }
      releaseConnection(transaction)
    },
    recordRollbackFailure: safelyRecordRollbackFailure
  }
}
