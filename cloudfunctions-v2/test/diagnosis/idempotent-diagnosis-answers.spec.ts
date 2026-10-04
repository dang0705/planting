import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import type { SubmitDiagnosisAnswersInput } from '../../src/diagnosis/application/submit-diagnosis-answers.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import {
  createIdempotentDiagnosisAnswerService,
  calculateDiagnosisAnswerRequestHash
} from '../../src/diagnosis/application/idempotent-diagnosis-answers.js'
import type { HttpIdempotencyReservationInput } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'

// L1 unit_fake：Expected来自共享幂等协议、未知提交合同和本轮answer-idempotency-contract.md。
// SQL、事务驱动与响应投影使用替身；最小响应为协议测试制品，非正式诊断HTTP响应。
const response = { status: 200, body: { data: { answersAccepted: true } } }
function fixture() {
  const inputBase = {
    userRef: 'usr-owner',
    userPlantRef: 'upl-owner',
    diagnosisRef: 'diag-owner',
    occurredAtMs: 1000,
    submitted: { requestMode: 'answer_submit', answers: [] }
  }
  const idempotency: HttpIdempotencyReservationInput = {
    principalType: 'user',
    principalScopeHash: createHash('sha256').update(inputBase.userRef).digest('hex'),
    httpMethod: 'POST',
    normalizedPath: '/api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers',
    operationId: 'answerDiagnosisQuestion',
    idempotencyKeyHash: 'a'.repeat(64),
    requestHash: calculateDiagnosisAnswerRequestHash(inputBase),
    createdAtMs: 1000,
    expiresAtMs: 2000
  }
  const input = { ...inputBase, idempotency }
  const tx = { transactionContext: true as const }
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
  const reconcile = {
    read: vi.fn(async () => ({
      state: 'completed' as const,
      requestHash: idempotency.requestHash,
      response
    }))
  }
  const work = vi.fn(
    async (_tx: TransactionExecutionContext, _input: SubmitDiagnosisAnswersInput) => ({
      status: 'recorded' as const,
      answerCount: 4
    })
  )
  const project = vi.fn(() => response)
  const run = createIdempotentDiagnosisAnswerService({
    driver,
    idempotencyRepository: ledger,
    commitUnknownRepository: reconcile,
    submitInTransaction: work,
    projectPublicResponse: project
  })
  return { input, driver, ledger, reconcile, work, project, run, tx }
}
describe('答案共享幂等应用接线', () => {
  it('首次占位、领域写入与首次响应完成共用一个事务', async () => {
    const f = fixture()
    expect(await f.run(f.input)).toEqual(response)
    expect(f.driver.beginTransaction).toHaveBeenCalledTimes(1)
    expect(f.work.mock.calls[0]![0]).toBe(f.tx)
    expect(f.ledger.completionFirstResult).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ requestHash: f.input.idempotency.requestHash, response })
    )
  })
  it('同键重放不再执行领域或响应投影', async () => {
    const f = fixture()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind: 'replay', response } as never)
    expect(await f.run(f.input)).toEqual(response)
    expect(f.work).not.toHaveBeenCalled()
    expect(f.project).not.toHaveBeenCalled()
  })
  it.each(['conflict', 'wait_for_winner'])('%s拒绝重复业务写入', async kind => {
    const f = fixture()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind } as never)
    expect((await f.run(f.input)).status).toBe(kind === 'conflict' ? 409 : 503)
    expect(f.work).not.toHaveBeenCalled()
  })
  it('COMMIT结果未知且已完成同摘要记录可读回，只执行一次领域', async () => {
    const f = fixture()
    f.driver.commitTransaction.mockRejectedValueOnce(
      new DatabaseCommitResultUnknownError('连接断开')
    )
    expect(await f.run(f.input)).toEqual(response)
    expect(f.work).toHaveBeenCalledTimes(1)
    expect(f.reconcile.read).toHaveBeenCalledTimes(1)
    expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
  it('未知提交未能证明时503，不泄露原始异常，不重写', async () => {
    const f = fixture()
    f.driver.commitTransaction.mockRejectedValueOnce(
      new DatabaseCommitResultUnknownError('敏感数据库地址')
    )
    f.reconcile.read.mockResolvedValueOnce(null as never)
    const result = await f.run(f.input)
    expect(result.status).toBe(503)
    expect(JSON.stringify(result)).not.toContain('敏感')
    expect(f.work).toHaveBeenCalledTimes(1)
    expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
  it('幂等完成失败必须回滚，不能伪报首次响应已保存', async () => {
    const f = fixture()
    f.ledger.completionFirstResult.mockResolvedValueOnce({ kind: 'conflict' } as never)
    expect((await f.run(f.input)).status).toBe(503)
    expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  })
  it.each(['principalScopeHash', 'requestHash', 'normalizedPath', 'operationId'])(
    '伪造%s在事务前拒绝',
    async key => {
      const f = fixture()
      await expect(
        f.run({ ...f.input, idempotency: { ...f.input.idempotency, [key]: 'forged' } })
      ).rejects.toThrow('答案幂等作用域不匹配')
      expect(f.driver.beginTransaction).not.toHaveBeenCalled()
    }
  )
})
