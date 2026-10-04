import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlReviewedDiagnosisCandidateReader } from '../../src/diagnosis/repository/mysql-reviewed-diagnosis-candidate-reader.js'
/** L3/unit_real_data：实际009候选/审核及010撤销DDL、mysql2、事务与锁。园艺内容及CMS审核行为为结构制品；不证明知识发布或真实管理员授权。 */
const root = findProjectRoot(),
  container = `qhz-reviewed-candidate-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr)
  }
  return r.stdout.trim()
}
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(',')}]`
  }
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
const candidate = validCandidate(),
  sha = createHash('sha256').update(canonical(candidate)).digest('hex')
const reader = createMysqlReviewedDiagnosisCandidateReader(
  JSON.parse(
    readFileSync(
      join(root, 'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'),
      'utf8'
    )
  ) as object
)
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
    throw new Error('隔离审核库未就绪')
  }
  await db.query('CREATE DATABASE reviewed_candidate')
  await db.query('USE reviewed_candidate')
  for (const [file, names] of [
    [
      '009_diagnosis_knowledge.sql',
      ['diagnosis_knowledge_candidates', 'diagnosis_review_attestations']
    ],
    ['010_diagnosis_review_revocations.sql', ['diagnosis_review_revocations']]
  ] as const) {
    const ddl = readFileSync(join(root, 'docs/backend-v2/schema', file), 'utf8')
    for (const name of names) {
      const i = ddl.indexOf('CREATE TABLE `' + name + '`')
      await db.query(ddl.slice(i, ddl.indexOf(';\n', i) + 1))
    }
  }
  await db.execute(
    'INSERT INTO diagnosis_knowledge_candidates(candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,created_at_ms) VALUES(?,?,?,?,?,?,?,?)',
    [
      'candidate-fixture',
      'yellow_leaf',
      1,
      'diagnosis-knowledge-candidate/v1',
      sha,
      JSON.stringify(candidate),
      'reviewed',
      1000
    ]
  )
  await db.execute(
    'INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) VALUES(?,?,?,?,?,?,?)',
    ['review-fixture', 'a'.repeat(64), 1, sha, 'approved', 'fixture-review/v1', 1100]
  )
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'reviewed_candidate'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
test('真实三表、Schema和摘要读回；不产生发布写入', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    const r = await reader.read(
      { transactionContext: true, connection: c },
      'candidate-fixture',
      'review-fixture',
      'fixture-review/v1'
    )
    expect(r.status).toBe('reviewed_candidate')
    if (r.status === 'reviewed_candidate') {
      expect(r.candidate).toEqual(candidate)
      expect(r.contentSha256).toBe(sha)
    }
    await c.commit()
  } finally {
    c.release()
  }
})
test('错候选引用与错协议均拒绝，不借用其他审核', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    expect(
      await reader.read(
        { transactionContext: true, connection: c },
        'other-candidate',
        'review-fixture',
        'fixture-review/v1'
      )
    ).toEqual({ status: 'unavailable' })
    expect(
      await reader.read(
        { transactionContext: true, connection: c },
        'candidate-fixture',
        'review-fixture',
        'other/v1'
      )
    ).toEqual({ status: 'invalid_record' })
    await c.rollback()
  } finally {
    c.release()
  }
})
test('审核锁阻止另一事务先撤销；锁释放后撤销事实使读取不可用', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    expect(
      (
        await reader.read(
          { transactionContext: true, connection: c },
          'candidate-fixture',
          'review-fixture',
          'fixture-review/v1'
        )
      ).status
    ).toBe('reviewed_candidate')
    await db.query('SET SESSION innodb_lock_wait_timeout=1')
    await expect(
      db.query(
        "SELECT id FROM diagnosis_review_attestations WHERE review_ref='review-fixture' FOR UPDATE"
      )
    ).rejects.toMatchObject({ code: 'ER_LOCK_WAIT_TIMEOUT' })
    await c.rollback()
    await db.execute(
      "INSERT INTO diagnosis_review_revocations(revocation_ref,target_review_internal_id,request_sha256,revoked_by_ref_hash,reason_zh,revoked_at_ms) VALUES('rev-fixture',1,?,?,?,1200)",
      ['b'.repeat(64), 'c'.repeat(64), '结构制品撤销']
    )
    await c.beginTransaction()
    expect(
      await reader.read(
        { transactionContext: true, connection: c },
        'candidate-fixture',
        'review-fixture',
        'fixture-review/v1'
      )
    ).toEqual({ status: 'unavailable' })
    await c.rollback()
  } finally {
    await c.rollback()
    c.release()
  }
}, 10000)
