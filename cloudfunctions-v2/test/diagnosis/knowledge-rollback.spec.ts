import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createDiagnosisKnowledgeReleaseLocker } from '../../src/diagnosis/domain/diagnosis-knowledge-release.js'
import { lockDiagnosisRollbackCommand } from '../../src/diagnosis/domain/diagnosis-knowledge-rollback.js'
import { createRollbackDiagnosisKnowledge } from '../../src/diagnosis/application/rollback-diagnosis-knowledge.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
/** L3/unit_fake：Expected来自既有回滚合同及本次内部合同；真实Schema/应用/摘要，替换Repository/CMS/来源和时钟。 */
const root = findProjectRoot(),
  schemas = {
    candidate: JSON.parse(
      readFileSync(
        join(
          root,
          'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
        ),
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
function canonical(v: unknown): string {
  if (Array.isArray(v)) {return `[${v.map(canonical).join(',')}]`}
  if (v !== null && typeof v === 'object')
    {return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`}
  return JSON.stringify(v)
}
const candidate = validCandidate(),
  sha = createHash('sha256').update(canonical(candidate)).digest('hex')
const release = createDiagnosisKnowledgeReleaseLocker(schemas.candidate)({
  schemaVersion: 'diagnosis-knowledge-release/v1',
  releaseRef: 'release-fixture',
  bundleCode: 'yellow_leaf',
  version: 1,
  candidateRef: 'candidate-fixture',
  candidateContentSha256: sha,
  reviewRef: 'review-fixture',
  reviewProtocolVersion: 'fixture-review/v1',
  publishedAtMs: 1200,
  candidate
})
const command = {
  commandRef: 'rollback-fixture',
  bundleCode: 'yellow_leaf',
  targetReleaseRef: 'release-fixture',
  targetPackageSha256: release.packageSha256,
  reviewProtocolVersion: 'fixture-review/v1',
  expectedPointerVersion: 2,
  operatorRefHash: 'a'.repeat(64),
  reasonZh: '回滚结构制品'
}
function fixture() {
  const result = {
    status: 'rolled_back' as const,
    releaseRef: command.targetReleaseRef,
    packageSha256: command.targetPackageSha256,
    pointerVersion: 3
  }
  const driver = {
    beginTransaction: vi.fn(() => ({ transactionContext: true as const })),
    commitTransaction: vi.fn(() => {}),
    rollbackTransaction: vi.fn(() => {}),
    recordRollbackFailure: vi.fn()
  }
  const repository = {
    readReceipt: vi.fn(async () => ({ status: 'not_found' as const })),
    readTarget: vi.fn(async () => ({ status: 'ready' as const, release })),
    rollback: vi.fn(async () => result),
    reconcile: vi.fn(async () => result)
  }
  const reader = {
    read: vi.fn(async () => ({
      publishedSymptomModes: [
        { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
      ],
      verifiedClaimRevisions: [
        { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
      ]
    }))
  }
  const now = vi.fn(() => 2000)
  return {
    result,
    driver,
    repository,
    reader,
    now,
    run: createRollbackDiagnosisKnowledge({
      driver,
      repository,
      schemas,
      dependencyReader: () => reader,
      now
    })
  }
}
test('严格完整回滚命令锁定，不接受未知字段/缺协议/坏摘要/指针溢出', () => {
  expect(Object.isFrozen(lockDiagnosisRollbackCommand(command))).toBe(true)
  for (const x of [
    { ...command, extra: true },
    { ...command, reviewProtocolVersion: undefined },
    { ...command, targetPackageSha256: 'wrong' },
    { ...command, expectedPointerVersion: 4294967295 },
    { ...command, reasonZh: ' ' }
  ])
    {expect(() => lockDiagnosisRollbackCommand(x)).toThrow(TypeError)}
})
test('首次回滚重新检查来源及题包，并提交原样目标包', async () => {
  const f = fixture()
  expect(await f.run(command)).toEqual(f.result)
  expect(f.reader.read).toHaveBeenCalledTimes(1)
  expect(f.repository.rollback).toHaveBeenCalledWith(
    { transactionContext: true },
    command,
    release,
    2000
  )
  expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
})
test('目标不可用或依赖失效拒绝，不进行指针写入', async () => {
  const missing = fixture()
  missing.repository.readTarget.mockResolvedValue({ status: 'unavailable' } as never)
  expect(await missing.run(command)).toEqual({ status: 'unavailable' })
  expect(missing.repository.rollback).not.toHaveBeenCalled()
  const invalid = fixture()
  invalid.reader.read.mockResolvedValue({ publishedSymptomModes: [], verifiedClaimRevisions: [] })
  expect(await invalid.run(command)).toEqual({ status: 'unavailable' })
  expect(invalid.repository.rollback).not.toHaveBeenCalled()
})
test('历史重放不取当前时间/依赖或再次切换；未知提交只读对账', async () => {
  const replay = fixture()
  replay.repository.readReceipt.mockResolvedValue(replay.result as never)
  expect(await replay.run(command)).toEqual(replay.result)
  expect(replay.now).not.toHaveBeenCalled()
  expect(replay.reader.read).not.toHaveBeenCalled()
  expect(replay.repository.rollback).not.toHaveBeenCalled()
  const uncertain = fixture()
  uncertain.driver.commitTransaction.mockImplementation(() => {
    throw new DatabaseCommitResultUnknownError('fixture')
  })
  expect(await uncertain.run(command)).toEqual(uncertain.result)
  expect(uncertain.repository.reconcile).toHaveBeenCalledWith(command)
  expect(uncertain.driver.rollbackTransaction).not.toHaveBeenCalled()
})
