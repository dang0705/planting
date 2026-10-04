import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createSubmitDiagnosisCandidate } from '../../src/diagnosis/application/submit-candidate.js'
import { DiagnosisCandidateSubmissionConflictError } from '../../src/diagnosis/domain/candidate-submission.js'
import {
  DatabaseCommitResultUnknownError,
  type DatabaseTransactionDriver,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
/** L3/unit_fake：Expected 来自统一计划、009 唯一约束及候选提交合同。
 * 实际执行完整 Schema、正文锁定、依赖准入、事务编排；替换 Repository 与来源读边界。
 * 正文为明确结构制品，不证明真实数据库、CMS 管理员、园艺正文或 HTTP。
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
/** 独立 Expected 的递归 JSON 键排序，不调用被测摘要。 */
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
  const result = {
    status: 'submitted' as const,
    candidateRef: 'candidate-fixture',
    contentSha256: sha,
    submittedAtMs: 1100
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
    insert: vi.fn(async () => result),
    reconcile: vi.fn(async () => result)
  }
  const verified = {
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
    ]
  }
  const dependencies = vi.fn(async () => verified),
    now = vi.fn(() => 1100)
  const submit = createSubmitDiagnosisCandidate({
    driver,
    repository,
    schemas,
    dependencyReader: () => ({ read: dependencies }),
    now
  })
  return { candidate, sha, result, driver, repository, verified, dependencies, now, submit }
}
test('完整候选先锁定，依赖复核后原样提交；返回精确收据但不批准', async () => {
  const f = fixture()
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual(
    f.result
  )
  const args = f.repository.insert.mock.calls[0] as unknown as [
    unknown,
    { candidateRef: string; contentSha256: string; candidate: unknown },
    number
  ]
  expect(args[1]).toEqual({
    candidateRef: 'candidate-fixture',
    contentSha256: f.sha,
    candidate: f.candidate
  })
  expect(Object.isFrozen(args[1].candidate)).toBe(true)
  expect(args[2]).toBe(1100)
  expect(f.driver.commitTransaction).toHaveBeenCalledOnce()
})
test('原提交历史收据直接重放，不重核准来源、不重写、不改原时间', async () => {
  const f = fixture()
  f.repository.readReceipt.mockResolvedValue(f.result as never)
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual(
    f.result
  )
  expect(f.dependencies).not.toHaveBeenCalled()
  expect(f.now).not.toHaveBeenCalled()
  expect(f.repository.insert).not.toHaveBeenCalled()
})
test.each(['question', 'claim'])('缺少%s依赖时禁止写入', async mode => {
  const f = fixture()
  f.dependencies.mockResolvedValue({
    publishedSymptomModes: mode === 'question' ? [] : f.verified.publishedSymptomModes,
    verifiedClaimRevisions: mode === 'claim' ? [] : f.verified.verifiedClaimRevisions
  })
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual({
    status: 'unavailable'
  })
  expect(f.repository.insert).not.toHaveBeenCalled()
})
test('等待事务期间调用方改变输入不改变提交修订或正文', async () => {
  const f = fixture(),
    input = { candidateRef: 'candidate-fixture', candidate: f.candidate }
  const expected = structuredClone(f.candidate),
    pending = f.submit(input)
  input.candidateRef = 'other'
  input.candidate.revisionNo = 9
  expect(await pending).toEqual(f.result)
  const args = f.repository.insert.mock.calls[0] as unknown as [
    unknown,
    { candidateRef: string; candidate: unknown }
  ]
  expect(args[1].candidateRef).toBe('candidate-fixture')
  expect(args[1].candidate).toEqual(expected)
})
test.each([
  null,
  {},
  { candidateRef: ' fixture ', candidate: validCandidate() },
  { candidateRef: 'fixture', candidate: { ...validCandidate(), confidence: 99 } }
])('非法提交不进入事务 %#', async input => {
  const f = fixture()
  await expect(f.submit(input)).rejects.toThrow(TypeError)
  expect(f.driver.beginTransaction).not.toHaveBeenCalled()
})
test('并发冲突回滚后新连接只读核对；不重复 insert', async () => {
  const f = fixture()
  f.repository.insert.mockRejectedValue(new DiagnosisCandidateSubmissionConflictError())
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual(
    f.result
  )
  expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
  expect(f.repository.insert).toHaveBeenCalledOnce()
  expect(f.repository.reconcile).toHaveBeenCalledOnce()
})
test('提交响应丢失只读对账，不回滚已提交连接、不重写', async () => {
  const f = fixture()
  vi.mocked(f.driver.commitTransaction).mockRejectedValue(
    new DatabaseCommitResultUnknownError('响应丢失制品')
  )
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual(
    f.result
  )
  expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
  expect(f.repository.insert).toHaveBeenCalledOnce()
  expect(f.repository.reconcile).toHaveBeenCalledOnce()
})
test('Repository 错误原样传播且回滚，不吞异常重跑', async () => {
  const f = fixture(),
    error = new Error('数据库错误制品')
  f.repository.insert.mockRejectedValue(error)
  await expect(
    f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })
  ).rejects.toBe(error)
  expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
  expect(f.repository.reconcile).not.toHaveBeenCalled()
})
test('提交未知且新连接没有收据，不伪造失败或成功，不重写', async () => {
  const f = fixture()
  vi.mocked(f.driver.commitTransaction).mockRejectedValue(
    new DatabaseCommitResultUnknownError('响应丢失制品')
  )
  f.repository.reconcile.mockResolvedValue({ status: 'not_found' } as never)
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual({
    status: 'unknown_commit'
  })
  expect(f.repository.insert).toHaveBeenCalledOnce()
  expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('历史引用冲突不复核依赖或覆盖原正文', async () => {
  const f = fixture()
  f.repository.readReceipt.mockResolvedValue({ status: 'conflict' } as never)
  expect(await f.submit({ candidateRef: 'candidate-fixture', candidate: f.candidate })).toEqual({
    status: 'conflict'
  })
  expect(f.dependencies).not.toHaveBeenCalled()
  expect(f.repository.insert).not.toHaveBeenCalled()
})
