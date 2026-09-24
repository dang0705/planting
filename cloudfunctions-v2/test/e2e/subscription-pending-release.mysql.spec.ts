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
import { createSettleAiQuotaUseCase } from '../../src/subscription/application/settle-ai-quota.js'
import type {
  AiQuotaReservationSqlExecutor,
  AiQuotaReservationSqlRow,
  AiQuotaReservationSqlWriteResult
} from '../../src/subscription/repository/ai-quota-reservation-repository-types.js'
import { createMysqlAiQuotaReservationRepository } from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import type {
  AiQuotaSettlementSqlExecutor,
  AiQuotaSettlementSqlRow,
  AiQuotaSettlementSqlWriteResult
} from '../../src/subscription/repository/ai-quota-settlement-repository-types.js'
import { createMysqlAiQuotaSettlementRepository } from '../../src/subscription/repository/mysql-ai-quota-settlement-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const mysqlImage = 'mysql:8.4'
const databaseName = 'qinghuazhi_v2_subscription_pending_release'
const containerName = `qhz-v2-pending-release-${String(process.pid)}`
const mysqlReadyAttempts = Number('60')
const mysqlReadyIntervalMs = Number('250')
const nowMs = Number('1758376800000')
const userRef = 'usr_subscription_pending_release' as UserRef
const reservationRef = 'aqr_subscription_pending_release_001'
const finalEvidenceRef = 'billing_provider_no_call_001'

/** 真实事务上下文；只有测试驱动持有可执行 SQL 的 MySQL 连接。 */
type MysqlTestTransaction = TransactionExecutionContext & {
  /** 当前事务专用连接；事务结束后由驱动归还连接池。 */
  readonly connection: PoolConnection
}

let pool: Pool | undefined
let mysqlPort = Number('0')

/** 执行 Docker 命令；失败时以受限错误输出中止测试。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`本地 MySQL 测试容器命令失败：${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 有界轮询真实 MySQL 查询，避免只凭容器进程状态判断就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < mysqlReadyAttempts; attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
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
    await new Promise(resolve => setTimeout(resolve, mysqlReadyIntervalMs))
  }
  throw new Error('本地 MySQL 未在限定时间内就绪')
}

/** 按身份、配置、订阅顺序将真实 v2 DDL 应用到一次性空库。 */
function applySchema(): void {
  runDocker([
    'exec',
    containerName,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${databaseName}\`;`
  ])
  for (const fileName of ['001_identity.sql', '007_configuration.sql', '005_subscription.sql']) {
    const sql = fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/schema', fileName), 'utf8')
    runDocker(['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName], sql)
  }
}

/** 读取随机映射端口并拒绝无效 Docker 输出。 */
function resolvePublishedPort(): number {
  const port = Number(runDocker(['port', containerName, '3306/tcp']).split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('本地 MySQL 测试端口无效')
  }
  return port
}

/** 将真实 MySQL 事务连接接入额度预占 Repository 的参数化 SQL 端口。 */
function createReservationExecutor(): AiQuotaReservationSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('额度预占 Repository 产生不支持的 MySQL 参数')
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

/** 将同一真实事务连接接入额度结算 Repository 的参数化 SQL 端口。 */
function createSettlementExecutor(): AiQuotaSettlementSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('额度结算 Repository 产生不支持的 MySQL 参数')
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

/** 所有用例的事务操作都由连接池真实获取同一事务连接完成。 */
function createTransactionDriver(): DatabaseTransactionDriver<MysqlTestTransaction> {
  return {
    beginTransaction: async () => {
      if (pool === undefined) {
        throw new Error('MySQL 连接池尚未初始化')
      }
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

/** 为隔离用户创建真实账户与单一有效 trial grant。 */
async function seedQuotaUser(): Promise<void> {
  if (pool === undefined) {
    throw new Error('MySQL 连接池尚未初始化')
  }
  await pool.execute(
    `INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
     VALUES ('', ?, 'active', 1, ?, ?)`,
    [userRef, nowMs - Number('1000'), nowMs - Number('1000')]
  )
  await pool.execute(
    `INSERT INTO ai_quota_accounts
      (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount, version,
       last_ledger_internal_id, created_at_ms, updated_at_ms)
     SELECT '', id, 8, 0, 0, 1, NULL, ?, ? FROM users WHERE public_user_id = ?`,
    [nowMs, nowMs, userRef]
  )
  await pool.execute(
    `INSERT INTO ai_quota_grants
      (_openid, grant_ref, user_internal_id, source_type, source_ref, granted_amount,
       available_amount, reserved_amount, consumed_amount, capability_scope_json, policy_version,
       status, granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
     SELECT '', 'aqg_subscription_pending_release_001', id, 'TRIAL', 'trial_pending_release_001',
            8, 8, 0, 0, JSON_ARRAY('USER_AGENT_TEXT'), 'quota-policy/test-pending-release',
            'active', ?, ?, 1, ?, ? FROM users WHERE public_user_id = ?`,
    [nowMs - Number('1000'), nowMs + Number('86400000'), nowMs, nowMs, userRef]
  )
}

/** 测试仅使用本地一次性 MySQL，不访问 CloudBase 或真实供应商。 */
describe('额度待对账确认未调用的真实 MySQL 闭环', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      mysqlImage
    ])
    await waitForMysql()
    applySchema()
    mysqlPort = resolvePublishedPort()
    pool = createPool({
      host: '127.0.0.1',
      port: mysqlPort,
      user: 'root',
      database: databaseName,
      connectionLimit: Number('4')
    })
    await seedQuotaUser()
  })

  afterAll(async () => {
    await pool?.end()
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  /**
   * Expected 来源：订阅语义 §2.2(4)、§2.3(3) 与实施合同规定相同终态证据重放原结果、最终确认未调用时全额释放。
   * 测试层次：L3 / `unit_real_data`；经过真实 MySQL 8.4、v2 DDL、预占/结算/最终裁决应用与 Repository。
   * 仅替换 CloudBase MySQL 为本地 MySQL、账单为本测试确定的最终证据；不调用 Provider、HTTP 或 CloudBase。
   * Break：丢失终态同证据重放或再次写账本；Mutation：把终态匹配条件改错，必须在本用例 RED。
   */
  test('确认未调用后全量释放；同证据重放不加账本，异证据失败关闭', async () => {
    if (pool === undefined || mysqlPort === Number('0')) {
      throw new Error('真实 MySQL 连接池或端口未初始化')
    }

    const transactionDriver = createTransactionDriver()
    const reservationRepository = createMysqlAiQuotaReservationRepository(
      createReservationExecutor()
    )
    const settlementRepository = createMysqlAiQuotaSettlementRepository(createSettlementExecutor())
    const reserve = createReserveAiQuotaUseCase({
      driver: transactionDriver,
      repository: reservationRepository,
      createReservationRef: () => reservationRef,
      createLedgerRef: () => 'aql_subscription_pending_release_reserve_001',
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const reservation = await reserve({
      userRef,
      productActionId: 'action_subscription_pending_release_001',
      costPolicyVersion: 'ai-cost/test-pending-release',
      capability: 'USER_AGENT_TEXT',
      estimatedAmount: 8,
      idempotencyKey: 'idem_subscription_pending_release_001',
      requestHash: 'a'.repeat(Number('64')),
      expiresAtMs: nowMs + Number('30000'),
      occurredAtMs: nowMs
    })
    expect(reservation).toMatchObject({
      kind: 'reserved',
      reservationRef,
      estimatedAmount: 8,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/test-pending-release'
    })

    let settlementLedgerSequence = Number('0')
    const settle = createSettleAiQuotaUseCase({
      driver: transactionDriver,
      reservationRepository,
      settlementRepository,
      createLedgerRef: entryType =>
        `aql_subscription_pending_release_${entryType}_${String(++settlementLedgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const observedOverage = {
      userRef,
      reservationRef,
      settledAmount: 9,
      actualCostMicros: 9000,
      usageEvidenceRef: 'usage_provider_unknown_001',
      platformAbsorbedCostMicros: 1000,
      occurredAtMs: nowMs + Number('100')
    }
    await expect(settle(observedOverage)).resolves.toMatchObject({
      kind: 'pending_reconciliation',
      reservationRef,
      requestedSettlementAmount: 9,
      quotaShortfallAmount: 1
    })

    const resolvePending = createResolvePendingAiQuotaUseCase({
      driver: transactionDriver,
      reservationRepository,
      settlementRepository,
      createLedgerRef: entryType =>
        `aql_subscription_pending_release_final_${entryType}_${String(++settlementLedgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const releaseCommand = {
      userRef,
      reservationRef,
      resolution: 'release_no_call' as const,
      actualCostMicros: 0,
      finalEvidenceRef,
      platformAbsorbedCostMicros: 0,
      occurredAtMs: nowMs + Number('200')
    }
    await expect(resolvePending(releaseCommand)).resolves.toEqual({
      kind: 'released',
      reservationRef,
      settledAmount: 0,
      releasedAmount: 8,
      platformAbsorbedCostMicros: 0
    })
    await expect(resolvePending(releaseCommand)).resolves.toEqual({
      kind: 'replayed',
      reservationRef,
      status: 'released',
      settledAmount: 0
    })
    await expect(
      resolvePending({ ...releaseCommand, finalEvidenceRef: 'billing_provider_no_call_other_001' })
    ).rejects.toMatchObject({ type: 'SETTLEMENT_CONFLICT' })

    const [stateRows] = await pool.query<RowDataPacket[]>(
      `SELECT a.available_amount, a.reserved_amount, a.consumed_amount,
              g.available_amount AS grant_available_amount,
              g.reserved_amount AS grant_reserved_amount,
              g.consumed_amount AS grant_consumed_amount,
              r.status, r.settled_amount, r.actual_cost_micros, r.usage_evidence_ref,
              r.platform_absorbed_cost_micros,
              ra.reserved_amount AS allocation_reserved_amount,
              ra.remaining_amount AS allocation_remaining_amount,
              ra.settled_amount AS allocation_settled_amount,
              ra.released_amount AS allocation_released_amount
       FROM ai_quota_reservations AS r
       JOIN ai_quota_accounts AS a ON a.user_internal_id = r.user_internal_id
       JOIN ai_quota_reservation_allocations AS ra ON ra.reservation_internal_id = r.id
       JOIN ai_quota_grants AS g ON g.id = ra.grant_internal_id
       WHERE r.reservation_ref = ?`,
      [reservationRef]
    )
    expect(stateRows).toEqual([
      {
        available_amount: 8,
        reserved_amount: 0,
        consumed_amount: 0,
        grant_available_amount: 8,
        grant_reserved_amount: 0,
        grant_consumed_amount: 0,
        status: 'released',
        settled_amount: 0,
        actual_cost_micros: 0,
        usage_evidence_ref: finalEvidenceRef,
        platform_absorbed_cost_micros: 0,
        allocation_reserved_amount: 8,
        allocation_remaining_amount: 0,
        allocation_settled_amount: 0,
        allocation_released_amount: 8
      }
    ])
    const [ledgerRows] = await pool.query<RowDataPacket[]>(
      `SELECT entry_type, amount FROM ai_quota_ledger
       WHERE reservation_internal_id = (
         SELECT id FROM ai_quota_reservations WHERE reservation_ref = ?
       ) ORDER BY entry_type`,
      [reservationRef]
    )
    expect(ledgerRows).toEqual([
      { entry_type: 'release', amount: 8 },
      { entry_type: 'reserve', amount: 8 }
    ])
  })
})
