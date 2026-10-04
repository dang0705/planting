import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import {
  calculatePestDiagnosisCreationRequestHash,
  createIdempotentPestDiagnosisCreationService
} from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'

/** unit_fake / L3。来源：pest-creation-idempotency-contract.md与已批准共享幂等规则。
 * 真实经过创建事务编排和摘要；数据库、原子创建与公开投影使用替身，不证明真实SQL/HTTP/Provider。
 */
const command = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  mode: 'pest' as const,
  assetRef: 'upa_owner123',
  startedAtMs: 1000
}
// Expected独立列明客户端正文，按规范JSON键顺序计算，不调用被测摘要函数。
const requestHash = createHash('sha256')
  .update(
    JSON.stringify({
      assetRef: 'upa_owner123',
      mode: 'pest',
      userPlantRef: 'upl_owner123',
      userRef: 'usr_owner123'
    })
  )
  .digest('hex')
const response = {
  status: 503,
  body: { error: { type: 'SERVICE_UNAVAILABLE', message: '题包暂时不可用' } }
}
function harness() {
  const input = {
    ...command,
    idempotency: {
      principalType: 'user' as const,
      principalScopeHash: createHash('sha256').update(command.userRef).digest('hex'),
      httpMethod: 'POST',
      normalizedPath: '/api/v2/diagnosis/sessions',
      operationId: 'createDiagnosisSession',
      idempotencyKeyHash: 'a'.repeat(64),
      requestHash,
      createdAtMs: 1000,
      expiresAtMs: 2000
    }
  }
  const tx = { transactionContext: true as const }
  const driver = {
    beginTransaction: vi.fn(async () => tx),
    commitTransaction: vi.fn(async () => {}),
    rollbackTransaction: vi.fn(async () => {}),
    recordRollbackFailure: vi.fn()
  }
  const ledger = {
    read: vi.fn(),
    tryReserve: vi.fn(async () => ({ kind: 'reserved' as const })),
    completionFirstResult: vi.fn(async () => ({ kind: 'completed' as const, response }))
  }
  const readOnly = {
    read: vi.fn(async () => ({ state: 'completed' as const, requestHash, response }))
  }
  const work = vi.fn(async () => ({ status: 'unavailable' as const }))
  const project = vi.fn(() => response)
  const run = createIdempotentPestDiagnosisCreationService({
    driver,
    idempotencyRepository: ledger,
    commitUnknownRepository: readOnly,
    createInTransaction: work,
    projectPublicResponse: project
  })
  return { input, tx, driver, ledger, readOnly, work, project, run }
}
describe('虫害原子创建共享幂等', () => {
  test('资产进入摘要，时间不进入摘要', () => {
    expect(calculatePestDiagnosisCreationRequestHash(command)).toBe(requestHash)
    expect(calculatePestDiagnosisCreationRequestHash({ ...command, startedAtMs: 2000 })).toBe(
      requestHash
    )
    expect(
      calculatePestDiagnosisCreationRequestHash({ ...command, assetRef: 'upa_other123' })
    ).not.toBe(requestHash)
  })
  test('已有原子创建用例与首次响应使用同一事务', async () => {
    const f = harness()
    expect(await f.run(f.input)).toEqual(response)
    expect(f.work).toHaveBeenCalledWith(f.tx, expect.objectContaining(command))
    expect(f.ledger.completionFirstResult).toHaveBeenCalledWith(
      f.tx,
      expect.objectContaining({ response })
    )
    expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
  })
  test('重放不执行创建、分析或重新投影', async () => {
    const f = harness()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind: 'replay', response } as never)
    expect(await f.run(f.input)).toEqual(response)
    expect(f.work).not.toHaveBeenCalled()
    expect(f.project).not.toHaveBeenCalled()
  })
  test.each(['conflict', 'wait_for_winner'])('%s不执行原子创建', async kind => {
    const f = harness()
    f.ledger.tryReserve.mockResolvedValueOnce({ kind } as never)
    expect((await f.run(f.input)).status).toBe(kind === 'conflict' ? 409 : 503)
    expect(f.work).not.toHaveBeenCalled()
  })
  test('同键换图但沿用旧正文摘要在事务前拒绝', async () => {
    const f = harness()
    await expect(f.run({ ...f.input, assetRef: 'upa_other123' })).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test.each([
    { principalScopeHash: 'f'.repeat(64) },
    { operationId: 'answerDiagnosisQuestion' },
    { normalizedPath: '/api/v2/other' },
    { httpMethod: 'GET' },
    { principalType: 'guest' }
  ])('非法幂等作用域拒绝：%j', async patch => {
    const f = harness()
    await expect(
      f.run({ ...f.input, idempotency: { ...f.input.idempotency, ...patch } } as never)
    ).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test.each([-1, NaN, Infinity, 1.5])('非法服务端时间%s不开始事务', async startedAtMs => {
    const f = harness()
    await expect(f.run({ ...f.input, startedAtMs })).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test('固定症状不能进入虫害工厂', async () => {
    const f = harness()
    await expect(f.run({ ...f.input, mode: 'yellow_leaf' } as never)).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test.each(['', ' ', null])('非法资产引用%j拒绝', async assetRef => {
    const f = harness()
    await expect(f.run({ ...f.input, assetRef } as never)).rejects.toThrow()
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
  test('响应保存失败回滚且不公开错误原文', async () => {
    const f = harness()
    f.ledger.completionFirstResult.mockRejectedValueOnce(new Error('private-secret'))
    const result = await f.run(f.input)
    expect(result.status).toBe(503)
    expect(JSON.stringify(result)).not.toContain('private-secret')
    expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  })
  test('未知提交仅只读对账，不自动重跑或回滚', async () => {
    const f = harness()
    f.driver.commitTransaction.mockRejectedValueOnce(
      new DatabaseCommitResultUnknownError('确认丢失')
    )
    expect(await f.run(f.input)).toEqual(response)
    expect(f.work).toHaveBeenCalledTimes(1)
    expect(f.readOnly.read).toHaveBeenCalledTimes(1)
    expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
})
