import { createConnection, type Connection } from 'mysql2/promise'

import type { DatabaseConnectionConfig } from '../config/database-config.js'
import type {
  MysqlConnectionPoolPort,
  MysqlTransactionConnectionPort
} from './mysql-transaction-driver.js'

/** Repository 允许绑定到参数化 SQL 的标量类型。 */
export type SqlParameter = string | number | null

/** 同时满足事务生命周期和参数化查询的 mysql2 连接句柄；只供 Repository 执行器使用。 */
export type Mysql2QueryConnection = MysqlTransactionConnectionPort & {
  /** 执行参数化 SQL 并返回结果行；禁止把用户输入拼接进 SQL 文本。 */
  readonly query: (
    sql: string,
    parameters: readonly SqlParameter[]
  ) => Promise<readonly Record<string, unknown>[]>
  /** 执行参数化写入并返回受影响行数与自增值，供写用例的 Repository 使用。 */
  readonly execute: (
    sql: string,
    parameters: readonly SqlParameter[]
  ) => Promise<{
    /** 本次语句实际影响的行数。 */
    readonly affectedRows: number
    /** 自增主键值；只可在服务端内部使用，不得公开。 */
    readonly insertId: number
  }>
}

/** 把 Repository 端口的 `unknown[]` 参数收窄为 mysql2 可绑定的标量；其他类型失败关闭。 */
export function toSqlParameters(parameters: readonly unknown[]): SqlParameter[] {
  return parameters.map(parameter => {
    if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
      return parameter
    }
    throw new Error('Repository 传入了不受支持的 SQL 参数类型')
  })
}

/** 包装单个 mysql2 连接，关闭动作只执行一次。 */
function wrapConnection(connection: Connection): Mysql2QueryConnection {
  let closed = false

  /** 执行 SQL 并把结果统一成只读行数组。 */
  async function run(sql: string, parameters: readonly SqlParameter[]) {
    const [result] = await connection.execute(sql, [...parameters])
    return result
  }

  return {
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => {
      if (closed) {
        return
      }
      closed = true
      connection.end().catch(() => {
        connection.destroy()
      })
    },
    destroy: () => {
      if (closed) {
        return
      }
      closed = true
      connection.destroy()
    },
    query: async (sql, parameters) => {
      const result = await run(sql, parameters)
      if (!Array.isArray(result)) {
        throw new Error('查询语句未返回结果行')
      }
      return result as readonly Record<string, unknown>[]
    },
    execute: async (sql, parameters) => {
      const result = await run(sql, parameters)
      if (Array.isArray(result)) {
        throw new Error('写入语句意外返回结果行')
      }
      const header = result as { affectedRows: number; insertId: number }
      return { affectedRows: header.affectedRows, insertId: header.insertId }
    }
  }
}

/**
 * 创建“每次请求一条独占连接”的 mysql2 连接来源，实现事务驱动所需的连接池端口。
 *
 * 连接池上限与建连时限在配置目录中仍为 pending，因此这里不创建连接池、不设置任何调优数值；
 * 每次 `getConnection` 新建连接，`release` 正常关闭、`destroy` 立即销毁，不复用状态不明的连接。
 * 该来源不宣称并发性能，真实并发部署前必须先冻结连接预算。
 */
export function createMysql2ConnectionSource(
  config: DatabaseConnectionConfig
): MysqlConnectionPoolPort<Mysql2QueryConnection> {
  return {
    getConnection: async () =>
      wrapConnection(
        await createConnection({
          host: config.host,
          port: config.port,
          database: config.database,
          user: config.user,
          password: config.password,
          charset: 'utf8mb4_unicode_ci',
          supportBigNumbers: true,
          bigNumberStrings: true,
          multipleStatements: false
        })
      )
  }
}

/**
 * 在一条独占连接上执行只读工作；成功后正常关闭，失败时销毁连接并原样抛出错误。
 * 只读查询不开启事务，调用方不得在此执行写入。
 */
export async function withReadConnection<TResult>(
  source: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  work: (connection: Mysql2QueryConnection) => Promise<TResult>
): Promise<TResult> {
  const connection = await source.getConnection()
  try {
    const result = await work(connection)
    connection.release()
    return result
  } catch (error: unknown) {
    connection.destroy()
    throw error
  }
}
