import { createPestQuestionSessionInTransaction } from '../../src/diagnosis/application/create-pest-question-session.js'
import { createMysqlDiagnosisVisualEvidenceRepository } from '../../src/diagnosis/repository/mysql-diagnosis-visual-evidence-repository.js'
import { createMysqlDiagnosisQuestionSnapshotRepository } from '../../src/diagnosis/repository/mysql-diagnosis-question-snapshot-repository.js'
import { createMysqlDynamicPestReleaseReader } from '../../src/diagnosis/repository/mysql-dynamic-pest-release-reader.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'
import { projectPestQuestionPackage } from '../../src/diagnosis/http/pest-question-public-projection.js'
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

  const policies = readFileSync(join(root, 'docs/backend-v2/schema/007_configuration.sql'), 'utf8')
  for (const name of ['business_policy_releases', 'active_business_policy_releases']) {
    const offset = policies.indexOf('CREATE TABLE `' + name + '` (')
    await db.query(policies.slice(offset, policies.indexOf(';', offset) + 1))
  }
  const raw = JSON.parse(
    readFileSync(join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8')
  )
  const body = {
    contractVersion: 'diagnosis-dynamic-pest-question-packages/v1',
    sourceRef: 'v1-reuse/questions.json',
    sourceSha256: '40385731fe0ed7d20c9331b1be6aee10c13ebb900350a4576c14edd0ea07107f',
    questions: raw.pestQuestions,
    tierQuestionLimits: { low: 3, medium: 2, high: 1, very_likely: 1, direct: 0 },
    evidenceGroupByKey: {}
  }
  await db.execute(
    "INSERT INTO business_policy_releases(release_ref,domain_code,policy_code,schema_version,release_version,content_sha256,policy_json,status,effective_at_ms,verified_at_ms,created_at_ms,updated_at_ms) VALUES('bpr_pest12345','diagnosis','dynamic_pest_question_packages',?,'v1',?,CAST(? AS JSON),'active',1000,900,900,1000)",
    [body.contractVersion, calculateCanonicalJsonSha256(body), JSON.stringify(body)]
  )
  await db.query(
    'INSERT INTO active_business_policy_releases(domain_code,policy_code,release_internal_id,active_release_version,active_content_sha256,activated_at_ms,created_at_ms,updated_at_ms) SELECT domain_code,policy_code,id,release_version,content_sha256,1000,1000,1000 FROM business_policy_releases'
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

/** 分析准备是服务端端口夹具；其余发布、归属、会话、视觉与读回均为真实MySQL。 */
function atomicCreator(extra: Record<string, unknown> = {}) {
  const source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'qhz_owned_visual'
  })
  const snapshots = createMysqlDiagnosisQuestionSnapshotRepository(source),
    visuals = createMysqlDiagnosisVisualEvidenceRepository()
  const deps = {
    published: createMysqlDynamicPestReleaseReader().read,
    asset: visuals.readOwnedAsset,
    prepare: async () => ({
      status: 'admitted' as const,
      evidenceKind: 'leaf' as const,
      assetContentSha256: 'a'.repeat(64),
      tier: 'medium' as const,
      candidateModes: ['whitefly'],
      lockedEvidenceKeys: [],
      output: model,
      expiresAtMs: 2000
    }),
    append: snapshots.append,
    appendVisual: visuals.append,
    read: snapshots.readInTransaction,
    readVisual: createMysqlOwnedVisualEvidenceReader().read,
    ...extra
  }
  const run = createPestQuestionSessionInTransaction(deps)
  return (override: Partial<{ userRef: string; userPlantRef: string; assetRef: string }> = {}) =>
    runDatabaseTransaction(
      createMysqlTransactionDriver(source, () => undefined),
      tx =>
        run(tx, {
          userRef: input.userRef,
          userPlantRef: input.userPlantRef,
          assetRef: 'upa_owner123',
          startedAtMs: 1500,
          ...override
        })
    )
}
async function counts() {
  return (
    await db.query(
      'SELECT (SELECT COUNT(*) FROM diagnosis_sessions) AS sessions,(SELECT COUNT(*) FROM diagnosis_visual_evidence) AS visuals'
    )
  )[0]
}
/** 先保留读取旧行的场景，再为新增创建安装019真实约束。 */
async function enableSnapshots() {
  // 019只加载本增量的长期会话ALTER和两条触发器；不遍历临时会话或其他迁移。
  const snapshotDdl = readFileSync(
    join(root, 'docs/backend-v2/schema/019_diagnosis_question_package_snapshots.sql'),
    'utf8'
  )
  const start = snapshotDdl.indexOf('ALTER TABLE `diagnosis_sessions`')
  await db.query(snapshotDdl.slice(start, snapshotDdl.indexOf(';', start) + 1))
  for (const name of [
    'tr_diagnosis_package_snapshot_insert',
    'tr_diagnosis_package_snapshot_update'
  ]) {
    const trigger = snapshotDdl.indexOf('CREATE TRIGGER `' + name + '`')
    await db.query(snapshotDdl.slice(trigger, snapshotDdl.indexOf('$$', trigger)))
  }
}

test('真实活动发布→选题→会话与视觉同事务保存，安全提示可公开投影', async () => {
  await enableSnapshots()
  const before = await counts(),
    r = await atomicCreator()()
  expect(r.status).toBe('created')
  if (r.status !== 'created') {
    throw new Error('未创建')
  }
  expect(r.snapshot.snapshot.questionCount).toBe(2)
  const publicPackage = projectPestQuestionPackage(r.snapshot)
  expect(publicPackage.questions.some(q => q.requiresExplicitConsent)).toBe(true)
  const [rows] = await db.execute(
    'SELECT e.evidence_ref FROM diagnosis_visual_evidence AS e JOIN diagnosis_sessions AS s ON s.id=e.diagnosis_session_internal_id WHERE s.diagnosis_ref=?',
    [r.diagnosisRef]
  )
  const evidenceRef = (rows as Record<string, string>[])[0]!.evidence_ref!
  expect((await read({ diagnosisRef: r.diagnosisRef, evidenceRef })).status).toBe('found')
  const after = await counts()
  expect(after).not.toEqual(before)
  await expect(
    db.execute(
      "UPDATE diagnosis_sessions SET question_package_snapshot_json=JSON_SET(question_package_snapshot_json,'$.questionCount',1) WHERE diagnosis_ref=?",
      [r.diagnosisRef]
    )
  ).rejects.toMatchObject({ sqlState: '45000' })
})
test.each([
  { userRef: 'usr_other123' },
  { userPlantRef: 'upl_second123' },
  { assetRef: 'UPA_OWNER123' }
])('创建前实际资产归属拒绝，无半会话：%j', async override => {
  const before = await counts()
  expect((await atomicCreator()(override)).status).toBe('not_found')
  expect(await counts()).toEqual(before)
})
test.each(['visual_write', 'snapshot_read', 'visual_read'])(
  '真实事务%s失败，会话与视觉全部回滚',
  async issue => {
    const before = await counts(),
      extra: any = {}
    if (issue === 'visual_write') {
      extra.appendVisual = async () => 'not_found'
    }
    if (issue === 'snapshot_read') {
      extra.read = async () => ({ status: 'not_found' })
    }
    if (issue === 'visual_read') {
      extra.readVisual = async () => ({ status: 'invalid' })
    }
    await expect(atomicCreator(extra)()).rejects.toThrow()
    expect(await counts()).toEqual(before)
  }
)
test('未准入分析与直判零题不创建会话', async () => {
  const before = await counts()
  expect(await atomicCreator({ prepare: async () => ({ status: 'unavailable' }) })()).toEqual({
    status: 'unavailable'
  })
  expect(
    await atomicCreator({
      prepare: async () => ({
        status: 'admitted',
        evidenceKind: 'leaf',
        assetContentSha256: 'a'.repeat(64),
        tier: 'direct',
        candidateModes: ['whitefly'],
        lockedEvidenceKeys: [],
        output: model,
        expiresAtMs: 2000
      })
    })()
  ).toEqual({ status: 'no_questions' })
  expect(await counts()).toEqual(before)
})

test('资产内容变化使旧分析准备失效，事务不留下新会话', async () => {
  const before = await counts()
  await db.query("UPDATE user_plant_assets SET content_hash=REPEAT('c',64) WHERE id=1")
  try {
    await expect(atomicCreator()()).rejects.toThrow('分析准备')
    expect(await counts()).toEqual(before)
  } finally {
    await db.query("UPDATE user_plant_assets SET content_hash=REPEAT('a',64) WHERE id=1")
  }
})
