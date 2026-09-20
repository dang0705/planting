import { describe, expect, test } from 'vitest'

import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlAiQuotaExpiryRepository,
  type AiQuotaExpirySqlExecutor,
  type ExpiredAiQuotaReservationSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-expiry-repository.js'

type TestTransaction = TransactionExecutionContext & {
  /** 用于证明全部 SQL 复用调用方事务。 */
  readonly testRef: string
}

type SqlRecord = {
  /** SQL 操作类别。 */
  readonly kind: 'query' | 'write'
  /** 参数化 SQL 文本。 */
  readonly sql: string
  /** 参数化值快照。 */
  readonly parameters: readonly unknown[]
  /** 当前事务测试引用。 */
  readonly transactionRef: string
}

const zero = Number('0')
const one = Number('1')
const batchLimit = Number('20')
const nowMs = Number('1758376800000')
const transaction: TestTransaction = { transactionContext: true, testRef: 'tx_expiry' }

/** 构造可观察的 TTL 扫描 SQL 执行器。 */
function createExecutor(options: {
  /** 查询返回的受控行。 */
  readonly rows?: readonly ExpiredAiQuotaReservationSqlRow[]
  /** 更新返回的影响行数。 */
  readonly affectedRows?: number
}) {
  const records: SqlRecord[] = []
  const executor: AiQuotaExpirySqlExecutor<TestTransaction> = {
    executeQuery: async (received, sql, parameters) => {
      records.push({ kind: 'query', sql, parameters, transactionRef: received.testRef })
      return options.rows ?? []
    },
    executeWrite: async (received, sql, parameters) => {
      records.push({ kind: 'write', sql, parameters, transactionRef: received.testRef })
      return { affectedRows: options.affectedRows ?? one }
    }
  }
  return { executor, records }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的 TTL 到期只转待对账、禁止自动释放规则。
 * 测试层次：L2 / `unit_fake`；替换参数化 SQL 驱动，执行真实 Repository 校验与写入编排。
 * 明确未覆盖：真实 MySQL 的行锁并发、任务调度、CloudBase 与供应商最终证据。
 */
describe('AI 额度预占 TTL MySQL Repository', () => {
  test('按到期时间与内部主键稳定锁定，并使用跳过已锁行避免并发重复领取', async () => {
    const { executor, records } = createExecutor({
      rows: [
        {
          reservation_internal_id: '91',
          reservation_ref: 'aqr_expired_001',
          reservation_status: 'reserved',
          expires_at_ms: String(nowMs),
          reservation_version: '1'
        }
      ]
    })
    const repository = createMysqlAiQuotaExpiryRepository(executor)

    await expect(
      repository.lockExpiredReservations(transaction, { occurredAtMs: nowMs, batchLimit })
    ).resolves.toEqual([
      {
        reservationInternalId: '91',
        reservationRef: 'aqr_expired_001',
        status: 'reserved',
        expiresAtMs: nowMs,
        reservationVersion: 1
      }
    ])
    expect(records[zero]?.sql).toContain("`status` = 'reserved'")
    expect(records[zero]?.sql).toContain('`expires_at_ms` <= ?')
    expect(records[zero]?.sql).toContain('ORDER BY `expires_at_ms`, `id`')
    expect(records[zero]?.sql).toContain(`LIMIT ${String(batchLimit)}`)
    expect(records[zero]?.sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(records[zero]?.parameters).toEqual([nowMs])
  })

  test('TTL 到期只写待对账状态和原因，不释放额度或写账本', async () => {
    const { executor, records } = createExecutor({})
    const repository = createMysqlAiQuotaExpiryRepository(executor)

    await expect(
      repository.markPendingReconciliation(transaction, {
        reservationInternalId: '91',
        reservationRef: 'aqr_expired_001',
        status: 'reserved',
        expiresAtMs: nowMs,
        reservationVersion: 1,
        occurredAtMs: nowMs
      })
    ).resolves.toBeUndefined()
    expect(records).toHaveLength(one)
    expect(records[zero]?.sql).toContain("`status` = 'pending_reconciliation'")
    expect(records[zero]?.sql).toContain("`reconciliation_reason` = 'reservation_ttl_expired'")
    expect(records[zero]?.sql).not.toContain('ai_quota_grants')
    expect(records[zero]?.sql).not.toContain('ai_quota_reservation_allocations')
    expect(records[zero]?.sql).not.toContain('ai_quota_ledger')
    expect(records[zero]?.parameters).toEqual([nowMs, '91', 'aqr_expired_001', one, nowMs])
  })

  test('非法扫描参数、重复引用和乐观锁冲突均失败关闭', async () => {
    const duplicateRow: ExpiredAiQuotaReservationSqlRow = {
      reservation_internal_id: '91',
      reservation_ref: 'aqr_expired_001',
      reservation_status: 'reserved',
      expires_at_ms: String(nowMs),
      reservation_version: '1'
    }
    const duplicate = createExecutor({ rows: [duplicateRow, duplicateRow] })
    const duplicateRepository = createMysqlAiQuotaExpiryRepository(duplicate.executor)
    await expect(
      duplicateRepository.lockExpiredReservations(transaction, {
        occurredAtMs: nowMs,
        batchLimit: 2
      })
    ).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })

    const conflict = createExecutor({ affectedRows: zero })
    const conflictRepository = createMysqlAiQuotaExpiryRepository(conflict.executor)
    await expect(
      conflictRepository.markPendingReconciliation(transaction, {
        reservationInternalId: '91',
        reservationRef: 'aqr_expired_001',
        status: 'reserved',
        expiresAtMs: nowMs,
        reservationVersion: 1,
        occurredAtMs: nowMs
      })
    ).rejects.toMatchObject({ type: 'WRITE_CONFLICT' })
  })
})
