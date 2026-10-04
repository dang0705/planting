import { expect, test, vi } from 'vitest'
import { createAuthenticatedEphemeralBindingApplicationService } from '../../src/user-plant/application/bind-authenticated-ephemeral-case.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import type { PrincipalDto } from '../../src/contracts/types.js'
import type { AuthenticatedEphemeralBindingResult } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-binding-repository.js'

// L1/unit_fake。Expected为绑定应用事务合同；真实应用/事务驱动，替换Repository和新连接读端口。
const principal = { principalType: 'user', user_id: 'usr_binding_owner001', credentialRef: 'cred_valid_fixture', issuedAt: '1970-01-01T00:00:01.000Z', expiresAt: '1970-01-01T00:00:10.000Z' } as unknown as PrincipalDto
const command = { ephemeralCaseRef: 'epc_binding_case001', targetUserPlantRef: 'upl_binding_target001', promotionRef: 'prm_binding_command001', idempotencyKeyHash: 'b'.repeat(64), occurredAtMs: 2000 }
const bound = { status: 'bound' as const, promotionRef: command.promotionRef, userPlantRef: command.targetUserPlantRef, boundAtMs: 2000 }
function fixture() {
  const tx = { transactionContext: true as const }
  const driver = { beginTransaction: vi.fn(async () => tx), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined), recordRollbackFailure: vi.fn() }
  const bindExisting = vi.fn(async (_tx: unknown, _input: unknown): Promise<AuthenticatedEphemeralBindingResult> => bound)
  const readCompleted = vi.fn(async (_input: unknown): Promise<AuthenticatedEphemeralBindingResult | null> => null)
  const service = createAuthenticatedEphemeralBindingApplicationService({ driver, repository: { bindExisting }, commitUnknownReadOnlyRepository: { readCompleted } })
  return { tx, driver, bindExisting, readCompleted, service }
}
test('统一用户只来自主体，同一事务绑定并提交', async () => {
  const f = fixture(); expect(await f.service({ principal, command })).toEqual(bound)
  expect(f.bindExisting).toHaveBeenCalledWith(f.tx, { ...command, userRef: 'usr_binding_owner001' }); expect(f.driver.commitTransaction).toHaveBeenCalledOnce()
})
test.each([{ ...principal, principalType: 'guest' }, { ...principal, expiresAt: '1970-01-01T00:00:02.000Z' }, { ...principal, expiresAt: 'bad' }])('非法或已过期主体不能开始事务', async value => {
  const f = fixture(); expect(await f.service({ principal: value as PrincipalDto, command })).toEqual({ status: 'principal_invalid' }); expect(f.driver.beginTransaction).not.toHaveBeenCalled()
})
test('命令自报归属不接受，即使与主体相同', async () => {
  const f = fixture(); await expect(f.service({ principal, command: { ...command, userRef: 'usr_binding_owner001' } as never })).rejects.toThrow(); expect(f.driver.beginTransaction).not.toHaveBeenCalled()
})
test('输入在await前固定，不因调用方变更绑定他人目标', async () => {
  const f = fixture(); const mutable = { ...command }; const promise = f.service({ principal, command: mutable }); mutable.targetUserPlantRef = 'upl_changed_target001'
  expect(await promise).toEqual(bound); expect(f.bindExisting).toHaveBeenCalledWith(f.tx, expect.objectContaining({ targetUserPlantRef: command.targetUserPlantRef }))
})
test.each(['not_found', 'expired', 'already_bound', 'idempotency_conflict'] as const)('确定拒绝%s不变成成功', async status => {
  const f = fixture(); f.bindExisting.mockResolvedValue({ status }); expect(await f.service({ principal, command })).toEqual({ status })
})
test('存储不可用回滚，禁止提交', async () => {
  const f = fixture(); f.bindExisting.mockResolvedValue({ status: 'unavailable' }); expect(await f.service({ principal, command })).toEqual({ status: 'unavailable' }); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled()
})
test.each([{ ...bound, secret: '内部数据' }, { ...bound, userPlantRef: 'upl_other_target001' }, { ...bound, boundAtMs: 2001 }])('损坏成功结果不能提交或透传', async value => {
  const f = fixture(); f.bindExisting.mockResolvedValue(value); await expect(f.service({ principal, command })).rejects.toThrow(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled()
})
test('SQL异常保留且整体回滚，不自动重试', async () => {
  const f = fixture(); f.bindExisting.mockRejectedValue(new Error('写入失败')); await expect(f.service({ principal, command })).rejects.toThrow('写入失败'); expect(f.bindExisting).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
})
test('提交未知只读原收据，不重绑定或回滚', async () => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('未知')); f.readCompleted.mockResolvedValue(bound)
  expect(await f.service({ principal, command })).toEqual(bound); expect(f.bindExisting).toHaveBeenCalledOnce(); expect(f.readCompleted).toHaveBeenCalledWith({ ...command, userRef: 'usr_binding_owner001' }); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test.each(['missing', 'error', 'wrong_target', 'extra'] as const)('提交未知%s收据不可用，零重试', async kind => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('未知'))
  if (kind === 'error') { f.readCompleted.mockRejectedValue(new Error('只读失败')) } else if (kind === 'wrong_target') { f.readCompleted.mockResolvedValue({ ...bound, userPlantRef: 'upl_other_target001' }) } else if (kind === 'extra') { f.readCompleted.mockResolvedValue({ ...bound, secret: '不可透传' } as never) }
  expect(await f.service({ principal, command })).toEqual({ status: 'unavailable' }); expect(f.bindExisting).toHaveBeenCalledOnce(); expect(f.readCompleted).toHaveBeenCalledOnce()
})
