import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
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

import type { EventRef, UserPlantRef, UserRef } from '../../src/contracts/types.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlRewardInboxRepository,
  type ReserveRewardInboxInput,
  type RewardInboxPrincipalSqlRow,
  type RewardInboxSqlExecutor,
  type RewardInboxSqlRow,
  type RewardInboxSqlWriteResult
} from '../../src/subscription/repository/mysql-reward-inbox-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const mysqlImage = 'mysql:8.4'
const databaseName = 'qinghuazhi_v2_reward_inbox'
const containerName = `qhz-v2-reward-inbox-${String(process.pid)}`
const mysqlReadyAttempts = Number('60')
const mysqlReadyIntervalMs = Number('250')
const occurredAtMs = Number('1758376800000')
const receivedAtMs = Number('1758376801000')
const payloadJson = '{"decision":"defer_watering"}'

/** 真实 MySQL 连接承载的事务上下文。 */
type MysqlTestTransaction = TransactionExecutionContext & {
  /** 当前事务独占的真实 MySQL 连接。 */
  readonly connection: PoolConnection
}

let pool: Pool

/** 执行 Docker CLI，并在失败时保留原始错误。 */
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

/** 进行有界等待，仅用于轮询一次性 MySQL 容器。 */
function wait(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

/** 以真实查询确认 MySQL 已可接受业务连接。 */
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
    await wait(mysqlReadyIntervalMs)
  }
  throw new Error('MySQL 容器未在有界时间内就绪')
}

/** 创建隔离数据库并回放奖励 inbox 的真实最小 DDL。 */
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

/** 读取 Docker 随机映射的 MySQL 本机端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析 MySQL 容器映射端口')
  }
  return port
}

/** 使用同一真实连接执行事务并在终态释放。 */
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

/** 把 mysql2 连接适配为奖励 inbox Repository 的参数化 SQL 端口。 */
function createSqlExecutor(): RewardInboxSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('奖励 inbox Repository 产生了不受支持的 SQL 参数')
    })

  return {
    executePrincipalQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly RewardInboxPrincipalSqlRow[]
    },
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly RewardInboxSqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows } satisfies RewardInboxSqlWriteResult
    }
  }
}

/** 构造通过事件 Schema 与奖励策略解析后的固定输入。 */
function createInput(overrides: Partial<ReserveRewardInboxInput> = {}): ReserveRewardInboxInput {
  return {
    eventId: 'evt_reward_mysql_0001' as EventRef,
    eventType: 'care.soil_check_completed.v1',
    eventVersion: 1,
    producerDomain: 'care',
    userRef: 'usr_reward_mysql_0001' as UserRef,
    userPlantRef: 'upl_reward_mysql_0001' as UserPlantRef,
    aggregateRef: 'care_plan_reward_mysql_0001',
    occurrenceRef: 'soil_check_reward_mysql_0001',
    businessUniqueKey: 'soil-check:soil_check_reward_mysql_0001',
    payloadJson,
    payloadHash: createHash('sha256').update(payloadJson).digest('hex'),
    producerPolicyVersion: 'care-soil-check/2026-09-20.1',
    rewardPolicyVersion: 'care-points/2026-09-20.1',
    rewardPolicyContentSha256: 'b'.repeat(Number('64')),
    occurredAtMs,
    receivedAtMs,
    ...overrides
  }
}

/**
 * Expected 来源：`reward-events/v1` 的至少一次投递、双唯一键去重和同事件防篡改合同。
 * 测试层次：L3 / `unit_real_data`；执行真实 MySQL 8.4、真实 DDL、事务和 Repository。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL。
 * 明确未覆盖：积分账本、等级奖励、dispatcher、HTTP、CloudBase 网络和提交结果未知对账。
 */
describe('奖励事件 inbox 的真实 MySQL 并发幂等', () => {
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
    pool = createPool({
      host: '127.0.0.1',
      port: resolvePublishedPort(),
      user: 'root',
      database: databaseName,
      connectionLimit: Number('4')
    })
    await pool.execute(`
      INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
      VALUES ('', 'usr_reward_mysql_0001', 'active', 1, 1000, 1000)
    `)
  })

  afterAll(async () => {
    if (pool !== undefined) {
      await pool.end()
    }
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('同一事件并发投递只首次预留一次，重放与业务重复均不新增', async () => {
    const repository = createMysqlRewardInboxRepository(createSqlExecutor())
    const driver = createTransactionDriver()
    const reserve = (input: ReserveRewardInboxInput) =>
      runDatabaseTransaction(driver, transaction => repository.reserve(transaction, input))

    const concurrentResults = await Promise.all([reserve(createInput()), reserve(createInput())])
    expect(concurrentResults.map(result => result.kind).sort()).toEqual(['replayed', 'reserved'])

    await expect(
      reserve(
        createInput({
          eventId: 'evt_reward_mysql_0002' as EventRef
        })
      )
    ).resolves.toMatchObject({ kind: 'duplicate_business', status: 'received' })

    const [countRows] = await pool.query<RowDataPacket[]>(
      'SELECT COUNT(*) AS row_count FROM subscription_reward_inbox'
    )
    expect(Number(countRows[Number('0')]?.row_count)).toBe(Number('1'))
  })

  test('同一事件 ID 的合法但不同载荷被识别为幂等冲突', async () => {
    const changedPayloadJson = '{"decision":"water_now"}'
    const repository = createMysqlRewardInboxRepository(createSqlExecutor())

    await expect(
      runDatabaseTransaction(createTransactionDriver(), transaction =>
        repository.reserve(
          transaction,
          createInput({
            payloadJson: changedPayloadJson,
            payloadHash: createHash('sha256').update(changedPayloadJson).digest('hex')
          })
        )
      )
    ).rejects.toMatchObject({ type: 'IDEMPOTENCY_CONFLICT' })
  })
})
