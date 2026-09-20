import { describe, expect, test } from 'vitest'

import {
  reconcileHttpIdempotencyCommitResult,
  type HttpIdempotencyCommitUnknownReadOnlyRepository
} from '../../src/foundation/idempotency/commit-unknown-reconciliation.js'
import type { HttpIdempotencyScope } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'

const currentRequestDigest = 'c'.repeat(Number('64'))

/** 创建不包含任何原始主体或幂等键的只读对账作用域。 */
function createScope(): HttpIdempotencyScope {
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
function createReadOnlyRepository(
  readResult: Awaited<ReturnType<HttpIdempotencyCommitUnknownReadOnlyRepository['read']>> | Error
): { readonly repository: HttpIdempotencyCommitUnknownReadOnlyRepository; readonly readAttempts: () => number } {
  let attempts = Number('0')
  return {
    repository: {
      async read() {
        attempts += Number('1')
        if (readResult instanceof Error) {
          throw readResult
        }
        return readResult
      }
    },
    readAttempts: () => attempts
  }
}

/**
 * Expected 来源：`http-api/v1` 与 P2 Foundation 提交结果未知合同。
 * 测试层次：L2 / `unit_fake`；真实执行只读对账决策，仅替换新连接 Repository 边界。
 * 明确未覆盖：真实连接池销毁、CloudBase MySQL 网络中断和 HTTP 503 映射。
 */
describe('HTTP 幂等提交结果未知只读对账', () => {
  test('只有相同请求摘要的 completed 记录可以原样重放', async () => {
    const firstResponse = { status: Number('200'), body: { data: { user_plant_id: 'upl_safe_replay' } } }
    const testDouble = createReadOnlyRepository({
      requestHash: currentRequestDigest,
      state: 'completed',
      response: firstResponse
    })

    await expect(
      reconcileHttpIdempotencyCommitResult(testDouble.repository, {
        scope: createScope(),
        requestHash: currentRequestDigest
      })
    ).resolves.toEqual({ kind: 'replay', response: firstResponse })
    expect(testDouble.readAttempts()).toBe(Number('1'))
  })

  test('未找到记录时保持未知，禁止据此重跑业务命令', async () => {
    const testDouble = createReadOnlyRepository(null)

    await expect(
      reconcileHttpIdempotencyCommitResult(testDouble.repository, {
        scope: createScope(),
        requestHash: currentRequestDigest
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'missing' })
  })

  test('processing 或不同请求摘要都不能被误报为安全重放', async () => {
    const processing = createReadOnlyRepository({ requestHash: currentRequestDigest, state: 'processing' })
    const digestConflict = createReadOnlyRepository({
      requestHash: 'd'.repeat(Number('64')),
      state: 'completed',
      response: { status: Number('200'), body: { data: {} } }
    })

    await expect(
      reconcileHttpIdempotencyCommitResult(processing.repository, {
        scope: createScope(),
        requestHash: currentRequestDigest
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'processing' })
    await expect(
      reconcileHttpIdempotencyCommitResult(digestConflict.repository, {
        scope: createScope(),
        requestHash: currentRequestDigest
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'request_hash_mismatch' })
  })

  test('新连接只读失败时失败关闭，不把异常或数据库细节带入结果', async () => {
    const testDouble = createReadOnlyRepository(new Error('connection refused: secret-host'))

    await expect(
      reconcileHttpIdempotencyCommitResult(testDouble.repository, {
        scope: createScope(),
        requestHash: currentRequestDigest
      })
    ).resolves.toEqual({ kind: 'unresolved', reason: 'read_failed' })
  })
})
