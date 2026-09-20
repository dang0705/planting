import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import {
  HTTP幂等数据损坏错误,
  创建MySQLHTTP幂等Repository,
  type HTTP幂等SQL执行器,
  type HTTP幂等SQL行
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { 事务执行上下文 } from '../../src/foundation/database/transaction-runner.js'

/** SHA-256 十六进制摘要的固定字符数。 */
const SHA256十六进制长度 = Number('64')

/** 测试中的零计数和首元素下标。 */
const 零 = Number('0')

/** 测试中的单次写入计数和第二元素下标基数。 */
const 一 = Number('1')

/** 测试事务只提供可辨认引用，不暴露真实数据库连接。 */
type 测试事务 = 事务执行上下文 & {
  /** 用于证明所有 SQL 都在调用方传入的同一事务中执行。 */
  readonly testRef: string
}

/** 单次测试使用的固定幂等作用域。 */
const 幂等作用域 = {
  principalType: 'user',
  principalScopeHash: 'a'.repeat(SHA256十六进制长度),
  httpMethod: 'POST',
  normalizedPath: '/api/v2/user-plants',
  operationId: 'createUserPlant',
  idempotencyKeyHash: 'b'.repeat(SHA256十六进制长度)
} as const

/** 单次测试使用的规范化请求摘要。 */
const 请求摘要 = 'c'.repeat(SHA256十六进制长度)

/** 创建一个可观察参数化 SQL、但不模拟 Repository 决策的执行器。 */
function 创建测试SQL执行器(输入: {
  readonly 写入影响行数?: readonly number[]
  readonly 查询结果?: readonly (readonly HTTP幂等SQL行[])[]
}) {
  const SQL记录: Array<{
    readonly kind: 'write' | 'query'
    readonly transactionRef: string
    readonly sql: string
    readonly parameters: readonly unknown[]
  }> = []
  const 写入影响行数 = [...(输入.写入影响行数 ?? [])]
  const 查询结果 = [...(输入.查询结果 ?? [])]

  const 执行器: HTTP幂等SQL执行器<测试事务> = {
    async 执行写入(事务, sql, parameters) {
      SQL记录.push({
        kind: 'write',
        transactionRef: 事务.testRef,
        sql,
        parameters
      })
      return { affectedRows: 写入影响行数.shift() ?? 零 }
    },
    async 执行查询(事务, sql, parameters) {
      SQL记录.push({
        kind: 'query',
        transactionRef: 事务.testRef,
        sql,
        parameters
      })
      return 查询结果.shift() ?? []
    }
  }

  return { 执行器, SQL记录 }
}

/** 生成与 MySQL 读回形状一致的处理中记录。 */
function 创建处理中行(requestHash = 请求摘要): HTTP幂等SQL行 {
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
function 创建已完成行(
  body: Readonly<Record<string, unknown>> = { data: { userPlantRef: 'upl_test' } },
  requestHash = 请求摘要
): HTTP幂等SQL行 {
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
  const 事务: 测试事务 = { transactionContext: true, testRef: 'tx_http_idempotency' }

  test('唯一占位成功时只写不可逆摘要并允许执行领域命令', async () => {
    const { 执行器, SQL记录 } = 创建测试SQL执行器({ 写入影响行数: [一] })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(
      repository.尝试占位(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({ kind: 'reserved' })

    expect(SQL记录).toHaveLength(一)
    expect(SQL记录[零]).toMatchObject({ kind: 'write', transactionRef: 事务.testRef })
    expect(SQL记录[零]?.sql).toContain('INSERT IGNORE INTO `http_idempotency_records`')
    expect(SQL记录[零]?.sql).not.toMatch(/wechat_openid|douyin_openid|xiaohongshu_openid/iu)
    expect(SQL记录[零]?.sql).not.toMatch(/authorization|cookie|access_token/iu)
    expect(SQL记录[零]?.parameters).toEqual([
      幂等作用域.principalType,
      幂等作用域.principalScopeHash,
      幂等作用域.httpMethod,
      幂等作用域.normalizedPath,
      幂等作用域.operationId,
      幂等作用域.idempotencyKeyHash,
      请求摘要,
      Number('605801000'),
      Number('1000'),
      Number('1000')
    ])
  })

  test('同键同参已完成时原样重放首次公开结果且不再占位', async () => {
    const { 执行器, SQL记录 } = 创建测试SQL执行器({
      写入影响行数: [零],
      查询结果: [[创建已完成行()]]
    })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(
      repository.尝试占位(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({
      kind: 'replay',
      response: { status: Number('201'), body: { data: { userPlantRef: 'upl_test' } } }
    })

    expect(SQL记录.map(item => item.kind)).toEqual(['write', 'query'])
    expect(SQL记录[一]?.sql).toContain('FROM `http_idempotency_records`')
    expect(SQL记录[一]?.sql).toContain('FOR UPDATE')
  })

  test('同键异参时返回稳定冲突并禁止领域命令继续执行', async () => {
    const { 执行器 } = 创建测试SQL执行器({
      写入影响行数: [零],
      查询结果: [[创建处理中行('d'.repeat(SHA256十六进制长度))]]
    })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(
      repository.尝试占位(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
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
    const { 执行器 } = 创建测试SQL执行器({
      写入影响行数: [零],
      查询结果: [[创建处理中行()]]
    })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(
      repository.尝试占位(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).resolves.toEqual({ kind: 'wait_for_winner' })
  })

  test('完成首次请求时在同一事务写入脱敏响应及其摘要', async () => {
    const { 执行器, SQL记录 } = 创建测试SQL执行器({ 写入影响行数: [一] })
    const repository = 创建MySQLHTTP幂等Repository(执行器)
    const response = {
      status: Number('201'),
      body: { data: { lifecycle: 'active', userPlantRef: 'upl_test' } }
    } as const

    await expect(
      repository.完成首次结果(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
        response,
        completedAtMs: Number('2000')
      })
    ).resolves.toEqual({ kind: 'completed', response })

    expect(SQL记录).toHaveLength(一)
    expect(SQL记录[零]).toMatchObject({ kind: 'write', transactionRef: 事务.testRef })
    expect(SQL记录[零]?.sql).toContain("SET `state` = 'completed'")
    expect(SQL记录[零]?.sql).toContain("AND `state` = 'processing'")
    expect(SQL记录[零]?.sql).toContain('AND `request_hash` = ?')
    const responseJson = JSON.stringify(response.body)
    expect(SQL记录[零]?.parameters).toContain(responseJson)
    expect(SQL记录[零]?.parameters).toContain(
      createHash('sha256').update(responseJson).digest('hex')
    )
  })

  test('完成态读回的响应摘要不匹配时失败关闭，不返回被篡改响应', async () => {
    const 损坏行 = { ...创建已完成行(), response_hash: 'f'.repeat(SHA256十六进制长度) }
    const { 执行器 } = 创建测试SQL执行器({ 查询结果: [[损坏行]] })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(repository.读取(事务, 幂等作用域)).rejects.toBeInstanceOf(HTTP幂等数据损坏错误)
  })

  test('占位冲突后却读不到获胜记录时失败关闭，不把一致性故障当成首次请求', async () => {
    const { 执行器 } = 创建测试SQL执行器({
      写入影响行数: [零],
      查询结果: [[]]
    })
    const repository = 创建MySQLHTTP幂等Repository(执行器)

    await expect(
      repository.尝试占位(事务, {
        ...幂等作用域,
        requestHash: 请求摘要,
        createdAtMs: Number('1000'),
        expiresAtMs: Number('605801000')
      })
    ).rejects.toBeInstanceOf(HTTP幂等数据损坏错误)
  })
})
