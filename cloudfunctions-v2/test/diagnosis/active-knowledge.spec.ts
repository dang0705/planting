import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createDiagnosisKnowledgeReleaseLocker } from '../../src/diagnosis/domain/diagnosis-knowledge-release.js'
import { createReadActiveDiagnosisKnowledge } from '../../src/diagnosis/application/read-active-diagnosis-knowledge.js'
/** L3/unit_fake：Expected来自活动知识合同；真实Schema/摘要/准备应用，事务与Repository/依赖替换，不证明CMS或实际诊断。 */
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
  sha = createHash('sha256').update(canonical(candidate)).digest('hex'),
  input = { bundleCode: 'yellow_leaf', reviewProtocolVersion: 'fixture-review/v1' }
const release = createDiagnosisKnowledgeReleaseLocker(schemas.candidate)({
  schemaVersion: 'diagnosis-knowledge-release/v1',
  releaseRef: 'release-fixture',
  bundleCode: 'yellow_leaf',
  version: 1,
  candidateRef: 'candidate-fixture',
  candidateContentSha256: sha,
  reviewRef: 'review-fixture',
  reviewProtocolVersion: input.reviewProtocolVersion,
  publishedAtMs: 1200,
  candidate
})
function fixture() {
  const repository = {
      readActive: vi.fn(async () => ({ status: 'active' as const, release, pointerVersion: 3 }))
    },
    reader = {
      read: vi.fn(async () => ({
        publishedSymptomModes: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
        ],
        verifiedClaimRevisions: [
          { sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }
        ]
      }))
    },
    driver = {
      beginTransaction: vi.fn(() => ({ transactionContext: true as const })),
      commitTransaction: vi.fn(() => {}),
      rollbackTransaction: vi.fn(() => {}),
      recordRollbackFailure: vi.fn()
    }
  return {
    repository,
    reader,
    driver,
    run: createReadActiveDiagnosisKnowledge({
      driver,
      repository,
      schemas,
      dependencyReader: () => reader
    })
  }
}
test('冻结单一完整包及指针版本，完成依赖复核后结束事务', async () => {
  const f = fixture(),
    r = await f.run(input)
  expect(r.status).toBe('knowledge_ready')
  if (r.status !== 'knowledge_ready') {
    throw new Error('应有冻结快照')
  }
  expect(r.pointerVersion).toBe(3)
  expect(r.release.packageSha256).toBe(release.packageSha256)
  expect(Object.isFrozen(r.release.package.candidate)).toBe(true)
  expect(f.reader.read).toHaveBeenCalledTimes(1)
  expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
})
test('无活动版本不读取依赖，依赖失效不输出知识', async () => {
  const f = fixture()
  f.repository.readActive.mockResolvedValue({ status: 'unavailable' } as never)
  expect(await f.run(input)).toEqual({ status: 'unavailable' })
  expect(f.reader.read).not.toHaveBeenCalled()
  const invalid = fixture()
  invalid.reader.read.mockResolvedValue({ publishedSymptomModes: [], verifiedClaimRevisions: [] })
  expect(await invalid.run(input)).toEqual({ status: 'unavailable' })
})
test('受控范围/协议/包摘要与指针资格不能由错误端口结果替代', async () => {
  for (const patch of [
    { pointerVersion: 0 },
    { release: { ...release, packageSha256: 'f'.repeat(64) } }
  ]) {
    const f = fixture()
    f.repository.readActive.mockResolvedValue({
      status: 'active',
      release,
      pointerVersion: 3,
      ...patch
    })
    expect(await f.run(input)).toEqual({ status: 'unavailable' })
  }
  expect(await fixture().run({ ...input, bundleCode: 'other' })).toEqual({ status: 'unavailable' })
  expect(await fixture().run({ ...input, reviewProtocolVersion: 'wrong/v1' })).toEqual({
    status: 'unavailable'
  })
})
test('缺协议或额外输入在事务之前拒绝', async () => {
  for (const v of [
    { bundleCode: 'yellow_leaf' },
    { ...input, extra: true },
    { ...input, bundleCode: '' }
  ]) {
    const f = fixture()
    await expect(f.run(v)).rejects.toThrow(TypeError)
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  }
})
