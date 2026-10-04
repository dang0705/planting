import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createReadActiveDiagnosisKnowledge } from '../../src/diagnosis/application/read-active-diagnosis-knowledge.js'
import { createMysqlActiveDiagnosisKnowledgeReader } from '../../src/diagnosis/repository/mysql-active-diagnosis-knowledge-reader.js'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { beforeAll, afterAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { createMysqlDiagnosisKnowledgePublicationRepository } from '../../src/diagnosis/repository/mysql-diagnosis-knowledge-publication-repository.js'
import { createPublishDiagnosisKnowledge } from '../../src/diagnosis/application/publish-diagnosis-knowledge.js'
import { createMysqlDiagnosisKnowledgeRollbackRepository } from '../../src/diagnosis/repository/mysql-diagnosis-knowledge-rollback-repository.js'
import { createRollbackDiagnosisKnowledge } from '../../src/diagnosis/application/rollback-diagnosis-knowledge.js'
import { createMysqlDiagnosisReviewRevocationRepository } from '../../src/diagnosis/repository/mysql-diagnosis-review-revocation-repository.js'
import { createRevokeDiagnosisReview } from '../../src/diagnosis/application/revoke-diagnosis-review.js'
/** L3/unit_real_data：实际009/010、mysql2共享事务、发布与运行读取/撤销。CMS/许可及园艺正文为明确结构制品，不证明正式知识/HTTP。 */
const root = findProjectRoot(),
  container = `qhz-active-knowledge-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const schemas = {
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
function dependencyReader() {
  return {
    read: async () => ({
      publishedSymptomModes: [
        { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
      ],
      verifiedClaimRevisions: [
        { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
      ]
    })
  }
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
      await db?.end().catch(() => {})
      await new Promise(r => setTimeout(r, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离回滚库未就绪')
  }
  await db.query('CREATE DATABASE active_knowledge')
  await db.query('USE active_knowledge')
  for (const [file, names] of [
    [
      '009_diagnosis_knowledge.sql',
      [
        'diagnosis_knowledge_candidates',
        'diagnosis_review_attestations',
        'diagnosis_knowledge_releases',
        'active_diagnosis_knowledge_releases',
        'diagnosis_release_activation_audit'
      ]
    ],
    ['010_diagnosis_review_revocations.sql', ['diagnosis_review_revocations']]
  ] as const) {
    const ddl = readFileSync(join(root, 'docs/backend-v2/schema', file), 'utf8')
    for (const name of names) {
      const i = ddl.indexOf('CREATE TABLE `' + name + '`')
      await db.query(ddl.slice(i, ddl.indexOf(';\n', i) + 1))
    }
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'active_knowledge'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
function publish(pool = source) {
  return createPublishDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(pool, () => {}),
    repository: createMysqlDiagnosisKnowledgePublicationRepository(pool, schemas.candidate),
    schemas,
    dependencyReader,
    now: () => 1200
  })
}
function rollback(pool = source) {
  return createRollbackDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(pool, () => {}),
    repository: createMysqlDiagnosisKnowledgeRollbackRepository(pool, schemas.candidate),
    schemas,
    dependencyReader,
    now: () => 2000
  })
}
/** 每个场景独立包范围，三个真实应用发布成为回滚前置，避免手填活动指针。 */
async function seed(n: number) {
  const bundleCode = `rollback-case-${n}`,
    packages = []
  for (let v = 1; v <= 3; v++) {
    const c = { ...validCandidate(), bundleCode, revisionNo: v },
      h = createHash('sha256').update(canonical(c)).digest('hex'),
      candidateRef = `candidate-${n}-${v}`,
      reviewRef = `review-${n}-${v}`,
      releaseRef = `release-${n}-${v}`
    await db.execute(
      'INSERT INTO diagnosis_knowledge_candidates(candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,created_at_ms) VALUES(?,?,?,?,?,?,?,?)',
      [
        candidateRef,
        bundleCode,
        v,
        'diagnosis-knowledge-candidate/v1',
        h,
        JSON.stringify(c),
        'reviewed',
        1000
      ]
    )
    const [ids] = await db.execute(
      'SELECT CAST(id AS CHAR) AS id FROM diagnosis_knowledge_candidates WHERE candidate_ref=?',
      [candidateRef]
    )
    const id = (ids as { id: string }[])[0]!.id
    await db.execute(
      'INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) VALUES(?,?,?,?,?,?,?)',
      [reviewRef, 'a'.repeat(64), id, h, 'approved', 'fixture-review/v1', 1100]
    )
    const command = {
      commandRef: `publish-${n}-${v}`,
      releaseRef,
      bundleCode,
      version: v,
      candidateRef,
      candidateContentSha256: h,
      reviewRef,
      reviewProtocolVersion: 'fixture-review/v1',
      expectedPointerVersion: v - 1,
      operatorRefHash: 'a'.repeat(64),
      reasonZh: '结构制品发布'
    }
    const r = await publish()(command)
    expect(r.status).toBe('published')
    if (r.status !== 'published') {
      throw new Error('前置真实发布失败')
    }
    packages.push({ command, sha: r.packageSha256 })
  }
  const first = packages[0]!,
    command = {
      commandRef: `rollback-${n}`,
      bundleCode,
      targetReleaseRef: first.command.releaseRef,
      targetPackageSha256: first.sha,
      reviewProtocolVersion: 'fixture-review/v1',
      expectedPointerVersion: 3,
      operatorRefHash: 'b'.repeat(64),
      reasonZh: '结构制品回滚'
    }
  return { bundleCode, packages, command }
}
async function state(bundle: string) {
  const [rows] = await db.execute(
    'SELECT p.version,r.release_ref,(SELECT COUNT(*) FROM diagnosis_knowledge_releases x WHERE x.bundle_code=p.bundle_code) AS releases,(SELECT COUNT(*) FROM diagnosis_release_activation_audit a WHERE a.bundle_code=p.bundle_code) AS audits FROM active_diagnosis_knowledge_releases p JOIN diagnosis_knowledge_releases r ON r.id=p.release_internal_id WHERE p.bundle_code=?',
    [bundle]
  )
  return rows
}
/** 只读应用使用短事务，Source替身边界与前置发布一致。 */
function readActive(pool = source) {
  return createReadActiveDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(pool, () => {}),
    repository: createMysqlActiveDiagnosisKnowledgeReader(schemas.candidate),
    schemas,
    dependencyReader
  })
}
test('真实活动包全文、指针与冻结快照对应；缺范围/协议错误拒绝且不写入', async () => {
  const f = await seed(1),
    before = await state(f.bundleCode),
    query = { bundleCode: f.bundleCode, reviewProtocolVersion: 'fixture-review/v1' },
    r = await readActive()(query)
  expect(r.status).toBe('knowledge_ready')
  if (r.status !== 'knowledge_ready') {
    throw new Error('应取得活动知识')
  }
  expect(r.pointerVersion).toBe(3)
  expect(r.release.package.releaseRef).toBe(f.packages[2]!.command.releaseRef)
  expect(r.release.packageSha256).toBe(f.packages[2]!.sha)
  expect(Object.isFrozen(r.release.package.candidate)).toBe(true)
  expect(await readActive()({ ...query, bundleCode: 'missing-bundle' })).toEqual({
    status: 'unavailable'
  })
  expect(await readActive()({ ...query, reviewProtocolVersion: 'wrong/v1' })).toEqual({
    status: 'unavailable'
  })
  expect(await state(f.bundleCode)).toEqual(before)
})
test('活动知识撤回、摘要损坏或原批准实际撤销，不供新诊断使用', async () => {
  const f = await seed(2),
    last = f.packages[2]!,
    query = { bundleCode: f.bundleCode, reviewProtocolVersion: 'fixture-review/v1' },
    before = await state(f.bundleCode)
  await db.execute(
    "UPDATE diagnosis_knowledge_releases SET release_state='withdrawn' WHERE release_ref=?",
    [last.command.releaseRef]
  )
  expect(await readActive()(query)).toEqual({ status: 'unavailable' })
  await db.execute(
    "UPDATE diagnosis_knowledge_releases SET release_state='published',package_sha256=? WHERE release_ref=?",
    ['f'.repeat(64), last.command.releaseRef]
  )
  expect(await readActive()(query)).toEqual({ status: 'unavailable' })
  await db.execute('UPDATE diagnosis_knowledge_releases SET package_sha256=? WHERE release_ref=?', [
    last.sha,
    last.command.releaseRef
  ])
  const revoke = createRevokeDiagnosisReview({
    driver: createMysqlTransactionDriver(source, () => {}),
    repository: createMysqlDiagnosisReviewRevocationRepository(source),
    now: () => 1500
  })
  expect(
    (
      await revoke({
        revocationRef: 'revoke-active',
        reviewRef: last.command.reviewRef,
        contentSha256: last.command.candidateContentSha256,
        reviewProtocolVersion: last.command.reviewProtocolVersion,
        operatorRefHash: 'c'.repeat(64),
        reasonZh: '撤销结构制品',
        reviewEvidenceRef: null
      })
    ).status
  ).toBe('revoked')
  expect(await readActive()(query)).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual(before)
})
test('初次读取后另一事务实际回滚，旧快照不能返回变化前的活动指针', async () => {
  const f = await seed(3)
  const moved = {
    getConnection: async () => {
      const c = await source.getConnection()
      let switched = false
      return {
        ...c,
        query: async (sql: string, params: readonly (string | number | null)[]) => {
          const rows = await c.query(sql, params)
          if (
            !switched &&
            sql.includes('FROM active_diagnosis_knowledge_releases') &&
            !sql.includes('FOR SHARE')
          ) {
            switched = true
            expect((await rollback()(f.command)).status).toBe('rolled_back')
          }
          return rows
        }
      }
    }
  }
  expect(
    await readActive(moved)({
      bundleCode: f.bundleCode,
      reviewProtocolVersion: 'fixture-review/v1'
    })
  ).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual([
    { version: 4, release_ref: 'release-3-1', releases: 3, audits: 4 }
  ])
})
