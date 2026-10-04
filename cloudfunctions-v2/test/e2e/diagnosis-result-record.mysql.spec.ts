import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { resultFixture } from '../support/diagnosis-result-record-fixture.js'
import { lockDiagnosisResultRecord } from '../../src/diagnosis/domain/diagnosis-result-record.js'
import { createMysqlDiagnosisResultRecordRepository } from '../../src/diagnosis/repository/mysql-diagnosis-result-record-repository.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
/** unit_real_data/L3：真实004结果表与022迁移、事务与归属读回；用户/植物/知识父行是隔离夹具，不证明知识审核/模型/HTTP。 */
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const container = `qhz-result-record-${process.pid}`,
  root = findProjectRoot()
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr)
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
  for (let i = 0; i < 100; i++) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1')
      ready = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(r => setTimeout(r, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离结果库未就绪')
  }
  await db.query('CREATE DATABASE result_records')
  await db.query('USE result_records')
  await db.query(
    'CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY,public_user_id VARCHAR(64),status VARCHAR(24))'
  )
  await db.query(
    'CREATE TABLE user_plants (id BIGINT UNSIGNED PRIMARY KEY,user_internal_id BIGINT UNSIGNED,public_user_plant_id VARCHAR(64),lifecycle_status VARCHAR(24),UNIQUE(user_internal_id,id))'
  )
  // 发布父行只模拟引用/摘要/状态边界，不代表009审核流程已执行。
  await db.query(
    'CREATE TABLE diagnosis_knowledge_releases (release_ref VARCHAR(96) PRIMARY KEY,package_sha256 CHAR(64),release_state VARCHAR(16)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
  )
  const ddl = readFileSync(join(root, 'docs/backend-v2/schema/004_care_diagnosis.sql'), 'utf8')
  for (const name of ['diagnosis_sessions', 'diagnosis_results']) {
    const i = ddl.indexOf('CREATE TABLE `' + name + '`')
    await db.query(ddl.slice(i, ddl.indexOf(';', i) + 1))
  }
  await db.query("INSERT INTO users VALUES(1,'usr_owner123','active'),(2,'usr_other123','active')")
  await db.query("INSERT INTO user_plants VALUES(1,1,'upl_owner123','active')")
  await db.query(
    "INSERT INTO diagnosis_sessions(diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms) VALUES('dia_fixture123',1,1,'yellow_leaf','bpr_test12345','active',1000,1000,1000),('dia_legacy123',1,1,'yellow_leaf','bpr_test12345','completed',1000,1000,1000)"
  )
  await db.query(
    "INSERT INTO diagnosis_results(result_ref,diagnosis_session_internal_id,result_version,evidence_summary_json,conclusion_json,proposal_json,generated_at_ms,created_at_ms,updated_at_ms) VALUES('dgr_legacy123',2,'legacy/v1',JSON_OBJECT(),JSON_OBJECT(),JSON_OBJECT(),1000,1000,1000)"
  )
  const migration = readFileSync(
    join(root, 'docs/backend-v2/schema/022_diagnosis_result_records.sql'),
    'utf8'
  )
  const [tables, triggers] = migration.split('DELIMITER $$')
  for (const s of tables!
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)) {
    await db.query(s)
  }
  for (const s of triggers!
    .split('DELIMITER ;')[0]!
    .split('$$')
    .map(s => s.trim())
    .filter(Boolean)) {
    await db.query(s)
  }
  const snapshots = readFileSync(
    join(root, 'docs/backend-v2/schema/019_diagnosis_question_package_snapshots.sql'),
    'utf8'
  )
  const si = snapshots.indexOf('ALTER TABLE `diagnosis_sessions`')
  await db.query(snapshots.slice(si, snapshots.indexOf(';', si) + 1))
  const question = resultFixture().replay.questionPackage
  await db.execute(
    'UPDATE diagnosis_sessions SET question_package_snapshot_json=CAST(? AS JSON),question_package_snapshot_sha256=? WHERE id=1',
    [JSON.stringify(question.snapshot), question.snapshotSha256]
  )
  await db.query(
    "INSERT INTO diagnosis_knowledge_releases VALUES('dkr_fixture123',REPEAT('a',64),'published')"
  )
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'result_records'
  })
}, 40000)
afterAll(async () => {
  await db?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})
async function append(
  userRef = 'usr_owner123',
  record = lockDiagnosisResultRecord(resultFixture())
) {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    const r = await createMysqlDiagnosisResultRecordRepository(source).append(
      { transactionContext: true, connection: c },
      {
        userRef,
        userPlantRef: 'upl_owner123',
        diagnosisRef: 'dia_fixture123',
        resultRef: 'dgr_fixture123',
        record,
        generatedAtMs: 2000
      }
    )
    await c.commit()
    return r
  } catch (e) {
    await c.rollback()
    throw e
  } finally {
    c.release()
  }
}
test('跨用户不写入；旧结果不补当前版本；完整新结果原事务保存与归属读回', async () => {
  const repo = createMysqlDiagnosisResultRecordRepository(source)
  expect(await append('usr_other123')).toBe('not_found')
  expect(await repo.read('usr_owner123', 'upl_owner123', 'dia_legacy123')).toEqual({
    status: 'missing_record'
  })
  expect(await append()).toBe('created')
  const r = await repo.read('usr_owner123', 'upl_owner123', 'dia_fixture123')
  expect(r.status).toBe('found')
  if (r.status === 'found') {
    expect(r.record.record).toEqual(resultFixture())
  }
  expect(await repo.read('usr_other123', 'upl_owner123', 'dia_fixture123')).toEqual({
    status: 'not_found'
  })
})
test('锁定结果不能UPDATE/DELETE，唯一会话禁止第二条结果', async () => {
  if (
    (
      await createMysqlDiagnosisResultRecordRepository(source).read(
        'usr_owner123',
        'upl_owner123',
        'dia_fixture123'
      )
    ).status !== 'found'
  ) {
    await append()
  }

  await expect(
    db.query(
      "UPDATE diagnosis_results SET public_result_json=JSON_OBJECT() WHERE result_ref='dgr_fixture123'"
    )
  ).rejects.toThrow('不可修改')
  await expect(
    db.query("DELETE FROM diagnosis_results WHERE result_ref='dgr_fixture123'")
  ).rejects.toThrow('不可删除')
  await expect(append()).rejects.toThrow()
})

test('错配知识摘要拒绝且不新增；损坏完整摘要的行只能返回invalid_record', async () => {
  const repo = createMysqlDiagnosisResultRecordRepository(source)
  if ((await repo.read('usr_owner123', 'upl_owner123', 'dia_fixture123')).status !== 'found') {
    await append()
  }
  const changed = resultFixture()
  changed.replay.knowledgePackageSha256 = 'c'.repeat(64)
  await expect(append('usr_owner123', lockDiagnosisResultRecord(changed))).rejects.toThrow(
    '知识发布'
  )
  const [before] = await db.query('SELECT COUNT(*) AS n FROM diagnosis_results')
  expect(before).toEqual([{ n: 2 }])
  await db.query(
    "INSERT INTO diagnosis_sessions(diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms) VALUES('dia_corrupt123',1,1,'yellow_leaf','bpr_test12345','completed',1000,1000,1000)"
  )
  await db.query(
    "INSERT INTO diagnosis_results(result_ref,diagnosis_session_internal_id,result_version,evidence_summary_json,conclusion_json,proposal_json,generated_at_ms,created_at_ms,updated_at_ms,record_schema_version,public_result_json,replay_snapshot_json,record_sha256,knowledge_release_ref) SELECT 'dgr_corrupt123',3,result_version,evidence_summary_json,conclusion_json,proposal_json,generated_at_ms,created_at_ms,updated_at_ms,record_schema_version,public_result_json,replay_snapshot_json,REPEAT('f',64),knowledge_release_ref FROM diagnosis_results WHERE result_ref='dgr_fixture123'"
  )
  expect(await repo.read('usr_owner123', 'upl_owner123', 'dia_corrupt123')).toEqual({
    status: 'invalid_record'
  })
})
