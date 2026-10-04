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
import { createReadDiagnosisReviewCandidate } from '../../src/diagnosis/application/read-review-candidate.js'
import { createMysqlDiagnosisReviewCandidateRepository } from '../../src/diagnosis/repository/mysql-review-candidate-repository.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
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
/** 待审制品是独立修订，来源/题包依赖为明确替身；不证明 CMS 管理员或园艺内容。 */
const submittedCandidate = { ...validCandidate(), revisionNo: 2 }
const submittedSha = createHash('sha256').update(canonical(submittedCandidate)).digest('hex')
const reviewSchemas = {
  candidate: JSON.parse(
    readFileSync(
      join(root, 'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'),
      'utf8'
    )
  ) as object,
  dependencies: JSON.parse(
    readFileSync(
      join(
        root,
        'docs/backend-v2/contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json'
      ),
      'utf8'
    )
  ) as object
}
const submittedRepository = createMysqlDiagnosisReviewCandidateRepository(reviewSchemas.candidate)
function readSubmitted() {
  return createReadDiagnosisReviewCandidate({
    driver: createMysqlTransactionDriver(source, () => undefined),
    repository: submittedRepository,
    schemas: reviewSchemas,
    dependencyReader: () => ({
      read: async () => ({
        publishedSymptomModes: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
        ],
        verifiedClaimRevisions: [
          { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
        ]
      })
    })
  })
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
  await db.execute(
    'INSERT INTO diagnosis_knowledge_candidates(candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,created_at_ms,submitted_at_ms) VALUES(?,?,?,?,?,?,?,?,?)',
    [
      'candidate-submitted',
      'yellow_leaf',
      2,
      'diagnosis-knowledge-candidate/v1',
      submittedSha,
      JSON.stringify(submittedCandidate),
      'submitted',
      1000,
      1100
    ]
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

test('真实 SQL 待审修订→完整 Schema/摘要/依赖→冻结快照，无审核写入', async () => {
  expect(
    await readSubmitted()({ candidateRef: 'candidate-submitted', contentSha256: submittedSha })
  ).toEqual({
    status: 'review_candidate_ready',
    candidateRef: 'candidate-submitted',
    contentSha256: submittedSha,
    submittedAtMs: 1100,
    candidate: submittedCandidate
  })
  const [reviews] = await db.query('SELECT COUNT(*) AS n FROM diagnosis_review_attestations')
  expect(reviews).toEqual([{ n: 1 }])
  const [rows] = await db.query(
    "SELECT candidate_state,content_sha256 FROM diagnosis_knowledge_candidates WHERE candidate_ref='candidate-submitted'"
  )
  expect(rows).toEqual([{ candidate_state: 'submitted', content_sha256: submittedSha }])
})
test('真实错引用、错摘要及损坏提交时间拒绝；不改为最新修订', async () => {
  const read = readSubmitted()
  expect(await read({ candidateRef: 'missing', contentSha256: submittedSha })).toEqual({
    status: 'unavailable'
  })
  expect(await read({ candidateRef: 'candidate-submitted', contentSha256: sha })).toEqual({
    status: 'unavailable'
  })
  try {
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET submitted_at_ms=NULL WHERE candidate_ref='candidate-submitted'"
    )
    expect(
      await read({ candidateRef: 'candidate-submitted', contentSha256: submittedSha })
    ).toEqual({ status: 'unavailable' })
  } finally {
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET submitted_at_ms=1100 WHERE candidate_ref='candidate-submitted'"
    )
  }
})
test('待审当前共享锁阻止准备期间改状态；事务结束后锁释放', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    expect(
      (
        await submittedRepository.readSubmitted(
          { transactionContext: true, connection: c },
          { candidateRef: 'candidate-submitted', contentSha256: submittedSha }
        )
      ).status
    ).toBe('submitted_candidate')
    await db.query('SET SESSION innodb_lock_wait_timeout=1')
    await expect(
      db.query(
        "UPDATE diagnosis_knowledge_candidates SET candidate_state='rejected' WHERE candidate_ref='candidate-submitted'"
      )
    ).rejects.toMatchObject({ code: 'ER_LOCK_WAIT_TIMEOUT' })
    await c.commit()
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET candidate_state='rejected' WHERE candidate_ref='candidate-submitted'"
    )
    expect(
      await readSubmitted()({ candidateRef: 'candidate-submitted', contentSha256: submittedSha })
    ).toEqual({ status: 'unavailable' })
  } finally {
    await c.rollback()
    c.release()
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET candidate_state='submitted' WHERE candidate_ref='candidate-submitted'"
    )
  }
}, 10000)
test('已有旧事务快照也读取当前状态；已驳回不能被旧快照当待审', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    await c.query(
      "SELECT candidate_state FROM diagnosis_knowledge_candidates WHERE candidate_ref='candidate-submitted'",
      []
    )
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET candidate_state='rejected' WHERE candidate_ref='candidate-submitted'"
    )
    expect(
      await submittedRepository.readSubmitted(
        { transactionContext: true, connection: c },
        { candidateRef: 'candidate-submitted', contentSha256: submittedSha }
      )
    ).toEqual({ status: 'unavailable' })
  } finally {
    await c.rollback()
    c.release()
    await db.query(
      "UPDATE diagnosis_knowledge_candidates SET candidate_state='submitted' WHERE candidate_ref='candidate-submitted'"
    )
  }
})
