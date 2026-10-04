import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createReadDiagnosisReviewCandidate } from '../../src/diagnosis/application/read-review-candidate.js'
import { createMysqlDiagnosisReviewCandidateRepository } from '../../src/diagnosis/repository/mysql-review-candidate-repository.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
/** L3/unit_fake：Expected 来自统一计划、009 表约束与待审只读合同。
 * 实际执行事务驱动、Repository、AJV、完整摘要及引用准入；只替换连接和来源/题包读边界。
 * 正文是已冻结 Schema 的结构制品，不证明真实管理员、CMS、园艺语义或 HTTP。
 */
const root = findProjectRoot()
const schemas = {
  candidate: JSON.parse(
    readFileSync(
      resolve(
        root,
        'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
      ),
      'utf8'
    )
  ) as object,
  dependencies: JSON.parse(
    readFileSync(
      resolve(
        root,
        'docs/backend-v2/contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json'
      ),
      'utf8'
    )
  ) as object
}
/** 独立 Expected 的 JSON 键排序；不调用被测摘要实现。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
function fixture() {
  const candidate = validCandidate(),
    sha = createHash('sha256').update(canonical(candidate)).digest('hex')
  const row = {
    candidate_ref: 'candidate-fixture',
    bundle_code: 'yellow_leaf',
    revision_no: 1,
    schema_version: 'diagnosis-knowledge-candidate/v1',
    content_sha256: sha,
    candidate_json: JSON.stringify(candidate),
    candidate_state: 'submitted',
    created_at_ms: '1000',
    submitted_at_ms: '1100',
    _openid: ''
  }
  const query = vi.fn<Mysql2QueryConnection['query']>().mockResolvedValue([row])
  const connection: Mysql2QueryConnection = {
    query,
    execute: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn()
  }
  const verified = {
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
    ]
  }
  const dependencies = vi.fn(async () => verified)
  const driver = createMysqlTransactionDriver({ getConnection: async () => connection }, vi.fn())
  const read = createReadDiagnosisReviewCandidate({
    driver,
    repository: createMysqlDiagnosisReviewCandidateRepository(schemas.candidate),
    schemas,
    dependencyReader: () => ({ read: dependencies })
  })
  return { candidate, sha, row, query, connection, verified, dependencies, read }
}
test('精确引用和摘要读取原样待审候选，复核依赖但不批准或写入', async () => {
  const f = fixture(),
    result = await f.read({ candidateRef: 'candidate-fixture', contentSha256: f.sha })
  expect(result).toEqual({
    status: 'review_candidate_ready',
    candidateRef: 'candidate-fixture',
    contentSha256: f.sha,
    submittedAtMs: 1100,
    candidate: f.candidate
  })
  if (result.status !== 'review_candidate_ready') {
    throw new Error('待审候选应就绪')
  }
  expect(Object.isFrozen(result)).toBe(true)
  expect(Object.isFrozen(result.candidate.outcomes)).toBe(true)
  expect(f.dependencies).toHaveBeenCalledWith({
    symptomModeRefs: f.candidate.symptomModeRefs,
    claimRevisions: [{ sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }]
  })
  expect(f.query.mock.calls[0]?.[1]).toEqual(['candidate-fixture'])
  expect(f.connection.execute).not.toHaveBeenCalled()
  expect(f.connection.commit).toHaveBeenCalledOnce()
})
test.each(['draft', 'rejected', 'reviewed', 'missing', 'wrong_hash'])(
  '不可待审 %s 不读取依赖',
  async mode => {
    const f = fixture()
    if (mode === 'missing') {
      f.query.mockResolvedValue([])
    } else if (mode !== 'wrong_hash') {
      f.row.candidate_state = mode
    }
    expect(
      await f.read({
        candidateRef: 'candidate-fixture',
        contentSha256: mode === 'wrong_hash' ? 'b'.repeat(64) : f.sha
      })
    ).toEqual({ status: 'unavailable' })
    expect(f.dependencies).not.toHaveBeenCalled()
  }
)
test.each(['body', 'metadata', 'openid', 'time', 'missing_time', 'duplicate', 'extra_field'])(
  '损坏记录 %s 不得到可审核正文',
  async mode => {
    const f = fixture()
    if (mode === 'body') {
      f.row.candidate_json = JSON.stringify({ ...f.candidate, outcomes: [] })
    }
    if (mode === 'metadata') {
      f.row.revision_no = 2
    }
    if (mode === 'openid') {
      f.row._openid = 'forbidden'
    }
    if (mode === 'time') {
      f.row.submitted_at_ms = '999'
    }
    if (mode === 'missing_time') {
      f.row.submitted_at_ms = null as never
    }
    if (mode === 'duplicate') {
      f.query.mockResolvedValue([f.row, f.row])
    }
    if (mode === 'extra_field') {
      f.row.candidate_json = JSON.stringify({ ...f.candidate, unreviewed: true })
      f.row.content_sha256 = createHash('sha256')
        .update(canonical(JSON.parse(f.row.candidate_json)))
        .digest('hex')
    }
    expect(
      await f.read({ candidateRef: 'candidate-fixture', contentSha256: f.row.content_sha256 })
    ).toEqual({ status: 'unavailable' })
    expect(f.dependencies).not.toHaveBeenCalled()
  }
)
test.each(['question', 'claim'])('失效的%s精确依赖不得通过审核准备', async mode => {
  const f = fixture()
  f.dependencies.mockResolvedValue({
    publishedSymptomModes: mode === 'question' ? [] : f.verified.publishedSymptomModes,
    verifiedClaimRevisions: mode === 'claim' ? [] : f.verified.verifiedClaimRevisions
  })
  expect(await f.read({ candidateRef: 'candidate-fixture', contentSha256: f.sha })).toEqual({
    status: 'unavailable'
  })
})
test('等待连接期间锁定查询；调用方改引用不能换成另一候选', async () => {
  const f = fixture(),
    input = { candidateRef: 'candidate-fixture', contentSha256: f.sha }
  const pending = f.read(input)
  input.candidateRef = 'other'
  input.contentSha256 = 'b'.repeat(64)
  expect((await pending).status).toBe('review_candidate_ready')
  expect(f.query.mock.calls[0]?.[1]).toEqual(['candidate-fixture'])
})
test.each([
  null,
  {},
  { candidateRef: ' fixture ', contentSha256: 'a'.repeat(64) },
  { candidateRef: 'fixture', contentSha256: 'bad' },
  { candidateRef: 'fixture', contentSha256: 'a'.repeat(64), protocolVersion: 'unapproved' }
])('非法查询不进入数据库 %#', async input => {
  const f = fixture()
  await expect(f.read(input)).rejects.toThrow(TypeError)
  expect(f.connection.beginTransaction).not.toHaveBeenCalled()
})
test('读取异常回滚并传播，不吞异常或重跑', async () => {
  const f = fixture(),
    error = new Error('读取失败制品')
  f.query.mockRejectedValue(error)
  await expect(f.read({ candidateRef: 'candidate-fixture', contentSha256: f.sha })).rejects.toBe(
    error
  )
  expect(f.connection.rollback).toHaveBeenCalledOnce()
  expect(f.connection.commit).not.toHaveBeenCalled()
  expect(f.query).toHaveBeenCalledOnce()
})
