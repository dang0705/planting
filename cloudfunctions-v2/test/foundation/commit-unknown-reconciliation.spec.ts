import { describe, expect, test } from 'vitest'

import {
  对账HTTP幂等提交结果,
  type HTTP幂等提交未知只读Repository
} from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import type { HTTP幂等作用域 } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'

const 当前请求摘要 = 'c'.repeat(Number('64'))

/** 创建不包含任何原始主体或幂等键的只读对账作用域。 */
function 创建作用域(): HTTP幂等作用域 {
  return {
    principalType: 'user',
    principalScopeHash: 'a'.repeat(Number('64')),
    httpMethod: 'POST',
    normalizedPath: '/api/v2/user-plants',
    operationId: 'createUserPlant',
    idempotencyKeyHash: 'b'.repeat(Number('64'))
  }
}

/** 创建只执行一次受控读取的测试 Repository。 */
function 创建只读Repository(
  读取结果: Awaited<ReturnType<HTTP幂等提交未知只读Repository['读取']>> | Error
): { readonly repository: HTTP幂等提交未知只读Repository; readonly 读取次数: () => number } {
  let 次数 = Number('0')
  return {
    repository: {
      async 读取() {
        次数 += Number('1')
        if (读取结果 instanceof Error) {
          throw 读取结果
        }
        return 读取结果
      }
    },
    读取次数: () => 次数
  }
}

/**
 * Expected 来源：`http-api/v1` 与 P2 Foundation 提交结果未知合同。
 * 测试层次：L2 / `unit_fake`；真实执行只读对账决策，仅替换新连接 Repository 边界。
 * 明确未覆盖：真实连接池销毁、CloudBase MySQL 网络中断和 HTTP 503 映射。
 */
describe('HTTP 幂等提交结果未知只读对账', () => {
  test('只有相同请求摘要的 completed 记录可以原样重放', async () => {
    const 首次响应 = { status: Number('200'), body: { data: { user_plant_id: 'upl_safe_replay' } } }
    const 测试双 = 创建只读Repository({
      requestHash: 当前请求摘要,
      state: 'completed',
      response: 首次响应
    })

    await expect(
      对账HTTP幂等提交结果(测试双.repository, {
        scope: 创建作用域(),
        requestHash: 当前请求摘要
      })
    ).resolves.toEqual({ kind: 'replay', response: 首次响应 })
    expect(测试双.读取次数()).toBe(Number('1'))
  })

  test('未找到记录时保持未知，禁止据此重跑业务命令', async () => {
    const 测试双 = 创建只读Repository(null)

    await expect(
      对账HTTP幂等提交结果(测试双.repository, {
        scope: 创建作用域(),
        requestHash: 当前请求摘要
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'missing' })
  })

  test('processing 或不同请求摘要都不能被误报为安全重放', async () => {
    const 处理中 = 创建只读Repository({ requestHash: 当前请求摘要, state: 'processing' })
    const 摘要冲突 = 创建只读Repository({
      requestHash: 'd'.repeat(Number('64')),
      state: 'completed',
      response: { status: Number('200'), body: { data: {} } }
    })

    await expect(
      对账HTTP幂等提交结果(处理中.repository, {
        scope: 创建作用域(),
        requestHash: 当前请求摘要
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'processing' })
    await expect(
      对账HTTP幂等提交结果(摘要冲突.repository, {
        scope: 创建作用域(),
        requestHash: 当前请求摘要
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'request_hash_mismatch' })
  })

  test('新连接只读失败时失败关闭，不把异常或数据库细节带入结果', async () => {
    const 测试双 = 创建只读Repository(new Error('connection refused: secret-host'))

    await expect(
      对账HTTP幂等提交结果(测试双.repository, {
        scope: 创建作用域(),
        requestHash: 当前请求摘要
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'read_failed' })
  })
})
