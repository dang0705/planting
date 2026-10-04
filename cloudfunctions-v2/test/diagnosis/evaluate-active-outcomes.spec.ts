import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import candidateSchema from '../../../docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
import referenceSchema from '../../../docs/backend-v2/contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json'
import { validCandidate } from '../support/reviewed-diagnosis-candidate-fixture.js'
import { createEvaluateActiveDiagnosisOutcomes } from '../../src/diagnosis/application/evaluate-active-outcomes.js'
import type { CanonicalJsonObject } from '../../src/foundation/json/canonical-json-sha256.js'

/** L3/unit_fake：Expected 来自活动知识和证据计算合同；真实应用/Schema/条件匹配，只替换事务、SQL与依赖Reader。未证明真实模型归一、CMS、数据库或最终诊断。 */
function canonical(v: unknown): string {
  if (Array.isArray(v)) {
    return `[${v.map(canonical).join(',')}]`
  }
  if (v && typeof v === 'object') {
    return `{${Object.keys(v)
      .sort()
      .map(k => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
const hash = (v: unknown) => createHash('sha256').update(canonical(v)).digest('hex')
const query = { bundleCode: 'yellow_leaf', reviewProtocolVersion: 'fixture-review/v1' }
const observation = {
  evidenceRef: 'answer-a',
  findingCode: 'soil-wet',
  sourceKind: 'answer',
  affectedPartCodes: ['root']
}
function fixture() {
  const candidate = validCandidate()
  const template = (candidate.outcomes as Record<string, unknown>[])[0]!
  candidate.outcomes = ['met', 'missing', 'conflict'].map((name, i) => ({
    ...template,
    outcomeCode: name,
    evidenceRules: {
      required: [
        {
          evidenceCode: `required-${name}`,
          findingCode: i === 1 ? 'soil-dry' : 'soil-wet',
          sourceKind: 'answer',
          affectedPartCodes: ['root']
        }
      ],
      supporting: [],
      opposing:
        i === 2
          ? [
              {
                evidenceCode: 'opposing-conflict',
                findingCode: 'soil-wet',
                sourceKind: 'answer',
                affectedPartCodes: ['root']
              }
            ]
          : []
    }
  }))
  candidate.claimLinks = [
    (candidate.claimLinks as Record<string, unknown>[])[0]!,
    ...['met', 'missing', 'conflict'].map(targetCode => ({
      targetKind: 'outcome',
      targetCode,
      sourceCode: 'reviewed-source',
      claimCode: 'multi-cause',
      revisionNo: 1,
      linkRole: 'limit'
    }))
  ]
  const p = {
    schemaVersion: 'diagnosis-knowledge-release/v1' as const,
    releaseRef: 'release-a',
    bundleCode: query.bundleCode,
    version: 1,
    candidateRef: 'candidate-a',
    candidateContentSha256: hash(candidate),
    reviewRef: 'review-a',
    reviewProtocolVersion: query.reviewProtocolVersion,
    publishedAtMs: 1200,
    candidate: candidate as CanonicalJsonObject
  }
  const repository = {
    readActive: vi.fn(async () => ({
      status: 'active' as const,
      release: { package: p, packageSha256: hash(p) },
      pointerVersion: 2
    }))
  }
  const driver = {
    beginTransaction: vi.fn(() => ({ transactionContext: true as const })),
    commitTransaction: vi.fn(() => {}),
    rollbackTransaction: vi.fn(() => {}),
    recordRollbackFailure: vi.fn()
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
  return {
    repository,
    driver,
    reader,
    package: p,
    run: createEvaluateActiveDiagnosisOutcomes({
      driver,
      repository,
      schemas: { candidate: candidateSchema, dependencies: referenceSchema },
      dependencyReader: () => reader
    })
  }
}
test('活动包和依赖读取接到所有结论：满足、缺失和冲突并存，精确版本与引用读回', async () => {
  const f = fixture(),
    r = await f.run(query, [observation])
  expect(r.status).toBe('evidence_evaluated')
  if (r.status !== 'evidence_evaluated') {
    throw new Error('应计算证据')
  }
  expect(r.releaseRef).toBe('release-a')
  expect(r.packageSha256).toBe(hash(f.package))
  expect(r.pointerVersion).toBe(2)
  expect(
    r.outcomes.map(x => [x.outcomeCode, x.match.status, x.match.missingRequiredCodes])
  ).toEqual([
    ['met', 'requirements_met', []],
    ['missing', 'insufficient_evidence', ['required-missing']],
    ['conflict', 'conflicting_evidence', []]
  ])
  expect(r.outcomes[0]?.match.required).toEqual([
    { evidenceCode: 'required-met', evidenceRefs: ['answer-a'] }
  ])
  expect(Object.isFrozen(r.outcomes[0]?.match.required)).toBe(true)
  expect(r).not.toHaveProperty('selectedOutcomeCode')
  expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
})
test('在异步读取之前锁定观察，调用方修改不会改变计算', async () => {
  const f = fixture(),
    findings = [{ ...observation, affectedPartCodes: ['root'] }]
  f.repository.readActive.mockImplementation(async () => {
    findings[0]!.findingCode = 'soil-dry'
    findings[0]!.affectedPartCodes.length = 0
    return {
      status: 'active',
      release: { package: f.package, packageSha256: hash(f.package) },
      pointerVersion: 2
    }
  })
  const r = await f.run(query, findings)
  if (r.status !== 'evidence_evaluated') {
    throw new Error('应计算原观察')
  }
  expect(r.outcomes[0]?.match.status).toBe('requirements_met')
  expect(r.outcomes[1]?.match.status).toBe('insufficient_evidence')
})
test('活动包缺失、依赖撤回或摘要损坏，不生成证据计算结果', async () => {
  const absent = fixture()
  absent.repository.readActive.mockResolvedValue({ status: 'unavailable' } as never)
  expect(await absent.run(query, [observation])).toEqual({ status: 'unavailable' })
  const revoked = fixture()
  revoked.reader.read.mockResolvedValue({ publishedSymptomModes: [], verifiedClaimRevisions: [] })
  expect(await revoked.run(query, [observation])).toEqual({ status: 'unavailable' })
  const corrupt = fixture()
  corrupt.repository.readActive.mockResolvedValue({
    status: 'active',
    release: { package: corrupt.package, packageSha256: 'f'.repeat(64) },
    pointerVersion: 2
  })
  expect(await corrupt.run(query, [observation])).toEqual({ status: 'unavailable' })
})
test('非法观察在事务前拒绝，明确空数组仍保留所有缺证据结论', async () => {
  const f = fixture()
  for (const findings of [
    null,
    [{ ...observation, sourceKind: 'model_free_text' }],
    [{ ...observation, rawPrompt: '禁止' }]
  ]) {
    await expect(f.run(query, findings)).rejects.toThrow(TypeError)
  }
  expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  const r = await f.run(query, [])
  if (r.status !== 'evidence_evaluated') {
    throw new Error('应计算缺证据')
  }
  expect(r.outcomes.map(x => x.match.status)).toEqual([
    'insufficient_evidence',
    'insufficient_evidence',
    'insufficient_evidence'
  ])
})
