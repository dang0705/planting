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
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createReserveAiQuotaUseCase } from '../../src/subscription/application/reserve-ai-quota.js'
import {
  createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository,
  type AiQuotaCommitUnknownSqlRow,
  type AiQuotaCommitUnknownReadOnlySqlExecutor
} from '../../src/subscription/repository/mysql-ai-quota-commit-unknown-repository.js'
import {
  createMysqlAiQuotaReservationRepository,
  type AiQuotaReservationSqlExecutor,
  type AiQuotaReservationSqlRow,
  type AiQuotaReservationSqlWriteResult
} from '../../src/subscription/repository/mysql-ai-quota-reservation-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const PROJECT_ROOT = findProjectRoot()
const MYSQL_IMAGE = 'mysql:8.4'
const DATABASE_NAME = 'qinghuazhi_v2_subscription_commit_unknown'
const CONTAINER_NAME = `qhz-v2-commit-unknown-${String(process.pid)}`
const MYSQL_READY_ATTEMPTS = Number('60')
const MYSQL_READY_INTERVAL_MS = Number('250')
const nowMs = Number('1758376800000')

let writerPool: Pool | undefined
let readerPool: Pool | undefined
let mysqlPort = Number('0')

/** 真实 MySQL 连接承载的事务上下文；产品 Repository 只看到标记接口。 */
type MysqlTestTransaction = TransactionExecutionContext & {
  /** 当前事务使用的真实 MySQL 连接，仅测试驱动可以访问。 */
  readonly connection: PoolConnection
}

/** 执行 Docker CLI；失败时保留原始输出并中止真实数据库测试。 */
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

/** 有界等待 MySQL 容器开始接受真实查询。 */
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
    await new Promise(resolve => setTimeout(resolve, MYSQL_READY_INTERVAL_MS))
  }
  throw new Error('MySQL container did not become ready within the bounded wait')
}

/** 创建隔离数据库并应用额度预占所需的真实 v2 DDL。 */
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

/** 读取 Docker 随机映射的本机 MySQL 端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', CONTAINER_NAME, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/**
 * 把真实 mysql2 事务连接适配为额度预占 Repository 的参数化 SQL 端口。
 * 测试只允许绑定 MySQL 可直接接受的原子值，避免适配器隐藏序列化差异。
 */
function createReservationSqlExecutor(): AiQuotaReservationSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('额度预占 Repository 产生了不受支持的 SQL 参数')
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

/** 把独立只读池适配为不可写、无事务的提交未知 SQL 端口。 */
function createReadOnlyExecutor(pool: Pool): AiQuotaCommitUnknownReadOnlySqlExecutor {
  return {
    executeQuery: async (sql, parameters) => {
      const safeParameters = parameters.map(parameter => {
        if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
          return parameter
        }
        throw new Error('只读 Repository 产生了不受支持的 SQL 参数')
      })
      const [rows] = await pool.execute<RowDataPacket[]>(sql, safeParameters)
      return rows as unknown as readonly AiQuotaCommitUnknownSqlRow[]
    }
  }
}

/** 为一个隔离测试主体写入真实用户、账户和有效 AI 额度批次。 */
async function seedQuotaUser(
  pool: Pool,
  userRef: UserRef,
  grantRef: string,
  createdAtMs: number
): Promise<void> {
  await pool.execute(
    `INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES ('', ?, 'active', 1, ?, ?)`,
    [userRef, createdAtMs, createdAtMs]
  )
  await pool.execute(
    `INSERT INTO ai_quota_accounts (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount, version, last_ledger_internal_id, created_at_ms, updated_at_ms)
     SELECT '', id, 10, 0, 0, 1, NULL, ?, ? FROM users WHERE public_user_id = ?`,
    [createdAtMs, createdAtMs, userRef]
  )
  await pool.execute(
    `INSERT INTO ai_quota_grants (_openid, grant_ref, user_internal_id, source_type, source_ref, granted_amount,
       available_amount, reserved_amount, consumed_amount, capability_scope_json, policy_version, status,
       granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms)
     SELECT '', ?, id, 'TRIAL', ?, 10, 10, 0, 0, JSON_ARRAY('USER_AGENT_TEXT'), 'quota-policy-test', 'active', ?, ?, 1, ?, ?
     FROM users WHERE public_user_id = ?`,
    [
      grantRef,
      `${grantRef}_source`,
      createdAtMs - Number('1000'),
      createdAtMs + Number('60000'),
      createdAtMs,
      createdAtMs,
      userRef
    ]
  )
}

/**
 * 从真实 MySQL 读回预占、账户、批次、分配和账本数量。
 * @param writerPool MySQL 管理连接池；userRef 为公开用户引用，仅用于检索而非内部主键。
 * @param actionId 预占所属产品动作；idempotencyKey 为原请求幂等键。
 * @param reservationRef 待读回预占公开引用。
 */
async function readReservationState(
  writerPool: Pool,
  userRef: UserRef,
  actionId: string,
  idempotencyKey: string,
  reservationRef: string
): Promise<RowDataPacket[]> {
  const [rows] = await writerPool.query<RowDataPacket[]>(
    `SELECT account.available_amount, account.reserved_amount,
            grant_batch.available_amount AS grant_available_amount, grant_batch.reserved_amount AS grant_reserved_amount,
            reservation.request_hash, reservation.status, reservation.estimated_amount,
            allocation.reserved_amount AS allocation_reserved_amount, allocation.remaining_amount,
            (SELECT COUNT(*) FROM ai_quota_reservations AS duplicate WHERE duplicate.user_internal_id = user_row.id AND duplicate.product_action_id = ? AND duplicate.idempotency_key = ?) AS reservation_count,
            (SELECT COUNT(*) FROM ai_quota_ledger AS ledger WHERE ledger.reservation_internal_id = reservation.id AND ledger.entry_type = 'reserve') AS reserve_ledger_count
     FROM users AS user_row JOIN ai_quota_accounts AS account ON account.user_internal_id = user_row.id JOIN ai_quota_grants AS grant_batch ON grant_batch.user_internal_id = user_row.id
     JOIN ai_quota_reservations AS reservation ON reservation.user_internal_id = user_row.id AND reservation.reservation_ref = ?
     JOIN ai_quota_reservation_allocations AS allocation ON allocation.reservation_internal_id = reservation.id
     WHERE user_row.public_user_id = ?`,
    [actionId, idempotencyKey, reservationRef, userRef]
  )
  return rows
}

/** 创建经真实 MySQL 执行、并在 COMMIT 后注入确认丢失的预占用例测试夹具。 */
function createReservationHarness(parameters: {
  /** 承载首次预占事务与业务状态读回的真实 MySQL 写连接池。 */
  readonly writerPool: Pool
  /** 只拥有 SELECT 权限、供提交未知对账使用的独立 MySQL 连接池。 */
  readonly readerPool: Pool
  /** 本用例应创建的唯一预占公开引用。 */
  readonly reservationRef: string
  /** 本用例应追加的唯一额度账本公开引用。 */
  readonly ledgerRef: string
  /** 仅用于模拟数据库已 COMMIT、确认后置处理仍未完成的测试数据突变。 */
  readonly afterCommitMutation?: (connection: PoolConnection) => Promise<void>
}) {
  let transactionConnectionId = Number('0')
  let reservationRefCalls = Number('0')
  let ledgerRefCalls = Number('0')
  let rollbackCalls = Number('0')

  const transactionDriver: DatabaseTransactionDriver<MysqlTestTransaction> = {
    beginTransaction: async () => {
      const connection = await parameters.writerPool.getConnection()
      await connection.beginTransaction()
      return { transactionContext: true, connection }
    },
    commitTransaction: async transaction => {
      try {
        const [rows] = await transaction.connection.query<RowDataPacket[]>(
          'SELECT CONNECTION_ID() AS id'
        )
        transactionConnectionId = Number(rows[Number('0')]?.id)
        await transaction.connection.commit()
        await parameters.afterCommitMutation?.(transaction.connection)
        throw new DatabaseCommitResultUnknownError('真实 COMMIT 后注入确认丢失')
      } finally {
        transaction.connection.release()
      }
    },
    rollbackTransaction: async transaction => {
      rollbackCalls += Number('1')
      try {
        await transaction.connection.rollback()
      } finally {
        transaction.connection.release()
      }
    },
    recordRollbackFailure: () => undefined
  }
  const reserveAiQuota = createReserveAiQuotaUseCase({
    driver: transactionDriver,
    repository: createMysqlAiQuotaReservationRepository(createReservationSqlExecutor()),
    createReservationRef: () => {
      reservationRefCalls += Number('1')
      return parameters.reservationRef
    },
    createLedgerRef: () => {
      ledgerRefCalls += Number('1')
      return parameters.ledgerRef
    },
    commitUnknownReadOnlyRepository: createMysqlAiQuotaReservationCommitUnknownReadOnlyRepository(
      createReadOnlyExecutor(parameters.readerPool)
    )
  })

  return {
    reserveAiQuota,
    get observations() {
      return { transactionConnectionId, reservationRefCalls, ledgerRefCalls, rollbackCalls }
    }
  }
}

/** Expected：`P1-subscription-semantics-2026-09-20.md` 提交未知合同要求按用户/动作/幂等键只读核验，同摘要才重放。
 * L3 / `unit_real_data` 真实经过额度应用用例、MySQL DDL 和只读 Repository；仅在真实 COMMIT 后注入确认丢失。
 * 覆盖 reservation、allocation、reserve ledger、账户读回；非 TCP 故障注入或 CloudBase 证明，未覆盖真实网络、HTTP、Provider 与模型调用。
 */
describe('AI 额度预占提交未知应用闭环的真实 MySQL 验证', () => {
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
    mysqlPort = resolvePublishedPort()
    writerPool = createPool({
      host: '127.0.0.1',
      port: mysqlPort,
      user: 'root',
      database: DATABASE_NAME,
      connectionLimit: Number('2')
    })
    await writerPool.execute(`CREATE USER 'qhz_readonly'@'%' IDENTIFIED BY 'local-test-only'`)
    await writerPool.execute(`GRANT SELECT ON \`${DATABASE_NAME}\`.* TO 'qhz_readonly'@'%'`)
    readerPool = createPool({
      host: '127.0.0.1',
      port: mysqlPort,
      user: 'qhz_readonly',
      password: 'local-test-only',
      database: DATABASE_NAME,
      connectionLimit: Number('1')
    })
  })

  afterAll(async () => {
    await readerPool?.end()
    await writerPool?.end()
    spawnSync('docker', ['rm', '--force', CONTAINER_NAME], { encoding: 'utf8' })
  })

  test('真实提交确认丢失且摘要相同时只读对账重放原预占', async () => {
    if (readerPool === undefined || writerPool === undefined || mysqlPort === Number('0')) {
      throw new Error('真实 MySQL 只读连接、写连接或端口未初始化')
    }

    const userRef = 'usr_subscription_commit_unknown_app' as UserRef
    const actionId = 'action_commit_unknown_app'
    const idempotencyKey = 'idem_commit_unknown_app'
    const reservationRef = 'aqr_commit_unknown_app_001'
    const requestHash = 'c'.repeat(Number('64'))
    await seedQuotaUser(writerPool, userRef, 'aqg_commit_unknown_app_001', nowMs)
    const harness = createReservationHarness({
      writerPool,
      readerPool,
      reservationRef,
      ledgerRef: 'aql_commit_unknown_app_001'
    })

    await expect(
      harness.reserveAiQuota({
        userRef,
        productActionId: actionId,
        costPolicyVersion: 'ai-cost/test-commit-unknown',
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 4,
        idempotencyKey,
        requestHash,
        expiresAtMs: nowMs + Number('30000'),
        occurredAtMs: nowMs
      })
    ).resolves.toEqual({
      kind: 'replayed',
      reservationRef,
      status: 'reserved',
      estimatedAmount: 4,
      capability: 'USER_AGENT_TEXT',
      costPolicyVersion: 'ai-cost/test-commit-unknown',
      expiresAtMs: nowMs + Number('30000')
    })

    const [readerConnectionRows] = await readerPool.query<RowDataPacket[]>(
      'SELECT CONNECTION_ID() AS id'
    )
    const observation = harness.observations
    expect(observation.transactionConnectionId).toBeGreaterThan(Number('0'))
    expect(Number(readerConnectionRows[Number('0')]?.id)).not.toBe(
      observation.transactionConnectionId
    )
    expect(observation.reservationRefCalls).toBe(Number('1'))
    expect(observation.ledgerRefCalls).toBe(Number('1'))
    expect(observation.rollbackCalls).toBe(Number('0'))

    const rows = await readReservationState(
      writerPool,
      userRef,
      actionId,
      idempotencyKey,
      reservationRef
    )
    expect(rows).toHaveLength(Number('1'))
    expect(rows[Number('0')]).toMatchObject({
      available_amount: Number('6'),
      reserved_amount: Number('4'),
      grant_available_amount: Number('6'),
      grant_reserved_amount: Number('4'),
      status: 'reserved',
      estimated_amount: Number('4'),
      allocation_reserved_amount: Number('4'),
      remaining_amount: Number('4'),
      reservation_count: Number('1'),
      reserve_ledger_count: Number('1')
    })
  })

  /** Expected：P1 额度语义 §2.2 异参不得重放；忽略摘要会泄露旧预占结果并返回成功。
   * Real path：真实 MySQL COMMIT → 应用/Repository → SELECT-only 对账；RED Mutation：夹具异摘要误报；L3 / `unit_real_data`；只改测试库摘要，不模拟 TCP 故障。
   */
  test('真实提交确认丢失且只读读回摘要不同时失败关闭并保留唯一预占', async () => {
    if (readerPool === undefined || writerPool === undefined || mysqlPort === Number('0')) {
      throw new Error('真实 MySQL 只读连接、写连接或端口未初始化')
    }

    const userRef = 'usr_subscription_commit_unknown_mismatch' as UserRef
    const actionId = 'action_commit_unknown_mismatch'
    const idempotencyKey = 'idem_commit_unknown_mismatch'
    const reservationRef = 'aqr_commit_unknown_mismatch_001'
    const commandHash = 'e'.repeat(Number('64'))
    const databaseHash = 'd'.repeat(Number('64'))
    await seedQuotaUser(writerPool, userRef, 'aqg_commit_unknown_mismatch_001', nowMs)
    const harness = createReservationHarness({
      writerPool,
      readerPool,
      reservationRef,
      ledgerRef: 'aql_commit_unknown_mismatch_001',
      afterCommitMutation: async connection => {
        const [result] = await connection.execute<ResultSetHeader>(
          'UPDATE ai_quota_reservations SET request_hash = ? WHERE reservation_ref = ?',
          [databaseHash, reservationRef]
        )
        expect(result.affectedRows).toBe(Number('1'))
      }
    })

    await expect(
      harness.reserveAiQuota({
        userRef,
        productActionId: actionId,
        costPolicyVersion: 'ai-cost/test-commit-unknown',
        capability: 'USER_AGENT_TEXT',
        estimatedAmount: 4,
        idempotencyKey,
        requestHash: commandHash,
        expiresAtMs: nowMs + Number('30000'),
        occurredAtMs: nowMs
      })
    ).rejects.toMatchObject({ type: 'COMMIT_RESULT_UNKNOWN' })

    const [readerConnectionRows] = await readerPool.query<RowDataPacket[]>(
      'SELECT CONNECTION_ID() AS id'
    )
    const observation = harness.observations
    expect(observation.transactionConnectionId).toBeGreaterThan(Number('0'))
    expect(Number(readerConnectionRows[Number('0')]?.id)).not.toBe(
      observation.transactionConnectionId
    )
    expect(observation.reservationRefCalls).toBe(Number('1'))
    expect(observation.ledgerRefCalls).toBe(Number('1'))
    expect(observation.rollbackCalls).toBe(Number('0'))

    const rows = await readReservationState(
      writerPool,
      userRef,
      actionId,
      idempotencyKey,
      reservationRef
    )
    expect(rows).toHaveLength(Number('1'))
    expect(rows[Number('0')]).toMatchObject({
      available_amount: Number('6'),
      reserved_amount: Number('4'),
      grant_available_amount: Number('6'),
      grant_reserved_amount: Number('4'),
      request_hash: databaseHash,
      status: 'reserved',
      allocation_reserved_amount: Number('4'),
      remaining_amount: Number('4'),
      reservation_count: Number('1'),
      reserve_ledger_count: Number('1')
    })
  })
})
