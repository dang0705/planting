import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createPestQuestionSessionInTransaction } from '../../src/diagnosis/application/create-pest-question-session.js'
import { projectPestQuestionPackage } from '../../src/diagnosis/http/pest-question-public-projection.js'
import { createHash } from 'node:crypto'
import {
  calculatePestDiagnosisCreationRequestHash,
  createIdempotentPestDiagnosisCreationService
} from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../src/foundation/idempotency/http-idempotency.js'
/** unit_fake / L3：真实V1素材；归属、发布、分析准备与SQL端口替身，不证明正式视觉Provider或HTTP。Expected来自原子创建合同、019约束、已批准题数与安全投影合同。 */
const raw = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const input = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  assetRef: 'upa_owner123',
  startedAtMs: 1500
}
const model = {
  contractVersion: 'diagnosis-model-output/v1',
  evidence: [
    { evidenceKey: 'obs1', source: 'visual', observation: '局部叶背细网', confidence: 'medium' }
  ],
  conclusionCandidates: [
    {
      candidateKey: 'spider_mite',
      summary: '叶螨候选',
      confidence: 'medium',
      supportingEvidenceKeys: ['obs1']
    }
  ],
  uncertainty: { level: 'medium', reasons: ['局部照片'], missingEvidence: ['其他叶片'] },
  recommendedActions: [
    {
      actionKey: 'inspect',
      instruction: '观察其他叶片',
      purpose: '补充线索',
      requiresUserConfirmation: true,
      producesCareFact: false,
      producesCarePlan: false
    }
  ]
}
function harness() {
  let session: any, visual: any
  const published = vi.fn(async () => ({
    status: 'available',
    release: {
      releaseRef: 'bpr_pest12345',
      contentSha256: 'b'.repeat(64),
      questions: raw.pestQuestions,
      tierQuestionLimits: { low: 3, medium: 2, high: 1, very_likely: 1, direct: 0 },
      evidenceGroupByKey: { fine_webbing: 'mite_presence', yellow_speckling: 'mite_presence' }
    }
  }))
  const asset = vi.fn(async () => ({
    status: 'found',
    assetRef: input.assetRef,
    contentSha256: 'a'.repeat(64)
  }))
  const prepare = vi.fn(async () => ({
    status: 'admitted',
    evidenceKind: 'leaf',
    assetContentSha256: 'a'.repeat(64),
    tier: 'medium',
    candidateModes: ['spider_mite'],
    lockedEvidenceKeys: [],
    output: model,
    expiresAtMs: 2000
  }))
  const append = vi.fn(async (_tx: any, value: any) => {
    session = value
    return 'created'
  })
  const appendVisual = vi.fn(async (_tx: any, value: any) => {
    visual = value
    return 'created'
  })
  const read = vi.fn(async () => ({ status: 'found', snapshot: session.snapshot }))
  const readVisual = vi.fn(async () => ({
    status: 'found',
    evidenceRef: visual.evidenceRef,
    evidenceKind: visual.evidenceKind,
    modelContractVersion: 'diagnosis-model-output/v1',
    output: visual.output
  }))
  const run = createPestQuestionSessionInTransaction({
    published,
    asset,
    prepare,
    append,
    appendVisual,
    read,
    readVisual
  } as any)
  return { published, asset, prepare, append, appendVisual, read, readVisual, run }
}
test('共享幂等重放实际虫害选题和原子创建的首次题包，不再次准备分析或写会话', async () => {
  const f = harness(),
    tx = { transactionContext: true as const }
  const command = { ...input, mode: 'pest' as const }
  let saved: HttpIdempotencyPublicResponseSnapshot | undefined
  const run = createIdempotentPestDiagnosisCreationService({
    driver: {
      beginTransaction: async () => tx,
      commitTransaction: async () => {},
      rollbackTransaction: async () => {},
      recordRollbackFailure: () => {}
    },
    idempotencyRepository: {
      read: vi.fn(),
      tryReserve: async () => (saved ? { kind: 'replay', response: saved } : { kind: 'reserved' }),
      completionFirstResult: async (_tx, completion) => {
        saved = completion.response
        return { kind: 'completed', response: saved }
      }
    },
    commitUnknownRepository: { read: vi.fn() },
    createInTransaction: f.run,
    // 正式HTTP仍未开放，此投影仅为本集成场景的受控端口。
    projectPublicResponse: result => {
      if (result.status !== 'created') {
        throw new Error('未创建')
      }
      return {
        status: 200,
        body: {
          data: {
            diagnosisSessionRef: result.diagnosisRef,
            questionPackage: projectPestQuestionPackage(result.snapshot)
          }
        } as any
      }
    }
  })
  const request = {
    ...command,
    idempotency: {
      principalType: 'user' as const,
      principalScopeHash: createHash('sha256').update(input.userRef).digest('hex'),
      httpMethod: 'POST',
      normalizedPath: '/api/v2/diagnosis/sessions',
      operationId: 'createDiagnosisSession',
      idempotencyKeyHash: 'a'.repeat(64),
      requestHash: calculatePestDiagnosisCreationRequestHash(command),
      createdAtMs: 1500,
      expiresAtMs: 2000
    }
  }
  const first = await run(request)
  expect(first.status).toBe(200)
  expect((first.body as any).data.questionPackage.questionCount).toBe(2)
  expect(await run({ ...request, startedAtMs: 1600 })).toEqual(first)
  for (const port of [f.published, f.asset, f.prepare, f.append, f.appendVisual]) {
    expect(port).toHaveBeenCalledTimes(1)
    expect(port.mock.calls[0]![0]).toBe(tx)
  }
  expect(JSON.stringify(first)).not.toContain('bpr_pest12345')
  expect(JSON.stringify(first)).not.toContain('upa_owner123')
})
test('原事务选题、会话、视觉证据及读回一并完成，不从模型置信度生成档位', async () => {
  const f = harness(),
    tx = { transactionContext: true as const },
    r = await f.run(tx, input)
  expect(r.status).toBe('created')
  if (r.status !== 'created') {
    throw new Error('未创建')
  }
  expect(r.snapshot.snapshot.packageQuestions.map(q => q.packageTopic)).toEqual([
    'spider_mite_webbing',
    'spider_mite_dots'
  ])
  expect(projectPestQuestionPackage(r.snapshot).questionCount).toBe(2)
  expect(r.diagnosisRef).toMatch(/^dia_[a-f0-9]{32}$/)
  for (const port of [
    f.published,
    f.asset,
    f.prepare,
    f.append,
    f.appendVisual,
    f.read,
    f.readVisual
  ]) {
    expect(port.mock.calls[0]![0]).toBe(tx)
  }
  expect(f.appendVisual.mock.calls[0]![1]).toMatchObject({
    diagnosisRef: r.diagnosisRef,
    userRef: input.userRef,
    userPlantRef: input.userPlantRef,
    assetRef: input.assetRef,
    assetContentSha256: 'a'.repeat(64)
  })
})
test.each(['release', 'asset', 'prepare'])('前置%s未满足不写任何会话', async missing => {
  const f = harness()
  if (missing === 'release') {
    f.published.mockResolvedValueOnce({ status: 'unavailable' } as any)
  }
  if (missing === 'asset') {
    f.asset.mockResolvedValueOnce({ status: 'not_found' } as any)
  }
  if (missing === 'prepare') {
    f.prepare.mockResolvedValueOnce({ status: 'unavailable' } as any)
  }
  expect((await f.run({ transactionContext: true }, input)).status).not.toBe('created')
  expect(f.append).not.toHaveBeenCalled()
  expect(f.appendVisual).not.toHaveBeenCalled()
})
test.each(['unknown_tier', 'changed_asset', 'invalid_output', 'expired'])(
  '准入准备%s损坏不写会话',
  async issue => {
    const f = harness(),
      v: any = await f.prepare()
    if (issue === 'unknown_tier') {
      v.tier = 'unknown'
    }
    if (issue === 'changed_asset') {
      v.assetContentSha256 = 'c'.repeat(64)
    }
    if (issue === 'invalid_output') {
      v.output = { raw: 'provider' }
    }
    if (issue === 'expired') {
      v.expiresAtMs = 1500
    }
    f.prepare.mockResolvedValueOnce(v)
    await expect(f.run({ transactionContext: true }, input)).rejects.toThrow()
    expect(f.append).not.toHaveBeenCalled()
  }
)
test('已归一同组观察避免重复询问，零题也不自动确诊', async () => {
  const f = harness(),
    v: any = await f.prepare()
  v.lockedEvidenceKeys = ['fine_webbing']
  f.prepare.mockResolvedValueOnce(v)
  const r = await f.run({ transactionContext: true }, input)
  expect(r.status).toBe('no_questions')
  expect(f.append).not.toHaveBeenCalled()
  expect(r).not.toHaveProperty('conclusion')
})
test('显式直判档零题不创建可答会话或结论', async () => {
  const f = harness(),
    v: any = await f.prepare()
  v.tier = 'direct'
  f.prepare.mockResolvedValueOnce(v)
  expect((await f.run({ transactionContext: true }, input)).status).toBe('no_questions')
  expect(f.appendVisual).not.toHaveBeenCalled()
})
test('创建归属竞争失败不写视觉记录', async () => {
  const f = harness()
  f.append.mockResolvedValueOnce('not_found')
  expect(await f.run({ transactionContext: true }, input)).toEqual({ status: 'not_found' })
  expect(f.appendVisual).not.toHaveBeenCalled()
})
test.each(['visual_write', 'snapshot_read', 'visual_read'])(
  '写后%s失败抛错供原事务回滚',
  async issue => {
    const f = harness()
    if (issue === 'visual_write') {
      f.appendVisual.mockResolvedValueOnce('not_found')
    }
    if (issue === 'snapshot_read') {
      f.read.mockResolvedValueOnce({ status: 'not_found' } as any)
    }
    if (issue === 'visual_read') {
      f.readVisual.mockResolvedValueOnce({ status: 'invalid' } as any)
    }
    await expect(f.run({ transactionContext: true }, input)).rejects.toThrow()
  }
)
test('同摘要但快照正文被改也拒绝', async () => {
  const f = harness()
  f.read.mockImplementationOnce(async () => {
    const v = structuredClone(f.append.mock.calls[0]![1].snapshot)
    v.snapshot.packageQuestions[0].text = '篡改'
    return { status: 'found', snapshot: v }
  })
  await expect(f.run({ transactionContext: true }, input)).rejects.toThrow()
})
test.each([NaN, -1, 1.5])('非法时间不访问准备或发布：%s', async startedAtMs => {
  const f = harness()
  await expect(f.run({ transactionContext: true }, { ...input, startedAtMs })).rejects.toThrow()
  expect(f.published).not.toHaveBeenCalled()
})
