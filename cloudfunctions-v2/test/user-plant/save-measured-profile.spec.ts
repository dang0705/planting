import { expect, test, vi } from 'vitest'
import { createMeasuredProfileApplicationService } from '../../src/user-plant/application/save-measured-profile.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyStoredRecord } from '../../src/foundation/idempotency/http-idempotency.js'

/** L1/unit_fake：Expected来自统一计划同事务幂等规则及measured-profile-application-contract。
 * 实际应用编排/输入校验/事务驱动与对账函数；替换SQL存储和连接，不证明MySQL或HTTP。 */
const measuredPot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 12 }
const command = { userRef: 'usr_profile_owner01', userPlantRef: 'upl_profile_save001', expectedVersion: 1, nickname: '小青', measuredPot, profileVersion: 'profile/v1', occurredAtMs: 3000 }
const idempotency = { principalType: 'user' as const, principalScopeHash: 'a'.repeat(64), httpMethod: 'PATCH', normalizedPath: '/api/v2/user-plants/{userPlantRef}', operationId: 'updateUserPlant', idempotencyKeyHash: 'b'.repeat(64), requestHash: 'c'.repeat(64), createdAtMs: 3000, expiresAtMs: 6000 }
const response = { status: 200, body: { data: { userPlantRef: 'upl_profile_save001', version: 2, nickname: '小青', measuredPot } } }
function fixture() {
  const tx = { transactionContext: true as const }
  const driver = { beginTransaction: vi.fn(async () => tx), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined), recordRollbackFailure: vi.fn() }
  const save = vi.fn(async (_tx: unknown, _command: unknown) => ({ status: 'saved' as const, ...response.body.data }))
  const reserve = vi.fn(async (): Promise<any> => ({ kind: 'reserved' }))
  const complete = vi.fn(async (_tx: unknown, value: any): Promise<any> => ({ kind: 'completed', response: value.response }))
  const read = vi.fn(async (): Promise<HttpIdempotencyStoredRecord | null> => null)
  const service = createMeasuredProfileApplicationService({ driver, profileRepository: { save }, idempotencyRepository: { read: vi.fn(), tryReserve: reserve, completionFirstResult: complete }, commitUnknownReadOnlyRepository: { read } })
  return { service, tx, driver, save, reserve, complete, read }
}
test('首次保存和完成收据共享事务，成功只含允许字段', async () => {
  const f = fixture(); expect(await f.service({ command, idempotency })).toEqual(response)
  expect(f.save).toHaveBeenCalledWith(f.tx, command)
  expect(f.complete).toHaveBeenCalledWith(f.tx, expect.objectContaining({ response, requestHash: idempotency.requestHash, completedAtMs: 3000 }))
  expect(f.driver.commitTransaction).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('相同请求重放首次结果，不重新保存', async () => {
  const f = fixture(); f.reserve.mockResolvedValue({ kind: 'replay', response })
  expect(await f.service({ command, idempotency })).toEqual(response); expect(f.save).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
})
test.each(['conflict', 'wait_for_winner'])('幂等%s不能进入档案写入', async kind => {
  const f = fixture(); f.reserve.mockResolvedValue({ kind, httpStatus: 409, errorType: 'IDEMPOTENCY_CONFLICT' })
  expect((await f.service({ command, idempotency })).status).toBe(kind === 'conflict' ? 409 : 503); expect(f.save).not.toHaveBeenCalled()
})
test.each([['not_found', 404], ['version_conflict', 409]] as const)('确定拒绝%s可重放且不误报成功', async (status, code) => {
  const f = fixture(); f.save.mockResolvedValue({ status } as any)
  const result = await f.service({ command, idempotency }); expect(result.status).toBe(code); expect(f.complete).toHaveBeenCalledWith(f.tx, expect.objectContaining({ response: result }))
})
test('完成收据失败和存储不可用均回滚，不提交半成品', async () => {
  for (const failure of ['receipt', 'storage']) {
    const f = fixture(); if (failure === 'receipt') { f.complete.mockResolvedValue({ kind: 'wait_for_winner' }) } else { f.save.mockResolvedValue({ status: 'unavailable' } as any) }
    await expect(f.service({ command, idempotency })).rejects.toThrow(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled()
  }
})
test('提交未知只读返回已提交收据，不重新写入或回滚', async () => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('受控未知提交'))
  f.read.mockResolvedValue({ state: 'completed', requestHash: idempotency.requestHash, response } as HttpIdempotencyStoredRecord)
  expect(await f.service({ command, idempotency })).toEqual(response); expect(f.save).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('未知提交缺收据或读取失败均503，不猜未提交并重跑', async () => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('受控未知提交'))
  expect((await f.service({ command, idempotency })).status).toBe(503); expect(f.save).toHaveBeenCalledOnce()
  f.read.mockRejectedValue(new Error('受限SQL')); expect((await f.service({ command, idempotency })).status).toBe(503)
})
test('异步占位期间修改调用者对象不改变保存事实，非法输入在事务前拒绝', async () => {
  const f = fixture(), value = structuredClone(command)
  f.reserve.mockImplementation(async () => { value.nickname = '被更改'; value.measuredPot.potHeightCm = 99; return { kind: 'reserved' } })
  expect(await f.service({ command: value, idempotency })).toEqual(response); expect(f.save.mock.calls[0]?.[1]).toEqual(command)
  const g = fixture(); await expect(g.service({ command: { ...command, nickname: 'a'.repeat(81) }, idempotency })).rejects.toThrow(); expect(g.driver.beginTransaction).not.toHaveBeenCalled()
})
