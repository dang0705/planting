import { describe, expect, test } from 'vitest'

import {
  执行数据库事务,
  type 数据库事务驱动,
  type 事务执行上下文
} from '../../src/foundation/database/transaction-runner.js'

type 测试事务 = 事务执行上下文 & {
  /** 仅用于测试验证同一个事务对象贯穿完整回调。 */
  testRef: string
}

/** 创建一个只记录生命周期、不模拟 SQL 行为的事务驱动。 */
function 创建测试驱动(
  事件: string[],
  错误: { 开始错误?: Error; 提交错误?: Error; 回滚错误?: Error } = {}
): 数据库事务驱动<测试事务> {
  return {
    async 开始事务() {
      事件.push('开始')
      if (错误.开始错误) {
        throw 错误.开始错误
      }
      return { transactionContext: true, testRef: 'tx_test' }
    },
    async 提交事务() {
      事件.push('提交')
      if (错误.提交错误) {
        throw 错误.提交错误
      }
    },
    async 回滚事务() {
      事件.push('回滚')
      if (错误.回滚错误) {
        throw 错误.回滚错误
      }
    },
    async 记录回滚失败() {
      事件.push('记录回滚失败')
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
    const 事件: string[] = []
    const 驱动 = 创建测试驱动(事件)

    const 结果 = await 执行数据库事务(驱动, async 事务 => {
      事件.push(`业务:${事务.testRef}`)
      return { userPlantRef: 'upl_test' }
    })

    expect(结果).toEqual({ userPlantRef: 'upl_test' })
    expect(事件).toEqual(['开始', '业务:tx_test', '提交'])
  })

  test('业务回调失败时回滚且不提交，并保留原始内部异常供上层统一脱敏', async () => {
    const 事件: string[] = []
    const 驱动 = 创建测试驱动(事件)
    const 原始错误 = new Error('repository failed')

    await expect(
      执行数据库事务(驱动, async () => {
        事件.push('业务失败')
        throw 原始错误
      })
    ).rejects.toBe(原始错误)
    expect(事件).toEqual(['开始', '业务失败', '回滚'])
  })

  test('提交失败时尝试回滚并抛出提交错误', async () => {
    const 事件: string[] = []
    const 提交错误 = new Error('commit failed')
    const 驱动 = 创建测试驱动(事件, { 提交错误 })

    await expect(执行数据库事务(驱动, async () => 'result')).rejects.toBe(提交错误)
    expect(事件).toEqual(['开始', '提交', '回滚'])
  })

  test('回滚失败不会覆盖最先发生的业务错误', async () => {
    const 事件: string[] = []
    const 业务错误 = new Error('domain failed')
    const 驱动 = 创建测试驱动(事件, { 回滚错误: new Error('rollback failed') })

    await expect(
      执行数据库事务(驱动, async () => {
        throw 业务错误
      })
    ).rejects.toBe(业务错误)
    expect(事件).toEqual(['开始', '回滚', '记录回滚失败'])
  })

  test('开始事务失败时不执行回调、提交或回滚', async () => {
    const 事件: string[] = []
    const 开始错误 = new Error('begin failed')
    const 驱动 = 创建测试驱动(事件, { 开始错误 })
    let 回调已执行 = false

    await expect(
      执行数据库事务(驱动, async () => {
        回调已执行 = true
      })
    ).rejects.toBe(开始错误)
    expect(回调已执行).toBe(false)
    expect(事件).toEqual(['开始'])
  })
})
