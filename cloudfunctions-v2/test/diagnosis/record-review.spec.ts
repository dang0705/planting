import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import type { CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { createRecordDiagnosisReview } from '../../src/diagnosis/application/record-review.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
/** L3/unit_fake：Expected 来自统一计划、009及人工审核内部合同。
 * 真实 Schema、命令锁定、来源准入及事务编排；替换 Repository/来源边界。
 * fixture-review/v1 与审批人摘要仅为制品，不代表正式 CMS 身份或协议已获批准。
 */
const root = findProjectRoot(),
  schemas = {
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
  const candidate = validCandidate() as CanonicalJsonObject,
    sha = createHash('sha256').update(canonical(candidate)).digest('hex')
  const command = {
    reviewRef: 'review-fixture',
    candidateRef: 'candidate-fixture',
    contentSha256: sha,
    decision: 'approved',
    reviewerRefHash: 'a'.repeat(64),
    reviewProtocolVersion: 'fixture-review/v1'
  }
  const result = {
    status: 'recorded' as const,
    reviewRef: command.reviewRef,
    decision: 'approved' as const,
    decidedAtMs: 1200
  }
  const tx: TransactionExecutionContext = { transactionContext: true }
  const driver: DatabaseTransactionDriver<TransactionExecutionContext> = {
    beginTransaction: vi.fn(async () => tx),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
    recordRollbackFailure: vi.fn()
  }
  const repository = {
    readReceipt: vi.fn(async () => ({ status: 'not_found' as const })),
    lockSubmitted: vi.fn(async () => ({
      status: 'submitted_candidate' as const,
      candidate,
      submittedAtMs: 1100
    })),
    append: vi.fn(async () => result),
    reconcile: vi.fn(async () => result)
  }
  const dependencies = vi.fn(async () => ({
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
    ]
  }))
  const record = createRecordDiagnosisReview({
    driver,
    repository,
    schemas,
    dependencyReader: () => ({ read: dependencies }),
    now: () => 1200
  })
  return { candidate, command, result, driver, repository, dependencies, record }
}
test('精确候选复核来源后记录批准，不产生知识发布', async () => {
  const f = fixture()
  expect(await f.record(f.command)).toEqual(f.result)
  expect(f.repository.append).toHaveBeenCalledWith(expect.anything(), f.command, 1200)
  expect(f.dependencies).toHaveBeenCalledOnce()
  expect(f.driver.commitTransaction).toHaveBeenCalledOnce()
})
test('批准来源失效不得写凭据；驳回可原样记录但不授予依赖资格', async () => {
  const f = fixture()
  f.dependencies.mockResolvedValue({ publishedSymptomModes: [], verifiedClaimRevisions: [] })
  expect(await f.record(f.command)).toEqual({ status: 'unavailable' })
  expect(f.repository.append).not.toHaveBeenCalled()
  f.repository.append.mockResolvedValue({ ...f.result, decision: 'rejected' } as never)
  expect(await f.record({ ...f.command, decision: 'rejected' })).toEqual({
    ...f.result,
    decision: 'rejected'
  })
})
test('历史同参收据不重新写审核、读候选或再批准', async () => {
  const f = fixture()
  f.repository.readReceipt.mockResolvedValue(f.result as never)
  expect(await f.record(f.command)).toEqual(f.result)
  expect(f.repository.lockSubmitted).not.toHaveBeenCalled()
  expect(f.repository.append).not.toHaveBeenCalled()
})
test('候选不可待审时禁止任何决定写入', async () => {
  const f = fixture()
  f.repository.lockSubmitted.mockResolvedValue({ status: 'unavailable' } as never)
  expect(await f.record(f.command)).toEqual({ status: 'unavailable' })
  expect(f.repository.append).not.toHaveBeenCalled()
})
test('完整摘要不同或决定时间早于提交均拒绝', async () => {
  const f = fixture()
  expect(await f.record({ ...f.command, contentSha256: 'b'.repeat(64) })).toEqual({
    status: 'unavailable'
  })
  f.repository.lockSubmitted.mockResolvedValue({
    status: 'submitted_candidate',
    candidate: f.candidate,
    submittedAtMs: 1300
  })
  expect(await f.record(f.command)).toEqual({ status: 'unavailable' })
  expect(f.repository.append).not.toHaveBeenCalled()
})
test('异步等待期间更改决定和主体不能改变已锁定命令', async () => {
  const f = fixture(),
    input = { ...f.command },
    expected = { ...input },
    pending = f.record(input)
  input.decision = 'rejected'
  input.reviewerRefHash = 'b'.repeat(64)
  await pending
  expect(f.repository.append).toHaveBeenCalledWith(expect.anything(), expected, 1200)
})
test.each([
  null,
  {},
  { decision: 'auto' },
  { ...fixture().command, reviewerRefHash: 'bad' },
  { ...fixture().command, reviewProtocolVersion: '' }
])('非法审核命令不进入事务 %#', async input => {
  const f = fixture()
  await expect(f.record(input)).rejects.toThrow(TypeError)
  expect(f.driver.beginTransaction).not.toHaveBeenCalled()
})
test('数据库失败回滚并传播，不重写', async () => {
  const f = fixture(),
    error = new Error('审核失败制品')
  f.repository.append.mockRejectedValue(error)
  await expect(f.record(f.command)).rejects.toBe(error)
  expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
  expect(f.repository.reconcile).not.toHaveBeenCalled()
})
test('提交未知只读核对原决定，不重复追加或回滚已提交连接', async () => {
  const f = fixture()
  vi.mocked(f.driver.commitTransaction).mockRejectedValue(
    new DatabaseCommitResultUnknownError('提交未知制品')
  )
  expect(await f.record(f.command)).toEqual(f.result)
  expect(f.repository.append).toHaveBeenCalledOnce()
  expect(f.repository.reconcile).toHaveBeenCalledOnce()
  expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
