import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  createPool,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket
} from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { UserRef } from '../../src/contracts/types.js'
import type {
  DatabaseTransactionDriver,
  TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createReserveAiQuotaUseCase } from '../../src/subscription/application/reserve-ai-quota.js'
import { createResolvePendingAiQuotaUseCase } from '../../src/subscription/application/resolve-pending-ai-quota.js'
import { createScanExpiredAiQuotaReservationsUseCase } from '../../src/subscription/application/scan-expired-ai-quota-reservations.js'
import { createSettleAiQuotaUseCase } from '../../src/subscription/application/settle-ai-quota.js'
import type {
  AiQuotaExpirySqlExecutor,
  AiQuotaExpirySqlWriteResult,
  ExpiredAiQuotaReservationSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-expiry-repository.js'
import { createMysqlAiQuotaExpiryRepository } from '../../src/subscription/repository/mysql-ai-quota-expiry-repository.js'
import type {
  AiQuotaReservationSqlExecutor,
  AiQuotaReservationSqlRow,
  AiQuotaReservationSqlWriteResult
} from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import { createMysqlAiQuotaReservationRepository } from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import type {
  AiQuotaSettlementSqlExecutor,
  AiQuotaSettlementSqlRow,
  AiQuotaSettlementSqlWriteResult
} from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'
import { createMysqlAiQuotaSettlementRepository } from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'
import { findProjectRoot } from '../support/project-root.js'
import {
  expectPendingReconciliationState,
  expectReservedQuotaState,
  expectResolvedPendingState,
  expectSettledQuotaState
} from '../support/subscription-quota-mysql-assertions.js'

const PROJECT_ROOT = findProjectRoot()
const MYSQL_IMAGE = 'mysql:8.4'
const DATABASE_NAME = 'qinghuazhi_v2_subscription_reservation'
const CONTAINER_NAME = `qhz-v2-reservation-${String(process.pid)}`
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const nowMs = Number('1758376800000')

/** 真实 MySQL 连接承载的事务上下文；连接只在本测试适配器内部可见。 */
type MysqlTestTransaction = TransactionExecutionContext & {
  /** 当前事务独占的真实 MySQL 连接。 */
  readonly connection: PoolConnection
}

let pool: Pool

/** 执行 Docker CLI；任何非零退出都保留原始输出并使测试失败。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`Docker command failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 等待指定毫秒数，仅用于有界轮询 MySQL 就绪状态。 */
function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/** 以真实查询确认 MySQL 已接受业务连接，避免把容器运行误判为数据库就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < MYSQL_READY_ATTEMPTS; attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        CONTAINER_NAME,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === Number('0') && result.stdout.trim() === '3306') {
      return
    }
    await wait(MYSQL_READY_INTERVAL_MS)
  }
  throw new Error('MySQL container did not become ready within the bounded wait')
}

/** 创建隔离数据库并按最小依赖顺序应用 v2 真实 DDL。 */
function applySchema(): void {
  runDocker([
    'exec',
    CONTAINER_NAME,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${DATABASE_NAME}\`;`
  ])
  for (const fileName of ['001_identity.sql', '007_configuration.sql', '005_subscription.sql']) {
    const sql = fs.readFileSync(path.join(PROJECT_ROOT, 'docs/backend-v2/schema', fileName), 'utf8')
    runDocker(
      ['exec', '-i', CONTAINER_NAME, 'mysql', '--no-defaults', '-uroot', DATABASE_NAME],
      sql
    )
  }
}

/** 读取 Docker 随机映射的本机端口，避免测试占用固定端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', CONTAINER_NAME, '3306/tcp'])
  const portText = output.split(':').at(Number('-1'))
  const port = Number(portText)
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/** 使用同一连接实现真实事务生命周期，并在终态释放连接。 */
function createTransactionDriver(): DatabaseTransactionDriver<MysqlTestTransaction> {
  return {
    beginTransaction: async () => {
      const connection = await pool.getConnection()
      await connection.beginTransaction()
      return { transactionContext: true, connection }
    },
    commitTransaction: async transaction => {
      try {
        await transaction.connection.commit()
      } finally {
        transaction.connection.release()
      }
    },
    rollbackTransaction: async transaction => {
      try {
        await transaction.connection.rollback()
      } finally {
        transaction.connection.release()
      }
    },
    recordRollbackFailure: () => undefined
  }
}

/** 把真实 mysql2 连接适配为产品 Repository 使用的参数化 SQL 端口。 */
function createSqlExecutor(): AiQuotaReservationSqlExecutor<MysqlTestTransaction> {
  /** Repository 参数在测试适配器中只允许使用 MySQL 可直接绑定的原子值。 */
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('Repository 产生了不受支持的 SQL 参数')
    })

  return {
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly AiQuotaReservationSqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows } satisfies AiQuotaReservationSqlWriteResult
    }
  }
}

/** 把同一真实 mysql2 连接适配为结算 Repository 的参数化 SQL 端口。 */
function createSettlementSqlExecutor(): AiQuotaSettlementSqlExecutor<MysqlTestTransaction> {
  /** 结算 Repository 只允许绑定 MySQL 可直接接受的原子参数。 */
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('结算 Repository 产生了不受支持的 SQL 参数')
    })

  return {
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly AiQuotaSettlementSqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows } satisfies AiQuotaSettlementSqlWriteResult
    }
  }
}

/** 把同一真实 mysql2 连接适配为 TTL 扫描 Repository 的参数化 SQL 端口。 */
function createExpirySqlExecutor(
  afterSelect?: () => Promise<void>
): AiQuotaExpirySqlExecutor<MysqlTestTransaction> {
  /** TTL Repository 只允许绑定 MySQL 可直接接受的原子参数。 */
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('TTL Repository 产生了不受支持的 SQL 参数')
    })

  return {
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      const parsedRows = rows as unknown as readonly ExpiredAiQuotaReservationSqlRow[]
      await afterSelect?.()
      return parsedRows
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows } satisfies AiQuotaExpirySqlWriteResult
    }
  }
}

/**
 * Expected 来源：`care-points-ai-quota/v1` 的单用户账户串行锁、最早到期批次优先与原子预占规则。
 * 测试层次：L3 / `unit_real_data`；执行真实 MySQL 8.4、真实 DDL、真实 Repository 和应用用例。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL；高熵引用生成器使用确定性测试实现。
 * 明确未覆盖：CloudBase 网络、HTTP、成本策略 Provider、模型调用、预占过期释放和提交结果未知对账。
 */
describe('AI 额度预占的真实 MySQL 并发闭环', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      CONTAINER_NAME,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      MYSQL_IMAGE
    ])
    await waitForMysql()
    applySchema()
    pool = createPool({
      host: '127.0.0.1',
      port: resolvePublishedPort(),
      user: 'root',
      database: DATABASE_NAME,
      connectionLimit: Number('4')
    })
    await pool.execute(`
      INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
      VALUES ('', 'usr_subscription_real', 'active', 1, 1000, 1000)
    `)
    await pool.execute(`
      INSERT INTO ai_quota_accounts
        (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
      SELECT '', id, 10, 0, 0, 1, NULL, 1000, 1000
      FROM users WHERE public_user_id = 'usr_subscription_real'
    `)
    await pool.execute(
      `
      INSERT INTO ai_quota_grants
        (_openid, grant_ref, user_internal_id, source_type, source_ref,
         granted_amount, available_amount, reserved_amount, consumed_amount,
         capability_scope_json, policy_version, status,
         granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
      SELECT '', 'aqg_subscription_real_a', id, 'TRIAL', 'trial_real_a',
             5, 5, 0, 0, JSON_ARRAY('USER_AGENT_TEXT'), 'quota-policy-v1', 'active',
             ?, ?, 1, ?, ?
      FROM users WHERE public_user_id = 'usr_subscription_real'
    `,
      [nowMs - Number('2000'), nowMs + Number('1000'), nowMs, nowMs]
    )
    await pool.execute(
      `
      INSERT INTO ai_quota_grants
        (_openid, grant_ref, user_internal_id, source_type, source_ref,
         granted_amount, available_amount, reserved_amount, consumed_amount,
         capability_scope_json, policy_version, status,
         granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
      SELECT '', 'aqg_subscription_real_b', id, 'TRIAL', 'trial_real_b',
             5, 5, 0, 0, JSON_ARRAY('USER_AGENT_TEXT'), 'quota-policy-v1', 'active',
             ?, ?, 1, ?, ?
      FROM users WHERE public_user_id = 'usr_subscription_real'
    `,
      [nowMs - Number('1000'), nowMs + Number('2000'), nowMs, nowMs]
    )
  })

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end()
    }
    spawnSync('docker', ['rm', '--force', CONTAINER_NAME], { encoding: 'utf8' })
  })

  test('并发预占、部分结算和超额待对账均保持账户与账本守恒', async () => {
    const repository = createMysqlAiQuotaReservationRepository(createSqlExecutor())
    let reservationSequence = Number('0')
    let ledgerSequence = Number('0')
    const reserve = createReserveAiQuotaUseCase({
      driver: createTransactionDriver(),
      repository,
      createReservationRef: () => `aqr_subscription_real_${String(++reservationSequence)}`,
      createLedgerRef: () => `aql_subscription_real_${String(++ledgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const commands = ['a', 'b'].map(suffix => ({
      userRef: 'usr_subscription_real' as UserRef,
      productActionId: `action_subscription_real_${suffix}`,
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      capability: 'USER_AGENT_TEXT' as const,
      estimatedAmount: 8,
      idempotencyKey: `idem_subscription_real_${suffix}`,
      requestHash: suffix.repeat(Number('64')),
      expiresAtMs: nowMs + Number('60000'),
      occurredAtMs: nowMs
    }))

    const concurrentResults = await Promise.all(commands.map(command => reserve(command)))
    expect(concurrentResults.map(result => result.kind).sort()).toEqual([
      'insufficient_quota',
      'reserved'
    ])
    const reservedIndex = concurrentResults.findIndex(result => result.kind === 'reserved')
    expect(reservedIndex).toBeGreaterThanOrEqual(Number('0'))
    const reservedResult = concurrentResults[reservedIndex]
    const replayResult = await reserve(commands[reservedIndex]!)
    expect(replayResult).toMatchObject({
      kind: 'replayed',
      reservationRef: reservedResult?.kind === 'reserved' ? reservedResult.reservationRef : ''
    })
    expect(reservationSequence).toBe(Number('1'))

    await expectReservedQuotaState(pool)

    const reservationRef = reservedResult?.kind === 'reserved' ? reservedResult.reservationRef : ''
    let settlementLedgerSequence = Number('0')
    const settle = createSettleAiQuotaUseCase({
      driver: createTransactionDriver(),
      reservationRepository: repository,
      settlementRepository: createMysqlAiQuotaSettlementRepository(createSettlementSqlExecutor()),
      createLedgerRef: entryType =>
        `aql_subscription_${entryType}_${String(++settlementLedgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const settlementCommand = {
      userRef: 'usr_subscription_real' as UserRef,
      reservationRef,
      settledAmount: 6,
      actualCostMicros: 4800,
      usageEvidenceRef: 'usage_bailian_real_001',
      platformAbsorbedCostMicros: 0,
      occurredAtMs: nowMs + Number('100')
    }
    await expect(settle(settlementCommand)).resolves.toEqual({
      kind: 'settled',
      reservationRef,
      settledAmount: 6,
      releasedAmount: 2
    })
    await expect(settle(settlementCommand)).resolves.toEqual({
      kind: 'replayed',
      reservationRef,
      status: 'settled',
      settledAmount: 6
    })
    expect(settlementLedgerSequence).toBe(Number('3'))

    await expectSettledQuotaState(pool, reservationRef)

    const pendingReserveCommand = {
      userRef: 'usr_subscription_real' as UserRef,
      productActionId: 'action_subscription_real_pending',
      costPolicyVersion: 'ai-cost/2026-09-20.1',
      capability: 'USER_AGENT_TEXT' as const,
      estimatedAmount: 4,
      idempotencyKey: 'idem_subscription_real_pending',
      requestHash: 'c'.repeat(Number('64')),
      expiresAtMs: nowMs + Number('60000'),
      occurredAtMs: nowMs + Number('200')
    }
    const pendingReservation = await reserve(pendingReserveCommand)
    expect(pendingReservation.kind).toBe('reserved')
    if (pendingReservation.kind !== 'reserved') {
      throw new Error('待对账真实数据库测试未能建立额度预占')
    }
    const pendingCommand = {
      userRef: 'usr_subscription_real' as UserRef,
      reservationRef: pendingReservation.reservationRef,
      settledAmount: 6,
      actualCostMicros: 5600,
      usageEvidenceRef: 'usage_bailian_real_pending_001',
      platformAbsorbedCostMicros: 1600,
      occurredAtMs: nowMs + Number('300')
    }
    await expect(settle(pendingCommand)).resolves.toEqual({
      kind: 'pending_reconciliation',
      reservationRef: pendingReservation.reservationRef,
      requestedSettlementAmount: 6,
      quotaShortfallAmount: 2
    })
    await expect(settle(pendingCommand)).resolves.toEqual({
      kind: 'replayed',
      reservationRef: pendingReservation.reservationRef,
      status: 'pending_reconciliation',
      settledAmount: null
    })
    expect(settlementLedgerSequence).toBe(Number('3'))

    await expectPendingReconciliationState(pool, pendingReservation.reservationRef)

    const resolvePending = createResolvePendingAiQuotaUseCase({
      driver: createTransactionDriver(),
      reservationRepository: repository,
      settlementRepository: createMysqlAiQuotaSettlementRepository(createSettlementSqlExecutor()),
      createLedgerRef: entryType =>
        `aql_subscription_${entryType}_${String(++settlementLedgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    await expect(
      resolvePending({
        userRef: 'usr_subscription_real' as UserRef,
        reservationRef: pendingReservation.reservationRef,
        resolution: 'settle_final_evidence',
        settledAmount: 4,
        actualCostMicros: 5600,
        finalEvidenceRef: 'billing_bailian_real_final_001',
        platformAbsorbedCostMicros: 1600,
        occurredAtMs: nowMs + Number('400')
      })
    ).resolves.toEqual({
      kind: 'settled',
      reservationRef: pendingReservation.reservationRef,
      settledAmount: 4,
      releasedAmount: 0,
      platformAbsorbedCostMicros: 1600
    })
    expect(settlementLedgerSequence).toBe(Number('4'))
    await expectResolvedPendingState(pool, pendingReservation.reservationRef)
  })

  test('TTL 边界扫描只把到期预占转入待对账，重复扫描不释放额度', async () => {
    const expiredRef = 'aqr_subscription_expired_real'
    await pool.execute(
      `INSERT INTO ai_quota_reservations
        (_openid, reservation_ref, user_internal_id, product_action_id, cost_policy_version,
         capability, estimated_amount, settled_amount, actual_cost_micros, usage_evidence_ref,
         platform_absorbed_cost_micros, idempotency_key, request_hash, status,
         reconciliation_reason, expires_at_ms, version, created_at_ms, updated_at_ms)
       SELECT '', ?, id, 'action_subscription_expired_real', 'ai-cost/2026-09-20.1',
              'USER_AGENT_TEXT', 3, NULL, NULL, NULL, 0,
              'idem_subscription_expired_real', ?, 'reserved', NULL, ?, 1, ?, ?
       FROM users WHERE public_user_id = 'usr_subscription_real'`,
      [expiredRef, 'd'.repeat(Number('64')), nowMs, nowMs - Number('1000'), nowMs]
    )
    const [beforeRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT SUM(available_amount) FROM ai_quota_accounts) AS account_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_accounts) AS account_reserved,
        (SELECT SUM(available_amount) FROM ai_quota_grants) AS grant_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_grants) AS grant_reserved,
        (SELECT COUNT(*) FROM ai_quota_ledger) AS ledger_count
    `)
    const scan = createScanExpiredAiQuotaReservationsUseCase({
      driver: createTransactionDriver(),
      repository: createMysqlAiQuotaExpiryRepository(createExpirySqlExecutor())
    })

    await expect(scan({ occurredAtMs: nowMs, batchLimit: Number('10') })).resolves.toEqual({
      pendingCount: 1,
      reservationRefs: [expiredRef]
    })
    await expect(scan({ occurredAtMs: nowMs, batchLimit: Number('10') })).resolves.toEqual({
      pendingCount: 0,
      reservationRefs: []
    })

    const [reservationRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, reconciliation_reason, settled_amount, actual_cost_micros,
              usage_evidence_ref, platform_absorbed_cost_micros, version
       FROM ai_quota_reservations WHERE reservation_ref = ?`,
      [expiredRef]
    )
    expect(reservationRows).toEqual([
      {
        status: 'pending_reconciliation',
        reconciliation_reason: 'reservation_ttl_expired',
        settled_amount: null,
        actual_cost_micros: null,
        usage_evidence_ref: null,
        platform_absorbed_cost_micros: 0,
        version: 2
      }
    ])
    const [afterRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT SUM(available_amount) FROM ai_quota_accounts) AS account_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_accounts) AS account_reserved,
        (SELECT SUM(available_amount) FROM ai_quota_grants) AS grant_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_grants) AS grant_reserved,
        (SELECT COUNT(*) FROM ai_quota_ledger) AS ledger_count
    `)
    expect(afterRows).toEqual(beforeRows)
  })

  /**
   * Expected 来源：`data/state-machines.md` §5 明确 TTL 到期只能转入待对账，不能释放、改变分摊或写账本；
   * `clickup/ticket-specs.md` 中 subscription 票据要求并发任务不重复扣减并验证持久化读回。
   * 测试层次：L3 / `unit_real_data`；两个独立 mysql2 连接、真实 MySQL 8.4、真实 DDL、Repository 与应用用例。
   * 替换边界：仅使用本地临时 MySQL 替代 CloudBase MySQL；测试屏障只暂停真实 SELECT 后的事务，不替换 SQL 锁或写入。
   * 明确未覆盖：CloudBase Scheduler/HTTP、租约认证、Provider 与 CloudBase 部署。
   */
  test('两个并发 TTL 扫描器对同一到期预占至多产生一次待对账结果且不动额度账本', async () => {
    const expiredRef = 'aqr_subscription_expired_concurrent_real'
    await pool.execute(
      `INSERT INTO ai_quota_reservations
        (_openid, reservation_ref, user_internal_id, product_action_id, cost_policy_version,
         capability, estimated_amount, settled_amount, actual_cost_micros, usage_evidence_ref,
         platform_absorbed_cost_micros, idempotency_key, request_hash, status,
         reconciliation_reason, expires_at_ms, version, created_at_ms, updated_at_ms)
       SELECT '', ?, id, 'action_subscription_expired_concurrent_real', 'ai-cost/2026-09-20.1',
              'USER_AGENT_TEXT', 2, NULL, NULL, NULL, 0,
              'idem_subscription_expired_concurrent_real', ?, 'reserved', NULL, ?, 1, ?, ?
       FROM users WHERE public_user_id = 'usr_subscription_real'`,
      [expiredRef, 'e'.repeat(Number('64')), nowMs, nowMs - Number('1000'), nowMs]
    )

    const [beforeRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT SUM(available_amount) FROM ai_quota_accounts) AS account_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_accounts) AS account_reserved,
        (SELECT SUM(available_amount) FROM ai_quota_grants) AS grant_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_grants) AS grant_reserved,
        (SELECT COUNT(*) FROM ai_quota_ledger) AS ledger_count,
        (SELECT COUNT(*) FROM ai_quota_reservation_allocations) AS allocation_count
    `)

    let selectedCount = Number('0')
    let releaseScans: () => void = () => undefined
    let signalBothSelected: () => void = () => undefined
    const scansMayContinue = new Promise<void>(resolve => {
      releaseScans = resolve
    })
    const bothWorkersSelected = new Promise<void>(resolve => {
      signalBothSelected = resolve
    })
    const waitAtSelectionBarrier = async (): Promise<void> => {
      selectedCount += Number('1')
      if (selectedCount === Number('2')) {
        signalBothSelected()
      }
      await scansMayContinue
    }
    const createScanner = () =>
      createScanExpiredAiQuotaReservationsUseCase({
        driver: createTransactionDriver(),
        repository: createMysqlAiQuotaExpiryRepository(
          createExpirySqlExecutor(waitAtSelectionBarrier)
        )
      })

    const scannerA = createScanner()
    const scannerB = createScanner()
    const scanA = scannerA({ occurredAtMs: nowMs, batchLimit: Number('10') })
    const scanB = scannerB({ occurredAtMs: nowMs, batchLimit: Number('10') })
    let barrierFallback: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        bothWorkersSelected,
        new Promise<void>(resolve => {
          barrierFallback = setTimeout(resolve, Number('2000'))
        })
      ])
    } finally {
      if (barrierFallback !== undefined) {
        clearTimeout(barrierFallback)
      }
      releaseScans()
    }

    const outcomes = await Promise.allSettled([scanA, scanB])
    const pendingResults = outcomes.filter(
      outcome => outcome.status === 'fulfilled' && outcome.value.pendingCount === Number('1')
    )
    const safeLoserResults = outcomes.filter(
      outcome =>
        (outcome.status === 'fulfilled' && outcome.value.pendingCount === Number('0')) ||
        (outcome.status === 'rejected' &&
          outcome.reason instanceof Error &&
          'type' in outcome.reason &&
          outcome.reason.type === 'WRITE_CONFLICT')
    )
    expect(pendingResults).toHaveLength(Number('1'))
    expect(pendingResults[Number('0')]).toMatchObject({
      status: 'fulfilled',
      value: { pendingCount: 1, reservationRefs: [expiredRef] }
    })
    expect(safeLoserResults).toHaveLength(Number('1'))

    const [reservationRows] = await pool.query<RowDataPacket[]>(
      `SELECT status, reconciliation_reason, settled_amount, actual_cost_micros,
              usage_evidence_ref, platform_absorbed_cost_micros
       FROM ai_quota_reservations WHERE reservation_ref = ?`,
      [expiredRef]
    )
    expect(reservationRows).toEqual([
      {
        status: 'pending_reconciliation',
        reconciliation_reason: 'reservation_ttl_expired',
        settled_amount: null,
        actual_cost_micros: null,
        usage_evidence_ref: null,
        platform_absorbed_cost_micros: 0
      }
    ])
    const [afterRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT SUM(available_amount) FROM ai_quota_accounts) AS account_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_accounts) AS account_reserved,
        (SELECT SUM(available_amount) FROM ai_quota_grants) AS grant_available,
        (SELECT SUM(reserved_amount) FROM ai_quota_grants) AS grant_reserved,
        (SELECT COUNT(*) FROM ai_quota_ledger) AS ledger_count,
        (SELECT COUNT(*) FROM ai_quota_reservation_allocations) AS allocation_count
    `)
    expect(afterRows).toEqual(beforeRows)
  })
})
