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
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

import type { EventRef, UserPlantRef, UserRef } from '../../src/contracts/types.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createApplyRewardPointsEventUseCase } from '../../src/subscription/application/apply-reward-points-event.js'
import {
  createMysqlRewardCommitUnknownReadOnlyRepository,
  type RewardCommitUnknownSqlRow
} from '../../src/subscription/repository/mysql-reward-commit-unknown-repository.js'
import {
  createMysqlRewardInboxRepository,
  type ReserveRewardInboxInput,
  type RewardInboxPrincipalSqlRow,
  type RewardInboxSqlExecutor,
  type RewardInboxSqlRow,
  type RewardInboxSqlWriteResult
} from '../../src/subscription/repository/mysql-reward-inbox-repository.js'
import {
  createMysqlRewardPointsRepository,
  type RewardPointsSqlExecutor,
  type RewardPointsSqlRow,
  type RewardPointsSqlWriteResult
} from '../../src/subscription/repository/mysql-reward-points-repository.js'
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
const crossUserOwnerRef = 'usr_reward_mysql_cross_owner_0001' as UserRef
const crossUserOtherRef = 'usr_reward_mysql_cross_other_0001' as UserRef

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

/** 模拟数据库已提交、但客户端在收到提交确认前断线的真实危险边界。 */
function createCommitUnknownAfterCommitDriver(): DatabaseTransactionDriver<MysqlTestTransaction> {
  const driver = createTransactionDriver()
  return {
    ...driver,
    commitTransaction: async transaction => {
      await driver.commitTransaction(transaction)
      throw new DatabaseCommitResultUnknownError('连接在 COMMIT 成功后中断')
    }
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

/** 把 mysql2 连接适配为奖励积分 Repository 的参数化 SQL 端口。 */
function createRewardPointsSqlExecutor(): RewardPointsSqlExecutor<MysqlTestTransaction> {
  const resolveParameters = (parameters: readonly unknown[]): (string | number | null)[] =>
    parameters.map(parameter => {
      if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
        return parameter
      }
      throw new Error('奖励积分 Repository 产生了不受支持的 SQL 参数')
    })

  return {
    executeQuery: async (transaction, sql, parameters) => {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveParameters(parameters)
      )
      return rows as unknown as readonly RewardPointsSqlRow[]
    },
    executeWrite: async (transaction, sql, parameters) => {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveParameters(parameters)
      )
      return { affectedRows: result.affectedRows } satisfies RewardPointsSqlWriteResult
    }
  }
}

/** 把连接池新连接适配为奖励提交未知无事务只读端口。 */
function createRewardCommitUnknownReadOnlyExecutor() {
  return {
    executeQuery: async (sql: string, parameters: readonly unknown[]) => {
      const safeParameters = parameters.map(parameter => {
        if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
          return parameter
        }
        throw new Error('奖励提交未知 Repository 产生了不受支持的 SQL 参数')
      })
      const [rows] = await pool.execute<RowDataPacket[]>(sql, safeParameters)
      return rows as unknown as readonly RewardCommitUnknownSqlRow[]
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

/** 每个用例后清理跨用户冲突专用数据，避免污染本文件其他真实 MySQL 场景。 */
async function cleanupCrossUserFixture(): Promise<void> {
  if (pool === undefined) {
    return
  }
  const userRefs = [crossUserOwnerRef, crossUserOtherRef]
  await pool.execute(
    `UPDATE care_point_accounts SET last_ledger_internal_id = NULL
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `UPDATE ai_quota_accounts SET last_ledger_internal_id = NULL
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM care_level_grants
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM subscription_reward_inbox
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM care_point_ledger
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM ai_quota_ledger
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM ai_quota_grants
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM care_point_accounts
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute(
    `DELETE FROM ai_quota_accounts
     WHERE user_internal_id IN (SELECT id FROM users WHERE public_user_id IN (?, ?))`,
    userRefs
  )
  await pool.execute('DELETE FROM users WHERE public_user_id IN (?, ?)', userRefs)
}

/**
 * Expected 来源：P2 订阅票据的同键异参冲突要求，以及 `reward-events/v1` 的至少一次投递、双唯一键去重和事件不可变合同。
 * 测试层次：L3 / `unit_real_data`；执行真实应用用例、MySQL 8.4、真实 DDL、事务和 Repository。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL，不替换订阅应用、Repository 或事务行为。
 * 明确未覆盖：dispatcher、HTTP、CloudBase 网络和生产 MySQL 驱动；本文件覆盖积分、等级奖励和提交未知只读对账。
 * 新增反向用例：同用户、同业务唯一键但事件事实改写必须报幂等冲突，且积分/等级/AI 额度均不得二次变化。
 */
describe('奖励事件 inbox 的真实 MySQL 并发幂等', () => {
  afterEach(async () => {
    await cleanupCrossUserFixture()
  })

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
    await pool.execute(`
      INSERT INTO care_point_accounts
        (_openid, user_internal_id, available_points, lifetime_net_earned, level_code,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
      SELECT '', id, 80, 80, 'L0', 1, NULL, 1000, 1000
      FROM users WHERE public_user_id = 'usr_reward_mysql_0001'
    `)
    await pool.execute(`
      INSERT INTO ai_quota_accounts
        (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
      SELECT '', id, 0, 0, 0, 1, NULL, 1000, 1000
      FROM users WHERE public_user_id = 'usr_reward_mysql_0001'
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

  test.each([
    {
      name: '载荷内容改变',
      changeInput: (input: ReserveRewardInboxInput): ReserveRewardInboxInput => {
        const changedPayloadJson = '{"decision":"water_now"}'
        return {
          ...input,
          payloadJson: changedPayloadJson,
          payloadHash: createHash('sha256').update(changedPayloadJson).digest('hex')
        }
      }
    },
    {
      name: '业务发生编号改变',
      changeInput: (input: ReserveRewardInboxInput): ReserveRewardInboxInput => ({
        ...input,
        occurrenceRef: 'soil_check_same_business_changed_0001'
      })
    }
  ])('同一用户同一业务唯一键的不同事件载荷异参必须冲突：$name', async ({ name, changeInput }) => {
    const userRef = crossUserOwnerRef
    const businessUniqueKey = `soil-check:same-user-changed-${name === '载荷内容改变' ? 'payload' : 'occurrence'}-0001`
    await pool.execute(
      `INSERT INTO users
        (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('', ?, 'active', 1, ?, ?)`,
      [userRef, occurredAtMs, occurredAtMs]
    )
    await pool.execute(
      `INSERT INTO care_point_accounts
        (_openid, user_internal_id, available_points, lifetime_net_earned, level_code,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
       SELECT '', id, 30, 30, 'L0', 1, NULL, ?, ?
       FROM users WHERE public_user_id = ?`,
      [occurredAtMs, occurredAtMs, userRef]
    )
    await pool.execute(
      `INSERT INTO ai_quota_accounts
        (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
       SELECT '', id, 0, 0, 0, 1, NULL, ?, ?
       FROM users WHERE public_user_id = ?`,
      [occurredAtMs, occurredAtMs, userRef]
    )

    let pointLedgerSequence = Number('0')
    const applyReward = createApplyRewardPointsEventUseCase({
      driver: createTransactionDriver(),
      inboxRepository: createMysqlRewardInboxRepository(createSqlExecutor()),
      pointsRepository: createMysqlRewardPointsRepository(createRewardPointsSqlExecutor()),
      commitUnknownReadOnlyRepository: createMysqlRewardCommitUnknownReadOnlyRepository(
        createRewardCommitUnknownReadOnlyExecutor()
      ),
      createPointLedgerRef: () => `cpl_same_business_changed_${String(++pointLedgerSequence)}`,
      createLevelGrantRef: levelCode => `clg_same_business_changed_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_same_business_changed_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_same_business_changed_${levelCode}`
    })
    const originalInbox = createInput({
      eventId: 'evt_reward_same_business_original_0001' as EventRef,
      userRef,
      aggregateRef: 'care_plan_same_business_original_0001',
      occurrenceRef: 'soil_check_same_business_original_0001',
      businessUniqueKey,
      payloadJson,
      payloadHash: createHash('sha256').update(payloadJson).digest('hex'),
      occurredAtMs: occurredAtMs + Number('100'),
      receivedAtMs: receivedAtMs + Number('100')
    })
    const rewardCommand = {
      inbox: originalInbox,
      pointsAmount: Number('300'),
      levelPolicy: [
        { code: 'L0', threshold: Number('0'), aiReward: Number('0') },
        { code: 'L1', threshold: Number('100'), aiReward: Number('50') },
        { code: 'L2', threshold: Number('300'), aiReward: Number('100') }
      ],
      levelRewardExpiresAtMs: occurredAtMs + Number('7776000000'),
      appliedAtMs: occurredAtMs + Number('200')
    } as const
    const changedInbox = {
      ...changeInput(originalInbox),
      eventId: 'evt_reward_same_business_changed_0001' as EventRef,
      receivedAtMs: receivedAtMs + Number('300')
    }

    await expect(applyReward(rewardCommand)).resolves.toMatchObject({
      kind: 'applied',
      resultRef: 'cpl_same_business_changed_1',
      awardedLevels: ['L1', 'L2']
    })
    await expect(applyReward({ ...rewardCommand, inbox: changedInbox })).rejects.toMatchObject({
      type: 'IDEMPOTENCY_CONFLICT'
    })

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT point_account.available_points, point_account.lifetime_net_earned,
              point_account.level_code, quota_account.available_amount,
              (SELECT COUNT(*) FROM subscription_reward_inbox AS inbox
               WHERE inbox.user_internal_id = user_row.id
                 AND inbox.business_unique_key = ?) AS inbox_count,
              (SELECT COUNT(*) FROM care_point_ledger AS point_ledger
               WHERE point_ledger.user_internal_id = user_row.id) AS point_ledger_count,
              (SELECT COUNT(*) FROM care_level_grants AS level_grant
               WHERE level_grant.user_internal_id = user_row.id) AS level_grant_count,
              (SELECT COUNT(*) FROM ai_quota_grants AS quota_grant
               WHERE quota_grant.user_internal_id = user_row.id) AS ai_grant_count,
              (SELECT COUNT(*) FROM ai_quota_ledger AS quota_ledger
               WHERE quota_ledger.user_internal_id = user_row.id) AS ai_ledger_count
       FROM users AS user_row
       JOIN care_point_accounts AS point_account ON point_account.user_internal_id = user_row.id
       JOIN ai_quota_accounts AS quota_account ON quota_account.user_internal_id = user_row.id
       WHERE user_row.public_user_id = ?`,
      [businessUniqueKey, userRef]
    )
    expect(rows).toEqual([
      {
        available_points: Number('330'),
        lifetime_net_earned: Number('330'),
        level_code: 'L2',
        available_amount: Number('150'),
        inbox_count: Number('1'),
        point_ledger_count: Number('1'),
        level_grant_count: Number('2'),
        ai_grant_count: Number('2'),
        ai_ledger_count: Number('2')
      }
    ])
  })

  test('不同用户碰撞同一奖励业务唯一键时失败关闭且不泄露既有账本引用', async () => {
    const userA = crossUserOwnerRef
    const userB = crossUserOtherRef
    const businessUniqueKey = 'soil-check:cross-user-reward-unique-0001'
    await pool.execute(
      `INSERT INTO users
        (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('', ?, 'active', 1, ?, ?), ('', ?, 'active', 1, ?, ?)`,
      [userA, occurredAtMs, occurredAtMs, userB, occurredAtMs, occurredAtMs]
    )
    await pool.execute(
      `INSERT INTO care_point_accounts
        (_openid, user_internal_id, available_points, lifetime_net_earned, level_code,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
       SELECT '', id, 30, 30, 'L0', 1, NULL, ?, ?
       FROM users WHERE public_user_id IN (?, ?)`,
      [occurredAtMs, occurredAtMs, userA, userB]
    )
    await pool.execute(
      `INSERT INTO ai_quota_accounts
        (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount,
         version, last_ledger_internal_id, created_at_ms, updated_at_ms)
       SELECT '', id, 0, 0, 0, 1, NULL, ?, ?
       FROM users WHERE public_user_id IN (?, ?)`,
      [occurredAtMs, occurredAtMs, userA, userB]
    )

    let pointLedgerSequence = Number('0')
    const applyReward = createApplyRewardPointsEventUseCase({
      driver: createTransactionDriver(),
      inboxRepository: createMysqlRewardInboxRepository(createSqlExecutor()),
      pointsRepository: createMysqlRewardPointsRepository(createRewardPointsSqlExecutor()),
      commitUnknownReadOnlyRepository: createMysqlRewardCommitUnknownReadOnlyRepository(
        createRewardCommitUnknownReadOnlyExecutor()
      ),
      createPointLedgerRef: () => `cpl_reward_cross_user_${String(++pointLedgerSequence)}`,
      createLevelGrantRef: levelCode => `clg_reward_cross_user_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_reward_cross_user_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_reward_cross_user_${levelCode}`
    })
    const levelPolicy = [
      { code: 'L0', threshold: Number('0'), aiReward: Number('0') },
      { code: 'L1', threshold: Number('100'), aiReward: Number('0') }
    ] as const
    const commandA = {
      inbox: createInput({
        eventId: 'evt_reward_cross_user_owner_0001' as EventRef,
        userRef: userA,
        aggregateRef: 'care_plan_cross_user_owner_0001',
        occurrenceRef: 'soil_check_cross_user_owner_0001',
        businessUniqueKey,
        occurredAtMs: occurredAtMs + Number('100'),
        receivedAtMs: receivedAtMs + Number('100')
      }),
      pointsAmount: Number('5'),
      levelPolicy,
      levelRewardExpiresAtMs: occurredAtMs + Number('7776000000'),
      appliedAtMs: occurredAtMs + Number('200')
    } as const
    const commandB = {
      inbox: createInput({
        eventId: 'evt_reward_cross_user_other_0001' as EventRef,
        userRef: userB,
        userPlantRef: 'upl_reward_cross_other_0001' as UserPlantRef,
        aggregateRef: 'care_plan_cross_user_other_0001',
        occurrenceRef: 'soil_check_cross_user_other_0001',
        businessUniqueKey,
        occurredAtMs: occurredAtMs + Number('300'),
        receivedAtMs: receivedAtMs + Number('350')
      }),
      pointsAmount: Number('5'),
      levelPolicy,
      levelRewardExpiresAtMs: occurredAtMs + Number('7776000000'),
      appliedAtMs: occurredAtMs + Number('400')
    } as const

    await expect(applyReward(commandA)).resolves.toMatchObject({
      kind: 'applied',
      resultRef: 'cpl_reward_cross_user_1'
    })
    await expect(applyReward(commandB)).rejects.toMatchObject({ type: 'INTERNAL_DATA_INVALID' })

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT user_row.public_user_id, point_account.available_points,
              point_account.lifetime_net_earned, point_account.level_code,
              quota_account.available_amount,
              (SELECT COUNT(*) FROM care_point_ledger AS point_ledger
               WHERE point_ledger.user_internal_id = user_row.id) AS point_ledger_count,
              (SELECT COUNT(*) FROM ai_quota_grants AS quota_grant
               WHERE quota_grant.user_internal_id = user_row.id) AS quota_grant_count,
              (SELECT COUNT(*) FROM subscription_reward_inbox AS inbox
               WHERE inbox.user_internal_id = user_row.id
                 AND inbox.business_unique_key = ?) AS owned_inbox_count
       FROM users AS user_row
       JOIN care_point_accounts AS point_account ON point_account.user_internal_id = user_row.id
       JOIN ai_quota_accounts AS quota_account ON quota_account.user_internal_id = user_row.id
       WHERE user_row.public_user_id IN (?, ?)
       ORDER BY user_row.public_user_id`,
      [businessUniqueKey, userA, userB]
    )
    expect(rows).toEqual([
      {
        public_user_id: userB,
        available_points: Number('30'),
        lifetime_net_earned: Number('30'),
        level_code: 'L0',
        available_amount: Number('0'),
        point_ledger_count: Number('0'),
        quota_grant_count: Number('0'),
        owned_inbox_count: Number('0')
      },
      {
        public_user_id: userA,
        available_points: Number('35'),
        lifetime_net_earned: Number('35'),
        level_code: 'L0',
        available_amount: Number('0'),
        point_ledger_count: Number('1'),
        quota_grant_count: Number('0'),
        owned_inbox_count: Number('1')
      }
    ])
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

  test('积分、跨级 AI 奖励与账户投影在一个真实事务中守恒落盘', async () => {
    const applyReward = createApplyRewardPointsEventUseCase({
      driver: createTransactionDriver(),
      inboxRepository: createMysqlRewardInboxRepository(createSqlExecutor()),
      pointsRepository: createMysqlRewardPointsRepository(createRewardPointsSqlExecutor()),
      commitUnknownReadOnlyRepository: createMysqlRewardCommitUnknownReadOnlyRepository(
        createRewardCommitUnknownReadOnlyExecutor()
      ),
      createPointLedgerRef: () => 'cpl_reward_mysql_0001',
      createLevelGrantRef: levelCode => `clg_reward_mysql_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_reward_mysql_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_reward_mysql_${levelCode}`
    })
    const rewardCommand = {
      inbox: createInput({
        eventId: 'evt_reward_points_mysql_0001' as EventRef,
        aggregateRef: 'care_plan_reward_points_mysql_0001',
        occurrenceRef: 'soil_check_reward_points_mysql_0001',
        businessUniqueKey: 'soil-check:soil_check_reward_points_mysql_0001',
        occurredAtMs: occurredAtMs + Number('100'),
        receivedAtMs: occurredAtMs + Number('150')
      }),
      pointsAmount: 250,
      levelPolicy: [
        { code: 'L0', threshold: 0, aiReward: 0 },
        { code: 'L1', threshold: 100, aiReward: 50 },
        { code: 'L2', threshold: 300, aiReward: 100 }
      ],
      levelRewardExpiresAtMs: occurredAtMs + Number('7776000000'),
      appliedAtMs: occurredAtMs + Number('200')
    } as const
    await expect(applyReward(rewardCommand)).resolves.toMatchObject({
      kind: 'applied',
      resultRef: 'cpl_reward_mysql_0001',
      awardedLevels: ['L1', 'L2']
    })
    await expect(applyReward(rewardCommand)).resolves.toEqual({
      kind: 'replayed',
      status: 'applied',
      resultRef: 'cpl_reward_mysql_0001'
    })

    const [summaryRows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT available_points FROM care_point_accounts) AS available_points,
        (SELECT lifetime_net_earned FROM care_point_accounts) AS lifetime_net_earned,
        (SELECT level_code FROM care_point_accounts) AS level_code,
        (SELECT available_amount FROM ai_quota_accounts) AS ai_available,
        (SELECT COUNT(*) FROM care_point_ledger) AS point_ledger_count,
        (SELECT COUNT(*) FROM care_level_grants) AS level_grant_count,
        (SELECT COUNT(*) FROM ai_quota_grants WHERE source_type = 'CARE_LEVEL') AS ai_grant_count,
        (SELECT COUNT(*) FROM ai_quota_ledger WHERE entry_type = 'grant') AS ai_ledger_count,
        (SELECT status FROM subscription_reward_inbox
         WHERE event_id = 'evt_reward_points_mysql_0001') AS inbox_status
    `)
    expect(summaryRows).toEqual([
      {
        available_points: 330,
        lifetime_net_earned: 330,
        level_code: 'L2',
        ai_available: 150,
        point_ledger_count: 1,
        level_grant_count: 2,
        ai_grant_count: 2,
        ai_ledger_count: 2,
        inbox_status: 'applied'
      }
    ])
  })

  test('等级唯一键中途冲突会回滚此前积分账本与账户更新', async () => {
    const repository = createMysqlRewardPointsRepository(createRewardPointsSqlExecutor())
    await expect(
      runDatabaseTransaction(createTransactionDriver(), async transaction => {
        const state = await repository.lockState(transaction, 'usr_reward_mysql_0001' as UserRef)
        await repository.apply(transaction, {
          ...state,
          pointLedgerRef: 'cpl_reward_mysql_rollback',
          sourceType: 'DUE_SOIL_CHECK',
          sourceRef: 'soil_check_reward_mysql_rollback',
          businessUniqueKey: 'soil-check:soil_check_reward_mysql_rollback',
          pointsAmount: 5,
          currentAvailablePoints: state.availablePoints,
          currentLifetimeNetEarned: state.lifetimeNetEarned,
          nextAvailablePoints: 335,
          nextLifetimeNetEarned: 335,
          nextLevelCode: 'L2',
          policyVersion: 'care-points/2026-09-20.1',
          occurredAtMs: occurredAtMs + Number('200'),
          levelRewards: [
            {
              levelCode: 'L2',
              amount: 100,
              levelGrantRef: 'clg_reward_mysql_rollback',
              aiGrantRef: 'aqg_reward_mysql_rollback',
              aiLedgerRef: 'aql_reward_mysql_rollback',
              expiresAtMs: occurredAtMs + Number('7776000000')
            }
          ]
        })
      })
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })

    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT available_points FROM care_point_accounts) AS available_points,
        (SELECT COUNT(*) FROM care_point_ledger) AS point_ledger_count,
        (SELECT COUNT(*) FROM ai_quota_grants) AS ai_grant_count
    `)
    expect(rows).toEqual([{ available_points: 330, point_ledger_count: 1, ai_grant_count: 2 }])
  })

  test('真实 MySQL 已提交但确认中断时只读对账并且不重复入账', async () => {
    const applyReward = createApplyRewardPointsEventUseCase({
      driver: createCommitUnknownAfterCommitDriver(),
      inboxRepository: createMysqlRewardInboxRepository(createSqlExecutor()),
      pointsRepository: createMysqlRewardPointsRepository(createRewardPointsSqlExecutor()),
      commitUnknownReadOnlyRepository: createMysqlRewardCommitUnknownReadOnlyRepository(
        createRewardCommitUnknownReadOnlyExecutor()
      ),
      createPointLedgerRef: () => 'cpl_reward_mysql_commit_unknown',
      createLevelGrantRef: levelCode => `clg_reward_mysql_commit_unknown_${levelCode}`,
      createAiGrantRef: levelCode => `aqg_reward_mysql_commit_unknown_${levelCode}`,
      createAiLedgerRef: levelCode => `aql_reward_mysql_commit_unknown_${levelCode}`
    })
    const command = {
      inbox: createInput({
        eventId: 'evt_reward_mysql_commit_unknown' as EventRef,
        aggregateRef: 'care_plan_reward_mysql_commit_unknown',
        occurrenceRef: 'soil_check_reward_mysql_commit_unknown',
        businessUniqueKey: 'soil-check:reward_mysql_commit_unknown',
        occurredAtMs: occurredAtMs + Number('300'),
        receivedAtMs: occurredAtMs + Number('350')
      }),
      pointsAmount: 5,
      levelPolicy: [
        { code: 'L0', threshold: 0, aiReward: 0 },
        { code: 'L1', threshold: 100, aiReward: 50 },
        { code: 'L2', threshold: 300, aiReward: 100 }
      ],
      levelRewardExpiresAtMs: occurredAtMs + Number('7776000000'),
      appliedAtMs: occurredAtMs + Number('400')
    } as const

    await expect(applyReward(command)).resolves.toEqual({
      kind: 'replayed',
      status: 'applied',
      resultRef: 'cpl_reward_mysql_commit_unknown'
    })
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT
        (SELECT available_points FROM care_point_accounts) AS available_points,
        (SELECT COUNT(*) FROM care_point_ledger) AS point_ledger_count,
        (SELECT COUNT(*) FROM subscription_reward_inbox
         WHERE event_id = 'evt_reward_mysql_commit_unknown' AND status = 'applied') AS inbox_count
    `)
    expect(rows).toEqual([{ available_points: 335, point_ledger_count: 2, inbox_count: 1 }])
  })
})
