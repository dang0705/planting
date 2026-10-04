import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
/** L3/unit_real_data：实际009/010、mysql2共享事务、发布与回滚/撤销。CMS/许可及园艺正文为明确结构制品，不证明正式知识/HTTP。 */
const root = findProjectRoot(),
  container = `qhz-rollback-${process.pid}`
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
  await db.query('CREATE DATABASE knowledge_rollback')
  await db.query('USE knowledge_rollback')
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
    database: 'knowledge_rollback'
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
test('真实旧包回滚/重放/异参冲突；后续发布后历史重放不重新切换', async () => {
  const f = await seed(1),
    r = await rollback()(f.command)
  expect(r).toEqual({
    status: 'rolled_back',
    releaseRef: f.command.targetReleaseRef,
    packageSha256: f.command.targetPackageSha256,
    pointerVersion: 4
  })
  expect(await state(f.bundleCode)).toEqual([
    { version: 4, release_ref: 'release-1-1', releases: 3, audits: 4 }
  ])
  expect(await rollback()(f.command)).toEqual(r)
  expect(await rollback()({ ...f.command, reasonZh: '异参' })).toEqual({ status: 'conflict' })
  expect(
    (
      await publish()({
        ...f.packages[2]!.command,
        commandRef: 'publish-after-rollback',
        releaseRef: 'release-after-rollback',
        version: 4,
        expectedPointerVersion: 4
      })
    ).status
  ).toBe('published')
  expect(await rollback()(f.command)).toEqual(r)
  expect(await state(f.bundleCode)).toEqual([
    { version: 5, release_ref: 'release-after-rollback', releases: 4, audits: 5 }
  ])
})
test('同范围/原样摘要/旧版本/预期指针/撤回状态均限制回滚', async () => {
  const f = await seed(2),
    before = await state(f.bundleCode),
    latest = f.packages[2]!
  for (const c of [
    { ...f.command, bundleCode: 'other-bundle' },
    { ...f.command, targetPackageSha256: 'f'.repeat(64) },
    { ...f.command, targetReleaseRef: latest.command.releaseRef, targetPackageSha256: latest.sha }
  ]) {
    expect(await rollback()(c)).toEqual({ status: 'unavailable' })
  }
  expect(await rollback()({ ...f.command, expectedPointerVersion: 2 })).toEqual({
    status: 'conflict'
  })
  await db.execute(
    "UPDATE diagnosis_knowledge_releases SET release_state='withdrawn' WHERE release_ref=?",
    [f.command.targetReleaseRef]
  )
  expect(await rollback()(f.command)).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual(before)
})
test('审核被实际撤销后，旧包不能重新激活', async () => {
  const f = await seed(3),
    first = f.packages[0]!,
    before = await state(f.bundleCode)
  const revoke = createRevokeDiagnosisReview({
    driver: createMysqlTransactionDriver(source, () => {}),
    repository: createMysqlDiagnosisReviewRevocationRepository(source),
    now: () => 1500
  })
  expect(
    (
      await revoke({
        revocationRef: 'revoke-rollback-target',
        reviewRef: first.command.reviewRef,
        contentSha256: first.command.candidateContentSha256,
        reviewProtocolVersion: first.command.reviewProtocolVersion,
        operatorRefHash: 'c'.repeat(64),
        reasonZh: '撤销旧批准',
        reviewEvidenceRef: null
      })
    ).status
  ).toBe('revoked')
  expect(await rollback()(f.command)).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual(before)
})
test('同指针并发回滚只有一方成功，另一方冲突', async () => {
  const f = await seed(4),
    second = f.packages[1]!,
    results = await Promise.all([
      rollback()(f.command),
      rollback()({
        ...f.command,
        commandRef: 'rollback-competing',
        targetReleaseRef: second.command.releaseRef,
        targetPackageSha256: second.sha
      })
    ])
  expect(results.map(x => x.status).sort()).toEqual(['conflict', 'rolled_back'])
  const rows = await state(f.bundleCode)
  expect(rows).toEqual([
    { version: 4, release_ref: expect.stringMatching(/^release-4-[12]$/u), releases: 3, audits: 4 }
  ])
})
test('审计失败回滚指针；提交响应丢失按新连接对账而不重复切换', async () => {
  const f = await seed(5),
    before = await state(f.bundleCode)
  const broken = {
    getConnection: async () => {
      const c = await source.getConnection()
      return {
        ...c,
        execute: async (sql: string, params: readonly (string | number | null)[]) => {
          if (sql.startsWith('INSERT INTO diagnosis_release_activation_audit')) {
            throw new Error('fixture audit failure')
          }
          return c.execute(sql, params)
        }
      }
    }
  }
  await expect(rollback(broken)(f.command)).rejects.toThrow('fixture audit failure')
  expect(await state(f.bundleCode)).toEqual(before)
  const uncertain = {
    getConnection: async () => {
      const c = await source.getConnection()
      return {
        ...c,
        commit: async () => {
          await c.commit()
          throw new Error('fixture lost response')
        }
      }
    }
  }
  const r = await rollback(uncertain)(f.command)
  expect(r.status).toBe('rolled_back')
  expect(await rollback()(f.command)).toEqual(r)
  expect(await state(f.bundleCode)).toEqual([
    { version: 4, release_ref: 'release-5-1', releases: 3, audits: 4 }
  ])
})
test('旧快照中目标仍published，锁后当前读发现撤回并拒绝', async () => {
  const f = await seed(6),
    repository = createMysqlDiagnosisKnowledgeRollbackRepository(source, schemas.candidate),
    before = await state(f.bundleCode)
  const app = createRollbackDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(source, () => {}),
    repository: {
      ...repository,
      readTarget: async (tx, c) => {
        const old = await repository.readTarget(tx, c)
        expect(old.status).toBe('ready')
        await db.execute(
          "UPDATE diagnosis_knowledge_releases SET release_state='withdrawn' WHERE release_ref=?",
          [c.targetReleaseRef]
        )
        return old
      }
    },
    schemas,
    dependencyReader,
    now: () => 2000
  })
  expect(await app(f.command)).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual(before)
})
test('旧快照后行关联被替换，不能借另一条同摘要批准回滚', async () => {
  const f = await seed(7),
    first = f.packages[0]!,
    repository = createMysqlDiagnosisKnowledgeRollbackRepository(source, schemas.candidate),
    before = await state(f.bundleCode)
  const [ids] = await db.execute(
    'SELECT CAST(id AS CHAR) AS id FROM diagnosis_knowledge_candidates WHERE candidate_ref=?',
    [first.command.candidateRef]
  )
  const id = (ids as { id: string }[])[0]!.id
  await db.execute(
    'INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) VALUES(?,?,?,?,?,?,?)',
    [
      'alternate-review',
      'd'.repeat(64),
      id,
      first.command.candidateContentSha256,
      'approved',
      'fixture-review/v1',
      1100
    ]
  )
  const app = createRollbackDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(source, () => {}),
    repository: {
      ...repository,
      readTarget: async (tx, c) => {
        const old = await repository.readTarget(tx, c)
        expect(old.status).toBe('ready')
        await db.execute(
          'UPDATE diagnosis_knowledge_releases SET review_attestation_internal_id=(SELECT id FROM diagnosis_review_attestations WHERE review_ref=?) WHERE release_ref=?',
          ['alternate-review', c.targetReleaseRef]
        )
        return old
      }
    },
    schemas,
    dependencyReader,
    now: () => 2000
  })
  expect(await app(f.command)).toEqual({ status: 'unavailable' })
  expect(await state(f.bundleCode)).toEqual(before)
})
