import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysql2ConnectionSource, toSqlParameters, type Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlMeasuredProfileRepository } from '../../src/user-plant/repository/mysql-measured-profile-repository.js'
import { createMeasuredProfileApplicationService } from '../../src/user-plant/application/save-measured-profile.js'
import { createMysqlHttpIdempotencyRepository, createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository, type HttpIdempotencySqlRow } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import type { MysqlTransactionContext } from '../../src/foundation/database/mysql-transaction-driver.js'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { createMysqlUserPlantRepository, type UserPlantSqlRow } from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { createGetUserPlantApplicationService } from '../../src/user-plant/application/get-user-plant.js'
import { createGetUserPlantRouteHandler, getUserPlantRoute } from '../../src/user-plant/http/get-user-plant-route.js'
import { createRouteDispatcher } from '../../src/foundation/http/route-dispatcher.js'
import type { UserRef } from '../../src/contracts/types.js'

/** L3/unit_real_data：实际003聚合/档案DDL、mysql2、行锁与事务。
 * users及plant_identities仅为明确的归属/FK表桩，不证明身份域Schema或登录验真。
 * 使用008共享幂等表验证应用收据；不运行整份迁移、不调用生产，不证明HTTP或完整档案；业务记录为合成制品。 */
const container = `qhz-measured-profile-${process.pid}`, root = findProjectRoot()
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const repository = createMysqlMeasuredProfileRepository()
const measuredPot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 12 }
const input = (name: string) => ({ userRef: 'usr_profile_owner01', userPlantRef: `upl_profile_${name}`, expectedVersion: 1, nickname: '小青', measuredPot, profileVersion: 'user-plant-profile/v1', occurredAtMs: 3000 })
function docker(args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) { throw new Error(result.stderr) }
  return result.stdout.trim()
}
function save(command: unknown, wrap?: (c: Mysql2QueryConnection) => Mysql2QueryConnection) {
  const driver = createMysqlTransactionDriver({ getConnection: async () => {
    const connection = await source.getConnection()
    return wrap ? wrap(connection) : connection
  } }, () => undefined)
  return runDatabaseTransaction(driver, tx => repository.save(tx, command))
}
beforeAll(async () => {
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1'); ready = true; break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!ready) { throw new Error('隔离档案MySQL未就绪') }
  await db.query('CREATE DATABASE measured_profile CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await db.query('USE measured_profile')
  await db.query("CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,_openid VARCHAR(64) NOT NULL DEFAULT '',public_user_id VARCHAR(64) NOT NULL UNIQUE,status VARCHAR(24) NOT NULL)")
  await db.query('CREATE TABLE plant_identities(id BIGINT UNSIGNED PRIMARY KEY,public_identity_ref VARCHAR(64) NULL)')
  const ddl = readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8')
  for (const name of ['user_plants', 'user_plant_profiles']) {
    const start = ddl.indexOf('CREATE TABLE `' + name + '`')
    await db.query(ddl.slice(start, ddl.indexOf(';\n', start) + 1))
  }
  // 定向准入见E03-measured-profile-application-context；只提取当前测试需要的一张表。
  const foundation = readFileSync(join(root, 'docs/backend-v2/schema/008_foundation.sql'), 'utf8')
  const idemStart = foundation.indexOf('CREATE TABLE `http_idempotency_records`')
  await db.query(foundation.slice(idemStart, foundation.indexOf(';\n', idemStart) + 1))
  await db.query("INSERT INTO users(id,public_user_id,status) VALUES(1,'usr_profile_owner01','active'),(2,'usr_profile_owner02','active')")
  for (const [index, name] of ['created01', 'preserve1', 'guards001', 'race00001', 'rollback1', 'archived1', 'idem00001', 'receipt01', 'unknown01', 'idemrace1', 'nickonly1', 'potonly01'].entries()) {
    await db.query("INSERT INTO user_plants(id,public_user_plant_id,user_internal_id,lifecycle_status,current_identity_status,version,created_at_ms,updated_at_ms) VALUES(?,?,1,?,'unidentified',1,1000,1000)", [index + 1, `upl_profile_${name}`, name === 'archived1' ? 'archived' : 'active'])
  }
  source = createMysql2ConnectionSource({ host: '127.0.0.1', port, user: 'root', password: '', database: 'measured_profile' })
}, 30000)
afterAll(async () => { await db?.end(); docker(['rm', '-f', container]) })

test('首次实际保存→原聚合版本递增→昵称及事实读回，不标完成', async () => {
  const command = input('created01')
  expect(await save(command)).toEqual({ status: 'saved', userPlantRef: command.userPlantRef, version: 2, nickname: '小青', measuredPot })
  const [rows] = await db.query('SELECT nickname,pot_profile_json,profile_completed_at_ms,version FROM user_plant_profiles WHERE user_plant_internal_id=1')
  expect(rows).toEqual([{ nickname: '小青', pot_profile_json: { measuredPot }, profile_completed_at_ms: null, version: 1 }])
  const [plant] = await db.query('SELECT public_user_plant_id,current_identity_status,lifecycle_status,version FROM user_plants WHERE id=1')
  expect(plant).toEqual([{ public_user_plant_id: command.userPlantRef, current_identity_status: 'unidentified', lifecycle_status: 'active', version: 2 }])
})
test('局部保存保留原基质/材质/专业参数、首次完成时间及创建时间', async () => {
  const original = { substrate: { evidence: 'retained', porosity: [0.2, 0.4] }, material: 'clay', professionalParameters: { spectralReview: 'preserved' }, measuredPot }
  await db.execute('INSERT INTO user_plant_profiles(user_internal_id,user_plant_internal_id,nickname,pot_profile_json,profile_completeness_version,profile_completed_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,2,?,CAST(? AS JSON),?,1500,7,1000,1500)', ['旧昵称', JSON.stringify(original), 'user-plant-profile/v1'])
  const changed = { ...measuredPot, potHeightCm: 10 }
  expect(await save({ ...input('preserve1'), nickname: '', measuredPot: changed })).toMatchObject({ status: 'saved', nickname: '', measuredPot: changed, version: 2 })
  const [rows] = await db.query('SELECT pot_profile_json,CAST(profile_completed_at_ms AS CHAR) AS completed,CAST(created_at_ms AS CHAR) AS created,profile_completeness_version,version FROM user_plant_profiles WHERE user_plant_internal_id=2')
  expect(rows).toEqual([{ pot_profile_json: { ...original, measuredPot: changed }, completed: '1500', created: '1000', profile_completeness_version: 'user-plant-profile/v1', version: 8 }])
})
test('跨用户和旧版本均拒绝且不创建档案或更改聚合', async () => {
  expect(await save({ ...input('guards001'), userRef: 'usr_profile_owner02' })).toEqual({ status: 'not_found' })
  expect(await save({ ...input('guards001'), expectedVersion: 9 })).toEqual({ status: 'version_conflict' })
  const [rows] = await db.query('SELECT version FROM user_plants WHERE id=3')
  const [profiles] = await db.query('SELECT COUNT(*) AS n FROM user_plant_profiles WHERE user_plant_internal_id=3')
  expect(rows).toEqual([{ version: 1 }]); expect(profiles).toEqual([{ n: 0 }])
})
test('两个连接同旧版本编辑只有一个成功，保存事实匹配赢家', async () => {
  const results = await Promise.all([save({ ...input('race00001'), nickname: '甲' }), save({ ...input('race00001'), nickname: '乙' })])
  expect(results.filter(result => result.status === 'saved')).toHaveLength(1)
  expect(results.filter(result => result.status === 'version_conflict')).toHaveLength(1)
  const winner = results.find(result => result.status === 'saved')!
  if (winner.status !== 'saved') { throw new Error('应有一个保存赢家') }
  const [rows] = await db.query('SELECT nickname,version FROM user_plant_profiles WHERE user_plant_internal_id=4')
  expect(rows).toEqual([{ nickname: winner.nickname, version: 1 }])
})
test('聚合版本更新后档案写入失败，两者整体回滚', async () => {
  await expect(save(input('rollback1'), c => ({ ...c, execute: async (sql, args) => {
    if (sql.startsWith('INSERT INTO user_plant_profiles')) { throw new Error('受控档案写入失败') }
    return c.execute(sql, args)
  } }))).rejects.toThrow('受控档案写入失败')
  const [rows] = await db.query('SELECT version,CAST(updated_at_ms AS CHAR) AS updated FROM user_plants WHERE id=5')
  const [profiles] = await db.query('SELECT COUNT(*) AS n FROM user_plant_profiles WHERE user_plant_internal_id=5')
  expect(rows).toEqual([{ version: 1, updated: '1000' }]); expect(profiles).toEqual([{ n: 0 }])
})
test('归档植物只改档案，不恢复生命周期或更改身份', async () => {
  expect(await save(input('archived1'))).toMatchObject({ status: 'saved', version: 2 })
  const [rows] = await db.query('SELECT lifecycle_status,current_identity_status FROM user_plants WHERE id=6')
  expect(rows).toEqual([{ lifecycle_status: 'archived', current_identity_status: 'unidentified' }])
})

/** 真实SQL适配器与现有事务驱动；模式仅在已提交响应丢失/收据失败的边界注入故障。 */
function application(mode?: 'unknown' | 'receipt') {
  let reads = 0
  const driver = createMysqlTransactionDriver({ getConnection: async () => {
    const c = await source.getConnection()
    return { ...c, commit: async () => { await c.commit(); if (mode === 'unknown') { throw new Error('提交响应丢失') } }, execute: async (sql: string, args: readonly (string | number | null)[]) => {
      if (mode === 'receipt' && sql.includes('UPDATE `http_idempotency_records`')) { throw new Error('完成收据失败') }
      return c.execute(sql, args)
    } }
  } }, () => undefined)
  const idem = createMysqlHttpIdempotencyRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
    executeWrite: (tx, sql, args) => tx.connection.execute(sql, toSqlParameters(args)),
    executeQuery: async (tx, sql, args) => await tx.connection.query(sql, toSqlParameters(args)) as unknown as readonly HttpIdempotencySqlRow[]
  })
  const readOnly = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({ executeQuery: async (sql, args) => {
    reads++; const c = await source.getConnection()
    try { return await c.query(sql, toSqlParameters(args)) as unknown as readonly HttpIdempotencySqlRow[] } finally { c.release() }
  } })
  const service = createMeasuredProfileApplicationService({ driver, profileRepository: repository, idempotencyRepository: idem, commitUnknownReadOnlyRepository: readOnly })
  return { service, readCount: () => reads }
}
/** 合成请求摘要/保留期仅供已冻结内部端口测试，不成为正式HTTP策略。 */
function appInput(name: string) {
  const hash = (value: string) => createHash('sha256').update(value).digest('hex')
  return { command: input(name), idempotency: { principalType: 'user' as const, principalScopeHash: hash('usr_profile_owner01'), httpMethod: 'PATCH', normalizedPath: '/api/v2/user-plants/{userPlantRef}', operationId: 'updateUserPlant', idempotencyKeyHash: hash(name), requestHash: hash(`request-${name}`), createdAtMs: 3000, expiresAtMs: 6000 } }
}
test('实际幂等同键重放旧版本成功收据，异参冲突不增档案版本', async () => {
  const { service } = application(), request = appInput('idem00001')
  const first = await service(request)
  expect(first).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_profile_idem00001', version: 2, nickname: '小青', measuredPot } } })
  expect(await service(request)).toEqual(first)
  expect((await service({ ...request, idempotency: { ...request.idempotency, requestHash: 'f'.repeat(64) } })).status).toBe(409)
  const [rows] = await db.query('SELECT p.version AS aggregate,f.version AS profile FROM user_plants p JOIN user_plant_profiles f ON f.user_plant_internal_id=p.id WHERE p.id=7')
  expect(rows).toEqual([{ aggregate: 2, profile: 1 }])
})
test('完成收据失败回滚真实档案、聚合版本和占位', async () => {
  const request = appInput('receipt01')
  await expect(application('receipt').service(request)).rejects.toThrow('完成收据失败')
  const [plants] = await db.query('SELECT version FROM user_plants WHERE id=8')
  const [profiles] = await db.query('SELECT COUNT(*) AS n FROM user_plant_profiles WHERE user_plant_internal_id=8')
  const [receipts] = await db.execute('SELECT COUNT(*) AS n FROM http_idempotency_records WHERE idempotency_key_hash=?', [request.idempotency.idempotencyKeyHash])
  expect(plants).toEqual([{ version: 1 }]); expect(profiles).toEqual([{ n: 0 }]); expect(receipts).toEqual([{ n: 0 }])
})
test('实际提交后响应丢失用新连接只读成功收据，业务只写一次', async () => {
  const f = application('unknown'), request = appInput('unknown01')
  expect((await f.service(request)).status).toBe(200); expect(f.readCount()).toBe(1)
  const [rows] = await db.query('SELECT p.version AS aggregate,f.version AS profile FROM user_plants p JOIN user_plant_profiles f ON f.user_plant_internal_id=p.id WHERE p.id=9')
  expect(rows).toEqual([{ aggregate: 2, profile: 1 }])
})
test('真实并发同幂等键返回同一赢家收据，只产生一次新版本', async () => {
  const { service } = application(), request = appInput('idemrace1')
  const results = await Promise.all([service(request), service(request)])
  expect(results[0]!.status).toBe(200); expect(results[1]).toEqual(results[0])
  const [rows] = await db.query('SELECT p.version AS aggregate,f.version AS profile FROM user_plants p JOIN user_plant_profiles f ON f.user_plant_internal_id=p.id WHERE p.id=10')
  expect(rows).toEqual([{ aggregate: 2, profile: 1 }])
})
test('首次仅昵称不补造测量，后续仅测量保留昵称和原事实', async () => {
  const { service } = application(), first = appInput('nickonly1')
  const { measuredPot: _ignored, ...nicknameCommand } = first.command
  const initial = await service({ ...first, command: nicknameCommand })
  expect(initial).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_profile_nickonly1', version: 2, nickname: '小青' } } })
  const [rows] = await db.query('SELECT nickname,pot_profile_json FROM user_plant_profiles WHERE user_plant_internal_id=11')
  expect(rows).toEqual([{ nickname: '小青', pot_profile_json: {} }])
  const { nickname: _unused, ...potCommand } = first.command
  const next = await service({ command: { ...potCommand, expectedVersion: 2, occurredAtMs: 4000 }, idempotency: { ...first.idempotency, idempotencyKeyHash: 'd'.repeat(64), requestHash: 'e'.repeat(64), createdAtMs: 4000 } })
  expect(next).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_profile_nickonly1', version: 3, nickname: '小青', measuredPot } } })
})
test('首次仅测量遵守SQL空昵称，后续清除昵称不改变测量事实', async () => {
  const { service } = application(), first = appInput('potonly01')
  const { nickname: _ignored, ...potCommand } = first.command
  expect(await service({ ...first, command: potCommand })).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_profile_potonly01', version: 2, nickname: '', measuredPot } } })
  const { measuredPot: _unused, ...nicknameCommand } = first.command
  const next = await service({ command: { ...nicknameCommand, nickname: '', expectedVersion: 2, occurredAtMs: 4000 }, idempotency: { ...first.idempotency, idempotencyKeyHash: 'f'.repeat(64), requestHash: 'a'.repeat(64), createdAtMs: 4000 } })
  expect(next).toEqual({ status: 200, body: { data: { userPlantRef: 'upl_profile_potonly01', version: 3, nickname: '', measuredPot } } })
})
test('真实HTTP单株读回保存档案且不透传专业参数，跨用户404', async () => {
  const driver = createMysqlTransactionDriver(source, () => undefined)
  const reader = createMysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
    executeQuery: async (tx, sql, args) => await tx.connection.query(sql, toSqlParameters(args)) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (tx, sql, args) => tx.connection.execute(sql, toSqlParameters(args))
  })
  const getUserPlant = createGetUserPlantApplicationService({ driver, repository: reader })
  const dispatch = createRouteDispatcher([{ route: getUserPlantRoute, handler: createGetUserPlantRouteHandler({
    // 只替换身份验真边界，不证明微信登录或正式会话；实际运行HTTP/应用/SQL/响应校验。
    resolvePrincipal: async command => ({ principalType: 'user', user_id: (command.bearerToken === 'other-user' ? 'usr_profile_owner02' : 'usr_profile_owner01') as UserRef, authenticatedVia: 'wechat', sessionVersion: 1, issuedAt: '2026-10-05T00:00:00.000Z', expiresAt: '2026-10-06T00:00:00.000Z' }),
    getUserPlant, now: () => 3000, writeAudit: () => undefined
  }) }])
  const server = createServer((req, res) => { dispatch(req, res).catch(() => undefined) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v2/user-plants/upl_profile_preserve1`
  try {
    const response = await fetch(url, { headers: { authorization: 'Bearer owner-user' } }), body = await response.json()
    expect(response.status).toBe(200)
    expect(body).toEqual({ data: { user_plant_id: 'upl_profile_preserve1', lifecycle: 'active', identityStatus: 'unidentified', version: 2, createdAt: '1970-01-01T00:00:01.000Z', updatedAt: '1970-01-01T00:00:03.000Z', profile: { nickname: '', measuredPot: { ...measuredPot, potHeightCm: 10 } } } })
    expect(JSON.stringify(body)).not.toContain('professionalParameters')
    const cross = await fetch(url, { headers: { authorization: 'Bearer other-user' } }); expect(cross.status).toBe(404)
  } finally { await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve())) }
})
