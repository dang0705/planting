import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createMysqlReviewedDiagnosisCandidateReader } from '../../src/diagnosis/repository/mysql-reviewed-diagnosis-candidate-reader.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
/** L3/unit_fake：Expected来自009/010及审核原样内容合同。真实AJV/摘要/事务SQL编排，替换连接；不证明CMS、发布或实际数据库。 */
const schema = JSON.parse(
  readFileSync(
    resolve(
      findProjectRoot(),
      'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
    ),
    'utf8'
  )
) as object
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
function fixture() {
  const candidate = validCandidate(),
    sha = createHash('sha256').update(canonical(candidate)).digest('hex')
  const review = {
    candidate_internal_id: '1',
    content_sha256: sha,
    decision: 'approved',
    protocol_version: 'fixture-review/v1',
    reviewer_ref_hash: 'a'.repeat(64),
    decided_at_ms: '1100',
    _openid: ''
  }
  const row = {
    candidate_ref: 'candidate-fixture',
    bundle_code: 'yellow_leaf',
    revision_no: 1,
    schema_version: 'diagnosis-knowledge-candidate/v1',
    content_sha256: sha,
    candidate_json: candidate,
    candidate_state: 'reviewed',
    _openid: ''
  }
  const query = vi
    .fn<Mysql2QueryConnection['query']>()
    .mockImplementation(async sql =>
      sql.includes('FROM diagnosis_review_attestations')
        ? [review]
        : sql.includes('FROM diagnosis_knowledge_candidates')
          ? [row]
          : []
    )
  const c: Mysql2QueryConnection = {
    query,
    execute: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    destroy: vi.fn()
  }
  return {
    review,
    row,
    query,
    c,
    read: () =>
      createMysqlReviewedDiagnosisCandidateReader(schema).read(
        { transactionContext: true, connection: c },
        'candidate-fixture',
        'review-fixture',
        'fixture-review/v1'
      )
  }
}
test('精确审核锁→原候选→撤销检查，原样候选摘要并冻结返回', async () => {
  const f = fixture(),
    r = await f.read()
  expect(r.status).toBe('reviewed_candidate')
  if (r.status !== 'reviewed_candidate') {
    throw new Error('结构制品应读回')
  }
  expect(r.candidate).toEqual(f.row.candidate_json)
  expect(Object.isFrozen(r.candidate)).toBe(true)
  expect(f.query.mock.calls.map(x => x[1])).toEqual([
    ['review-fixture'],
    ['1', 'candidate-fixture'],
    ['review-fixture']
  ])
  expect(f.query.mock.calls[0]![0]).toContain('FOR UPDATE')
  expect(f.query.mock.calls[1]![0]).toContain('FOR UPDATE')
})
test.each(['rejected', 'revoked', 'missing_review', 'missing_candidate'])(
  '审核不可用%s不产生发布准备内容',
  async mode => {
    const f = fixture()
    if (mode === 'rejected') {
      f.review.decision = 'rejected'
    }
    if (mode === 'revoked') {
      f.query.mockImplementation(async sql =>
        sql.includes('FROM diagnosis_review_attestations')
          ? [f.review]
          : sql.includes('FROM diagnosis_knowledge_candidates')
            ? [f.row]
            : [{ revocation_ref: 'rev-fixture' }]
      )
    }
    if (mode === 'missing_review') {
      f.query.mockResolvedValue([])
    }
    if (mode === 'missing_candidate') {
      f.query.mockResolvedValueOnce([f.review]).mockResolvedValue([])
    }
    expect(await f.read()).toEqual({ status: 'unavailable' })
  }
)
test.each(['hash', 'protocol', 'metadata', 'schema', 'openid', 'duplicate'])(
  '错配或损坏%s失败关闭',
  async mode => {
    const f = fixture()
    if (mode === 'hash') {
      f.row.content_sha256 = 'b'.repeat(64)
    }
    if (mode === 'protocol') {
      f.review.protocol_version = 'other/v1'
    }
    if (mode === 'metadata') {
      f.row.revision_no = 2
    }
    if (mode === 'schema') {
      f.row.candidate_json = { ...f.row.candidate_json, outcomes: [] }
    }
    if (mode === 'openid') {
      f.review._openid = 'forbidden'
    }
    if (mode === 'duplicate') {
      f.query.mockResolvedValue([f.review, f.review])
    }
    expect(await f.read()).toEqual({ status: 'invalid_record' })
  }
)
test('缺显式事务拒绝；读库错误原样传播，不写入或提交', async () => {
  const f = fixture()
  await expect(
    createMysqlReviewedDiagnosisCandidateReader(schema).read(
      { transactionContext: false, connection: f.c } as never,
      'candidate-fixture',
      'review-fixture',
      'fixture-review/v1'
    )
  ).rejects.toThrow()
  const failure = new Error('fixture failure')
  f.query.mockRejectedValue(failure)
  await expect(f.read()).rejects.toBe(failure)
  expect(f.c.execute).not.toHaveBeenCalled()
  expect(f.c.commit).not.toHaveBeenCalled()
})
