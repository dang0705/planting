import { describe, expect, test } from 'vitest'

import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlTransactionConnectionPort
} from '../../src/foundation/database/mysql-transaction-driver.js'

const singleExecution = 1

type FakeConnection = MysqlTransactionConnectionPort & {
  /** 记录此连接收到的生命周期命令，供测试核对调用顺序与次数。 */
  readonly events: string[]
  /** 控制开始事务调用失败的测试故障；未设置时开始成功。 */
  readonly beginError?: unknown
  /** 控制提交事务调用失败的测试故障；未设置时提交成功。 */
  readonly commitError?: unknown
  /** 控制回滚事务调用失败的测试故障；未设置时回滚成功。 */
  readonly rollbackError?: unknown
}

type FakeFailurePlan = {
  /** 模拟 BEGIN 命令失败的原始异常。 */
  readonly beginError?: unknown
  /** 模拟 COMMIT 命令失败的原始异常。 */
  readonly commitError?: unknown
  /** 模拟 ROLLBACK 命令失败的原始异常。 */
  readonly rollbackError?: unknown
}

/**
 * 创建会记录命令且可注入阶段错误的连接替身。
 * 测试层次：L3 / `unit_fake`；替换边界仅为 MySQL 连接池与连接，不替换事务驱动和运行器。
 */
function createFakeConnection(events: string[], failure: FakeFailurePlan = {}): FakeConnection {
  return {
    events: events,
    beginError: failure.beginError,
    commitError: failure.commitError,
    rollbackError: failure.rollbackError,
    beginTransaction: async () => {
      events.push('BEGIN')
      if (failure.beginError !== undefined) {
        throw failure.beginError
      }
    },
    commit: async () => {
      events.push('COMMIT')
      if (failure.commitError !== undefined) {
        throw failure.commitError
      }
    },
    rollback: async () => {
      events.push('ROLLBACK')
      if (failure.rollbackError !== undefined) {
        throw failure.rollbackError
      }
    },
    release: () => {
      events.push('RELEASE')
    },
    destroy: () => {
      events.push('DESTROY')
    }
  }
}

/** 创建只提供单个测试连接的连接池替身。 */
function createFakePool(
  events: string[],
  connection: FakeConnection,
  acquisitionError?: unknown
): MysqlConnectionPoolPort<FakeConnection> {
  return {
    getConnection: async () => {
      events.push('GET_CONNECTION')
      if (acquisitionError !== undefined) {
        throw acquisitionError
      }
      return connection
    }
  }
}

/**
 * Expected 来源：P2 共享基础设施 ticket、`transaction-runner.ts` 的生命周期合同，以及
 * `foundation-http-idempotency.md` 的提交结果未知失败关闭规则。MySQL 连接使用明确故障计划替身。
 */
describe('Foundation MySQL 事务驱动', () => {
  test('工作成功时只提交一次并归还连接', async () => {
    const events: string[] = []
    const connection = createFakeConnection(events)
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), () => undefined)

    const result = await runDatabaseTransaction(driver, async () => {
      events.push('WORK')
      return 'committed-result'
    })

    expect(result).toBe('committed-result')
    expect(events).toEqual(['GET_CONNECTION', 'BEGIN', 'WORK', 'COMMIT', 'RELEASE'])
  })

  test('连接池取连接失败时不执行工作回调', async () => {
    const events: string[] = []
    const connection = createFakeConnection(events)
    const acquisitionError = new Error('pool unavailable')
    const driver = createMysqlTransactionDriver(
      createFakePool(events, connection, acquisitionError),
      () => undefined
    )
    let workExecuted = false

    await expect(
      runDatabaseTransaction(driver, async () => {
        workExecuted = true
      })
    ).rejects.toBe(acquisitionError)

    expect(workExecuted).toBe(false)
    expect(events).toEqual(['GET_CONNECTION'])
  })

  test('BEGIN 失败后尝试清理事务并归还连接，且不执行工作回调', async () => {
    const events: string[] = []
    const beginError = new Error('begin rejected')
    const connection = createFakeConnection(events, { beginError: beginError })
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), () => undefined)
    let workExecuted = false

    await expect(
      runDatabaseTransaction(driver, async () => {
        workExecuted = true
      })
    ).rejects.toBe(beginError)

    expect(workExecuted).toBe(false)
    expect(events).toEqual(['GET_CONNECTION', 'BEGIN', 'ROLLBACK', 'RELEASE'])
  })

  test('BEGIN 清理回滚失败时销毁连接并保留 BEGIN 原始错误', async () => {
    const events: string[] = []
    const beginError = new Error('begin rejected')
    const rollbackError = new Error('cleanup rollback rejected')
    const connection = createFakeConnection(events, {
      beginError: beginError,
      rollbackError: rollbackError
    })
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), event => {
      expect(event.originalError).toBe(beginError)
      expect(event.rollbackError).toBe(rollbackError)
      events.push('RECORD_ROLLBACK_FAILURE')
    })
    let workExecuted = false

    await expect(
      runDatabaseTransaction(driver, async () => {
        workExecuted = true
      })
    ).rejects.toBe(beginError)

    expect(workExecuted).toBe(false)
    expect(events).toEqual([
      'GET_CONNECTION',
      'BEGIN',
      'ROLLBACK',
      'DESTROY',
      'RECORD_ROLLBACK_FAILURE'
    ])
  })

  test('业务工作失败时只回滚，保留业务错误并归还连接', async () => {
    const events: string[] = []
    const connection = createFakeConnection(events)
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), () => undefined)
    const workError = new Error('repository rejected')

    await expect(
      runDatabaseTransaction(driver, async () => {
        events.push('WORK')
        throw workError
      })
    ).rejects.toBe(workError)

    expect(events).toEqual(['GET_CONNECTION', 'BEGIN', 'WORK', 'ROLLBACK', 'RELEASE'])
  })

  test('回滚失败时销毁连接、记录回滚失败并保留原始业务错误', async () => {
    const events: string[] = []
    const rollbackError = new Error('rollback rejected')
    const connection = createFakeConnection(events, { rollbackError: rollbackError })
    const workError = new Error('repository rejected')
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), event => {
      expect(event.originalError).toBe(workError)
      expect(event.rollbackError).toBe(rollbackError)
      events.push('RECORD_ROLLBACK_FAILURE')
    })

    await expect(
      runDatabaseTransaction(driver, async () => {
        events.push('WORK')
        throw workError
      })
    ).rejects.toBe(workError)

    expect(events).toEqual([
      'GET_CONNECTION',
      'BEGIN',
      'WORK',
      'ROLLBACK',
      'DESTROY',
      'RECORD_ROLLBACK_FAILURE'
    ])
  })

  test('回滚失败观测器自身异常也不能覆盖原始业务错误', async () => {
    const events: string[] = []
    const rollbackError = new Error('rollback rejected')
    const connection = createFakeConnection(events, { rollbackError: rollbackError })
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), () => {
      throw new Error('observer rejected')
    })
    const workError = new Error('repository rejected')

    await expect(
      runDatabaseTransaction(driver, async () => {
        events.push('WORK')
        throw workError
      })
    ).rejects.toBe(workError)

    expect(events).toEqual(['GET_CONNECTION', 'BEGIN', 'WORK', 'ROLLBACK', 'DESTROY'])
  })

  test('任何 COMMIT Promise 拒绝都标记结果未知、销毁旧连接且不回滚或重跑', async () => {
    const events: string[] = []
    const connection = createFakeConnection(events, {
      commitError: new Error('transport details must stay private')
    })
    const driver = createMysqlTransactionDriver(createFakePool(events, connection), () => undefined)
    let workCount = 0
    let caughtError: unknown

    try {
      await runDatabaseTransaction(driver, async () => {
        workCount += singleExecution
        events.push('WORK')
      })
    } catch (error: unknown) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(DatabaseCommitResultUnknownError)
    expect((caughtError as Error).message).not.toContain('transport details')
    expect(workCount).toBe(singleExecution)
    expect(events).toEqual(['GET_CONNECTION', 'BEGIN', 'WORK', 'COMMIT', 'DESTROY'])
  })
})
