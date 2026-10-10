import { createHash } from 'node:crypto'
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

import type {
  UserCapabilitySnapshotDto,
  UserPlantRef,
  UserPrincipalDto,
  UserRef
} from '../../src/contracts/types.js'
import {
  createMysqlTransactionDriver,
  type MysqlTransactionContext
} from '../../src/foundation/database/mysql-transaction-driver.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction,
  type DatabaseTransactionDriver
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencyReadOnlySqlExecutor,
  type HttpIdempotencySqlExecutor,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import {
  createArchiveUserPlantApplicationService,
  createRestoreUserPlantApplicationService
} from '../../src/user-plant/application/transition-user-plant-lifecycle.js'
import { createUserPlantApplicationService } from '../../src/user-plant/application/create-user-plant.js'
import {
  createMysqlUserPlantLifecycleRepository,
  type UserPlantLifecycleSqlExecutor,
  type UserPlantLifecycleSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-lifecycle-repository.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlExecutor,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const projectRoot = findProjectRoot()
const mysqlImage = 'mysql:8.4'
const processSuffix = String(process.pid)
const databaseName = `qhz_v2_user_plant_lifecycle_${processSuffix}`
const containerName = `qhz-v2-user-plant-lifecycle-${processSuffix}`
const ownerRef = `usr_lifecycle_owner_${processSuffix}` as UserRef
const anotherOwnerRef = `usr_lifecycle_other_${processSuffix}` as UserRef
const raceOwnerRef = `usr_lifecycle_race_${processSuffix}` as UserRef
const createdAtMs = Number('1000')
const poolConnectionLimit = Number('8')
const portZero = Number('0')
const one = Number('1')
const sha256Format = /^[a-f0-9]{64}$/u
const mysqlTestTimeoutMs = Number('30000')

/** 当前真实 MySQL 8.4 测试数据库连接池。 */
let pool: Pool

/** Docker 随机映射到本机的 MySQL TCP 端口。 */
let publishedPort = Number('0')

/** 本测试事务只在 MySQL 事务驱动和 SQL Repository 间传递真实连接。 */
type LifecycleMysqlTransaction = MysqlTransactionContext<PoolConnection>

/** 调用 Docker CLI 并在失败时保留足够诊断，避免真实数据库测试静默假绿。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input: input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`Docker command failed: ${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 等待 MySQL 服务端实际接受连接，而不是只相信容器运行状态。 */
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
  throw new Error('MySQL 8.4 未在限定等待时间内就绪')
}

/** 通过官方 MySQL 命令行在隔离容器创建空库并按冻结顺序执行 DDL。 */
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
  for (const fileName of [
    '001_identity.sql',
    '002_plant_knowledge.sql',
    '003_user_plant.sql',
    // 030（Lux 存档）为单株读取投影新增养护环境三列。
    '030_user_plant_care_context_plant_light.sql',
    '008_foundation.sql'
  ]) {
    const sql = fs.readFileSync(path.join(projectRoot, 'docs/backend-v2/schema', fileName), 'utf8')
    runDocker(['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot', databaseName], sql)
  }
}

/** 读取 Docker 随机映射到本机的 MySQL 端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= portZero) {
    throw new Error('无法读取隔离 MySQL 的随机映射端口')
  }
  return port
}

/** 把查询参数限制为本 Repository 当前使用的 MySQL 标量集合。 */
function resolveSqlParameters(parameters: readonly unknown[]): (string | number | null)[] {
  return parameters.map(parameter => {
    if (parameter === null || typeof parameter === 'string' || typeof parameter === 'number') {
      return parameter
    }
    throw new Error('生命周期 Repository 产生了不支持的 SQL 参数')
  })
}

/** 使用 SHA-256 构造测试用不可逆唯一作用域和规范化载荷摘要。 */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** 创建经身份域解析的统一用户主体，不含平台主体标识。 */
function createPrincipal(userRef: UserRef = ownerRef): UserPrincipalDto {
  return {
    principalType: 'user',
    user_id: userRef,
    sessionVersion: one,
    authenticatedVia: 'wechat',
    issuedAt: '2026-09-20T00:00:00.000Z',
    expiresAt: '2026-09-25T00:00:00.000Z'
  }
}

/** 构造用于恢复与创建竞争的已验证免费用户能力快照。 */
function createCapabilitySnapshot(
  userRef: UserRef = ownerRef,
  activeUserPlantLimit: number = Number('1')
): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_userplant_mysql_001',
    subjectType: 'user',
    user_id: userRef,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: activeUserPlantLimit,
    generatedAt: '2026-09-21T00:00:00.000Z',
    validUntil: '2026-09-22T00:00:00.000Z',
    policyVersion: 'user-plant-limit/2026-09-20.1'
  }
}

/** 根据冻结路由登记生成归档或恢复动作的完整幂等范围。 */
function createIdempotencyInput(input: {
  readonly operation: 'create' | 'archive' | 'restore'
  readonly owner?: UserRef
  readonly plantRef: UserPlantRef
  readonly expectedVersion: number
  readonly keySuffix: string
}): {
  readonly principalType: 'user'
  readonly principalScopeHash: string
  readonly httpMethod: 'POST'
  readonly normalizedPath: string
  readonly operationId: string
  readonly idempotencyKeyHash: string
  readonly requestHash: string
  readonly expiresAtMs: number
  readonly createdAtMs: number
} {
  const route =
    input.operation === 'create'
      ? {
          operationId: 'createUserPlant',
          normalizedPath: '/api/v2/user-plants'
        }
      : input.operation === 'archive'
        ? {
            operationId: 'archiveUserPlant',
            normalizedPath: '/api/v2/user-plants/{userPlantRef}/archive'
          }
        : {
            operationId: 'restoreUserPlant',
            normalizedPath: '/api/v2/user-plants/{userPlantRef}/restore'
          }
  const normalizedCommand = JSON.stringify(
    input.operation === 'create'
      ? {}
      : { userPlantRef: input.plantRef, expectedVersion: input.expectedVersion }
  )
  return {
    principalType: 'user',
    principalScopeHash: sha256(input.owner ?? ownerRef),
    httpMethod: 'POST',
    normalizedPath: route.normalizedPath,
    operationId: route.operationId,
    idempotencyKeyHash: sha256(`key-${input.keySuffix}`),
    requestHash: sha256(normalizedCommand),
    expiresAtMs: Number('1790000300000'),
    createdAtMs: Number('1790000000000')
  }
}

/** 创建绑定当前事务中真实 MySQL 连接的参数化执行器。 */
function createSqlExecutor() {
  const userPlantExecutor: UserPlantSqlExecutor<LifecycleMysqlTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveSqlParameters(parameters)
      )
      return rows as unknown as readonly UserPlantSqlRow[]
    },
    async executeWrite(transaction, sql, parameters) {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveSqlParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    }
  }
  const lifecycleExecutor: UserPlantLifecycleSqlExecutor<LifecycleMysqlTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveSqlParameters(parameters)
      )
      return rows as unknown as readonly UserPlantLifecycleSqlRow[]
    },
    async executeWrite(transaction, sql, parameters) {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveSqlParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    }
  }
  const idempotencyExecutor: HttpIdempotencySqlExecutor<LifecycleMysqlTransaction> = {
    async executeQuery(transaction, sql, parameters) {
      const [rows] = await transaction.connection.execute<RowDataPacket[]>(
        sql,
        resolveSqlParameters(parameters)
      )
      return rows as unknown as readonly HttpIdempotencySqlRow[]
    },
    async executeWrite(transaction, sql, parameters) {
      const [result] = await transaction.connection.execute<ResultSetHeader>(
        sql,
        resolveSqlParameters(parameters)
      )
      return { affectedRows: result.affectedRows }
    }
  }
  return {
    userPlantExecutor: userPlantExecutor,
    lifecycleExecutor: lifecycleExecutor,
    idempotencyExecutor: idempotencyExecutor
  }
}

/** 建立实际 SQL Repository、统一事务驱动及幂等只读对账端口。 */
function createServices(driver: DatabaseTransactionDriver<LifecycleMysqlTransaction>) {
  const sql = createSqlExecutor()
  const userPlantRepository = createMysqlUserPlantRepository(sql.userPlantExecutor)
  const lifecycleRepository = createMysqlUserPlantLifecycleRepository(sql.lifecycleExecutor)
  const idempotencyRepository = createMysqlHttpIdempotencyRepository(sql.idempotencyExecutor)
  const readOnlyExecutor: HttpIdempotencyReadOnlySqlExecutor = {
    async executeQuery(statement, parameters) {
      const [rows] = await pool.execute<RowDataPacket[]>(
        statement,
        resolveSqlParameters(parameters)
      )
      return rows as unknown as readonly HttpIdempotencySqlRow[]
    }
  }
  const commitUnknownReadOnlyRepository =
    createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(readOnlyExecutor)
  const dependencies = {
    driver: driver,
    idempotencyRepository: idempotencyRepository,
    lifecycleRepository: lifecycleRepository,
    userPlantRepository: userPlantRepository,
    commitUnknownReadOnlyRepository: commitUnknownReadOnlyRepository
  }
  return {
    create: createUserPlantApplicationService(dependencies),
    archive: createArchiveUserPlantApplicationService(dependencies),
    restore: createRestoreUserPlantApplicationService(dependencies)
  }
}

/** 用真实外键为一个用户植物聚合根准备指定生命周期状态。 */
async function insertPlant(
  plantRef: UserPlantRef,
  input: {
    readonly owner?: UserRef
    readonly lifecycle?: 'active' | 'archived' | 'deleting' | 'deleted'
    readonly version?: number
  } = {}
): Promise<void> {
  await pool.execute(
    `INSERT INTO user_plants
       (_openid, public_user_plant_id, user_internal_id, lifecycle_status,
        current_identity_status, confirmed_identity_internal_id, version,
        created_at_ms, updated_at_ms)
     SELECT '', ?, u.id, ?, 'unidentified', NULL, ?, ?, ?
     FROM users AS u WHERE u.public_user_id = ?`,
    [
      plantRef,
      input.lifecycle ?? 'active',
      input.version ?? Number('1'),
      createdAtMs,
      createdAtMs,
      input.owner ?? ownerRef
    ]
  )
}

/** 通过独立 MySQL 查询读取持久化状态和版本，验证真实读回而非响应自证。 */
async function readPlant(plantRef: UserPlantRef): Promise<{ lifecycle: string; version: number }> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT lifecycle_status, version FROM user_plants WHERE public_user_plant_id = ?`,
    [plantRef]
  )
  const row = rows[Number('0')]
  if (rows.length !== one || row === undefined || typeof row.lifecycle_status !== 'string') {
    throw new Error('真实 MySQL 生命周期读回缺少唯一用户植物')
  }
  return {
    lifecycle: row.lifecycle_status as string,
    version: Number(row.version)
  }
}

/** 独立连接读取统一用户当前 active 数量，不使用被测 Repository 的返回值自证。 */
async function readActivePlantCount(userRef: UserRef = ownerRef): Promise<number> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS active_count
     FROM user_plants AS p
     JOIN users AS u ON u.id = p.user_internal_id
     WHERE u.public_user_id = ? AND p.lifecycle_status = 'active'`,
    [userRef]
  )
  const row = rows[Number('0')]
  if (rows.length !== one || row === undefined) {
    throw new Error('独立连接未能唯一读回用户植物 active 数量')
  }
  return Number(row.active_count)
}

/** 独立连接检查创建竞争是否留下未被接受的待建植物。 */
async function readPlantIfPresent(
  plantRef: UserPlantRef
): Promise<{ lifecycle: string; version: number } | null> {
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT lifecycle_status, version FROM user_plants WHERE public_user_plant_id = ?`,
    [plantRef]
  )
  const row = rows[Number('0')]
  if (rows.length === Number('0')) {
    return null
  }
  if (rows.length !== one || row === undefined || typeof row.lifecycle_status !== 'string') {
    throw new Error('并发创建结果读回不唯一或字段损坏')
  }
  return { lifecycle: row.lifecycle_status, version: Number(row.version) }
}

/**
 * Expected 来源：`decisions/P0-product-cost-boundaries.md#D-03`、
 * `contracts/principal-and-capability.md`、`contracts/user-plant.md`、`data/state-machines.md`、
 * `api/route-registry.json` 的 owner-scoped archive/restore、active↔archived、expectedVersion、
 * required Idempotency-Key、稳定 404/409 与同键重放合同。
 * 测试层次：L3 / `unit_real_data`；真实 MySQL 8.4、冻结 DDL、事务驱动、user-plant/Fundation MySQL
 * Repository 与应用服务协作；只在未知提交测试中把真实 commit 后的确认包成故障。
 * 明确未覆盖：CloudBase 托管 MySQL、HTTP request DTO/OpenAPI 字段、网关认证与公开路由接线。
 */
describe('用户植物归档与恢复的真实 MySQL 生命周期闭环', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--tmpfs',
      '/var/lib/mysql',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      '--publish',
      '127.0.0.1::3306',
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
      connectionLimit: poolConnectionLimit,
      decimalNumbers: false
    })
    await pool.execute(
      `INSERT INTO users (_openid, public_user_id, status, session_version, created_at_ms, updated_at_ms)
       VALUES ('', ?, 'active', 1, ?, ?), ('', ?, 'active', 1, ?, ?),
              ('', ?, 'active', 1, ?, ?)`,
      [
        ownerRef,
        createdAtMs,
        createdAtMs,
        anotherOwnerRef,
        createdAtMs,
        createdAtMs,
        raceOwnerRef,
        createdAtMs,
        createdAtMs
      ]
    )
  }, mysqlTestTimeoutMs)

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('active→archived→active 完整往返，版本每次递增并从独立连接读回', async () => {
    const plantRef = `upl_lifecycle_roundtrip_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('3') })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))

    const archived = await services.archive({
      principal: createPrincipal(),
      userPlantRef: plantRef,
      expectedVersion: Number('3'),
      occurredAtMs: Number('1790000000001'),
      idempotency: createIdempotencyInput({
        operation: 'archive',
        plantRef: plantRef,
        expectedVersion: Number('3'),
        keySuffix: 'roundtrip-archive'
      })
    })
    expect(archived).toMatchObject({
      status: Number('200'),
      body: { data: { user_plant_id: plantRef, lifecycle: 'archived', version: Number('4') } }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('4')
    })

    const restored = await services.restore({
      principal: createPrincipal(),
      capabilitySnapshot: createCapabilitySnapshot(),
      userPlantRef: plantRef,
      expectedVersion: Number('4'),
      occurredAtMs: Number('1790000000002'),
      idempotency: createIdempotencyInput({
        operation: 'restore',
        plantRef: plantRef,
        expectedVersion: Number('4'),
        keySuffix: 'roundtrip-restore'
      })
    })
    expect(restored).toMatchObject({
      status: Number('200'),
      body: { data: { user_plant_id: plantRef, lifecycle: 'active', version: Number('5') } }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'active',
      version: Number('5')
    })
  })

  test('同键同参真实重放首次归档响应且数据库只递增一次', async () => {
    const plantRef = `upl_lifecycle_replay_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('6') })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))
    const input = {
      principal: createPrincipal(),
      userPlantRef: plantRef,
      expectedVersion: Number('6'),
      occurredAtMs: Number('1790000000010'),
      idempotency: createIdempotencyInput({
        operation: 'archive',
        plantRef: plantRef,
        expectedVersion: Number('6'),
        keySuffix: 'replay'
      })
    }

    const first = await services.archive(input)
    const replay = await services.archive(input)
    expect(replay).toEqual(first)
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('7')
    })
    const [records] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS record_count FROM http_idempotency_records
       WHERE operation_id = 'archiveUserPlant'
         AND normalized_path = '/api/v2/user-plants/{userPlantRef}/archive'
         AND idempotency_key_hash = ?`,
      [input.idempotency.idempotencyKeyHash]
    )
    const recordCount = records[Number('0')]
    expect(recordCount === undefined ? Number('0') : Number(recordCount.record_count)).toBe(
      Number('1')
    )
  })

  test('另一用户不能归档该植物，缺失与越权统一为 404 且存储不变', async () => {
    const plantRef = `upl_lifecycle_owner_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('8') })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))

    await expect(
      services.archive({
        principal: createPrincipal(anotherOwnerRef),
        userPlantRef: plantRef,
        expectedVersion: Number('8'),
        occurredAtMs: Number('1790000000020'),
        idempotency: createIdempotencyInput({
          operation: 'archive',
          owner: anotherOwnerRef,
          plantRef: plantRef,
          expectedVersion: Number('8'),
          keySuffix: 'foreign-owner'
        })
      })
    ).resolves.toEqual({
      status: Number('404'),
      body: {
        error: {
          type: 'USER_PLANT_NOT_FOUND',
          message: '用户植物不存在或不可访问'
        }
      }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'active',
      version: Number('8')
    })
  })

  test('expectedVersion 过期时返回稳定冲突并保留数据库原状态', async () => {
    const plantRef = `upl_lifecycle_stale_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('10') })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))

    await expect(
      services.archive({
        principal: createPrincipal(),
        userPlantRef: plantRef,
        expectedVersion: Number('9'),
        occurredAtMs: Number('1790000000030'),
        idempotency: createIdempotencyInput({
          operation: 'archive',
          plantRef: plantRef,
          expectedVersion: Number('9'),
          keySuffix: 'stale-version'
        })
      })
    ).resolves.toMatchObject({
      status: Number('409'),
      body: { error: { type: 'USER_PLANT_VERSION_CONFLICT' } }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'active',
      version: Number('10')
    })
  })

  test('CAS 自身再次校验统一用户归属，错误 owner 不能仅凭公开引用写入', async () => {
    const plantRef = `upl_lifecycle_cas_owner_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('10') })
    const repository = createMysqlUserPlantLifecycleRepository(
      createSqlExecutor().lifecycleExecutor
    )
    const driver = createMysqlTransactionDriver(pool, () => undefined)

    await runDatabaseTransaction(driver, async transaction => {
      await expect(
        repository.compareAndSwapLifecycle(transaction, {
          userRef: anotherOwnerRef,
          userPlantRef: plantRef,
          expectedLifecycle: 'active',
          expectedVersion: Number('10'),
          targetLifecycle: 'archived',
          occurredAtMs: Number('1790000000035')
        })
      ).resolves.toBe(false)
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'active',
      version: Number('10')
    })
  })

  test('两个真实连接用相同旧版本竞争归档，只有一次 CAS 成功', async () => {
    const plantRef = `upl_lifecycle_race_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('11') })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))
    const createInput = (keySuffix: string) => ({
      principal: createPrincipal(),
      userPlantRef: plantRef,
      expectedVersion: Number('11'),
      occurredAtMs: Number('1790000000040'),
      idempotency: createIdempotencyInput({
        operation: 'archive' as const,
        plantRef: plantRef,
        expectedVersion: Number('11'),
        keySuffix: keySuffix
      })
    })

    const responses = await Promise.all([
      services.archive(createInput('race-a')),
      services.archive(createInput('race-b'))
    ])
    expect(responses.map(response => response.status).sort()).toEqual([
      Number('200'),
      Number('409')
    ])
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('12')
    })
  })

  test('active 数已达免费能力快照上限时拒绝恢复且真实 MySQL 状态不变', async () => {
    const activePlantRef = `upl_lifecycle_limit_active_${processSuffix}` as UserPlantRef
    const archivedPlantRef = `upl_lifecycle_limit_archived_${processSuffix}` as UserPlantRef
    await insertPlant(activePlantRef, { owner: anotherOwnerRef, lifecycle: 'active' })
    await insertPlant(archivedPlantRef, {
      owner: anotherOwnerRef,
      lifecycle: 'archived',
      version: Number('4')
    })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))
    const restoreInput = {
      principal: createPrincipal(anotherOwnerRef),
      capabilitySnapshot: createCapabilitySnapshot(anotherOwnerRef),
      userPlantRef: archivedPlantRef,
      expectedVersion: Number('4'),
      occurredAtMs: Number('1790000000070'),
      idempotency: createIdempotencyInput({
        operation: 'restore',
        owner: anotherOwnerRef,
        plantRef: archivedPlantRef,
        expectedVersion: Number('4'),
        keySuffix: 'limit-denied'
      })
    }

    const denied = await services.restore(restoreInput)
    expect(denied).toMatchObject({
      status: Number('403'),
      body: { error: { type: 'CAPABILITY_DENIED' } }
    })
    await expect(services.restore(restoreInput)).resolves.toEqual(denied)

    await expect(readActivePlantCount(anotherOwnerRef)).resolves.toBe(Number('1'))
    await expect(readPlant(archivedPlantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('4')
    })
  })

  test('创建与恢复竞争时共享用户行锁，最多只有一株进入 active', async () => {
    const archivedPlantRef = `upl_lifecycle_limit_race_archived_${processSuffix}` as UserPlantRef
    const createdPlantRef = `upl_lifecycle_limit_race_created_${processSuffix}` as UserPlantRef
    await insertPlant(archivedPlantRef, {
      owner: raceOwnerRef,
      lifecycle: 'archived',
      version: Number('7')
    })

    const baseDriver = createMysqlTransactionDriver(pool, () => undefined)
    let signalCreateAtCommit: () => void = () => undefined
    const createReachedCommit = new Promise<void>(resolve => {
      signalCreateAtCommit = resolve
    })
    let releaseCreateCommit: () => void = () => undefined
    const createCommitReleased = new Promise<void>(resolve => {
      releaseCreateCommit = resolve
    })
    const pausedCreateDriver: DatabaseTransactionDriver<LifecycleMysqlTransaction> = {
      beginTransaction: baseDriver.beginTransaction,
      async commitTransaction(transaction) {
        signalCreateAtCommit()
        await createCommitReleased
        await baseDriver.commitTransaction(transaction)
      },
      rollbackTransaction: baseDriver.rollbackTransaction,
      recordRollbackFailure: baseDriver.recordRollbackFailure
    }
    const createServicesForRace = createServices(pausedCreateDriver)
    const restoreServicesForRace = createServices(baseDriver)
    const createResponsePromise = createServicesForRace.create({
      principal: createPrincipal(raceOwnerRef),
      capabilitySnapshot: createCapabilitySnapshot(raceOwnerRef),
      newUserPlantRef: createdPlantRef,
      occurredAtMs: Number('1790000000080'),
      idempotency: createIdempotencyInput({
        operation: 'create',
        owner: raceOwnerRef,
        plantRef: createdPlantRef,
        expectedVersion: Number('1'),
        keySuffix: 'create-restore-race'
      })
    })
    let restoreResponsePromise: ReturnType<typeof restoreServicesForRace.restore> | undefined
    try {
      await createReachedCommit
      restoreResponsePromise = restoreServicesForRace.restore({
        principal: createPrincipal(raceOwnerRef),
        capabilitySnapshot: createCapabilitySnapshot(raceOwnerRef),
        userPlantRef: archivedPlantRef,
        expectedVersion: Number('7'),
        occurredAtMs: Number('1790000000081'),
        idempotency: createIdempotencyInput({
          operation: 'restore',
          owner: raceOwnerRef,
          plantRef: archivedPlantRef,
          expectedVersion: Number('7'),
          keySuffix: 'create-restore-race'
        })
      })
    } finally {
      releaseCreateCommit()
    }

    if (restoreResponsePromise === undefined) {
      throw new Error('恢复请求必须在创建事务释放用户锁前启动')
    }
    const [createResponse, restoreResponse] = await Promise.all([
      createResponsePromise,
      restoreResponsePromise
    ])
    expect(createResponse).toMatchObject({ status: Number('200') })
    expect(restoreResponse).toMatchObject({
      status: Number('403'),
      body: { error: { type: 'CAPABILITY_DENIED' } }
    })
    await expect(readActivePlantCount(raceOwnerRef)).resolves.toBe(Number('1'))
    await expect(readPlant(archivedPlantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('7')
    })
    await expect(readPlantIfPresent(createdPlantRef)).resolves.toMatchObject({
      lifecycle: 'active',
      version: Number('1')
    })
  })

  test('COMMIT 已成功但确认丢失时，Foundation 只读对账返回原响应且不重做写入', async () => {
    const plantRef = `upl_lifecycle_unknown_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, { lifecycle: 'active', version: Number('13') })
    const baseDriver = createMysqlTransactionDriver(pool, () => undefined)
    const commitUnknownDriver: DatabaseTransactionDriver<LifecycleMysqlTransaction> = {
      beginTransaction: baseDriver.beginTransaction,
      async commitTransaction(transaction) {
        await baseDriver.commitTransaction(transaction)
        throw new DatabaseCommitResultUnknownError('测试：COMMIT 成功但确认丢失')
      },
      rollbackTransaction: baseDriver.rollbackTransaction,
      recordRollbackFailure: baseDriver.recordRollbackFailure
    }
    const services = createServices(commitUnknownDriver)

    const response = await services.archive({
      principal: createPrincipal(),
      userPlantRef: plantRef,
      expectedVersion: Number('13'),
      occurredAtMs: Number('1790000000050'),
      idempotency: createIdempotencyInput({
        operation: 'archive',
        plantRef: plantRef,
        expectedVersion: Number('13'),
        keySuffix: 'commit-unknown'
      })
    })
    expect(response).toMatchObject({
      status: Number('200'),
      body: { data: { user_plant_id: plantRef, lifecycle: 'archived', version: Number('14') } }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'archived',
      version: Number('14')
    })
    const [records] = await pool.execute<RowDataPacket[]>(
      `SELECT state, request_hash FROM http_idempotency_records
       WHERE operation_id = 'archiveUserPlant' AND idempotency_key_hash = ?`,
      [sha256('key-commit-unknown')]
    )
    expect(records).toHaveLength(Number('1'))
    const record = records[Number('0')]
    if (record === undefined) {
      throw new Error('未知提交只读对账后应读回完成态幂等记录')
    }
    expect(record.state).toBe('completed')
    expect(record.request_hash).toMatch(sha256Format)
  })

  test('deleting 植物对普通归档/恢复主体不可见，不得被恢复', async () => {
    const plantRef = `upl_lifecycle_deleting_${processSuffix}` as UserPlantRef
    await insertPlant(plantRef, {
      lifecycle: 'deleting',
      version: Number('15')
    })
    const services = createServices(createMysqlTransactionDriver(pool, () => undefined))

    await expect(
      services.restore({
        principal: createPrincipal(),
        capabilitySnapshot: createCapabilitySnapshot(),
        userPlantRef: plantRef,
        expectedVersion: Number('15'),
        occurredAtMs: Number('1790000000060'),
        idempotency: createIdempotencyInput({
          operation: 'restore',
          plantRef: plantRef,
          expectedVersion: Number('15'),
          keySuffix: 'deleting-hidden'
        })
      })
    ).resolves.toMatchObject({
      status: Number('404'),
      body: { error: { type: 'USER_PLANT_NOT_FOUND' } }
    })
    await expect(readPlant(plantRef)).resolves.toEqual({
      lifecycle: 'deleting',
      version: Number('15')
    })
  })
})
