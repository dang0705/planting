import { expect, test, vi } from 'vitest'
import { createAuthenticatedEphemeralNewPlantApplicationService } from '../../src/user-plant/application/save-authenticated-ephemeral-as-new-plant.js'
import type { UserPrincipalDto, UserRef, UserCapabilitySnapshotDto } from '../../src/contracts/types.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import type { AuthenticatedEphemeralNewPlantResult } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-new-plant-repository.js'

/** L1/unit_fake；独立Expected为显式新建事务合同。真实应用/事务驱动，替换Repository；真实SQL另验。 */
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_binding_owner001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:10Z' }
const snapshot: UserCapabilitySnapshotDto = { contractVersion: 'capability-snapshot/v1', snapshotRef: 'cps_binding_fixture001', subjectType: 'user', user_id: principal.user_id, tier: 'free', allowedCapabilities: ['USER_PLANT_CREATE'], rewardedAiScopes: [], activeUserPlantLimit: 2, generatedAt: '1970-01-01T00:00:01Z', validUntil: '1970-01-01T00:00:05Z', policyVersion: 'fixture/v1' }
const input = () => ({ principal: { ...principal }, capabilitySnapshot: { ...snapshot, allowedCapabilities: [...snapshot.allowedCapabilities] }, ephemeralCaseRef: 'epc_binding_case001', newUserPlantRef: 'upl_binding_created001', promotionRef: 'prm_binding_command001', idempotencyKeyHash: 'a'.repeat(64), occurredAtMs: 2000 })
const bound = { status: 'bound' as const, promotionRef: 'prm_original_command001', userPlantRef: 'upl_original_created001', boundAtMs: 1500 }
function fixture() {
  const tx = { transactionContext: true as const }
  const driver = { beginTransaction: vi.fn(async () => tx), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined), recordRollbackFailure: vi.fn() }
  const saveNew = vi.fn(async (_tx: unknown, _input: unknown) => bound as { status: string; promotionRef?: string; userPlantRef?: string; boundAtMs?: number })
  const readCompleted = vi.fn(async (_input: unknown): Promise<AuthenticatedEphemeralNewPlantResult | null> => null)
  return { driver, saveNew, readCompleted, service: createAuthenticatedEphemeralNewPlantApplicationService({ driver, repository: { saveNew: saveNew as never }, commitUnknownReader: { readCompleted } }) }
}
test('复用同事务，重放可返回原引用而非本次候选引用', async () => {
  const f = fixture(); expect(await f.service(input())).toEqual(bound); expect(f.saveNew).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).toHaveBeenCalledOnce()
})
test.each(['expired_principal', 'extra', 'bad_ref', 'unsafe_time', 'unsafe_limit'] as const)('非法内部输入%s不启动事务', async kind => {
  const f = fixture(), value = input()
  if (kind === 'expired_principal') { value.principal.expiresAt = '1970-01-01T00:00:02Z' } else if (kind === 'extra') { Object.assign(value, { userRef: 'usr_other001' }) } else if (kind === 'bad_ref') { value.newUserPlantRef = 'wrong_target001' } else if (kind === 'unsafe_limit') { value.capabilitySnapshot.activeUserPlantLimit = Number.MAX_SAFE_INTEGER + 1 } else { value.occurredAtMs = Number.MAX_SAFE_INTEGER }
  await expect(f.service(value)).rejects.toThrow(); expect(f.driver.beginTransaction).not.toHaveBeenCalled()
})
test('等待事务时原数组和引用修改不改变固定输入', async () => {
  const f = fixture(); let release!: () => void
  f.driver.beginTransaction.mockImplementation(async () => { await new Promise<void>(r => { release = r }); return { transactionContext: true } })
  const value = input(), work = f.service(value); value.newUserPlantRef = 'upl_mutated_created001'; value.capabilitySnapshot.allowedCapabilities.length = 0; release()
  await work; expect(f.saveNew.mock.calls[0]?.[1]).toMatchObject({ newUserPlantRef: 'upl_binding_created001', capabilitySnapshot: { allowedCapabilities: ['USER_PLANT_CREATE'] } })
})
test.each(['capability_denied', 'capability_snapshot_expired', 'expired', 'already_bound', 'not_found', 'idempotency_conflict'] as const)('确定拒绝%s不变成成功', async status => {
  const f = fixture(); f.saveNew.mockResolvedValue({ status }); expect(await f.service(input())).toEqual({ status })
})
test('unavailable整事务回滚，不能提交部分创建', async () => {
  const f = fixture(); f.saveNew.mockResolvedValue({ status: 'unavailable' }); expect(await f.service(input())).toEqual({ status: 'unavailable' }); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled()
})
test('受限结果拒绝并回滚，不泄露内部字段', async () => {
  const f = fixture(); f.saveNew.mockResolvedValue({ ...bound, internalId: 1 } as never); await expect(f.service(input())).rejects.toThrow(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
})
test.each(['bound', 'missing', 'conflict', 'error', 'restricted'] as const)('提交未知%s只读核对一次且不重建', async kind => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('unknown'))
  if (kind === 'bound') { f.readCompleted.mockResolvedValue(bound) } else if (kind === 'conflict') { f.readCompleted.mockResolvedValue({ status: 'idempotency_conflict' }) } else if (kind === 'error') { f.readCompleted.mockRejectedValue(new Error('restricted detail')) } else if (kind === 'restricted') { f.readCompleted.mockResolvedValue({ ...bound, secret: 'restricted' } as never) }
  expect(await f.service(input())).toEqual(kind === 'bound' ? bound : kind === 'conflict' ? { status: 'idempotency_conflict' } : { status: 'unavailable' })
  expect(f.saveNew).toHaveBeenCalledOnce(); expect(f.readCompleted).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
