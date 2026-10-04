import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysql2ConnectionSource, type Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlMeasuredProfileRepository } from '../../src/user-plant/repository/mysql-measured-profile-repository.js'

/** L3/unit_real_data：实际003聚合/档案DDL、mysql2、行锁与事务。
 * users及plant_identities仅为明确的归属/FK表桩，不证明身份域Schema或登录验真。
 * 不运行整份迁移、不调用生产，不证明HTTP幂等或完整档案；当前所有业务记录为合成制品。 */
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
  await db.query('CREATE TABLE plant_identities(id BIGINT UNSIGNED PRIMARY KEY)')
  const ddl = readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8')
  for (const name of ['user_plants', 'user_plant_profiles']) {
    const start = ddl.indexOf('CREATE TABLE `' + name + '`')
    await db.query(ddl.slice(start, ddl.indexOf(';\n', start) + 1))
  }
  await db.query("INSERT INTO users(id,public_user_id,status) VALUES(1,'usr_profile_owner01','active'),(2,'usr_profile_owner02','active')")
  for (const [index, name] of ['created01', 'preserve1', 'guards001', 'race00001', 'rollback1', 'archived1'].entries()) {
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
