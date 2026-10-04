import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import {
  DatabaseCommitResultUnknownError,
  type TransactionExecutionContext
} from '../../src/foundation/database/transaction-runner.js'
import type { CreateFixedQuestionSessionInput } from '../../src/diagnosis/application/create-fixed-question-session.js'
import {
  createIdempotentDiagnosisCreationService,
  calculateDiagnosisCreationRequestHash
} from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import { projectDiagnosisCreationResponse } from '../../src/diagnosis/http/create-session-contract.js'

/** unit_fake / L3：真实V1题目制品；事务、身份和账本替身，不证明MySQL或正式发布。 */
const raw = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const snapshot = lockQuestionPackageSnapshot({
  questionPackageReleaseRef: 'bpr_question123',
  mode: 'yellow_leaf',
  questionCount: 4,
  packageQuestions: raw.fixed.yellow_leaf
})
const created = { status: 'created' as const, diagnosisRef: 'dia_example123', snapshot }
function harness() {
  const command = {
    userRef: 'usr_owner123',
    userPlantRef: 'upl_owner123',
    mode: 'yellow_leaf' as const,
    startedAtMs: 1000
  }
  const input = {
    ...command,
    idempotency: {
      principalType: 'user' as const,
      principalScopeHash: createHash('sha256').update(command.userRef).digest('hex'),
      httpMethod: 'POST',
      normalizedPath: '/api/v2/diagnosis/sessions',
      operationId: 'createDiagnosisSession',
      idempotencyKeyHash: 'a'.repeat(64),
      requestHash: calculateDiagnosisCreationRequestHash(command),
      createdAtMs: 1000,
      expiresAtMs: 2000
    }
  }
  const tx = { transactionContext: true as const }
  const response = projectDiagnosisCreationResponse(created)
  const driver = {
    beginTransaction: vi.fn(async () => tx),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
    recordRollbackFailure: vi.fn()
  }
  const ledger = {
    read: vi.fn(),
    tryReserve: vi.fn(async () => ({ kind: 'reserved' as const })),
    completionFirstResult: vi.fn(async () => ({ kind: 'completed' as const, response }))
  }
  const readOnly = {
    read: vi.fn(async () => ({
      state: 'completed' as const,
      requestHash: input.idempotency.requestHash,
      response
    }))
  }
  const work = vi.fn(
    async (_tx: TransactionExecutionContext, _input: CreateFixedQuestionSessionInput) => created
  )
  const project = vi.fn(projectDiagnosisCreationResponse)
  const run = createIdempotentDiagnosisCreationService({
    driver,
    idempotencyRepository: ledger,
    commitUnknownRepository: readOnly,
    createInTransaction: work,
    projectPublicResponse: project
  })
  return { input, tx, response, driver, ledger, readOnly, work, project, run }
}
describe('固定会话创建共享幂等', () => {
  test('创建和首次题目响应在同一事务保存', async () => {
    const f = harness()
    expect(await f.run(f.input)).toEqual(f.response)
    expect(f.work.mock.calls[0]![0]).toBe(f.tx)
    expect(f.ledger.completionFirstResult).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ response: f.response })
    )
    expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
  })
  test('同键重放不再生成会话，也不重新投影当前题目', async () => {
    const f = harness()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind: 'replay', response: f.response } as never)
    expect(await f.run(f.input)).toEqual(f.response)
    expect(f.work).not.toHaveBeenCalled()
    expect(f.project).not.toHaveBeenCalled()
  })
  test.each(['conflict', 'wait_for_winner'])('%s不能再次创建', async kind => {
    const f = harness()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind } as never)
    expect((await f.run(f.input)).status).toBe(kind === 'conflict' ? 409 : 503)
    expect(f.work).not.toHaveBeenCalled()
  })
  test('提交确认丢失后只读首次响应，不自动重跑创建', async () => {
    const f = harness()
    f.driver.commitTransaction.mockRejectedValueOnce(
      new DatabaseCommitResultUnknownError('丢失确认')
    )
    expect(await f.run(f.input)).toEqual(f.response)
    expect(f.work).toHaveBeenCalledTimes(1)
    expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
  test('首次响应保存失败回滚，错误原文不公开', async () => {
    const f = harness()
    f.ledger.completionFirstResult.mockRejectedValueOnce(new Error('secret-password'))
    const result = await f.run(f.input)
    expect(result.status).toBe(503)
    expect(JSON.stringify(result)).not.toContain('secret-password')
    expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  })
  test('跨操作或伪造主体摘要在事务前拒绝', async () => {
    const f = harness()
    await expect(
      f.run({
        ...f.input,
        idempotency: { ...f.input.idempotency, operationId: 'answerDiagnosisQuestion' }
      })
    ).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test('公开题目只保留显示和作答字段，内部元数据仍在原快照', () => {
    const result = projectDiagnosisCreationResponse(created)
    expect(result.status).toBe(200)
    const data = (result.body as { data: any }).data
    expect(data.questionPackage.questionCount).toBe(4)
    expect(Object.keys(data).sort()).toEqual(['diagnosisSessionRef', 'mode', 'questionPackage'])
    const first = data.questionPackage.questions[0]
    expect(first.text).toBe(raw.fixed.yellow_leaf[0].text)
    expect(first.inputKind).toBe('care_behavior_timeline')
    expect(first).not.toHaveProperty('routeKey')
    expect(first).not.toHaveProperty('outcomeKey')
    expect(JSON.stringify(result.body)).not.toContain('bpr_question123')
    expect(snapshot.snapshot.packageQuestions[0]).toHaveProperty('routeKey')
  })
  test('显示内容缺失时拒绝公开，而不是返回半题包', () => {
    const bad = structuredClone(created)
    Object.assign(bad.snapshot.snapshot.packageQuestions[0]!, { text: null })
    expect(() => projectDiagnosisCreationResponse(bad)).toThrow()
  })
})
