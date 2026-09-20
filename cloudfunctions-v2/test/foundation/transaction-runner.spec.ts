import { describe, expect, test } from 'vitest'

import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'

type TestTransaction = TransactionExecutionContext & {
  /** 仅用于测试验证同一个事务对象贯穿完整回调。 */
  testRef: string
}

/** 创建一个只记录生命周期、不模拟 SQL 行为的事务驱动。 */
function createTestDriver(
  event: string[],
  error: { beginError?: Error; commitError?: Error; rollbackError?: Error } = {}
): DatabaseTransactionDriver<TestTransaction> {
  return {
    async beginTransaction() {
      event.push('开始')
      if (error.beginError) {
        throw error.beginError
      }
      return { transactionContext: true, testRef: 'tx_test' }
    },
    async commitTransaction() {
      event.push('提交')
      if (error.commitError) {
        throw error.commitError
      }
    },
    async rollbackTransaction() {
      event.push('回滚')
      if (error.rollbackError) {
        throw error.rollbackError
      }
    },
    async recordRollbackFailure() {
      event.push('记录回滚失败')
    }
  }
}

/**
 * Expected 来源：`docs/backend-v2/implementation/http-function.md` 与 P2 共享基础设施 ticket 的事务原子性要求。
 * 测试层次：L3 / `unit_fake`。真实执行事务编排器，以可观测驱动替代 MySQL 连接。
 * 明确未覆盖：MySQL 隔离级别、连接池、真实 SQL、唯一约束和 CloudBase 网络失败。
 */
describe('共享数据库事务编排器', () => {
  test('业务回调成功时只提交一次并返回回调结果', async () => {
    const event: string[] = []
    const driver = createTestDriver(event)

    const result = await runDatabaseTransaction(driver, async transaction => {
      event.push(`业务:${transaction.testRef}`)
      return { userPlantRef: 'upl_test' }
    })

    expect(result).toEqual({ userPlantRef: 'upl_test' })
    expect(event).toEqual(['开始', '业务:tx_test', '提交'])
  })

  test('业务回调失败时回滚且不提交，并保留原始内部异常供上层统一脱敏', async () => {
    const event: string[] = []
    const driver = createTestDriver(event)
    const rawError = new Error('repository failed')

    await expect(
      runDatabaseTransaction(driver, async () => {
        event.push('业务失败')
        throw rawError
      })
    ).rejects.toBe(rawError)
    expect(event).toEqual(['开始', '业务失败', '回滚'])
  })

  test('提交失败时尝试回滚并抛出提交错误', async () => {
    const event: string[] = []
    const commitError = new Error('commit failed')
    const driver = createTestDriver(event, { commitError })

    await expect(runDatabaseTransaction(driver, async () => 'result')).rejects.toBe(commitError)
    expect(event).toEqual(['开始', '提交', '回滚'])
  })

  test('提交结果未知时禁止回滚和自动重跑，原样交给新连接只读对账', async () => {
    const event: string[] = []
    const commitError = new DatabaseCommitResultUnknownError('提交响应在网络断开后未知')
    const driver = createTestDriver(event, { commitError })

    await expect(runDatabaseTransaction(driver, async () => 'result')).rejects.toBe(commitError)
    expect(event).toEqual(['开始', '提交'])
  })

  test('回滚失败不会覆盖最先发生的业务错误', async () => {
    const event: string[] = []
    const businessError = new Error('domain failed')
    const driver = createTestDriver(event, { rollbackError: new Error('rollback failed') })

    await expect(
      runDatabaseTransaction(driver, async () => {
        throw businessError
      })
    ).rejects.toBe(businessError)
    expect(event).toEqual(['开始', '回滚', '记录回滚失败'])
  })

  test('开始事务失败时不执行回调、提交或回滚', async () => {
    const event: string[] = []
    const beginError = new Error('begin failed')
    const driver = createTestDriver(event, { beginError })
    let callbackExecuted = false

    await expect(
      runDatabaseTransaction(driver, async () => {
        callbackExecuted = true
      })
    ).rejects.toBe(beginError)
    expect(callbackExecuted).toBe(false)
    expect(event).toEqual(['开始'])
  })
})
