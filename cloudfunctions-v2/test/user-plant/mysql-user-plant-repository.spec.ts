import { describe, expect, test } from 'vitest'

import type { UserPlantRef, UserRef } from '../../src/contracts/types.js'
import type { 事务执行上下文 } from '../../src/foundation/database/transaction-runner.js'
import {
  用户植物持久化错误,
  创建MySQL用户植物Repository,
  type 用户植物SQL执行器,
  type 用户植物SQL行
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'

const 零 = Number('0')
const 一 = Number('1')
const 当前用户 = 'usr_userplant_repo_001' as UserRef
const 当前植物 = 'upl_userplant_repo_001' as UserPlantRef

/** 测试事务只携带可观察引用，不暴露真实数据库连接。 */
type 测试事务 = 事务执行上下文 & {
  /** 用于断言所有 SQL 都复用调用方传入的同一事务。 */
  readonly testRef: string
}

/** 创建可观察 SQL 顺序与参数、但不复制 Repository 决策的受控执行器。 */
function 创建测试执行器(输入: {
  /** 每次参数化查询依次返回的数据库行。 */
  readonly 查询结果?: readonly (readonly 用户植物SQL行[])[]
  /** 每次参数化写入依次返回的影响行数。 */
  readonly 写入结果?: readonly number[]
}) {
  const SQL记录: Array<{
    /** 本次调用是查询还是写入。 */
    readonly kind: 'query' | 'write'
    /** 事务可观察引用。 */
    readonly transactionRef: string
    /** Repository 生成的参数化 SQL。 */
    readonly sql: string
    /** 与占位符顺序一致的参数。 */
    readonly parameters: readonly unknown[]
  }> = []
  const 查询结果 = [...(输入.查询结果 ?? [])]
  const 写入结果 = [...(输入.写入结果 ?? [])]
  const 执行器: 用户植物SQL执行器<测试事务> = {
    async 执行查询(事务, sql, parameters) {
      SQL记录.push({ kind: 'query', transactionRef: 事务.testRef, sql, parameters })
      return 查询结果.shift() ?? []
    },
    async 执行写入(事务, sql, parameters) {
      SQL记录.push({ kind: 'write', transactionRef: 事务.testRef, sql, parameters })
      return { affectedRows: 写入结果.shift() ?? 零 }
    }
  }
  return { 执行器, SQL记录 }
}

/**
 * Expected 来源：`user-plant/v1`、`001_identity.sql`、`003_user_plant.sql`。
 * 测试层次：L3 / `unit_fake`；真实执行 Repository 的 SQL 顺序、参数和行映射，数据库驱动被替换。
 * 明确未覆盖：MySQL 行锁、外键、并发、提交结果未知、CloudBase 网络与 HTTP。
 */
describe('用户植物 MySQL Repository', () => {
  const 事务: 测试事务 = { transactionContext: true, testRef: 'tx_user_plant_create' }

  test('先锁定统一用户行再统计 active 植物，形成并发数量上限的串行化入口', async () => {
    const { 执行器, SQL记录 } = 创建测试执行器({
      查询结果: [
        [{ kind: 'user', user_internal_id: '41', user_status: 'active' }],
        [{ kind: 'count', active_count: '2' }]
      ]
    })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(repository.锁定用户并统计Active数量(事务, 当前用户)).resolves.toEqual({
      userInternalId: '41',
      activeCount: 2
    })

    expect(SQL记录.map((记录) => 记录.kind)).toEqual(['query', 'query'])
    expect(SQL记录[零]?.sql).toContain('FROM `users`')
    expect(SQL记录[零]?.sql).toContain('FOR UPDATE')
    expect(SQL记录[零]?.parameters).toEqual([当前用户])
    expect(SQL记录[一]?.sql).toContain('FROM `user_plants`')
    expect(SQL记录[一]?.sql).toContain("`lifecycle_status` = 'active'")
    expect(SQL记录[一]?.parameters).toEqual(['41'])
    expect(SQL记录.every((记录) => 记录.transactionRef === 事务.testRef)).toBe(true)
  })

  test('用户已暂停时在持有用户行锁后拒绝，不继续读取植物数量', async () => {
    const { 执行器, SQL记录 } = 创建测试执行器({
      查询结果: [[{ kind: 'user', user_internal_id: '41', user_status: 'suspended' }]]
    })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(repository.锁定用户并统计Active数量(事务, 当前用户)).rejects.toMatchObject({
      type: 'PRINCIPAL_INVALID'
    })
    expect(SQL记录).toHaveLength(一)
  })

  test('插入时只写内部归属、公开引用和固定初态', async () => {
    const { 执行器, SQL记录 } = 创建测试执行器({ 写入结果: [一] })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(
      repository.插入暂未识别用户植物(事务, {
        userInternalId: '41',
        userPlantRef: 当前植物,
        occurredAtMs: Number('1000')
      })
    ).resolves.toBeUndefined()

    expect(SQL记录[零]?.sql).toContain('INSERT INTO `user_plants`')
    expect(SQL记录[零]?.sql).toContain("'active'")
    expect(SQL记录[零]?.sql).toContain("'unidentified'")
    expect(SQL记录[零]?.parameters).toEqual([当前植物, '41', Number('1000'), Number('1000')])
    expect(SQL记录[零]?.sql).not.toMatch(/openid|platform_subject|session_ref/iu)
  })

  test('插入没有恰好影响一行时失败关闭', async () => {
    const { 执行器 } = 创建测试执行器({ 写入结果: [零] })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(
      repository.插入暂未识别用户植物(事务, {
        userInternalId: '41',
        userPlantRef: 当前植物,
        occurredAtMs: Number('1000')
      })
    ).rejects.toBeInstanceOf(用户植物持久化错误)
  })

  test('按统一用户和植物公开引用读回脱敏创建投影', async () => {
    const { 执行器, SQL记录 } = 创建测试执行器({
      查询结果: [
        [
          {
            kind: 'plant',
            public_user_plant_id: 当前植物,
            lifecycle_status: 'active',
            current_identity_status: 'unidentified',
            version: '1',
            created_at_ms: '1000',
            updated_at_ms: '1000'
          }
        ]
      ]
    })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(repository.读取创建初始投影(事务, 当前用户, 当前植物)).resolves.toEqual({
      user_plant_id: 当前植物,
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: 1,
      createdAt: '1970-01-01T00:00:01.000Z',
      updatedAt: '1970-01-01T00:00:01.000Z'
    })
    expect(SQL记录[零]?.sql).toContain('JOIN `users`')
    expect(SQL记录[零]?.parameters).toEqual([当前用户, 当前植物])
  })

  test('读回损坏版本或时间时失败关闭，不返回部分投影', async () => {
    const { 执行器 } = 创建测试执行器({
      查询结果: [
        [
          {
            kind: 'plant',
            public_user_plant_id: 当前植物,
            lifecycle_status: 'active',
            current_identity_status: 'unidentified',
            version: '0',
            created_at_ms: '1000',
            updated_at_ms: '999'
          }
        ]
      ]
    })
    const repository = 创建MySQL用户植物Repository(执行器)

    await expect(repository.读取创建初始投影(事务, 当前用户, 当前植物)).rejects.toMatchObject({
      type: 'INTERNAL_DATA_INVALID'
    })
  })
})
