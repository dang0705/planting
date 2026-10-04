import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import { createMysqlAuthenticatedEphemeralCaseOwnershipReader } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-case-ownership-reader.js'
import { createAuthenticatedEphemeralBindingRouteHandler, authenticatedEphemeralBindingRoute } from '../../src/user-plant/http/authenticated-ephemeral-binding-route.js'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import type {
  UserPrincipalDto,
  UserRef,
  UserCapabilitySnapshotDto
} from '../../src/contracts/types.js'
import {
  createMysql2ConnectionSource,
  toSqlParameters,
  type Mysql2QueryConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlTransactionDriver,
  type MysqlTransactionContext
} from '../../src/foundation/database/mysql-transaction-driver.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { createMysqlAuthenticatedEphemeralBindingRepository } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-binding-repository.js'
import {
  createMysqlAuthenticatedEphemeralNewPlantRepository,
  createMysqlAuthenticatedEphemeralNewPlantCommitUnknownReader
} from '../../src/user-plant/repository/mysql-authenticated-ephemeral-new-plant-repository.js'
import { createAuthenticatedEphemeralNewPlantApplicationService } from '../../src/user-plant/application/save-authenticated-ephemeral-as-new-plant.js'

/** L3/unit_real_data：Expected来自authenticated-ephemeral-new-plant-contract.md和本轮冻结输入；
 * 真实应用、创建领域、用户行锁、mysql2、003聚合与016三表、提交未知只读核对。
 * Principal和能力为完整合同夹具，users/plant_identities仅外键桩；HTTP使用真实Node请求链；不验证身份/权益服务或CloudBase。
 * 隔离MySQL只机械装载已准入两份迁移切片，不触碰已有业务数据。 */
const container = `qhz-ephemeral-new-plant-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_newplant_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01.000Z',
  expiresAt: '1970-01-01T00:00:10.000Z'
}
function capability(limit = 1): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_newplant_fixture01',
    subjectType: 'user',
    user_id: principal.user_id,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: limit,
    generatedAt: '1970-01-01T00:00:02.000Z',
    validUntil: '1970-01-01T00:00:09.000Z',
    policyVersion: 'user-plant-limit/v1'
  }
}
function input() {
  return {
    principal,
    capabilitySnapshot: capability() as UserCapabilitySnapshotDto | null,
    ephemeralCaseRef: 'epc_newplant_case01',
    newUserPlantRef: 'upl_newplant_candidate01',
    promotionRef: 'prm_newplant_command01',
    idempotencyKeyHash: 'a'.repeat(64),
    occurredAtMs: 3000
  }
}
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout)
  }
  return r.stdout.trim()
}
beforeAll(async () => {
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--tmpfs',
    '/var/lib/mysql',
    '-p',
    '127.0.0.1::3306',
    '-e',
    'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    'mysql:8.4'
  ])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1')
      ready = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离临时案例新植物MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE ephemeral_new_plant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE ephemeral_new_plant')
  await db.query(
    "CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,_openid VARCHAR(64) NOT NULL DEFAULT '',public_user_id VARCHAR(64) NOT NULL UNIQUE,status VARCHAR(24) NOT NULL)"
  )
  await db.query(
    'CREATE TABLE plant_identities(id BIGINT UNSIGNED PRIMARY KEY,public_identity_ref VARCHAR(64) NULL)'
  )
  const root = findProjectRoot(),
    plantDdl = readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8'),
    start = plantDdl.indexOf('CREATE TABLE `user_plants`')
  await db.query(plantDdl.slice(start, plantDdl.indexOf(';\n', start) + 1))
  const caseDdl = readFileSync(
    join(root, 'docs/backend-v2/schema/016_authenticated_ephemeral_plant_case.sql'),
    'utf8'
  )
  for (const name of [
    'authenticated_ephemeral_plant_cases',
    'authenticated_ephemeral_promotion_commands',
    'authenticated_ephemeral_case_bindings'
  ]) {
    const offset = caseDdl.indexOf('CREATE TABLE `' + name + '`')
    await db.query(caseDdl.slice(offset, caseDdl.indexOf(';\n', offset) + 1))
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'ephemeral_new_plant'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
beforeEach(async () => {
  await db.query('DROP TRIGGER IF EXISTS reject_new_binding_insert')
  for (const table of [
    'authenticated_ephemeral_case_bindings',
    'authenticated_ephemeral_promotion_commands',
    'authenticated_ephemeral_plant_cases',
    'user_plants',
    'users'
  ]) {
    await db.query(`DELETE FROM ${table}`)
  }
  await db.query(
    "INSERT INTO users(id,public_user_id,status) VALUES(1,'usr_newplant_owner01','active'),(2,'usr_newplant_owner02','active')"
  )
  await db.query(
    "INSERT INTO user_plants(id,public_user_plant_id,user_internal_id,lifecycle_status,current_identity_status,version,created_at_ms,updated_at_ms) VALUES(1,'upl_newplant_archived01',1,'archived','unidentified',1,1000,1000),(2,'upl_newplant_other001',2,'active','unidentified',1,1000,1000)"
  )
  await db.query(
    "INSERT INTO authenticated_ephemeral_plant_cases(id,ephemeral_plant_case_ref,user_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'epc_newplant_case01',1,'completed',2000,5000,7,1000,2000),(2,'epc_newplant_case02',1,'active',NULL,5000,1,1000,1000),(3,'epc_newplant_other01',2,'active',NULL,5000,1,1000,1000)"
  )
})
/** 复用真实用户植物SQL入口；故障只注入commit回包边界，创建/完成/读回均不替换。 */
function application(mode?: 'commit_lost' | 'rollback_lost') {
  let transactions = 0,
    reconciliations = 0
  const queries: string[] = [],
    writes: string[] = []
  const transactionSource: typeof source = {
    getConnection: async () => {
      transactions++
      const c = await source.getConnection()
      return {
        ...c,
        commit: async () => {
          if (mode === 'rollback_lost') {
            await c.rollback()
          } else {
            await c.commit()
          }
          if (mode) {
            throw new DatabaseCommitResultUnknownError('受控提交回包未知')
          }
        }
      }
    }
  }
  const readonlySource: typeof source = {
    getConnection: async () => {
      reconciliations++
      const c = await source.getConnection()
      return {
        ...c,
        query: async (sql, args) => {
          queries.push(sql)
          if (!/^\s*SELECT\b/iu.test(sql) || /\bFOR\s+(UPDATE|SHARE)\b/iu.test(sql)) {
            throw new Error('提交未知核对必须无锁只读')
          }
          return c.query(sql, args)
        },
        execute: async sql => {
          writes.push(sql)
          throw new Error('核对禁止创建或绑定')
        }
      }
    }
  }
  const userPlantRepository = createMysqlUserPlantRepository<
    MysqlTransactionContext<Mysql2QueryConnection>
  >({
    executeQuery: async (tx, sql, args) =>
      (await tx.connection.query(
        sql,
        toSqlParameters(args)
      )) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (tx, sql, args) => tx.connection.execute(sql, toSqlParameters(args))
  })
  const reader = createMysqlAuthenticatedEphemeralNewPlantCommitUnknownReader(readonlySource)
  const service = createAuthenticatedEphemeralNewPlantApplicationService({
    driver: createMysqlTransactionDriver(transactionSource, () => undefined),
    repository: createMysqlAuthenticatedEphemeralNewPlantRepository(userPlantRepository),
    commitUnknownReader: reader
  })
  return { service, reader, queries, writes, counts: () => ({ transactions, reconciliations }) }
}
async function tableCounts() {
  const [rows] = await db.query(
    'SELECT (SELECT COUNT(*) FROM user_plants) AS plants,(SELECT COUNT(*) FROM authenticated_ephemeral_promotion_commands) AS commands,(SELECT COUNT(*) FROM authenticated_ephemeral_case_bindings) AS bindings'
  )
  return rows
}
async function originalCase() {
  const [rows] = await db.query(
    'SELECT status,version,CAST(completed_at_ms AS CHAR) AS completed,CAST(expires_at_ms AS CHAR) AS expires,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated FROM authenticated_ephemeral_plant_cases WHERE id=1'
  )
  return rows
}
const untouched = [
  {
    status: 'completed',
    version: 7,
    completed: '2000',
    expires: '5000',
    created: '1000',
    updated: '2000'
  }
]
const success = {
  status: 'bound',
  promotionRef: 'prm_newplant_command01',
  userPlantRef: 'upl_newplant_candidate01',
  boundAtMs: 3000
}
test('显式保存新增初态植物与完整三表关系，归档植物不消耗active名额，原案例时间不变', async () => {
  expect(await application().service(input())).toEqual(success)
  expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  const [rows] = await db.query(
    "SELECT lifecycle_status,current_identity_status,version,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated,_openid FROM user_plants WHERE public_user_plant_id='upl_newplant_candidate01'"
  )
  expect(rows).toEqual([
    {
      lifecycle_status: 'active',
      current_identity_status: 'unidentified',
      version: 1,
      created: '3000',
      updated: '3000',
      _openid: ''
    }
  ])
  expect(await originalCase()).toEqual([
    {
      status: 'bound',
      version: 8,
      completed: '2000',
      expires: '5000',
      created: '1000',
      updated: '3000'
    }
  ])
  const [commands] = await db.query(
    'SELECT target_type,requested_user_plant_internal_id,status,request_hash FROM authenticated_ephemeral_promotion_commands'
  )
  const hash = createHash('sha256')
    .update('{"ephemeralCaseRef":"epc_newplant_case01","targetType":"new_user_plant"}')
    .digest('hex')
  expect(commands).toEqual([
    {
      target_type: 'new_user_plant',
      requested_user_plant_internal_id: null,
      status: 'completed',
      request_hash: hash
    }
  ])
})
test('旧成功先于额度及TTL，候选引用变化/null能力/案例超期仍返回原植物且零重复创建', async () => {
  const app = application()
  await app.service(input())
  expect(
    await app.service({
      ...input(),
      newUserPlantRef: 'upl_newplant_retry0001',
      promotionRef: 'prm_newplant_retry0001',
      capabilitySnapshot: null,
      occurredAtMs: 6000
    })
  ).toEqual(success)
  expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  const [rows] = await db.query(
    "SELECT COUNT(*) AS n FROM user_plants WHERE public_user_plant_id='upl_newplant_retry0001'"
  )
  expect(rows).toEqual([{ n: 0 }])
})
test.each(['missing', 'no_permission', 'expired', 'wrong_owner', 'at_limit'] as const)(
  '缺失或无效创建资格拒绝且四表无新增：%s',
  async reason => {
    const command = input()
    if (reason === 'missing') {
      command.capabilitySnapshot = null
    }
    if (reason === 'no_permission') {
      command.capabilitySnapshot = { ...capability(), allowedCapabilities: [] }
    }
    if (reason === 'expired') {
      command.capabilitySnapshot = { ...capability(), validUntil: '1970-01-01T00:00:03.000Z' }
    }
    if (reason === 'wrong_owner') {
      command.capabilitySnapshot = { ...capability(), user_id: 'usr_newplant_owner02' as UserRef }
    }
    if (reason === 'at_limit') {
      await db.query("UPDATE user_plants SET lifecycle_status='active' WHERE id=1")
    }
    expect(await application().service(command)).toEqual({
      status:
        reason === 'missing'
          ? 'unavailable'
          : reason === 'expired'
            ? 'capability_snapshot_expired'
            : 'capability_denied'
    })
    expect(await tableCounts()).toEqual([{ plants: 2, commands: 0, bindings: 0 }])
    expect(await originalCase()).toEqual(untouched)
  }
)
test('精确expiry拒绝新创建，跨用户案例不可见', async () => {
  expect(await application().service({ ...input(), occurredAtMs: 5000 })).toEqual({
    status: 'expired'
  })
  expect(
    await application().service({ ...input(), ephemeralCaseRef: 'epc_newplant_other01' })
  ).toEqual({ status: 'not_found' })
  expect(await tableCounts()).toEqual([{ plants: 2, commands: 0, bindings: 0 }])
  expect(await originalCase()).toEqual(untouched)
})
test('与已有目标绑定同键不同类型冲突，不创建新植物', async () => {
  await runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx =>
      createMysqlAuthenticatedEphemeralBindingRepository().bindExisting(tx, {
        userRef: principal.user_id,
        ephemeralCaseRef: input().ephemeralCaseRef,
        targetUserPlantRef: 'upl_newplant_archived01',
        promotionRef: 'prm_newplant_existing01',
        idempotencyKeyHash: input().idempotencyKeyHash,
        occurredAtMs: 3000
      })
  )
  expect(
    await application().service({ ...input(), capabilitySnapshot: null, occurredAtMs: 6000 })
  ).toEqual({ status: 'idempotency_conflict' })
  expect(await tableCounts()).toEqual([{ plants: 2, commands: 1, bindings: 1 }])
})
test('同用户两个案例同时争一个名额只有一株新增，两案例不越过上限', async () => {
  const results = await Promise.all([
    application().service(input()),
    application().service({
      ...input(),
      ephemeralCaseRef: 'epc_newplant_case02',
      newUserPlantRef: 'upl_newplant_race0002',
      promotionRef: 'prm_newplant_race0002',
      idempotencyKeyHash: 'b'.repeat(64)
    })
  ])
  expect(results.filter(r => r.status === 'bound')).toHaveLength(1)
  expect(results.filter(r => r.status === 'capability_denied')).toHaveLength(1)
  expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('同案例不同键并发只有单赢家，不再创建第二株', async () => {
  const results = await Promise.all([
    application().service({ ...input(), capabilitySnapshot: capability(2) }),
    application().service({
      ...input(),
      capabilitySnapshot: capability(2),
      newUserPlantRef: 'upl_newplant_race0003',
      promotionRef: 'prm_newplant_race0003',
      idempotencyKeyHash: 'b'.repeat(64)
    })
  ])
  expect(results.filter(r => r.status === 'bound')).toHaveLength(1)
  expect(results.filter(r => r.status === 'already_bound')).toHaveLength(1)
  expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('最后绑定插入实际SQL失败，新植物与三表变化整体回滚', async () => {
  await db.query(
    "CREATE TRIGGER reject_new_binding_insert BEFORE INSERT ON authenticated_ephemeral_case_bindings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='受控新植物绑定插入失败'"
  )
  await expect(application().service(input())).rejects.toThrow()
  expect(await tableCounts()).toEqual([{ plants: 2, commands: 0, bindings: 0 }])
  expect(await originalCase()).toEqual(untouched)
})
test('提交成功回包未知新连接读取原结果，只创建一次且无锁零写核对', async () => {
  const app = application('commit_lost')
  expect(await app.service(input())).toEqual(success)
  expect(app.counts()).toEqual({ transactions: 1, reconciliations: 1 })
  expect(app.queries).toHaveLength(1)
  expect(app.writes).toEqual([])
  expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('真实rollback后结果未知且没有成功收据，返回unavailable不重建或补写', async () => {
  const app = application('rollback_lost')
  expect(await app.service(input())).toEqual({ status: 'unavailable' })
  expect(app.counts()).toEqual({ transactions: 1, reconciliations: 1 })
  expect(app.queries).toHaveLength(1)
  expect(app.writes).toEqual([])
  expect(await tableCounts()).toEqual([{ plants: 2, commands: 0, bindings: 0 }])
  expect(await originalCase()).toEqual(untouched)
})

/** HTTP合同Expected：新建只公开原植物引用；超期/null能力原键重放，满额403零写。
 * 真实HTTP→归属Reader→应用→MySQL，身份/能力/1024字节限制仍为明确测试夹具。 */
test.each(['create_replay', 'at_limit'] as const)('真实HTTP新目标保存及额度拒绝：%s', async scenario => {
  let now = 3000, candidates = 0, cap: UserCapabilitySnapshotDto | null = capability()
  if (scenario === 'at_limit') { await db.query("UPDATE user_plants SET lifecycle_status='active' WHERE id=1") }
  const app = application(), ownership = createMysqlAuthenticatedEphemeralCaseOwnershipReader(source)
  const dispatch = createRouteDispatcher([{ route: authenticatedEphemeralBindingRoute,
    handler: createAuthenticatedEphemeralBindingRouteHandler({ maxBodyBytes: 1024,
      resolvePrincipal: async () => principal, readOwnedCase: value => ownership.readOwned(value),
      bindExisting: async () => { throw new Error('新目标不得调用原目标应用') }, saveNew: app.service,
      createUserPlantRef: () => `upl_newplant_http000${++candidates}`,
      resolveCapabilitySnapshot: async () => cap, now: () => now,
      createPromotionRef: () => `prm_newplant_http000${candidates}`, writeAudit: () => undefined }) }])
  const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const post = async () => {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/ephemeral-cases/epc_newplant_case01/bindings`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer fixture-session-token', 'idempotency-key': 'new-plant-http-original' },
      body: JSON.stringify({ target: { type: 'new_user_plant' } }) })
    return { status: response.status, body: await response.json() }
  }
  try {
    if (scenario === 'at_limit') {
      expect(await post()).toEqual({ status: 403, body: { error: { type: 'CAPABILITY_DENIED', message: '当前能力不允许创建植物' } } })
      expect(await tableCounts()).toEqual([{ plants: 2, commands: 0, bindings: 0 }])
      expect(await originalCase()).toEqual(untouched)
    } else {
      const expected = { status: 200, body: { data: { user_plant_id: 'upl_newplant_http0001' } } }
      expect(await post()).toEqual(expected)
      now = 6000; cap = null
      expect(await post()).toEqual(expected)
      expect(candidates).toBe(2)
      expect(await tableCounts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
      const [rows] = await db.query('SELECT p.public_user_plant_id,CAST(b.bound_at_ms AS CHAR) AS bound FROM authenticated_ephemeral_case_bindings b JOIN user_plants p ON p.id=b.user_plant_internal_id')
      expect(rows).toEqual([{ public_user_plant_id: 'upl_newplant_http0001', bound: '3000' }])
      expect(await originalCase()).toEqual([{ ...untouched[0], status: 'bound', version: 8, updated: '3000' }])
    }
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})
