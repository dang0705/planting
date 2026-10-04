import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import {
  createMysql2ConnectionSource,
  type Mysql2QueryConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { createSubmitDiagnosisCandidate } from '../../src/diagnosis/application/submit-candidate.js'
import { createMysqlDiagnosisCandidateSubmissionRepository } from '../../src/diagnosis/repository/mysql-candidate-submission-repository.js'
import { createRecordDiagnosisReview } from '../../src/diagnosis/application/record-review.js'
import { createMysqlDiagnosisReviewRecordRepository } from '../../src/diagnosis/repository/mysql-review-record-repository.js'
import { createPublishDiagnosisKnowledge } from '../../src/diagnosis/application/publish-diagnosis-knowledge.js'
import { createMysqlDiagnosisKnowledgePublicationRepository } from '../../src/diagnosis/repository/mysql-diagnosis-knowledge-publication-repository.js'
/** L3/unit_real_data：实际009/010、mysql2及提交→人工记录→不可变发布事务。
 * 园艺内容、管理员摘要、协议和来源Reader均为明确制品；不证明正式CMS、内容审核、云端或HTTP。
 */
const root = findProjectRoot(),
  container = `qhz-review-record-${process.pid}`
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
const dependencyReader = () => ({
  read: async () => ({
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
    ]
  })
})
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr)
  }
  return r.stdout.trim()
}
function record(wrap?: (c: Mysql2QueryConnection) => Mysql2QueryConnection) {
  return createRecordDiagnosisReview({
    driver: createMysqlTransactionDriver(
      {
        getConnection: async () => {
          const c = await source.getConnection()
          return wrap ? wrap(c) : c
        }
      },
      () => undefined
    ),
    repository: createMysqlDiagnosisReviewRecordRepository(source, schemas.candidate),
    schemas,
    dependencyReader,
    now: () => 1200
  })
}
async function submitted(ref: string, revisionNo: number) {
  const submit = createSubmitDiagnosisCandidate({
    driver: createMysqlTransactionDriver(source, () => undefined),
    repository: createMysqlDiagnosisCandidateSubmissionRepository(source),
    schemas,
    dependencyReader,
    now: () => 1100
  })
  const result = await submit({ candidateRef: ref, candidate: { ...validCandidate(), revisionNo } })
  if (result.status !== 'submitted') {
    throw new Error('候选提交应成功')
  }
  return {
    reviewRef: `review-${ref}`,
    candidateRef: ref,
    contentSha256: result.contentSha256,
    decision: 'approved' as const,
    reviewerRefHash: 'a'.repeat(64),
    reviewProtocolVersion: 'fixture-review/v1'
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
      await db?.end().catch(() => undefined)
      await new Promise(r => setTimeout(r, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离人工审核库未就绪')
  }
  await db.query('CREATE DATABASE review_record')
  await db.query('USE review_record')
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
      const start = ddl.indexOf('CREATE TABLE `' + name + '`')
      await db.query(ddl.slice(start, ddl.indexOf(';\n', start) + 1))
    }
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'review_record'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
test('真实候选提交→记录审核→原样不可变发布；审核本身不产生发布包', async () => {
  const command = await submitted('first', 1),
    result = await record()(command)
  expect(result).toEqual({
    status: 'recorded',
    reviewRef: command.reviewRef,
    decision: 'approved',
    decidedAtMs: 1200
  })
  const [before] = await db.query('SELECT COUNT(*) AS n FROM diagnosis_knowledge_releases')
  expect(before).toEqual([{ n: 0 }])
  const publish = createPublishDiagnosisKnowledge({
    driver: createMysqlTransactionDriver(source, () => undefined),
    repository: createMysqlDiagnosisKnowledgePublicationRepository(source, schemas.candidate),
    schemas,
    dependencyReader,
    now: () => 1300
  })
  const release = await publish({
    commandRef: 'publish-first',
    releaseRef: 'release-first',
    bundleCode: 'yellow_leaf',
    version: 1,
    candidateRef: command.candidateRef,
    candidateContentSha256: command.contentSha256,
    reviewRef: command.reviewRef,
    reviewProtocolVersion: command.reviewProtocolVersion,
    expectedPointerVersion: 0,
    operatorRefHash: 'b'.repeat(64),
    reasonZh: '明确结构制品的内部发布核验'
  })
  expect(release).toMatchObject({
    status: 'published',
    releaseRef: 'release-first',
    pointerVersion: 1
  })
  const [rows] = await db.query(
    "SELECT k.candidate_state,a.decision FROM diagnosis_knowledge_candidates k JOIN diagnosis_review_attestations a ON a.candidate_internal_id=k.id WHERE k.candidate_ref='first'"
  )
  expect(rows).toEqual([{ candidate_state: 'reviewed', decision: 'approved' }])
})
test('同审核引用异主体/异决定冲突；同参重放保留原时间', async () => {
  const command = await submitted('replay', 2),
    first = await record()(command)
  expect(await record()(command)).toEqual(first)
  expect(await record()({ ...command, reviewerRefHash: 'c'.repeat(64) })).toEqual({
    status: 'conflict'
  })
  expect(await record()({ ...command, decision: 'rejected' })).toEqual({ status: 'conflict' })
})
test('驳回只记录原决定，另一个审核引用不能批准已驳回候选', async () => {
  const command = { ...(await submitted('reject', 3)), decision: 'rejected' }
  expect(await record()(command)).toEqual({
    status: 'recorded',
    reviewRef: command.reviewRef,
    decision: 'rejected',
    decidedAtMs: 1200
  })
  expect(await record()({ ...command, reviewRef: 'second-reject', decision: 'approved' })).toEqual({
    status: 'unavailable'
  })
  const [rows] = await db.query(
    "SELECT candidate_state FROM diagnosis_knowledge_candidates WHERE candidate_ref='reject'"
  )
  expect(rows).toEqual([{ candidate_state: 'rejected' }])
})
test('审核INSERT后状态更新失败，凭据及候选状态一起回滚', async () => {
  const command = await submitted('rollback', 4)
  const write = record(c => ({
    ...c,
    execute: async (sql, args) => {
      if (sql.startsWith('UPDATE diagnosis_knowledge_candidates')) {
        throw new Error('状态更新失败制品')
      }
      return c.execute(sql, args)
    }
  }))
  await expect(write(command)).rejects.toThrow('状态更新失败制品')
  const [reviews] = await db.query(
    'SELECT COUNT(*) AS n FROM diagnosis_review_attestations WHERE review_ref=?',
    [command.reviewRef]
  )
  expect(reviews).toEqual([{ n: 0 }])
  const [rows] = await db.query(
    "SELECT candidate_state FROM diagnosis_knowledge_candidates WHERE candidate_ref='rollback'"
  )
  expect(rows).toEqual([{ candidate_state: 'submitted' }])
  expect((await record()(command)).status).toBe('recorded')
})
test('真实COMMIT后响应丢失只读读回，一次审核写入及稳定决定', async () => {
  const command = await submitted('unknown', 5)
  let writes = 0
  const write = record(c => ({
    ...c,
    execute: async (sql, args) => {
      if (sql.startsWith('INSERT INTO diagnosis_review_attestations')) {
        writes++
      }
      return c.execute(sql, args)
    },
    commit: async () => {
      await c.commit()
      throw new Error('审核提交响应丢失制品')
    }
  }))
  const result = await write(command)
  expect(result).toEqual({
    status: 'recorded',
    reviewRef: command.reviewRef,
    decision: 'approved',
    decidedAtMs: 1200
  })
  expect(writes).toBe(1)
  expect(await record()(command)).toEqual(result)
})
test('同候选并发相反决定只能记录一个，候选状态与胜出决定一致', async () => {
  const command = await submitted('concurrent', 6),
    write = record()
  const results = await Promise.all([
    write(command),
    write({ ...command, reviewRef: 'competing-review', decision: 'rejected' })
  ])
  expect(results.filter(r => r.status === 'recorded')).toHaveLength(1)
  const [rows] = await db.query(
    "SELECT k.candidate_state,a.decision FROM diagnosis_knowledge_candidates k JOIN diagnosis_review_attestations a ON a.candidate_internal_id=k.id WHERE k.candidate_ref='concurrent'"
  )
  const winner = results.find(r => r.status === 'recorded')
  if (winner?.status !== 'recorded') {
    throw new Error('应有一个原子决定')
  }
  expect(rows).toEqual([
    {
      candidate_state: winner.decision === 'approved' ? 'reviewed' : 'rejected',
      decision: winner.decision
    }
  ])
})
