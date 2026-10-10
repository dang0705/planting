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
import { createMarkAiQuotaProviderResultUnknownUseCase } from '../../src/subscription/application/mark-ai-quota-provider-result-unknown.js'
import { createReserveAiQuotaUseCase } from '../../src/subscription/application/reserve-ai-quota.js'
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
import {
  createMysqlAiQuotaProviderUnknownRepository,
  type AiQuotaProviderUnknownSqlExecutor,
  type AiQuotaProviderUnknownSqlRow
} from '../../src/subscription/repository/mysql-ai-quota-provider-unknown-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const mysqlImage = 'mysql:8.4'
const databaseName = 'qinghuazhi_v2_subscription_provider_unknown'
const containerName = `qhz-v2-provider-unknown-${String(process.pid)}`
const mysqlReadyAttempts = Number('60')
const mysqlReadyIntervalMs = Number('250')
const nowMs = Number('1758376800000')
const ownerUserRef = 'usr_subscription_provider_unknown_owner' as UserRef
const otherUserRef = 'usr_subscription_provider_unknown_other' as UserRef
const unknownReservationRef = 'aqr_subscription_provider_unknown_001'
const settledReservationRef = 'aqr_subscription_provider_unknown_002'

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

/** 将同一真实事务连接接入“供应商结果未知”专用 Repository 的参数化 SQL 端口。 */
function createProviderUnknownExecutor(): AiQuotaProviderUnknownSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('供应商结果未知 Repository 产生不支持的 MySQL 参数')
    })
  return {
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly AiQuotaProviderUnknownSqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    }
  }
}

/** 为隔离用户创建真实账户与单一有效 trial grant（每位用户 20 额度）。 */
async function seedQuotaUser(userRef: UserRef, grantRef: string): Promise<void> {
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
     SELECT '', id, 20, 0, 0, 1, NULL, ?, ? FROM users WHERE public_user_id = ?`,
    [nowMs, nowMs, userRef]
  )
  await pool.execute(
    `INSERT INTO ai_quota_grants
      (_openid, grant_ref, user_internal_id, source_type, source_ref, granted_amount,
       available_amount, reserved_amount, consumed_amount, capability_scope_json, policy_version,
       status, granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
     SELECT '', ?, id, 'TRIAL', CONCAT('trial_', ?), 20, 20, 0, 0, JSON_ARRAY('USER_AGENT_TEXT'),
            'quota-policy/test-provider-unknown', 'active', ?, ?, 1, ?, ? FROM users WHERE public_user_id = ?`,
    [grantRef, grantRef, nowMs - Number('1000'), nowMs + Number('86400000'), nowMs, nowMs, userRef]
  )
}

/** 读取指定预占及其账户、批次、分摊、账本的完整持久化快照，用于证明“零额度副作用”。 */
async function readQuotaState(reservationRef: string) {
  if (pool === undefined) {
    throw new Error('MySQL 连接池尚未初始化')
  }
  const [reservationRows] = await pool.query<RowDataPacket[]>(
    `SELECT r.status, r.reconciliation_reason, r.version, r.updated_at_ms, r.settled_amount,
            r.estimated_amount, r.actual_cost_micros, r.usage_evidence_ref,
            r.platform_absorbed_cost_micros,
            a.available_amount, a.reserved_amount, a.consumed_amount, a.version AS account_version,
            g.available_amount AS grant_available_amount,
            g.reserved_amount AS grant_reserved_amount,
            g.consumed_amount AS grant_consumed_amount, g.version AS grant_version,
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
  const [ledgerRows] = await pool.query<RowDataPacket[]>(
    `SELECT entry_type, amount FROM ai_quota_ledger
     WHERE reservation_internal_id = (SELECT id FROM ai_quota_reservations WHERE reservation_ref = ?)
     ORDER BY id`,
    [reservationRef]
  )
  return { reservationRows, ledgerRows }
}

/** 测试仅使用本地一次性 MySQL，不访问 CloudBase 或真实供应商。 */
describe('额度预占标记供应商结果未知的真实 MySQL 闭环', () => {
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
    await seedQuotaUser(ownerUserRef, 'aqg_subscription_provider_unknown_owner')
    await seedQuotaUser(otherUserRef, 'aqg_subscription_provider_unknown_other')
  })

  afterAll(async () => {
    await pool?.end()
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  /**
   * Expected 来源：docs/backend-v2/contracts/care-points-and-ai-quota.md
   * “无法确认供应商结果时进入 pending_reconciliation”“供应商结果未知为 `provider_result_unknown`”，
   * 以及“预占到期/待对账不证明调用未发生、不得自动释放额度”（额度在对账前保持锁定）；
   * DDL docs/backend-v2/schema/005_subscription.sql `ai_quota_reservations`（status、reconciliation_reason、version 乐观锁）。
   * 测试层次：L3 / `unit_real_data`；经过真实 MySQL 8.4、v2 DDL 与约束、预占/结算/标记用例与 Repository。
   * 仅替换 CloudBase MySQL 为本地一次性 MySQL；不调用 Provider、HTTP 或 CloudBase。
   */
  test('reserved → pending_reconciliation(provider_result_unknown)，版本+1，额度/批次/分摊/账本不变；重放零写入；他人预占不可见', async () => {
    if (pool === undefined || mysqlPort === Number('0')) {
      throw new Error('真实 MySQL 连接池或端口未初始化')
    }
    const transactionDriver = createTransactionDriver()
    const reservationRepository = createMysqlAiQuotaReservationRepository(
      createReservationExecutor()
    )
    const settlementRepository = createMysqlAiQuotaSettlementRepository(createSettlementExecutor())
    const providerUnknownRepository = createMysqlAiQuotaProviderUnknownRepository(
      createProviderUnknownExecutor()
    )
    let ledgerSequence = Number('0')
    const pendingReservationRefs = [unknownReservationRef, settledReservationRef]
    const reserve = createReserveAiQuotaUseCase({
      driver: transactionDriver,
      repository: reservationRepository,
      createReservationRef: () => {
        const nextRef = pendingReservationRefs.shift()
        if (nextRef === undefined) {
          throw new Error('测试预占引用已用尽')
        }
        return nextRef
      },
      createLedgerRef: () =>
        `aql_subscription_provider_unknown_reserve_${String(++ledgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    const reserveCommand = (suffix: string) => ({
      userRef: ownerUserRef,
      productActionId: `action_subscription_provider_unknown_${suffix}`,
      costPolicyVersion: 'ai-cost/test-provider-unknown',
      capability: 'USER_AGENT_TEXT' as const,
      estimatedAmount: 8,
      idempotencyKey: `idem_subscription_provider_unknown_${suffix}`,
      requestHash: 'b'.repeat(Number('64')),
      expiresAtMs: nowMs + Number('30000'),
      occurredAtMs: nowMs
    })
    await expect(reserve(reserveCommand('001'))).resolves.toMatchObject({
      kind: 'reserved',
      reservationRef: unknownReservationRef
    })
    await expect(reserve(reserveCommand('002'))).resolves.toMatchObject({
      kind: 'reserved',
      reservationRef: settledReservationRef
    })

    const markUnknown = createMarkAiQuotaProviderResultUnknownUseCase({
      driver: transactionDriver,
      reservationRepository,
      providerUnknownRepository
    })
    const before = await readQuotaState(unknownReservationRef)
    expect(before.reservationRows).toHaveLength(1)
    expect(before.reservationRows[0]).toMatchObject({
      status: 'reserved',
      reconciliation_reason: null,
      version: 1
    })

    // 他人不得标记不属于自己的预占：表现为不存在，且不改变任何持久化状态。
    await expect(
      markUnknown({
        userRef: otherUserRef,
        reservationRef: unknownReservationRef,
        occurredAtMs: nowMs + Number('50')
      })
    ).rejects.toMatchObject({ type: 'RESERVATION_NOT_FOUND' })
    await expect(
      markUnknown({
        userRef: ownerUserRef,
        reservationRef: 'aqr_subscription_provider_unknown_missing',
        occurredAtMs: nowMs + Number('50')
      })
    ).rejects.toMatchObject({ type: 'RESERVATION_NOT_FOUND' })
    expect(await readQuotaState(unknownReservationRef)).toEqual(before)

    const markCommand = {
      userRef: ownerUserRef,
      reservationRef: unknownReservationRef,
      occurredAtMs: nowMs + Number('100')
    }
    await expect(markUnknown(markCommand)).resolves.toEqual({
      kind: 'pending_reconciliation',
      reservationRef: unknownReservationRef
    })
    const after = await readQuotaState(unknownReservationRef)
    const beforeRow = before.reservationRows[0]!
    expect(after.reservationRows).toEqual([
      {
        ...beforeRow,
        status: 'pending_reconciliation',
        reconciliation_reason: 'provider_result_unknown',
        version: 2,
        updated_at_ms: nowMs + Number('100')
      }
    ])
    // 额度保持锁定：账户 reserved=16（两笔预占）、批次 reserved=16、分摊 remaining=8，且账本只有原 reserve 一行。
    expect(after.reservationRows[0]).toMatchObject({
      available_amount: 4,
      reserved_amount: 16,
      consumed_amount: 0,
      grant_reserved_amount: 16,
      allocation_remaining_amount: 8,
      settled_amount: null
    })
    expect(after.ledgerRows).toEqual([{ entry_type: 'reserve', amount: 8 }])

    // 重放：返回当前状态，零写入（版本与更新时间不变）。
    await expect(
      markUnknown({ ...markCommand, occurredAtMs: nowMs + Number('200') })
    ).resolves.toEqual({
      kind: 'replayed',
      reservationRef: unknownReservationRef,
      status: 'pending_reconciliation'
    })
    expect(await readQuotaState(unknownReservationRef)).toEqual(after)

    // 已结算终态：返回 replayed + settled，零写入。
    const settle = createSettleAiQuotaUseCase({
      driver: transactionDriver,
      reservationRepository,
      settlementRepository,
      createLedgerRef: entryType =>
        `aql_subscription_provider_unknown_${entryType}_${String(++ledgerSequence)}`,
      commitUnknownReadOnlyRepository: { read: async () => null }
    })
    await expect(
      settle({
        userRef: ownerUserRef,
        reservationRef: settledReservationRef,
        settledAmount: 5,
        actualCostMicros: 5000,
        usageEvidenceRef: 'usage_provider_unknown_settled_001',
        platformAbsorbedCostMicros: 0,
        occurredAtMs: nowMs + Number('300')
      })
    ).resolves.toMatchObject({ kind: 'settled' })
    const settledBefore = await readQuotaState(settledReservationRef)
    await expect(
      markUnknown({
        userRef: ownerUserRef,
        reservationRef: settledReservationRef,
        occurredAtMs: nowMs + Number('400')
      })
    ).resolves.toEqual({
      kind: 'replayed',
      reservationRef: settledReservationRef,
      status: 'settled'
    })
    expect(await readQuotaState(settledReservationRef)).toEqual(settledBefore)
    expect(settledBefore.reservationRows[0]).toMatchObject({
      status: 'settled',
      reconciliation_reason: null
    })
  })
})
