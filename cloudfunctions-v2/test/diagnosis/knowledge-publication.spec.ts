import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import type { CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'
import { test, expect, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createDiagnosisKnowledgeReleaseLocker } from '../../src/diagnosis/domain/diagnosis-knowledge-release.js'
import { createPublishDiagnosisKnowledge } from '../../src/diagnosis/application/publish-diagnosis-knowledge.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
/** L3/unit_fake：独立Expected来自原样审核、009/010和知识发布合同；真实Schema/摘要/应用事务编排，替换Repository/依赖/时钟，不证明实际CMS/SQL。 */
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
  candidateSha = createHash('sha256').update(canonical(candidate)).digest('hex')
const command = {
  commandRef: 'command-fixture',
  releaseRef: 'release-fixture',
  bundleCode: 'yellow_leaf',
  version: 1,
  candidateRef: 'candidate-fixture',
  candidateContentSha256: candidateSha,
  reviewRef: 'review-fixture',
  reviewProtocolVersion: 'fixture-review/v1',
  expectedPointerVersion: 0,
  operatorRefHash: 'a'.repeat(64),
  reasonZh: '结构制品发布验证'
}
function fixture() {
  const tx = { transactionContext: true as const },
    receipt = {
      status: 'published' as const,
      releaseRef: command.releaseRef,
      packageSha256: 'b'.repeat(64),
      pointerVersion: 1
    }
  const driver = {
    beginTransaction: vi.fn(async () => tx),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    recordRollbackFailure: vi.fn()
  }
  const repository = {
    readReceipt: vi.fn(async () => ({ status: 'not_found' as const })),
    readReviewed: vi.fn(async () => ({
      status: 'reviewed_candidate' as const,
      candidate: candidate as CanonicalJsonObject,
      contentSha256: candidateSha,
      reviewRef: command.reviewRef,
      protocolVersion: command.reviewProtocolVersion,
      reviewerRefHash: 'c'.repeat(64),
      decidedAtMs: 1000
    })),
    activate: vi.fn(async () => receipt),
    reconcile: vi.fn(async () => receipt)
  }
  const dependencies = {
    read: vi.fn(async () => ({
      publishedSymptomModes: [
        { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
      ],
      verifiedClaimRevisions: [
        { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
      ]
    }))
  }
  return {
    tx,
    driver,
    repository,
    dependencies,
    run: createPublishDiagnosisKnowledge({
      driver,
      repository,
      schemas,
      dependencyReader: () => dependencies,
      now: () => 1200
    })
  }
}
test('完整发布包候选原样、候选和整包分别摘要、递归冻结', () => {
  const input = {
    schemaVersion: 'diagnosis-knowledge-release/v1',
    releaseRef: 'release-fixture',
    bundleCode: 'yellow_leaf',
    version: 1,
    candidateRef: 'candidate-fixture',
    candidateContentSha256: candidateSha,
    reviewRef: 'review-fixture',
    reviewProtocolVersion: 'fixture-review/v1',
    publishedAtMs: 1200,
    candidate
  }
  const locked = createDiagnosisKnowledgeReleaseLocker(schemas.candidate)(input)
  expect(locked.package).toEqual(input)
  expect(locked.packageSha256).toBe(createHash('sha256').update(canonical(input)).digest('hex'))
  expect(Object.isFrozen(locked.package.candidate)).toBe(true)
})
test.each(['candidate_hash', 'bundle', 'unknown', 'empty_candidate'])(
  '发布包结构错配%s拒绝',
  mode => {
    const input: Record<string, unknown> = {
      schemaVersion: 'diagnosis-knowledge-release/v1',
      releaseRef: 'release-fixture',
      bundleCode: 'yellow_leaf',
      version: 1,
      candidateRef: 'candidate-fixture',
      candidateContentSha256: candidateSha,
      reviewRef: 'review-fixture',
      reviewProtocolVersion: 'fixture-review/v1',
      publishedAtMs: 1200,
      candidate
    }
    if (mode === 'candidate_hash') {
      input.candidateContentSha256 = 'f'.repeat(64)
    }
    if (mode === 'bundle') {
      input.bundleCode = 'other'
    }
    if (mode === 'unknown') {
      input.extra = true
    }
    if (mode === 'empty_candidate') {
      input.candidate = {}
    }
    expect(() => createDiagnosisKnowledgeReleaseLocker(schemas.candidate)(input)).toThrow()
  }
)
test('审核→依赖核验→原子激活；同一事务保留原样完整候选', async () => {
  const f = fixture()
  expect(await f.run(command)).toMatchObject({ status: 'published' })
  expect(f.repository.activate).toHaveBeenCalledTimes(1)
  const [tx, c, p] = f.repository.activate.mock.calls[0] as unknown as [
    unknown,
    unknown,
    { package: { candidate: unknown } }
  ]
  expect(tx).toBe(f.tx)
  expect(c).toEqual(command)
  expect(p.package.candidate).toEqual(candidate)
  expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
})
test('未验证来源不写发布；缺审核不读依赖', async () => {
  const f = fixture()
  f.dependencies.read.mockResolvedValueOnce({
    publishedSymptomModes: [],
    verifiedClaimRevisions: []
  })
  expect(await f.run(command)).toEqual({ status: 'unavailable' })
  expect(f.repository.activate).not.toHaveBeenCalled()
  const g = fixture()
  g.repository.readReviewed.mockResolvedValueOnce({ status: 'unavailable' } as never)
  expect(await g.run(command)).toEqual({ status: 'unavailable' })
  expect(g.dependencies.read).not.toHaveBeenCalled()
})
test('候选命令摘要错配不产生发布', async () => {
  const f = fixture()
  expect(await f.run({ ...command, candidateContentSha256: 'f'.repeat(64) })).toEqual({
    status: 'unavailable'
  })
  expect(f.repository.activate).not.toHaveBeenCalled()
})
test('已存在同参收据直接重放，不再次取依赖或激活', async () => {
  const f = fixture()
  f.repository.readReceipt.mockResolvedValueOnce({
    status: 'published',
    releaseRef: 'release-fixture',
    packageSha256: 'b'.repeat(64),
    pointerVersion: 1
  } as never)
  expect(await f.run(command)).toMatchObject({ status: 'published' })
  expect(f.repository.readReviewed).not.toHaveBeenCalled()
  expect(f.repository.activate).not.toHaveBeenCalled()
})
test('未知提交只读对账一次，不回滚旧连接或重复写', async () => {
  const f = fixture()
  f.driver.commitTransaction.mockRejectedValueOnce(
    new DatabaseCommitResultUnknownError('fixture unknown')
  )
  expect(await f.run(command)).toMatchObject({ status: 'published' })
  expect(f.repository.reconcile).toHaveBeenCalledTimes(1)
  expect(f.repository.activate).toHaveBeenCalledTimes(1)
  expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('依赖读取失败回滚，不伪造发布成功', async () => {
  const f = fixture(),
    failure = new Error('fixture dependency')
  f.dependencies.read.mockRejectedValueOnce(failure)
  await expect(f.run(command)).rejects.toBe(failure)
  expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  expect(f.repository.activate).not.toHaveBeenCalled()
})
