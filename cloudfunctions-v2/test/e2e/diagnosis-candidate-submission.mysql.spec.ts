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
import { createMysqlDiagnosisCandidateSubmissionRepository } from '../../src/diagnosis/repository/mysql-candidate-submission-repository.js'
import { createSubmitDiagnosisCandidate } from '../../src/diagnosis/application/submit-candidate.js'
import { createReadDiagnosisReviewCandidate } from '../../src/diagnosis/application/read-review-candidate.js'
import { createMysqlDiagnosisReviewCandidateRepository } from '../../src/diagnosis/repository/mysql-review-candidate-repository.js'
/** L3/unit_real_data：009真实候选表→mysql2→事务→提交/读回/对账。
 * 候选为已冻结 Schema 结构制品，来源/题包为明确替身；不证明 CMS 身份、正式内容、云端或 HTTP。
 */
const root = findProjectRoot(),
  container = `qhz-candidate-submit-${process.pid}`
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
const verified = {
  publishedSymptomModes: [
    { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
  ],
  verifiedClaimRevisions: [
    { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
  ]
}
function makeSubmit(
  options: {
    wrap?: (c: Mysql2QueryConnection) => Mysql2QueryConnection
    invalidDependencies?: boolean
    at?: number
  } = {}
) {
  const pool = {
    getConnection: async () => {
      const c = await source.getConnection()
      return options.wrap ? options.wrap(c) : c
    }
  }
  return createSubmitDiagnosisCandidate({
    driver: createMysqlTransactionDriver(pool, () => undefined),
    repository: createMysqlDiagnosisCandidateSubmissionRepository(source),
    schemas,
    dependencyReader: () => ({
      read: async () =>
        options.invalidDependencies ? { ...verified, verifiedClaimRevisions: [] } : verified
    }),
    now: () => options.at ?? 1100
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
    throw new Error('隔离候选提交库未就绪')
  }
  await db.query('CREATE DATABASE candidate_submission')
  await db.query('USE candidate_submission')
  const ddl = readFileSync(
      join(root, 'docs/backend-v2/schema/009_diagnosis_knowledge.sql'),
      'utf8'
    ),
    start = ddl.indexOf('CREATE TABLE `diagnosis_knowledge_candidates`')
  await db.query(ddl.slice(start, ddl.indexOf(';\n', start) + 1))
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'candidate_submission'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
test('完整新候选真实保存→精确待审读回，不产生审核或发布', async () => {
  const candidate = validCandidate(),
    result = await makeSubmit()({ candidateRef: 'first', candidate })
  expect(result.status).toBe('submitted')
  if (result.status !== 'submitted') {
    throw new Error('应读回提交收据')
  }
  const read = createReadDiagnosisReviewCandidate({
    driver: createMysqlTransactionDriver(source, () => undefined),
    repository: createMysqlDiagnosisReviewCandidateRepository(schemas.candidate),
    schemas,
    dependencyReader: () => ({ read: async () => verified })
  })
  expect(await read({ candidateRef: 'first', contentSha256: result.contentSha256 })).toEqual({
    status: 'review_candidate_ready',
    candidateRef: 'first',
    contentSha256: result.contentSha256,
    submittedAtMs: 1100,
    candidate
  })
  const [rows] = await db.query(
    "SELECT candidate_state,created_at_ms,submitted_at_ms FROM diagnosis_knowledge_candidates WHERE candidate_ref='first'"
  )
  expect(rows).toEqual([
    { candidate_state: 'submitted', created_at_ms: 1100, submitted_at_ms: 1100 }
  ])
})
test('驳回后的同正文重放只返原收据，不重新待审或再次核准来源', async () => {
  const input = { candidateRef: 'first', candidate: validCandidate() },
    first = await makeSubmit()(input)
  await db.query(
    "UPDATE diagnosis_knowledge_candidates SET candidate_state='rejected' WHERE candidate_ref='first'"
  )
  expect(await makeSubmit({ invalidDependencies: true, at: 2200 })(input)).toEqual(first)
  const [rows] = await db.query(
    "SELECT candidate_state,submitted_at_ms FROM diagnosis_knowledge_candidates WHERE candidate_ref='first'"
  )
  expect(rows).toEqual([{ candidate_state: 'rejected', submitted_at_ms: 1100 }])
})
test('同引用不同正文、另一引用占用同包修订均冲突，原正文不覆盖', async () => {
  const changed = { ...validCandidate(), revisionNo: 2 }
  expect(await makeSubmit()({ candidateRef: 'first', candidate: changed })).toEqual({
    status: 'conflict'
  })
  expect(await makeSubmit()({ candidateRef: 'other-first', candidate: validCandidate() })).toEqual({
    status: 'conflict'
  })
  const [rows] = await db.query(
    'SELECT candidate_ref,revision_no FROM diagnosis_knowledge_candidates'
  )
  expect(rows).toEqual([{ candidate_ref: 'first', revision_no: 1 }])
})
test('缺来源精确修订时不保存新候选', async () => {
  expect(
    await makeSubmit({ invalidDependencies: true })({
      candidateRef: 'no-source',
      candidate: { ...validCandidate(), revisionNo: 2 }
    })
  ).toEqual({ status: 'unavailable' })
  const [rows] = await db.query(
    "SELECT COUNT(*) AS n FROM diagnosis_knowledge_candidates WHERE candidate_ref='no-source'"
  )
  expect(rows).toEqual([{ n: 0 }])
})
test('INSERT 已执行但业务失败时整行回滚，可明确重新提交', async () => {
  const input = { candidateRef: 'rollback', candidate: { ...validCandidate(), revisionNo: 2 } }
  const submit = makeSubmit({
    wrap: c => ({
      ...c,
      execute: async (sql, args) => {
        const r = await c.execute(sql, args)
        if (sql.startsWith('INSERT INTO diagnosis_knowledge_candidates')) {
          throw new Error('保存后失败制品')
        }
        return r
      }
    })
  })
  await expect(submit(input)).rejects.toThrow('保存后失败制品')
  const [rows] = await db.query(
    "SELECT COUNT(*) AS n FROM diagnosis_knowledge_candidates WHERE candidate_ref='rollback'"
  )
  expect(rows).toEqual([{ n: 0 }])
  expect((await makeSubmit()(input)).status).toBe('submitted')
})
test('真实 COMMIT 后响应丢失，新连接读回同一收据且仅 INSERT 一次', async () => {
  let writes = 0
  const input = {
    candidateRef: 'unknown-commit',
    candidate: { ...validCandidate(), revisionNo: 3 }
  }
  const submit = makeSubmit({
    wrap: c => ({
      ...c,
      execute: async (sql, args) => {
        if (sql.startsWith('INSERT')) {
          writes++
        }
        return c.execute(sql, args)
      },
      commit: async () => {
        await c.commit()
        throw new Error('提交响应丢失制品')
      }
    })
  })
  const result = await submit(input)
  expect(result).toMatchObject({
    status: 'submitted',
    candidateRef: 'unknown-commit',
    submittedAtMs: 1100
  })
  expect(writes).toBe(1)
  expect(await makeSubmit({ at: 2200 })(input)).toEqual(result)
})
test('并发同引用只保存一行；失败分支不盲重写，随后重放稳定', async () => {
  const input = { candidateRef: 'concurrent', candidate: { ...validCandidate(), revisionNo: 4 } }
  const submit = makeSubmit(),
    results = await Promise.all([submit(input), submit(input)])
  expect(results.some(r => r.status === 'submitted')).toBe(true)
  expect(results.every(r => r.status === 'submitted' || r.status === 'conflict')).toBe(true)
  const [rows] = await db.query(
    "SELECT COUNT(*) AS n FROM diagnosis_knowledge_candidates WHERE candidate_ref='concurrent'"
  )
  expect(rows).toEqual([{ n: 1 }])
  const stable = await submit(input)
  for (const r of results) {
    if (r.status === 'submitted') {
      expect(stable).toEqual(r)
    }
  }
})
