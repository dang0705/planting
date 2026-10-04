import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { createReadDiagnosisAnswerEvidence } from '../../src/diagnosis/application/read-answer-evidence.js'

/** L3/unit_fake：独立Expected来自保存/读取合同；真实快照、成员、复合证据与摘要检查，只替换事务/SQL，不证明数据库、映射或确诊。 */
const snapshot = lockQuestionPackageSnapshot({
  questionPackageReleaseRef: 'question/v1',
  mode: 'yellow_leaf',
  questionCount: 2,
  packageQuestions: [
    { questionKey: 'q-one', options: [{ optionKey: 'unknown' }] },
    { questionKey: 'q-two', options: [{ optionKey: 'normal' }] }
  ]
})
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
const submissionHash = createHash('sha256')
  .update(
    canonical({
      questionSnapshotSha256: snapshot.snapshotSha256,
      answers: [
        { questionKey: 'q-one', optionKey: 'unknown' },
        { questionKey: 'q-two', optionKey: 'normal' }
      ],
      air: {},
      timeline: null
    })
  )
  .digest('hex')
const input = { userRef: 'usr-owner', userPlantRef: 'upl-owner', diagnosisRef: 'diag-one' }
function fixture() {
  const rows = ['q-one', 'q-two'].map((questionKey, i) => ({
    evidenceRef: `answer-${i}`,
    answeredAtMs: 2000,
    questionKey,
    body: {
      contractVersion: 'diagnosis-answer-evidence/v1',
      questionKey,
      optionKey: i === 0 ? 'unknown' : 'normal',
      questionSnapshotSha256: snapshot.snapshotSha256,
      submissionSha256: submissionHash,
      airEvidence: null,
      timelineEvidence: null
    }
  }))
  const repository = {
    lockOwned: vi.fn(async () => ({
      status: 'found' as const,
      session: { internalId: '1', status: 'active', snapshot }
    })),
    readEvidence: vi.fn(async () => [...rows].reverse())
  }
  const driver = {
    beginTransaction: vi.fn(() => ({ transactionContext: true as const })),
    commitTransaction: vi.fn(() => {}),
    rollbackTransaction: vi.fn(() => {}),
    recordRollbackFailure: vi.fn()
  }
  return {
    rows,
    repository,
    driver,
    run: createReadDiagnosisAnswerEvidence({ repository, driver })
  }
}
test('读取完整答案并按原题包顺序冻结，不覆盖未知答案或把它当成阴性证据', async () => {
  const f = fixture(),
    r = await f.run(input)
  expect(r.status).toBe('evidence_ready')
  if (r.status !== 'evidence_ready') {
    throw new Error('应有完整证据')
  }
  expect(r.submissionSha256).toBe(submissionHash)
  expect(r.questionPackageReleaseRef).toBe('question/v1')
  expect(
    r.answers.map(x => [x.evidenceRef, x.questionKey, x.body.optionKey, x.answeredAtMs])
  ).toEqual([
    ['answer-0', 'q-one', 'unknown', 2000],
    ['answer-1', 'q-two', 'normal', 2000]
  ])
  expect(Object.isFrozen(r.answers[0]?.body)).toBe(true)
  f.rows[0]!.body.optionKey = 'changed'
  expect(r.answers[0]?.body.optionKey).toBe('unknown')
  expect(f.repository.lockOwned).toHaveBeenCalledWith(
    expect.anything(),
    'usr-owner',
    'upl-owner',
    'diag-one'
  )
  expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
})
test('尚未作答与归属/状态不合格分开，禁止读取别人的答案', async () => {
  const empty = fixture()
  empty.repository.readEvidence.mockResolvedValue([])
  expect(await empty.run(input)).toEqual({ status: 'evidence_not_ready' })
  const owner = fixture()
  owner.repository.lockOwned.mockResolvedValue({ status: 'not_found' } as never)
  expect(await owner.run(input)).toEqual({ status: 'not_found' })
  expect(owner.repository.readEvidence).not.toHaveBeenCalled()
  const expired = fixture()
  expired.repository.lockOwned.mockResolvedValue({
    status: 'found',
    session: { internalId: '1', status: 'expired', snapshot }
  })
  expect(await expired.run(input)).toEqual({ status: 'session_not_active' })
  expect(expired.repository.readEvidence).not.toHaveBeenCalled()
})
test('少题、多题、重复题或重复引用拒绝，不补齐半套旧答案', async () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => f.rows.pop(),
    (f: ReturnType<typeof fixture>) => f.rows.push(structuredClone(f.rows[0]!)),
    (f: ReturnType<typeof fixture>) => {
      f.rows[1]!.questionKey = 'q-one'
    },
    (f: ReturnType<typeof fixture>) => {
      f.rows[1]!.evidenceRef = 'answer-0'
    }
  ]) {
    const f = fixture()
    change(f)
    expect(await f.run(input)).toEqual({ status: 'invalid_evidence' })
  }
})
test('正文、题包摘要、提交摘要、内部多余字段和非法时间拒绝', async () => {
  for (const patch of [
    { optionKey: 'invalid' },
    { questionKey: 'other' },
    { questionSnapshotSha256: 'f'.repeat(64) },
    { submissionSha256: 'f'.repeat(64) },
    { extra: true }
  ]) {
    const f = fixture()
    Object.assign(f.rows[0]!.body, patch)
    expect(await f.run(input)).toEqual({ status: 'invalid_evidence' })
  }
  const f = fixture()
  f.rows[0]!.answeredAtMs = -1
  expect(await f.run(input)).toEqual({ status: 'invalid_evidence' })
})
test('数据库失败回滚，不作为空答案或成功读回', async () => {
  const f = fixture()
  f.repository.readEvidence.mockRejectedValue(new Error('SQL failed'))
  await expect(f.run(input)).rejects.toThrow('SQL failed')
  expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  expect(f.driver.commitTransaction).not.toHaveBeenCalled()
})
test('完整空气与行为时间线从原正文读回，仍保持来源未核验与用户申报语义', async () => {
  const f = fixture(),
    compound = lockQuestionPackageSnapshot({
      questionPackageReleaseRef: 'compound/v1',
      mode: 'yellow_leaf',
      questionCount: 2,
      packageQuestions: [
        {
          questionKey: 'air',
          questionType: 'air_environment',
          options: [{ optionKey: 'air_environment_recorded' }]
        },
        {
          questionKey: 'timeline',
          uiVariant: 'care_behavior_timeline',
          options: [{ optionKey: 'unknown' }]
        }
      ]
    })
  const airEvidence = {
    input: {
      schemaVersion: 3,
      mode: 'quick',
      quickAnswer: { questionKey: 'air_exchange_frequency', optionKey: 'rare' },
      advancedInput: null
    },
    declaredSource: 'temporary',
    sourceVerification: 'unverified_client_declaration'
  }
  const timeline = {
    referenceDate: '2026-10-05',
    wateringEvents: [{ date: '2026-10-04', watered: true, amount: null, amountMl: null }],
    fertilizingEvents: [],
    lightChangeEvents: [],
    dailyRecords: [],
    lastFertilizedBucket: 'unknown'
  }
  const answers = [
    { questionKey: 'air', optionKey: 'air_environment_recorded' },
    { questionKey: 'timeline', optionKey: 'care_behavior_timeline' }
  ]
  const sha = createHash('sha256')
    .update(
      canonical({
        questionSnapshotSha256: compound.snapshotSha256,
        answers,
        air: { air: airEvidence },
        timeline
      })
    )
    .digest('hex')
  f.repository.lockOwned.mockResolvedValue({
    status: 'found',
    session: { internalId: '1', status: 'completed', snapshot: compound }
  })
  f.repository.readEvidence.mockResolvedValue(
    answers.map((answer, i) => ({
      questionKey: answer.questionKey,
      evidenceRef: `compound-${i}`,
      answeredAtMs: 2000,
      body: {
        contractVersion: 'diagnosis-answer-evidence/v1',
        ...answer,
        questionSnapshotSha256: compound.snapshotSha256,
        submissionSha256: sha,
        airEvidence: i === 0 ? airEvidence : null,
        timelineEvidence: i === 1 ? timeline : null
      }
    })) as never
  )
  const r = await f.run(input)
  if (r.status !== 'evidence_ready') {
    throw new Error('完整复合证据应可读')
  }
  expect(r.answers[0]?.body.airEvidence).toEqual(airEvidence)
  expect(r.answers[1]?.body.timelineEvidence).toEqual(timeline)
  expect(r.submissionSha256).toBe(sha)
  expect(r).not.toHaveProperty('careFact')
})
