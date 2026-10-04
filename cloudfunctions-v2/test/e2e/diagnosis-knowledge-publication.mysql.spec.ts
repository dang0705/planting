import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlDiagnosisKnowledgePublicationRepository } from '../../src/diagnosis/repository/mysql-diagnosis-knowledge-publication-repository.js'
import { createRevokeDiagnosisReview } from '../../src/diagnosis/application/revoke-diagnosis-review.js'
import { createMysqlDiagnosisReviewRevocationRepository } from '../../src/diagnosis/repository/mysql-diagnosis-review-revocation-repository.js'
import { createPublishDiagnosisKnowledge } from '../../src/diagnosis/application/publish-diagnosis-knowledge.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
/** L3/unit_real_data：实际009发布/指针/审计及010撤销、真实mysql2与事务。来源/题包依赖、CMS身份及园艺正文仍为结构制品；不证明正式知识或HTTP。 */
const root = findProjectRoot(),
  container = `qhz-knowledge-publish-${process.pid}`
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
  await db.query('CREATE DATABASE knowledge_publish')
  await db.query('USE knowledge_publish')
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
  for (let i = 2; i <= 3; i++) {
    const v = { ...candidate, revisionNo: i },
      h = createHash('sha256').update(canonical(v)).digest('hex')
    await db.execute(
      'INSERT INTO diagnosis_knowledge_candidates(candidate_ref,bundle_code,revision_no,schema_version,content_sha256,candidate_json,candidate_state,created_at_ms) VALUES(?,?,?,?,?,?,?,?)',
      [
        `candidate-${i}`,
        'yellow_leaf',
        i,
        'diagnosis-knowledge-candidate/v1',
        h,
        JSON.stringify(v),
        'reviewed',
        1000
      ]
    )
    await db.execute(
      'INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) VALUES(?,?,?,?,?,?,?)',
      [`review-${i}`, 'a'.repeat(64), i, h, 'approved', 'fixture-review/v1', 1100]
    )
  }

  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'knowledge_publish'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
/** 同一结构制品的精确命令；时间由应用端口提供，不作为重放参数。 */
function command(i = 1, version = i, expectedPointerVersion = i - 1) {
  const value = i === 1 ? candidate : { ...candidate, revisionNo: i },
    h = createHash('sha256').update(canonical(value)).digest('hex')
  return {
    commandRef: `publish-${version}-${i}`,
    releaseRef: `release-${version}-${i}`,
    bundleCode: 'yellow_leaf',
    version,
    candidateRef: i === 1 ? 'candidate-fixture' : `candidate-${i}`,
    candidateContentSha256: h,
    reviewRef: i === 1 ? 'review-fixture' : `review-${i}`,
    reviewProtocolVersion: 'fixture-review/v1',
    expectedPointerVersion,
    operatorRefHash: 'a'.repeat(64),
    reasonZh: '结构制品发布验证'
  }
}
/** CMS和来源边界明确替换，事务、Repository、表约束和读回保持真实。 */
function app(pool = source) {
  return createPublishDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(pool, () => {}),
    repository: createMysqlDiagnosisKnowledgePublicationRepository(source, schemas.candidate),
    schemas,
    dependencyReader: () => ({
      read: async () => ({
        publishedSymptomModes: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
        ],
        verifiedClaimRevisions: [
          { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
        ]
      })
    }),
    now: () => 1200
  })
}
/** 只读实际三类发布记录数量和当前指针，用于证明回滚未留下部分写入。 */
async function counts() {
  const [rows] = await db.query(
    'SELECT (SELECT COUNT(*) FROM diagnosis_knowledge_releases) AS releases,(SELECT COUNT(*) FROM diagnosis_release_activation_audit) AS audits,(SELECT version FROM active_diagnosis_knowledge_releases LIMIT 1) AS pointer'
  )
  return rows
}
test('完整发布→指针→审计→真实收据；重放不新增记录', async () => {
  const run = app(),
    first = await run(command())
  expect(first.status).toBe('published')
  expect(await run(command())).toEqual(first)
  expect(await counts()).toEqual([{ releases: 1, audits: 1, pointer: 1 }])
})
test('同命令异参冲突，审核和发布记录保持原样', async () => {
  expect(await app()({ ...command(), reasonZh: '异参结构制品' })).toEqual({ status: 'conflict' })
  expect(await counts()).toEqual([{ releases: 1, audits: 1, pointer: 1 }])
})
test('并发争用同一旧指针只能一个成功，不留半个发布', async () => {
  const results = await Promise.all([app()(command(2, 2, 1)), app()(command(3, 3, 1))])
  expect(results.map(r => r.status).sort()).toEqual(['conflict', 'published'])
  expect(await counts()).toEqual([{ releases: 2, audits: 2, pointer: 2 }])
})
test('审计插入故障回滚发布与指针，旧指针和记录数量不变', async () => {
  const broken = {
    getConnection: async () => {
      const c = await source.getConnection()
      return {
        ...c,
        execute: async (sql: string, params: readonly (string | number | null)[]) => {
          if (sql.includes('INSERT INTO diagnosis_release_activation_audit')) {
            throw new Error('fixture audit failure')
          }
          return c.execute(sql, params)
        }
      }
    }
  }
  await expect(app(broken)(command(2, 4, 2))).rejects.toThrow('fixture audit failure')
  expect(await counts()).toEqual([{ releases: 2, audits: 2, pointer: 2 }])
})
test('真实提交后响应丢失，用新连接收据对账，不重复发布', async () => {
  const uncertain = {
    getConnection: async () => {
      const c = await source.getConnection()
      return {
        ...c,
        commit: async () => {
          await c.commit()
          throw new Error('fixture lost commit response')
        }
      }
    }
  }
  const r = await app(uncertain)(command(2, 4, 2))
  expect(r.status).toBe('published')
  expect(await app()(command(2, 4, 2))).toEqual(r)
  expect(await counts()).toEqual([{ releases: 3, audits: 3, pointer: 3 }])
})
test('撤销后的新命令不可发布；旧命令只读历史收据不重新激活', async () => {
  await db.execute(
    "INSERT INTO diagnosis_review_revocations(revocation_ref,target_review_internal_id,request_sha256,revoked_by_ref_hash,reason_zh,revoked_at_ms) VALUES('rev-fixture',2,?,?,?,1300)",
    ['b'.repeat(64), 'c'.repeat(64), '结构制品撤销']
  )
  expect(await app()(command(2, 5, 3))).toEqual({ status: 'unavailable' })
  expect((await app()(command(2, 4, 2))).status).toBe('published')
  expect(await counts()).toEqual([{ releases: 3, audits: 3, pointer: 3 }])
})
test('事务已建立旧快照时，之后提交的撤销仍须由当前读拒绝', async () => {
  const c = await source.getConnection()
  await c.beginTransaction()
  try {
    await c.query('SELECT COUNT(*) FROM diagnosis_review_revocations', [])
    await db.execute(
      "INSERT INTO diagnosis_review_revocations(revocation_ref,target_review_internal_id,request_sha256,revoked_by_ref_hash,reason_zh,revoked_at_ms) VALUES('rev-after-snapshot',3,?,?,?,1400)",
      ['d'.repeat(64), 'e'.repeat(64), '旧快照之后的结构制品撤销']
    )
    const repository = createMysqlDiagnosisKnowledgePublicationRepository(source, schemas.candidate)
    expect(
      await repository.readReviewed({ transactionContext: true, connection: c }, command(3, 6, 3))
    ).toEqual({ status: 'unavailable' })
    await c.rollback()
  } finally {
    await c.rollback()
    c.release()
  }
})

/** Expected来自独立撤销合同/010：与发布共享真实审核锁，CMS管理员仍为明确替身。 */
async function revocationCommand(n: number) {
  const reviewRef = `review-revoke-${n}`
  await db.execute(
    'INSERT INTO diagnosis_review_attestations(review_ref,reviewer_ref_hash,candidate_internal_id,content_sha256,decision,protocol_version,decided_at_ms) VALUES(?,?,?,?,?,?,?)',
    [reviewRef, 'a'.repeat(64), 1, sha, 'approved', 'fixture-review/v1', 1100]
  )
  return {
    revocationRef: `revocation-${n}`,
    reviewRef,
    contentSha256: sha,
    reviewProtocolVersion: 'fixture-review/v1',
    operatorRefHash: 'c'.repeat(64),
    reasonZh: '独立撤销结构制品',
    reviewEvidenceRef: 'evidence-fixture'
  }
}
function revokeApp(pool = source) {
  return createRevokeDiagnosisReview({
    driver: createMysqlTransactionDriver(pool, () => {}),
    repository: createMysqlDiagnosisReviewRevocationRepository(pool),
    now: () => 1500
  })
}
test('撤销真实读回/原样重放与异参冲突；原批准和活动指针保持', async () => {
  const cmd = await revocationCommand(10),
    before = await counts(),
    r = await revokeApp()(cmd)
  expect(r).toEqual({ status: 'revoked', revocationRef: cmd.revocationRef, revokedAtMs: 1500 })
  expect(await revokeApp()(cmd)).toEqual(r)
  expect(await revokeApp()({ ...cmd, reasonZh: '异参' })).toEqual({ status: 'conflict' })
  expect(await revokeApp()({ ...cmd, revocationRef: 'different-ref' })).toEqual({
    status: 'conflict'
  })
  expect(await counts()).toEqual(before)
  const [rows] = await db.execute(
    'SELECT decision FROM diagnosis_review_attestations WHERE review_ref=?',
    [cmd.reviewRef]
  )
  expect(rows).toEqual([{ decision: 'approved' }])
  expect(await app()({ ...command(1, 50, 3), reviewRef: cmd.reviewRef })).toEqual({
    status: 'unavailable'
  })
})
test('精确摘要/协议错误、未知和驳回目标不产生撤销事实', async () => {
  const cmd = await revocationCommand(11)
  for (const input of [
    { ...cmd, contentSha256: 'f'.repeat(64) },
    { ...cmd, reviewProtocolVersion: 'wrong/v1' },
    { ...cmd, reviewRef: 'absent-review' }
  ]) {
    expect(await revokeApp()(input)).toEqual({ status: 'unavailable' })
  }
  await db.execute(
    "UPDATE diagnosis_review_attestations SET decision='rejected' WHERE review_ref=?",
    [cmd.reviewRef]
  )
  expect(await revokeApp()(cmd)).toEqual({ status: 'unavailable' })
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS n FROM diagnosis_review_revocations WHERE revocation_ref=?',
    [cmd.revocationRef]
  )
  expect(rows).toEqual([{ n: 0 }])
})
test('同批准并发撤销只有一条事实，第二命令冲突', async () => {
  const cmd = await revocationCommand(12),
    results = await Promise.all([
      revokeApp()(cmd),
      revokeApp()({ ...cmd, revocationRef: 'competing-revocation' })
    ])
  expect(results.map(x => x.status).sort()).toEqual(['conflict', 'revoked'])
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS n FROM diagnosis_review_revocations v JOIN diagnosis_review_attestations a ON a.id=v.target_review_internal_id WHERE a.review_ref=?',
    [cmd.reviewRef]
  )
  expect(rows).toEqual([{ n: 1 }])
})
test('追加后收据故障回滚，提交响应丢失仅用新连接对账', async () => {
  const cmd = await revocationCommand(13)
  const broken = {
    getConnection: async () => {
      const c = await source.getConnection()
      let reads = 0
      return {
        ...c,
        query: async (sql: string, params: readonly (string | number | null)[]) => {
          if (sql.startsWith('SELECT v._openid') && ++reads === 2) {
            throw new Error('fixture receipt failure')
          }
          return c.query(sql, params)
        }
      }
    }
  }
  await expect(revokeApp(broken)(cmd)).rejects.toThrow('fixture receipt failure')
  const [rows] = await db.execute(
    'SELECT COUNT(*) AS n FROM diagnosis_review_revocations WHERE revocation_ref=?',
    [cmd.revocationRef]
  )
  expect(rows).toEqual([{ n: 0 }])
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
  expect(await revokeApp(uncertain)(cmd)).toEqual({
    status: 'revoked',
    revocationRef: cmd.revocationRef,
    revokedAtMs: 1500
  })
  expect(await revokeApp()(cmd)).toEqual({
    status: 'revoked',
    revocationRef: cmd.revocationRef,
    revokedAtMs: 1500
  })
})
test('先建立旧快照、同命令另一事务先提交，锁后重放必须读当前收据', async () => {
  const cmd = await revocationCommand(14),
    repository = createMysqlDiagnosisReviewRevocationRepository(source)
  const outer = createRevokeDiagnosisReview({
    driver: createMysqlTransactionDriver(source, () => {}),
    repository: {
      ...repository,
      readReceipt: async (tx, locked) => {
        const old = await repository.readReceipt(tx, locked)
        expect(old.status).toBe('not_found')
        expect((await revokeApp()(cmd)).status).toBe('revoked')
        return old
      }
    },
    now: () => 1600
  })
  expect(await outer(cmd)).toEqual({
    status: 'revoked',
    revocationRef: cmd.revocationRef,
    revokedAtMs: 1500
  })
})
