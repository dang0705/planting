import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import {
  HttpIdempotencyDataCorruptedError,
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencyReadOnlySqlExecutor,
  type HttpIdempotencySqlExecutor,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'

/** SHA-256 十六进制摘要的固定字符数。 */
const sha256HexLength = Number('64')

/** 测试中的零计数和首元素下标。 */
const zero = Number('0')

/** 测试中的单次写入计数和第二元素下标基数。 */
const one = Number('1')

/** 测试事务只提供可辨认引用，不暴露真实数据库连接。 */
type TestTransaction = TransactionExecutionContext & {
  /** 用于证明所有 SQL 都在调用方传入的同一事务中执行。 */
  readonly testRef: string
}

/** 单次测试使用的固定幂等作用域。 */
const idempotencyScope = {
  principalType: 'user',
  principalScopeHash: 'a'.repeat(sha256HexLength),
  httpMethod: 'POST',
  normalizedPath: '/api/v2/user-plants',
  operationId: 'createUserPlant',
  idempotencyKeyHash: 'b'.repeat(sha256HexLength)
} as const

/** 单次测试使用的规范化请求摘要。 */
const requestDigest = 'c'.repeat(sha256HexLength)

/** 创建一个可观察参数化 SQL、但不模拟 Repository 决策的执行器。 */
function createTestSqlExecutor(input: {
  readonly writeAffectedRows?: readonly number[]
  readonly queryResult?: readonly (readonly HttpIdempotencySqlRow[])[]
}) {
  const sqlRecord: Array<{
    readonly kind: 'write' | 'query'
    readonly transactionRef: string
    readonly sql: string
    readonly parameters: readonly unknown[]
  }> = []
  const writeAffectedRows = [...(input.writeAffectedRows ?? [])]
  const queryResult = [...(input.queryResult ?? [])]

  const executor: HttpIdempotencySqlExecutor<TestTransaction> = {
    async executeWrite(transaction, sql, parameters) {
      sqlRecord.push({
        kind: 'write',
        transactionRef: transaction.testRef,
        sql,
        parameters
      })
      return { affectedRows: writeAffectedRows.shift() ?? zero }
    },
    async executeQuery(transaction, sql, parameters) {
      sqlRecord.push({
        kind: 'query',
        transactionRef: transaction.testRef,
        sql,
        parameters
      })
      return queryResult.shift() ?? []
    }
  }

  return { executor, sqlRecord }
}

/** 生成与 MySQL 读回形状一致的处理中记录。 */
function createProcessingRow(requestHash = requestDigest): HttpIdempotencySqlRow {
  return {
    request_hash: requestHash,
    state: 'processing',
    response_status: null,
    response_json: null,
    response_hash: null,
    stable_error_type: null
  }
}

/** 生成带可验证公开响应摘要的完成记录。 */
function createCompletedRow(
  body: Readonly<Record<string, unknown>> = { data: { userPlantRef: 'upl_test' } },
  requestHash = requestDigest
): HttpIdempotencySqlRow {
  const responseJson = JSON.stringify(body)
  return {
    request_hash: requestHash,
    state: 'completed',
    response_status: Number('201'),
    response_json: responseJson,
    response_hash: createHash('sha256').update(responseJson).digest('hex'),
    stable_error_type: null
  }
}

/**
 * Expected 来源：`http-api/v1` 第 4 节、`008_foundation.sql` 与
 * `http.idempotency.retention_hours=168` 的已冻结策略。
 *
 * 测试层次：L3 / `unit_fake`。真实执行 MySQL Repository 的 SQL 生成、行映射和幂等决策，
 * 仅以可观察执行器替换数据库驱动；不替换被测 Repository。
 *
 * 明确未覆盖：真实 MySQL 唯一键竞争、连接池、提交结果未知、CloudBase 网络和业务 outbox。
 */
describe('共享 HTTP 幂等 MySQL Repository', () => {
  const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_http_idempotency' }

  test('唯一占位成功时只写不可逆摘要并允许执行领域命令', async () => {
    const { executor, sqlRecord } = createTestSqlExecutor({ writeAffectedRows: [one] })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(
      repository.tryReserve(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({ kind: 'reserved' })

    expect(sqlRecord).toHaveLength(one)
    expect(sqlRecord[zero]).toMatchObject({ kind: 'write', transactionRef: transaction.testRef })
    expect(sqlRecord[zero]?.sql).toContain('INSERT IGNORE INTO `http_idempotency_records`')
    expect(sqlRecord[zero]?.sql).not.toMatch(/wechat_openid|douyin_openid|xiaohongshu_openid/iu)
    expect(sqlRecord[zero]?.sql).not.toMatch(/authorization|cookie|access_token/iu)
    expect(sqlRecord[zero]?.parameters).toEqual([
      idempotencyScope.principalType,
      idempotencyScope.principalScopeHash,
      idempotencyScope.httpMethod,
      idempotencyScope.normalizedPath,
      idempotencyScope.operationId,
      idempotencyScope.idempotencyKeyHash,
      requestDigest,
      Number('605801000'),
      Number('1000'),
      Number('1000')
    ])
  })

  test('同键同参已完成时原样重放首次公开结果且不再占位', async () => {
    const { executor, sqlRecord } = createTestSqlExecutor({
      writeAffectedRows: [zero],
      queryResult: [[createCompletedRow()]]
    })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(
      repository.tryReserve(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({
      kind: 'replay',
      response: { status: Number('201'), body: { data: { userPlantRef: 'upl_test' } } }
    })

    expect(sqlRecord.map(item => item.kind)).toEqual(['write', 'query'])
    expect(sqlRecord[one]?.sql).toContain('FROM `http_idempotency_records`')
    expect(sqlRecord[one]?.sql).toContain('FOR UPDATE')
  })

  test('同键异参时返回稳定冲突并禁止领域命令继续执行', async () => {
    const { executor } = createTestSqlExecutor({
      writeAffectedRows: [zero],
      queryResult: [[createProcessingRow('d'.repeat(sha256HexLength))]]
    })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(
      repository.tryReserve(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({
      kind: 'conflict',
      errorType: 'IDEMPOTENCY_CONFLICT',
      httpStatus: Number('409')
    })
  })

  test('同键同参仍处理中时只等待获胜者，不重复执行领域命令', async () => {
    const { executor } = createTestSqlExecutor({
      writeAffectedRows: [zero],
      queryResult: [[createProcessingRow()]]
    })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(
      repository.tryReserve(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({ kind: 'wait_for_winner' })
  })

  test('完成首次请求时在同一事务写入脱敏响应及其摘要', async () => {
    const { executor, sqlRecord } = createTestSqlExecutor({ writeAffectedRows: [one] })
    const repository = createMysqlHttpIdempotencyRepository(executor)
    const response = {
      status: Number('201'),
      body: { data: { lifecycle: 'active', userPlantRef: 'upl_test' } }
    } as const

    await expect(
      repository.completionFirstResult(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        response,
        completedAtMs: Number('2000')
      })
    ).resolves.toEqual({ kind: 'completed', response })

    expect(sqlRecord).toHaveLength(one)
    expect(sqlRecord[zero]).toMatchObject({ kind: 'write', transactionRef: transaction.testRef })
    expect(sqlRecord[zero]?.sql).toContain("SET `state` = 'completed'")
    expect(sqlRecord[zero]?.sql).toContain("AND `state` = 'processing'")
    expect(sqlRecord[zero]?.sql).toContain('AND `request_hash` = ?')
    const responseJson = JSON.stringify(response.body)
    expect(sqlRecord[zero]?.parameters).toContain(responseJson)
    expect(sqlRecord[zero]?.parameters).toContain(
      createHash('sha256').update(responseJson).digest('hex')
    )
  })

  test('完成态读回的响应摘要不匹配时失败关闭，不返回被篡改响应', async () => {
    const corruptedRow = { ...createCompletedRow(), response_hash: 'f'.repeat(sha256HexLength) }
    const { executor } = createTestSqlExecutor({ queryResult: [[corruptedRow]] })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(repository.read(transaction, idempotencyScope)).rejects.toBeInstanceOf(HttpIdempotencyDataCorruptedError)
  })

  test('占位冲突后却读不到获胜记录时失败关闭，不把一致性故障当成首次请求', async () => {
    const { executor } = createTestSqlExecutor({
      writeAffectedRows: [zero],
      queryResult: [[]]
    })
    const repository = createMysqlHttpIdempotencyRepository(executor)

    await expect(
      repository.tryReserve(transaction, {
        ...idempotencyScope,
        requestHash: requestDigest,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).rejects.toBeInstanceOf(HttpIdempotencyDataCorruptedError)
  })

  test('提交未知只读 Repository 使用无事务新连接且绝不申请 FOR UPDATE', async () => {
    const sqlRecord: Array<{ readonly sql: string; readonly parameters: readonly unknown[] }> = []
    const executor: HttpIdempotencyReadOnlySqlExecutor = {
      async executeQuery(sql, parameters) {
        sqlRecord.push({ sql, parameters })
        return [createCompletedRow()]
      }
    }
    const repository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(executor)

    await expect(repository.read(idempotencyScope)).resolves.toEqual({
      requestHash: requestDigest,
      state: 'completed',
      response: { status: Number('201'), body: { data: { userPlantRef: 'upl_test' } } }
    })
    expect(sqlRecord).toHaveLength(one)
    expect(sqlRecord[zero]?.sql).toContain('FROM `http_idempotency_records`')
    expect(sqlRecord[zero]?.sql).not.toContain('FOR UPDATE')
    expect(sqlRecord[zero]?.parameters).toEqual([
      idempotencyScope.principalType,
      idempotencyScope.principalScopeHash,
      idempotencyScope.httpMethod,
      idempotencyScope.normalizedPath,
      idempotencyScope.operationId,
      idempotencyScope.idempotencyKeyHash
    ])
  })
})
