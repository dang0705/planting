import { describe, expect, test, vi } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import {
  createMysqlPlatformIdentityBindingRepository,
  type PlatformIdentitySqlExecutor,
  type PlatformIdentitySqlRow
} from '../../src/identity/repository/mysql-platform-identity-binding-repository.js'

type TestTransaction = {
  /** 证明所有身份写入复用调用方事务。 */
  readonly transactionContext: true
  /** 测试事务稳定引用。 */
  readonly ref: string
}

const transaction: TestTransaction = { transactionContext: true, ref: 'tx_identity_binding' }
const occurredAtMs = Date.parse('2026-09-20T05:00:00.000Z')

/** 构造可观察 SQL 执行器。 */
function createExecutor(
  rows: readonly (readonly PlatformIdentitySqlRow[])[],
  writeFailure?: unknown
) {
  let queryIndex = Number('0')
  const calls: Array<{
    readonly kind: 'query' | 'write'
    readonly sql: string
    readonly parameters: readonly unknown[]
  }> = []
  const executor: PlatformIdentitySqlExecutor<TestTransaction> = {
    executeQuery: vi.fn(async (_transaction, sql: string, parameters: readonly unknown[]) => {
      calls.push({ kind: 'query' as const, sql, parameters })
      const result = rows[queryIndex] ?? []
      queryIndex += Number('1')
      return result
    }),
    executeWrite: vi.fn(async (_transaction, sql: string, parameters: readonly unknown[]) => {
      calls.push({ kind: 'write' as const, sql, parameters })
      if (writeFailure !== undefined) {
        throw writeFailure
      }
      return { affectedRows: Number('1') }
    })
  }
  return {
    calls,
    executor
  }
}

const bindInput = {
  userRef: 'usr_identity_binding_001' as UserRef,
  platform: 'wechat' as const,
  appScope: 'wx-app-qhz',
  platformSubjectHash: 'a'.repeat(Number('64')),
  subjectHashKeyVersion: 'identity-hmac.2026-09-20.1',
  platformSubjectCiphertext: 'secret-manager-ciphertext-ref',
  occurredAtMs
}

/**
 * Expected 来源：`principal-capability/v1` 平台绑定、恢复、冲突和最后入口保护合同。
 * 测试层次：L2 / `unit_fake`；替换参数化 SQL 执行器，验证锁顺序与状态写入。
 * 明确未覆盖：真实唯一键竞争、事务提交、平台 Provider、HTTP 幂等与 CloudBase。
 */
describe('平台身份绑定 MySQL Repository', () => {
  test('新主体按用户→主体→active 槽位固定顺序加锁后创建绑定', async () => {
    const testDouble = createExecutor([
      [{ kind: 'user', user_internal_id: '11', session_version: '3' }],
      [],
      []
    ])
    const repository = createMysqlPlatformIdentityBindingRepository(testDouble.executor)

    await expect(repository.bindOrRestore(transaction, bindInput)).resolves.toEqual({
      kind: 'created',
      platform: 'wechat',
      appScope: 'wx-app-qhz'
    })
    expect(testDouble.calls.map(call => call.kind)).toEqual(['query', 'query', 'query', 'write'])
    expect(testDouble.calls[Number('0')]?.sql).toContain('FROM `users`')
    expect(testDouble.calls[Number('1')]?.sql).toContain('`platform_subject_hash` = ?')
    expect(testDouble.calls[Number('1')]?.sql).not.toContain('FOR UPDATE')
    expect(testDouble.calls[Number('2')]?.sql).toContain('`active_slot` = 1')
    expect(testDouble.calls[Number('3')]?.sql).toContain('INSERT INTO `platform_identities`')
  })

  test('同一用户已撤销主体在 active 槽位空闲时恢复，既有 active 则安全重放', async () => {
    const revokedRow = {
      kind: 'binding' as const,
      binding_internal_id: '21',
      owner_internal_id: '11',
      platform: 'wechat' as const,
      app_scope: 'wx-app-qhz',
      platform_subject_hash: bindInput.platformSubjectHash,
      subject_hash_key_version: bindInput.subjectHashKeyVersion,
      binding_status: 'revoked' as const
    }
    const restoreDouble = createExecutor([
      [{ kind: 'user', user_internal_id: '11', session_version: '3' }],
      [revokedRow],
      [revokedRow],
      []
    ])
    const replayDouble = createExecutor([
      [{ kind: 'user', user_internal_id: '11', session_version: '3' }],
      [{ ...revokedRow, binding_status: 'active' as const }],
      [{ ...revokedRow, binding_status: 'active' as const }],
      [{ ...revokedRow, binding_status: 'active' as const }]
    ])

    await expect(
      createMysqlPlatformIdentityBindingRepository(restoreDouble.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).resolves.toMatchObject({ kind: 'restored' })
    expect(restoreDouble.calls[Number('2')]?.sql).toContain('WHERE `id` = ? FOR UPDATE')
    expect(restoreDouble.calls.at(Number('-1'))?.sql).toContain("`binding_status` = 'active'")
    await expect(
      createMysqlPlatformIdentityBindingRepository(replayDouble.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).resolves.toMatchObject({ kind: 'replayed' })
    expect(replayDouble.calls).toHaveLength(Number('4'))
  })

  test('主体属于其他用户或 active 槽位已有另一主体时拒绝静默转绑', async () => {
    const otherBinding = {
      kind: 'binding' as const,
      binding_internal_id: '22',
      owner_internal_id: '99',
      platform: 'wechat' as const,
      app_scope: 'wx-app-qhz',
      platform_subject_hash: bindInput.platformSubjectHash,
      subject_hash_key_version: bindInput.subjectHashKeyVersion,
      binding_status: 'active' as const
    }
    const ownedSlot = { ...otherBinding, binding_internal_id: '23', owner_internal_id: '11' }
    const crossUser = createExecutor([
      [{ kind: 'user', user_internal_id: '11', session_version: '3' }],
      [otherBinding],
      [otherBinding]
    ])
    const slotConflict = createExecutor([
      [{ kind: 'user', user_internal_id: '11', session_version: '3' }],
      [],
      [ownedSlot]
    ])

    await expect(
      createMysqlPlatformIdentityBindingRepository(crossUser.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).rejects.toMatchObject({ type: 'IDENTITY_BINDING_CONFLICT' })
    await expect(
      createMysqlPlatformIdentityBindingRepository(slotConflict.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).rejects.toMatchObject({ type: 'IDENTITY_BINDING_CONFLICT' })
  })

  test('只把 MySQL 唯一键冲突转换为绑定冲突，不把死锁伪装成 409', async () => {
    const userRow = { kind: 'user' as const, user_internal_id: '11', session_version: '3' }
    const emptySubjectRows = [[userRow], [], []] as const
    const duplicateError = Object.assign(new Error('duplicate key'), {
      code: 'ER_DUP_ENTRY',
      errno: 1062
    })
    const deadlockError = Object.assign(new Error('deadlock'), {
      code: 'ER_LOCK_DEADLOCK',
      errno: 1213
    })
    const duplicateExecutor = createExecutor(emptySubjectRows, duplicateError)
    const deadlockExecutor = createExecutor(emptySubjectRows, deadlockError)

    await expect(
      createMysqlPlatformIdentityBindingRepository(duplicateExecutor.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).rejects.toMatchObject({ type: 'IDENTITY_BINDING_CONFLICT' })
    await expect(
      createMysqlPlatformIdentityBindingRepository(deadlockExecutor.executor).bindOrRestore(
        transaction,
        bindInput
      )
    ).rejects.toBe(deadlockError)
  })

  test('解绑拒绝删除最后入口，否则原子撤销绑定、递增版本并失效全部会话', async () => {
    const userRow = { kind: 'user' as const, user_internal_id: '11', session_version: '3' }
    const target = {
      kind: 'binding' as const,
      binding_internal_id: '21',
      owner_internal_id: '11',
      platform: 'wechat' as const,
      app_scope: 'wx-app-qhz',
      platform_subject_hash: bindInput.platformSubjectHash,
      subject_hash_key_version: bindInput.subjectHashKeyVersion,
      binding_status: 'active' as const
    }
    const other = { ...target, binding_internal_id: '22', platform: 'phone' as const }
    const lastEntry = createExecutor([[userRow], [target]])
    const removable = createExecutor([[userRow], [target, other]])
    const input = {
      userRef: bindInput.userRef,
      platform: bindInput.platform,
      appScope: bindInput.appScope,
      occurredAtMs
    }

    await expect(
      createMysqlPlatformIdentityBindingRepository(lastEntry.executor).revoke(transaction, input)
    ).rejects.toMatchObject({ type: 'IDENTITY_LAST_BINDING_REQUIRED' })
    await expect(
      createMysqlPlatformIdentityBindingRepository(removable.executor).revoke(transaction, input)
    ).resolves.toEqual({
      platform: 'wechat',
      appScope: 'wx-app-qhz',
      nextSessionVersion: 4
    })
    const writes = removable.calls.filter(call => call.kind === 'write')
    expect(writes).toHaveLength(Number('4'))
    expect(writes[Number('0')]?.sql).toContain("`binding_status` = 'revoked'")
    expect(writes[Number('1')]?.sql).toContain("`status` = 'expired'")
    expect(writes[Number('2')]?.sql).toContain("`status` = 'revoked'")
    expect(writes[Number('3')]?.sql).toContain('`session_version` = `session_version` + 1')
  })
})
