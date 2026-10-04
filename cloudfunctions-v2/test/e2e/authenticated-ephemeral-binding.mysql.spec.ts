import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import {
  runDatabaseTransaction,
  DatabaseCommitResultUnknownError
} from '../../src/foundation/database/transaction-runner.js'
import {
  createMysqlAuthenticatedEphemeralBindingRepository,
  createMysqlAuthenticatedEphemeralBindingCommitUnknownReader
} from '../../src/user-plant/repository/mysql-authenticated-ephemeral-binding-repository.js'
import { createAuthenticatedEphemeralBindingApplicationService } from '../../src/user-plant/application/bind-authenticated-ephemeral-case.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysqlAuthenticatedEphemeralCaseOwnershipReader } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-case-ownership-reader.js'
import { verifyAuthenticatedEphemeralBindingHttp } from '../support/authenticated-ephemeral-binding-http-harness.js'

/** L3/unit_real_data；Expected来自本轮明确绑定生命周期与003/016约束。
 * 真实mysql2/事务/行锁/唯一绑定；users和plant_identities是FK桩，不证明Principal解析、HTTP或CloudBase。
 * 案例和植物为独立合成夹具，不迁移历史业务数据，不延长原TTL，不创建植物/养护事实/奖励。 */
const container = `qhz-ephemeral-binding-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const repository = createMysqlAuthenticatedEphemeralBindingRepository()
const input = () => ({
  userRef: 'usr_binding_owner01',
  ephemeralCaseRef: 'epc_binding_case01',
  targetUserPlantRef: 'upl_binding_target01',
  promotionRef: 'prm_binding_command01',
  idempotencyKeyHash: 'a'.repeat(64),
  occurredAtMs: 3000
})
function docker(args: string[]): string {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout)
  }
  return r.stdout.trim()
}
function bind(command = input()) {
  return runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx => repository.bindExisting(tx, command)
  )
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
    throw new Error('隔离临时案例绑定MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE ephemeral_binding CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE ephemeral_binding')
  await db.query(
    "CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,_openid VARCHAR(64) NOT NULL DEFAULT '',public_user_id VARCHAR(64) NOT NULL UNIQUE,status VARCHAR(24) NOT NULL)"
  )
  await db.query(
    'CREATE TABLE plant_identities(id BIGINT UNSIGNED PRIMARY KEY,public_identity_ref VARCHAR(64) NULL)'
  )
  const root = findProjectRoot()
  const plantDdl = readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8')
  const start = plantDdl.indexOf('CREATE TABLE `user_plants`')
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
    database: 'ephemeral_binding'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
beforeEach(async () => {
  await db.query('DROP TRIGGER IF EXISTS reject_binding_insert')
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
    "INSERT INTO users(id,public_user_id,status) VALUES(1,'usr_binding_owner01','active'),(2,'usr_binding_owner02','active')"
  )
  await db.query(
    "INSERT INTO user_plants(id,public_user_plant_id,user_internal_id,lifecycle_status,current_identity_status,version,created_at_ms,updated_at_ms) VALUES(1,'upl_binding_target01',1,'active','unidentified',1,1000,1000),(2,'upl_binding_target02',1,'archived','unidentified',1,1000,1000),(3,'upl_binding_other001',2,'active','unidentified',1,1000,1000)"
  )
  await db.query(
    "INSERT INTO authenticated_ephemeral_plant_cases(id,ephemeral_plant_case_ref,user_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'epc_binding_case01',1,'completed',2000,5000,7,1000,2000),(2,'epc_binding_other01',2,'active',NULL,5000,1,1000,1000)"
  )
})
async function caseSnapshot() {
  const [rows] = await db.query(
    'SELECT status,CAST(completed_at_ms AS CHAR) AS completed,CAST(expires_at_ms AS CHAR) AS expires,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated,version,bound_user_plant_internal_id AS target FROM authenticated_ephemeral_plant_cases WHERE id=1'
  )
  return rows
}
async function counts() {
  const [rows] = await db.query(
    'SELECT (SELECT COUNT(*) FROM user_plants) AS plants,(SELECT COUNT(*) FROM authenticated_ephemeral_promotion_commands) AS commands,(SELECT COUNT(*) FROM authenticated_ephemeral_case_bindings) AS bindings'
  )
  return rows
}
const originalCase = [
  {
    status: 'completed',
    completed: '2000',
    expires: '5000',
    created: '1000',
    updated: '2000',
    version: 7,
    target: null
  }
]
test('绑定已有植物同事务读回唯一事实，保留原案例完成/截止/创建，不创建植物或修改其版本', async () => {
  expect(await bind()).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(await caseSnapshot()).toEqual([
    {
      status: 'bound',
      completed: '2000',
      expires: '5000',
      created: '1000',
      updated: '3000',
      version: 8,
      target: 1
    }
  ])
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  const [plants] = await db.query(
    'SELECT version,CAST(updated_at_ms AS CHAR) AS updated FROM user_plants WHERE id=1'
  )
  expect(plants).toEqual([{ version: 1, updated: '1000' }])
  const [commands] = await db.query(
    'SELECT target_type,status,idempotency_key,request_hash FROM authenticated_ephemeral_promotion_commands'
  )
  const hash = createHash('sha256')
    .update(
      '{"ephemeralCaseRef":"epc_binding_case01","targetType":"existing_user_plant","targetUserPlantRef":"upl_binding_target01"}'
    )
    .digest('hex')
  expect(commands).toEqual([
    {
      target_type: 'existing_user_plant',
      status: 'completed',
      idempotency_key: 'a'.repeat(64),
      request_hash: hash
    }
  ])
})
test('相同键同案例目标在原截止后重放原引用和时间，不延长TTL或重复写', async () => {
  await bind()
  expect(
    await bind({ ...input(), promotionRef: 'prm_binding_retry0001', occurredAtMs: 6000 })
  ).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(await caseSnapshot()).toEqual([
    {
      status: 'bound',
      completed: '2000',
      expires: '5000',
      created: '1000',
      updated: '3000',
      version: 8,
      target: 1
    }
  ])
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('同键异目标到期后仍识别幂等冲突，原成功绑定不变', async () => {
  await bind()
  expect(
    await bind({
      ...input(),
      targetUserPlantRef: 'upl_binding_target02',
      promotionRef: 'prm_binding_retry0002',
      occurredAtMs: 6000
    })
  ).toEqual({ status: 'idempotency_conflict' })
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('跨用户案例和跨用户目标均拒绝，零绑定和命令', async () => {
  expect(await bind({ ...input(), ephemeralCaseRef: 'epc_binding_other01' })).toEqual({
    status: 'not_found'
  })
  expect(await bind({ ...input(), targetUserPlantRef: 'upl_binding_other001' })).toEqual({
    status: 'not_found'
  })
  expect(await caseSnapshot()).toEqual(originalCase)
  expect(await counts()).toEqual([{ plants: 3, commands: 0, bindings: 0 }])
})
test('新请求到精确截止返回expired，案例原字段不变', async () => {
  expect(await bind({ ...input(), occurredAtMs: 5000 })).toEqual({ status: 'expired' })
  expect(await caseSnapshot()).toEqual(originalCase)
  expect(await counts()).toEqual([{ plants: 3, commands: 0, bindings: 0 }])
})

test.each(['failed', 'expired'])('失败或过期案例未到截止也不可新绑定：%s', async status => {
  await db.execute('UPDATE authenticated_ephemeral_plant_cases SET status=? WHERE id=1', [status])
  expect(await bind()).toEqual({ status: 'expired' })
  expect(await caseSnapshot()).toEqual([{ ...originalCase[0], status }])
  expect(await counts()).toEqual([{ plants: 3, commands: 0, bindings: 0 }])
})
test('不同键并发绑定不同已有目标只产生一个赢家及不可变事实', async () => {
  const results = await Promise.all([
    bind(),
    bind({
      ...input(),
      targetUserPlantRef: 'upl_binding_target02',
      promotionRef: 'prm_binding_race0002',
      idempotencyKeyHash: 'b'.repeat(64)
    })
  ])
  expect(results.filter(r => r.status === 'bound')).toHaveLength(1)
  expect(results.filter(r => r.status === 'already_bound')).toHaveLength(1)
  const winner = results.find(r => r.status === 'bound')!
  if (winner.status !== 'bound') {
    throw new Error('必须有唯一绑定赢家')
  }
  const [rows] = await db.query(
    'SELECT p.public_user_plant_id AS ref FROM authenticated_ephemeral_case_bindings b JOIN user_plants p ON p.id=b.user_plant_internal_id'
  )
  expect(rows).toEqual([{ ref: winner.userPlantRef }])
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
})
test('最后插入绑定失败时命令、案例投影和版本整体回滚', async () => {
  // 仅隔离测试触发器：在真实SQL末步强制失败，证明事务原子性；不属于产品迁移。
  await db.query(
    "CREATE TRIGGER reject_binding_insert BEFORE INSERT ON authenticated_ephemeral_case_bindings FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='受控绑定插入失败'"
  )
  await expect(bind()).rejects.toThrow()
  expect(await caseSnapshot()).toEqual(originalCase)
  expect(await counts()).toEqual([{ plants: 3, commands: 0, bindings: 0 }])
})

/** 应用层Expected：仅可信统一主体构造归属；提交未知后只用新连接核对，不重执行绑定。
 * 真实应用/事务/MySQL/只读读取器；替换的只有commit回包，不验证HTTP或微信验真。 */
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_binding_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01.000Z',
  expiresAt: '1970-01-01T00:00:10.000Z'
}
function appCommand() {
  const { userRef: _userRef, ...command } = input()
  return command
}
/** 追踪的两条真实连接来源：事务可注入提交回包丢失，只读来源禁止所有写入与锁定查询。 */
function application(mode?: 'commit_lost' | 'rollback_lost') {
  let transactionConnections = 0,
    readonlyConnections = 0
  const readonlyQueries: string[] = [],
    readonlyWrites: string[] = []
  const transactionSource: typeof source = {
    getConnection: async () => {
      transactionConnections++
      const connection = await source.getConnection()
      return {
        ...connection,
        commit: async () => {
          if (mode === 'rollback_lost') {
            await connection.rollback()
          } else {
            await connection.commit()
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
      readonlyConnections++
      const connection = await source.getConnection()
      return {
        ...connection,
        query: async (sql, args) => {
          readonlyQueries.push(sql)
          if (!/^\s*SELECT\b/iu.test(sql) || /\bFOR\s+(UPDATE|SHARE)\b/iu.test(sql)) {
            throw new Error('核对必须无锁只读')
          }
          return connection.query(sql, args)
        },
        execute: async sql => {
          readonlyWrites.push(sql)
          throw new Error('核对禁止写入')
        }
      }
    }
  }
  const reader = createMysqlAuthenticatedEphemeralBindingCommitUnknownReader(readonlySource)
  const service = createAuthenticatedEphemeralBindingApplicationService({
    driver: createMysqlTransactionDriver(transactionSource, () => undefined),
    repository,
    commitUnknownReadOnlyRepository: reader
  })
  return {
    service,
    reader,
    readonlyQueries,
    readonlyWrites,
    connectionCounts: () => ({ transactionConnections, readonlyConnections })
  }
}
/** 核对前后真实三表读回必须相同，不以HTTP200或替身记录代替持久化证据。 */
async function bindingSnapshot() {
  const [cases] = await db.query('SELECT * FROM authenticated_ephemeral_plant_cases ORDER BY id')
  const [commands] = await db.query(
    'SELECT * FROM authenticated_ephemeral_promotion_commands ORDER BY id'
  )
  const [bindings] = await db.query(
    'SELECT * FROM authenticated_ephemeral_case_bindings ORDER BY id'
  )
  return { cases, commands, bindings }
}
test('真实应用以可信Principal保存，原案例到期后仍重放同一绑定', async () => {
  const app = application()
  expect(await app.service({ principal, command: appCommand() })).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(
    await app.service({
      principal,
      command: { ...appCommand(), occurredAtMs: 6000, promotionRef: 'prm_binding_appretry01' }
    })
  ).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  expect(app.connectionCounts()).toEqual({ transactionConnections: 2, readonlyConnections: 0 })
})
test('真实commit成功但回包未知，新连接无锁只读返回原收据且只写一次', async () => {
  const app = application('commit_lost')
  expect(await app.service({ principal, command: appCommand() })).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(await counts()).toEqual([{ plants: 3, commands: 1, bindings: 1 }])
  expect(app.connectionCounts()).toEqual({ transactionConnections: 1, readonlyConnections: 1 })
  expect(app.readonlyQueries).toHaveLength(1)
  expect(app.readonlyWrites).toEqual([])
  const before = await bindingSnapshot()
  expect(await app.reader.readCompleted({ ...input(), occurredAtMs: 6000 })).toEqual({
    status: 'bound',
    promotionRef: 'prm_binding_command01',
    userPlantRef: 'upl_binding_target01',
    boundAtMs: 3000
  })
  expect(await bindingSnapshot()).toEqual(before)
  expect(app.readonlyQueries).toHaveLength(2)
  expect(app.readonlyWrites).toEqual([])
})
test('真实rollback后回包未知，未读到收据返回unavailable且不重新绑定', async () => {
  const app = application('rollback_lost')
  expect(await app.service({ principal, command: appCommand() })).toEqual({ status: 'unavailable' })
  expect(await caseSnapshot()).toEqual(originalCase)
  expect(await counts()).toEqual([{ plants: 3, commands: 0, bindings: 0 }])
  expect(app.connectionCounts()).toEqual({ transactionConnections: 1, readonlyConnections: 1 })
  expect(app.readonlyQueries).toHaveLength(1)
  expect(app.readonlyWrites).toEqual([])
})
test('只读核对跨用户及同键异目标均不冒充原绑定成功，三表完全不变', async () => {
  await bind()
  const before = await bindingSnapshot(),
    app = application()
  expect(await app.reader.readCompleted({ ...input(), userRef: 'usr_binding_owner02' })).toBeNull()
  expect(
    await app.reader.readCompleted({ ...input(), targetUserPlantRef: 'upl_binding_target02' })
  ).toEqual({ status: 'idempotency_conflict' })
  expect(await bindingSnapshot()).toEqual(before)
  expect(app.connectionCounts()).toEqual({ transactionConnections: 0, readonlyConnections: 2 })
  expect(app.readonlyQueries).toHaveLength(2)
  expect(app.readonlyWrites).toEqual([])
})

/** Expected来自冻结归属前置：仅核验active统一用户与精确案例归属，不判断TTL/资格，允许历史重放。 */
async function readCaseOwnership(userRef = 'usr_binding_owner01', ephemeralCaseRef = 'epc_binding_case01') {
  const queries: string[] = [], writes: string[] = []
  const guarded: typeof source = { getConnection: async () => {
    const c = await source.getConnection()
    return { ...c, query: async (sql, args) => {
      queries.push(sql)
      if (!/^\s*SELECT\b/iu.test(sql) || /\bFOR\s+(UPDATE|SHARE)\b/iu.test(sql)) { throw new Error('归属前置必须无锁只读') }
      return c.query(sql, args)
    }, execute: async sql => { writes.push(sql); throw new Error('归属前置禁止写入') } }
  } }
  const before = await bindingSnapshot()
  const result = await createMysqlAuthenticatedEphemeralCaseOwnershipReader(guarded).readOwned({ userRef, ephemeralCaseRef })
  expect(queries).toHaveLength(1); expect(writes).toEqual([])
  expect(await bindingSnapshot()).toEqual(before)
  return result
}
test('归属前置本人所有案例状态均owned，历史过期不阻断重放', async () => {
  for (const status of ['active', 'completed', 'failed', 'expired']) {
    await db.execute('UPDATE authenticated_ephemeral_plant_cases SET status=? WHERE id=1', [status])
    expect(await readCaseOwnership()).toEqual({ status: 'owned' })
  }
  await db.execute("UPDATE authenticated_ephemeral_plant_cases SET status='completed' WHERE id=1")
  await bind()
  expect(await readCaseOwnership()).toEqual({ status: 'owned' })
})
test('归属前置跨用户/不存在/大小写伪引用均not_found，零写且无锁', async () => {
  expect(await readCaseOwnership('usr_binding_owner01', 'epc_binding_other01')).toEqual({ status: 'not_found' })
  expect(await readCaseOwnership('usr_binding_owner02')).toEqual({ status: 'not_found' })
  expect(await readCaseOwnership('usr_binding_owner01', 'epc_binding_missing01')).toEqual({ status: 'not_found' })
  expect(await readCaseOwnership('usr_binding_owner01', 'EPC_binding_case01')).toEqual({ status: 'not_found' })
})
test('归属前置停用用户及非空技术openid不能当成合法归属', async () => {
  await db.execute("UPDATE users SET status='suspended' WHERE id=1")
  expect(await readCaseOwnership()).toEqual({ status: 'not_found' })
  await db.execute("UPDATE users SET status='active',_openid='technical-subject' WHERE id=1")
  expect(await readCaseOwnership()).toEqual({ status: 'not_found' })
  await db.execute("UPDATE users SET status='active',_openid='' WHERE id=1")
  await db.execute("UPDATE authenticated_ephemeral_plant_cases SET _openid='technical-case-subject' WHERE id=1")
  expect(await readCaseOwnership()).toEqual({ status: 'not_found' })
})
test('真实HTTP绑定及到期后重放仅公开目标引用，同键异目标冲突且三表保留原时间', async () => {
  await verifyAuthenticatedEphemeralBindingHttp(db, source, 'success_replay_conflict')
})
test('真实HTTP跨用户案例优先于非法正文404，跨用户目标404，零绑定', async () => {
  await verifyAuthenticatedEphemeralBindingHttp(db, source, 'cross_user')
})
test('真实HTTP提交成功回包未知由新连接核对200且仅保存一次', async () => {
  await verifyAuthenticatedEphemeralBindingHttp(db, source, 'commit_unknown')
})
