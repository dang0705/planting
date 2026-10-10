import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { createPool, type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import type { UserPlantRef, UserRef, UserPrincipalDto } from '../../src/contracts/types.js'
import {
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import { createGetUserPlantApplicationService } from '../../src/user-plant/application/get-user-plant.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlExecutor,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const databaseName = `qinghuazhi_v2_user_plant_read_${String(process.pid)}`
const containerName = `qhz-v2-user-plant-read-${String(process.pid)}`
const mysqlImage = 'mysql:8.4'
const currentUser = 'usr_userplant_read_001' as UserRef
const anotherUser = 'usr_userplant_read_002' as UserRef
const activePlant = 'upl_userplant_read_active'
const archivedPlant = 'upl_userplant_read_archived'
const confirmedPlant = 'upl_userplant_read_confirmed'
const deletingPlant = 'upl_userplant_read_deleting'
const deletedPlant = 'upl_userplant_read_deleted'
const foreignPlant = 'upl_userplant_read_foreign'
const identityRef = 'pid_01J8Z3H4R57V4G2QPG6C5W8K9M'
const evidenceHash = 'a'.repeat(Number('64'))
const releaseHash = 'b'.repeat(Number('64'))
const itemHash = 'c'.repeat(Number('64'))
const createdAtMs = Number('1000')
const updatedAtMs = Number('3000')
let pool: Pool
let publishedPort = Number('0')
const executedSql: string[] = []
let writeCallCount = Number('0')

/** 用户植物读取测试使用的真实 MySQL 事务上下文。 */
type MysqlUserPlantTransaction = TransactionExecutionContext & {
  /** 当前事务独占的 MySQL 连接；仅数据库 Repository 执行器可读取。 */
  readonly connection: PoolConnection
}

/** 调用 Docker CLI 并完整保留失败诊断，避免容器测试静默跳过。 */
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

/** 轮询真实 MySQL 8.4 服务端，不把容器 running 当成数据库就绪。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < Number('60'); attempt += Number('1')) {
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
        'SELECT @@port, VERSION();'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === Number('0') && result.stdout.trim().startsWith('3306\t8.4.')) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, Number('250')))
  }
  throw new Error('MySQL 8.4 container did not become ready within the bounded wait')
}

/** 读取隔离容器发布给本机的随机 MySQL 端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('Could not resolve the isolated MySQL 8.4 port')
  }
  return port
}

/** 通过 MySQL 官方客户端创建隔离数据库并顺序执行冻结 DDL。 */
function applySchema(): void {
  runDocker([
    'exec',
    containerName,
    'mysql',
    '--no-defaults',
    '-uroot',
    '-e',
    `CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
  ])
  // 030（Lux 存档）为单株读取投影新增 user_plant_care_contexts 三列，需在 003 之后执行。
  for (const fileName of ['001_identity.sql', '002_plant_knowledge.sql', '003_user_plant.sql', '030_user_plant_care_context_plant_light.sql']) {
    const sql = fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/schema', fileName), 'utf8')
    try {
      runDocker(
        ['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName],
        sql
      )
    } catch (error: unknown) {
      const logs = spawnSync('docker', ['logs', '--tail', '80', containerName], {
        encoding: 'utf8'
      })
      throw new Error(
        `${fileName} execution failed: ${String(error)}\n${logs.stderr || logs.stdout}`
      )
    }
  }
}

/** 把执行器参数缩窄到 mysql2 明确支持的标量集合。 */
function resolveSqlParameters(parameters: readonly unknown[]): (string | number | null)[] {
  return parameters.map(parameter => {
    if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
      return parameter
    }
    throw new Error('user-plant Repository emitted an unsupported SQL parameter')
  })
}

/** 使用真实连接执行 Repository 参数化查询并记录 SQL 形状。 */
function createRepository() {
  const executor: UserPlantSqlExecutor<MysqlUserPlantTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      executedSql.push(sql)
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveSqlParameters(parameters)
      )
      return rows as unknown as readonly UserPlantSqlRow[]
    },
    async executeWrite() {
      writeCallCount += Number('1')
      throw new Error('GET user plant must not execute a write query')
    }
  }
  return createMysqlUserPlantRepository(executor)
}

/** 每个应用查询都从连接池申请独立事务并在结束后释放连接。 */
function createTransactionDriver(): DatabaseTransactionDriver<MysqlUserPlantTransaction> {
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

/** 创建由身份域解析出的测试登录主体，不向业务服务传入平台主体信息。 */
function createPrincipal(userRef: UserRef = currentUser): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: Number('1'),
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T03:00:00.000Z',
    expiresAt: '2026-09-21T03:00:00.000Z'
  }
}

/** 用真实 MySQL 外键写入一株用户植物状态样本。 */
async function insertPlant(input: {
  readonly plantRef: string
  readonly owner: UserRef
  readonly lifecycle: 'active' | 'archived' | 'deleting' | 'deleted'
  readonly identityStatus: 'unidentified' | 'candidate_pending' | 'confirmed'
  readonly identityId: number | null
}): Promise<void> {
  await pool.execute(
    `INSERT INTO user_plants
       (_openid, public_user_plant_id, user_internal_id, lifecycle_status,
        current_identity_status, confirmed_identity_internal_id, version,
        created_at_ms, updated_at_ms)
     SELECT '', ?, u.id, ?, ?, ?, 2, ?, ?
     FROM users AS u
     WHERE u.public_user_id = ?`,
    [
      input.plantRef,
      input.lifecycle,
      input.identityStatus,
      input.identityId,
      createdAtMs,
      updatedAtMs,
      input.owner
    ]
  )
}

/** 建立真实用户、已发布身份及 active/archive/deleting/deleted 数据样本。 */
async function seedFixtures(): Promise<void> {
  await pool.execute(
    `INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
     VALUES ('', ?, 'active', 1, ?, ?), ('', ?, 'active', 1, ?, ?)`,
    [currentUser, createdAtMs, updatedAtMs, anotherUser, createdAtMs, updatedAtMs]
  )
  await pool.execute(
    `INSERT INTO plant_taxa
       (_openid, public_taxon_ref, authority_source, authority_taxon_id,
        accepted_scientific_name, taxon_rank, nomenclatural_status,
        source_version, retrieved_at_ms, evidence_hash, review_status,
        created_at_ms, updated_at_ms)
     VALUES ('', 'txr_userplant_read_001', 'POWO', 'user-plant-read-fixture-v1',
             'Monstera deliciosa', 'species', 'accepted', 'fixture-v1', ?, ?, 'ACTIVE', ?, ?)`,
    [createdAtMs, evidenceHash, createdAtMs, updatedAtMs]
  )
  await pool.execute(
    `INSERT INTO plant_identities
       (_openid, public_identity_ref, primary_taxon_internal_id, display_name_zh,
        identity_kind, review_status, active_release_internal_id, created_at_ms, updated_at_ms)
     SELECT '', ?, t.id, '龟背竹', 'taxon', 'ACTIVE', NULL, ?, ?
     FROM plant_taxa AS t WHERE t.public_taxon_ref = 'txr_userplant_read_001'`,
    [identityRef, createdAtMs, updatedAtMs]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_releases
       (_openid, release_ref, release_kind, schema_version, artifact_ref,
        artifact_hash, record_count, released_at_ms, created_at_ms, updated_at_ms)
     VALUES ('', 'rel_userplant_read_001', 'identity', 'identity/v1',
             'fixture://user-plant-read/identity', ?, 1, ?, ?, ?)`,
    [releaseHash, updatedAtMs, createdAtMs, updatedAtMs]
  )
  await pool.execute(
    `INSERT INTO plant_knowledge_release_items
       (_openid, release_internal_id, subject_kind, subject_ref,
        evidence_manifest_sha256, decision_ref, admission_status,
        release_item_sha256, created_at_ms, updated_at_ms)
     SELECT '', r.id, 'identity', ?, ?, 'review_userplant_read_001', 'ACTIVE', ?, ?, ?
     FROM plant_knowledge_releases AS r WHERE r.release_ref = 'rel_userplant_read_001'`,
    [identityRef, evidenceHash, itemHash, createdAtMs, updatedAtMs]
  )
  await pool.execute(
    `UPDATE plant_identities AS i
     JOIN plant_knowledge_releases AS r ON r.release_ref = 'rel_userplant_read_001'
     SET i.active_release_internal_id = r.id
     WHERE i.public_identity_ref = ?`,
    [identityRef]
  )
  await pool.execute(
    `INSERT INTO active_plant_knowledge_releases
       (_openid, release_kind, release_internal_id, active_release_version,
        active_artifact_sha256, version, activated_at_ms, created_at_ms, updated_at_ms)
     SELECT '', 'identity', r.id, 'fixture-v1', ?, 1, ?, ?, ?
     FROM plant_knowledge_releases AS r WHERE r.release_ref = 'rel_userplant_read_001'`,
    [releaseHash, updatedAtMs, createdAtMs, updatedAtMs]
  )

  const [[identityRow]] = await pool.execute<RowDataPacket[]>(
    'SELECT CAST(id AS CHAR) AS identity_id FROM plant_identities WHERE public_identity_ref = ?',
    [identityRef]
  )
  if (!identityRow || typeof identityRow.identity_id !== 'string') {
    throw new Error('Published identity fixture did not persist')
  }
  const identityId = Number(identityRow.identity_id)
  if (!Number.isSafeInteger(identityId) || identityId <= Number('0')) {
    throw new Error('Published identity internal key fixture is invalid')
  }

  await insertPlant({
    plantRef: activePlant,
    owner: currentUser,
    lifecycle: 'active',
    identityStatus: 'unidentified',
    identityId: null
  })
  await insertPlant({
    plantRef: archivedPlant,
    owner: currentUser,
    lifecycle: 'archived',
    identityStatus: 'candidate_pending',
    identityId: null
  })
  await insertPlant({
    plantRef: confirmedPlant,
    owner: currentUser,
    lifecycle: 'active',
    identityStatus: 'confirmed',
    identityId
  })
  await insertPlant({
    plantRef: deletingPlant,
    owner: currentUser,
    lifecycle: 'deleting',
    identityStatus: 'unidentified',
    identityId: null
  })
  await insertPlant({
    plantRef: deletedPlant,
    owner: currentUser,
    lifecycle: 'deleted',
    identityStatus: 'unidentified',
    identityId: null
  })
  await insertPlant({
    plantRef: foreignPlant,
    owner: anotherUser,
    lifecycle: 'active',
    identityStatus: 'unidentified',
    identityId: null
  })
}

/** 将字符串公开引用作为合同类型的植物路径输入。 */
function plantRef(value: string): UserPlantRef {
  return value as UserPlantRef
}

/**
 * Expected 来源：`contracts/user-plant.md`、`contracts/http-api.md`、`001_identity.sql`、
 * `002_plant_knowledge.sql`、`003_user_plant.sql` 与主代理关于 deleting 可见性的裁决。
 * 测试层次：L3 / `unit_real_data`；调用真实 user-plant 应用服务、Repository、事务驱动、mysql2、
 * MySQL 8.4 和冻结 DDL，不经过 CloudBase 或 HTTP 网关。
 * 明确未覆盖：CloudBase MySQL 兼容、身份令牌解析、HTTP 路由/AJV、部署与网络故障。
 */
describe('用户植物单株读取的真实 MySQL 8.4 归属与脱敏读回', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '-P',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      mysqlImage
    ])
    await waitForMysql()
    applySchema()
    publishedPort = resolvePublishedPort()
    pool = createPool({
      host: '127.0.0.1',
      port: publishedPort,
      user: 'root',
      password: '',
      database: databaseName,
      connectionLimit: Number('4'),
      decimalNumbers: false
    })
    try {
      await seedFixtures()
    } catch (error: unknown) {
      const logs = spawnSync('docker', ['logs', '--tail', '80', containerName], {
        encoding: 'utf8'
      })
      throw new Error(
        `Could not seed MySQL 8.4 user-plant fixtures: ${String(error)}\n${logs.stderr || logs.stdout}`
      )
    }
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('owner 可读 active 与 archived，响应严格符合公开 DTO 且不泄漏归属内部键', async () => {
    executedSql.length = Number('0')
    writeCallCount = Number('0')
    const service = createGetUserPlantApplicationService({
      driver: createTransactionDriver(),
      repository: createRepository()
    })

    const active = await service({
      principal: createPrincipal(),
      userPlantRef: plantRef(activePlant)
    })
    expect(active).toEqual({
      status: Number('200'),
      body: {
        data: {
          user_plant_id: activePlant,
          lifecycle: 'active',
          identityStatus: 'unidentified',
          version: Number('2'),
          createdAt: '1970-01-01T00:00:01.000Z',
          updatedAt: '1970-01-01T00:00:03.000Z'
        }
      }
    })
    const archived = await service({
      principal: createPrincipal(),
      userPlantRef: plantRef(archivedPlant)
    })
    expect(archived).toEqual({
      status: Number('200'),
      body: {
        data: {
          user_plant_id: archivedPlant,
          lifecycle: 'archived',
          identityStatus: 'candidate_pending',
          version: Number('2'),
          createdAt: '1970-01-01T00:00:01.000Z',
          updatedAt: '1970-01-01T00:00:03.000Z'
        }
      }
    })
    const serialized = JSON.stringify([active, archived])
    expect(serialized).not.toMatch(/user_id|user_internal_id|user_plant_internal_id|databaseId/iu)
    expect(executedSql).toHaveLength(Number('2'))
    expect(writeCallCount).toBe(Number('0'))
  })

  test('confirmed 植物只返回与确认身份关联的公开 pid 引用', async () => {
    const service = createGetUserPlantApplicationService({
      driver: createTransactionDriver(),
      repository: createRepository()
    })

    await expect(
      service({ principal: createPrincipal(), userPlantRef: plantRef(confirmedPlant) })
    ).resolves.toEqual({
      status: Number('200'),
      body: {
        data: {
          user_plant_id: confirmedPlant,
          lifecycle: 'active',
          identityStatus: 'confirmed',
          confirmedIdentityRef: identityRef,
          version: Number('2'),
          createdAt: '1970-01-01T00:00:01.000Z',
          updatedAt: '1970-01-01T00:00:03.000Z'
        }
      }
    })
  })

  test('跨用户、不存在、deleting 与 deleted 的公开错误完全相同', async () => {
    const service = createGetUserPlantApplicationService({
      driver: createTransactionDriver(),
      repository: createRepository()
    })
    const baseline = await service({
      principal: createPrincipal(),
      userPlantRef: plantRef('upl_userplant_read_missing')
    })

    for (const ref of [foreignPlant, deletingPlant, deletedPlant]) {
      await expect(
        service({ principal: createPrincipal(), userPlantRef: plantRef(ref) })
      ).resolves.toEqual(baseline)
    }
    expect(baseline).toEqual({
      status: Number('404'),
      body: {
        error: {
          type: 'USER_PLANT_NOT_FOUND',
          message: '用户植物不存在或不可访问'
        }
      }
    })
  })
})
