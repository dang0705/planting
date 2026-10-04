import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysqlOwnedVisualEvidenceReader } from '../../src/diagnosis/repository/mysql-owned-visual-evidence-reader.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
/** unit_real_data / L3：真实MySQL8.4与实际003资产、004会话/视觉表；模型JSON是合同场景夹具，不声称真实Provider、HTTP或视觉准入发布。 */
const root = findProjectRoot(),
  container = `qhz-owned-visual-${process.pid}`
let db: Connection, port: number
const input = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  diagnosisRef: 'dia_owner123',
  evidenceRef: 'dve_owner123',
  modelContractVersion: 'diagnosis-model-output/v1',
  capturedAtMs: 1500
}
const model = {
  contractVersion: 'diagnosis-model-output/v1',
  evidence: [
    { evidenceKey: 'obs1', source: 'visual', observation: '叶背可见白色小虫', confidence: 'medium' }
  ],
  conclusionCandidates: [
    {
      candidateKey: 'whitefly',
      summary: '白粉虱候选',
      confidence: 'medium',
      supportingEvidenceKeys: ['obs1']
    }
  ],
  uncertainty: { level: 'medium', reasons: ['局部照片'], missingEvidence: ['其他叶片'] },
  recommendedActions: [
    {
      actionKey: 'inspect',
      instruction: '观察其他叶背',
      purpose: '补充证据',
      requiresUserConfirmation: true,
      producesCareFact: false,
      producesCarePlan: false
    }
  ]
}
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
  port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  let ready = false
  for (let i = 0; i < 100; i += 1) {
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
    throw new Error('隔离MySQL未就绪')
  }
  await db.query('CREATE DATABASE qhz_owned_visual')
  await db.query('USE qhz_owned_visual')
  // users与user_plants仅提供归属外键夹具，核心资产和视觉表使用真实DDL。
  await db.query(
    "CREATE TABLE users(id BIGINT UNSIGNED PRIMARY KEY,_openid VARCHAR(64) NOT NULL DEFAULT '',public_user_id VARCHAR(64) NOT NULL,status VARCHAR(24) NOT NULL)"
  )
  await db.query(
    "CREATE TABLE user_plants(id BIGINT UNSIGNED PRIMARY KEY,_openid VARCHAR(64) NOT NULL DEFAULT '',user_internal_id BIGINT UNSIGNED NOT NULL,public_user_plant_id VARCHAR(64) NOT NULL,lifecycle_status VARCHAR(24) NOT NULL,UNIQUE KEY uq_owner(user_internal_id,id))"
  )
  for (const [file, tables] of [
    ['003_user_plant.sql', ['user_plant_assets']],
    ['004_care_diagnosis.sql', ['diagnosis_sessions', 'diagnosis_visual_evidence']]
  ] as const) {
    const ddl = readFileSync(join(root, 'docs/backend-v2/schema', file), 'utf8')
    for (const name of tables) {
      const start = ddl.indexOf('CREATE TABLE `' + name + '` (')
      if (start < 0) {
        throw new Error('指定表缺失')
      }
      await db.query(ddl.slice(start, ddl.indexOf(';', start) + 1))
    }
  }
  await db.query(
    "INSERT INTO users(id,public_user_id,status) VALUES (1,'usr_owner123','active'),(2,'usr_other123','active')"
  )
  await db.query(
    "INSERT INTO user_plants(id,user_internal_id,public_user_plant_id,lifecycle_status) VALUES (1,1,'upl_owner123','active'),(2,2,'upl_other123','active'),(3,1,'upl_second123','active')"
  )
  await db.query(
    "INSERT INTO diagnosis_sessions(diagnosis_ref,user_internal_id,user_plant_internal_id,symptom_type,question_package_release_ref,status,started_at_ms,created_at_ms,updated_at_ms) VALUES ('dia_owner123',1,1,'specific_pest_visual','bpr_pest12345','active',1000,1000,1000)"
  )
  await db.query(
    "INSERT INTO user_plant_assets(asset_ref,user_internal_id,user_plant_internal_id,storage_file_id,asset_purpose,status,content_hash,created_at_ms,updated_at_ms) VALUES ('upa_owner123',1,1,'private-file-never-public','diagnosis_evidence','active',REPEAT('a',64),1000,1000)"
  )
  await db.execute(
    "INSERT INTO diagnosis_visual_evidence(evidence_ref,diagnosis_session_internal_id,asset_internal_id,evidence_kind,model_contract_version,evidence_json,expires_at_ms,created_at_ms,updated_at_ms) VALUES ('dve_owner123',1,1,'leaf','diagnosis-model-output/v1',CAST(? AS JSON),2000,1000,1000)",
    [JSON.stringify(model)]
  )
}, 40000)
afterAll(async () => {
  await db?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})
async function read(extra: Partial<typeof input> = {}) {
  const source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'qhz_owned_visual'
  })
  return runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx => createMysqlOwnedVisualEvidenceReader().read(tx, { ...input, ...extra })
  )
}
/** 使用当前测试连接读回未提交边界变更，并回滚，避免场景污染。 */
async function readMutation(sql: string) {
  await db.beginTransaction()
  try {
    await db.query(sql)
    const connection = {
      query: async (q: string, p: readonly (string | number | null)[]) => {
        const [rows] = await db.execute(q, [...p])
        return rows as Record<string, unknown>[]
      }
    } as any
    return await createMysqlOwnedVisualEvidenceReader().read(
      { transactionContext: true, connection },
      input
    )
  } finally {
    await db.rollback()
  }
}
test('真实SQL在原事务读回冻结的结构化证据，不返回私有文件标识', async () => {
  const before = (await db.query('SELECT evidence_json FROM diagnosis_visual_evidence'))[0]
  const r = await read()
  expect(r.status).toBe('found')
  if (r.status !== 'found') {
    throw new Error('未找到')
  }
  expect(r.output).toEqual(model)
  expect(Object.isFrozen(r.output.evidence)).toBe(true)
  expect(JSON.stringify(r)).not.toMatch(/private-file|internal_id|openid|storage_file_id/)
  expect((await db.query('SELECT evidence_json FROM diagnosis_visual_evidence'))[0]).toEqual(before)
})
test.each([
  { userRef: 'usr_other123' },
  { userPlantRef: 'upl_other123' },
  { userPlantRef: 'upl_second123' },
  { diagnosisRef: 'dia_other123' },
  { evidenceRef: 'dve_other123' },
  { userRef: 'USR_OWNER123' },
  { evidenceRef: 'DVE_OWNER123' }
])('归属及引用按字节拒绝：%j', async extra => {
  expect(await read(extra)).toEqual({ status: 'not_found' })
})
test.each([
  'UPDATE user_plant_assets SET user_internal_id=2,user_plant_internal_id=2',
  'UPDATE user_plant_assets SET user_plant_internal_id=3',
  "UPDATE user_plant_assets SET status='removed'",
  "UPDATE user_plant_assets SET status='pending_cleanup'",
  "UPDATE user_plant_assets SET asset_purpose='profile'",
  "UPDATE users SET status='disabled' WHERE id=1",
  "UPDATE user_plants SET lifecycle_status='archived' WHERE id=1",
  "UPDATE diagnosis_sessions SET status='completed'",
  "UPDATE diagnosis_sessions SET symptom_type='yellow_leaf'"
])('真实SQL不采纳其他目标或失效上下文：%s', async sql => {
  expect(await readMutation(sql)).toEqual({ status: 'not_found' })
})
test.each([
  'UPDATE diagnosis_visual_evidence SET expires_at_ms=1500',
  'UPDATE user_plant_assets SET cleanup_after_ms=1500'
])('有效期边界不通过：%s', async sql => {
  expect(await readMutation(sql)).toEqual({ status: 'expired' })
})
test.each([
  'UPDATE diagnosis_visual_evidence SET created_at_ms=1501',
  "UPDATE diagnosis_visual_evidence SET model_contract_version='v2'",
  "UPDATE diagnosis_visual_evidence SET evidence_json=JSON_OBJECT('rawModelOutput','不能采纳')",
  "UPDATE diagnosis_visual_evidence SET _openid='platform'",
  "UPDATE diagnosis_sessions SET _openid='platform'",
  "UPDATE user_plant_assets SET _openid='platform'"
])('真实SQL字段损坏不通过：%s', async sql => {
  expect(await readMutation(sql)).toEqual({ status: 'invalid' })
})
