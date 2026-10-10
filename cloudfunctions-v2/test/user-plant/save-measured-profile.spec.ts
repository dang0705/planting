import { expect, test, vi } from 'vitest'
import { createMeasuredProfileApplicationService } from '../../src/user-plant/application/save-measured-profile.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import type { HttpIdempotencyStoredRecord } from '../../src/foundation/idempotency/http-idempotency.js'

/** L1/unit_fake：Expected来自统一计划同事务幂等规则及measured-profile-application-contract。
 * 实际应用编排/输入校验/事务驱动与对账函数；替换SQL存储和连接，不证明MySQL或HTTP。 */
const measuredPot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 12 }
const command = { userRef: 'usr_profile_owner01', userPlantRef: 'upl_profile_save001', expectedVersion: 1, nickname: '小青', measuredPot, profileVersion: 'profile/v1', occurredAtMs: 3000 }
const idempotency = { principalType: 'user' as const, principalScopeHash: 'a'.repeat(64), httpMethod: 'PATCH', normalizedPath: '/api/v2/user-plants/{userPlantRef}', operationId: 'updateUserPlant', idempotencyKeyHash: 'b'.repeat(64), requestHash: 'c'.repeat(64), createdAtMs: 3000, expiresAtMs: 6000 }
const fullPlant = { user_plant_id: 'upl_profile_save001', lifecycle: 'active', identityStatus: 'unidentified', version: 2, createdAt: '1970-01-01T00:00:01.000Z', updatedAt: '1970-01-01T00:00:03.000Z', profile: { nickname: '小青', measuredPot } }
const response = { status: 200, body: { data: fullPlant } }
/** 已发布 user-plant-profile/v1 完整度策略（与配置目录 confirmed 值一致）。 */
const profilePolicy = { profileVersion: 'user-plant-profile/v1', requiredFields: ['identityStatus', 'pot', 'location', 'lightingEnvironment', 'ventilationEnvironment'], acceptedIdentityStates: ['unidentified', 'candidate_pending', 'confirmed'], rewardOncePerUser: true }
function fixture() {
  const tx = { transactionContext: true as const }
  const driver = { beginTransaction: vi.fn(async () => tx), commitTransaction: vi.fn(async () => undefined), rollbackTransaction: vi.fn(async () => undefined), recordRollbackFailure: vi.fn() }
  const save = vi.fn(async (_tx: unknown, _command: unknown) => ({ status: 'saved' as const, userPlantRef: 'upl_profile_save001', version: 2, nickname: '小青', measuredPot }))
  const reserve = vi.fn(async (): Promise<any> => ({ kind: 'reserved' }))
  const complete = vi.fn(async (_tx: unknown, value: any): Promise<any> => ({ kind: 'completed', response: value.response }))
  const read = vi.fn(async (): Promise<HttpIdempotencyStoredRecord | null> => null)
  const getOwnedUserPlant = vi.fn(async (): Promise<any> => fullPlant)
  const saveCareContext = vi.fn(async (): Promise<Record<string, unknown>> => ({}))
  const readCompletenessEvidence = vi.fn(async () => ({ identityStatus: 'unidentified', profileCompletedAtMs: null as number | null, userPreviouslyCompletedProfile: false }))
  const markProfileCompleted = vi.fn(async () => undefined)
  const insertPending = vi.fn(async () => undefined)
  const service = createMeasuredProfileApplicationService({ driver, profileRepository: { save }, userPlantRepository: { getOwnedUserPlant }, idempotencyRepository: { read: vi.fn(), tryReserve: reserve, completionFirstResult: complete }, commitUnknownReadOnlyRepository: { read },
    environmentRepository: { saveCareContext, readCompletenessEvidence, markProfileCompleted }, outboxRepository: { insertPending }, createEventRef: () => 'evt_fixture_event_0001' })
  return { service, tx, driver, save, reserve, complete, read, getOwnedUserPlant, saveCareContext, readCompletenessEvidence, markProfileCompleted, insertPending }
}
test('成功收据必须为同事务完整公开读回，禁止内部保存子集', async () => {
  const f = fixture()
  expect(await f.service({ command, idempotency, environment: {}, profilePolicy })).toEqual({ status: 200, body: { data: fullPlant } })
  expect(f.getOwnedUserPlant).toHaveBeenCalledWith(f.tx, command.userRef, command.userPlantRef)
})
test.each([{ version: 9 }, { user_plant_id: 'upl_other_owner01' }, { secret: 'SQL受限原文' }, { profile: { nickname: '不一致' } }])('完整读回不匹配或含受限字段时回滚：%j', async extra => {
  const f = fixture(); f.getOwnedUserPlant.mockResolvedValue({ ...fullPlant, ...extra })
  await expect(f.service({ command, idempotency, environment: {}, profilePolicy })).rejects.toThrow()
  expect(f.complete).not.toHaveBeenCalled(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce()
})
test('首次保存和完成收据共享事务，成功只含允许字段', async () => {
  const f = fixture(); expect(await f.service({ command, idempotency, environment: {}, profilePolicy })).toEqual(response)
  expect(f.save).toHaveBeenCalledWith(f.tx, command)
  expect(f.complete).toHaveBeenCalledWith(f.tx, expect.objectContaining({ response, requestHash: idempotency.requestHash, completedAtMs: 3000 }))
  expect(f.driver.commitTransaction).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('相同请求重放首次结果，不重新保存', async () => {
  const f = fixture(); f.reserve.mockResolvedValue({ kind: 'replay', response })
  expect(await f.service({ command, idempotency, environment: {}, profilePolicy })).toEqual(response); expect(f.save).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
})
test.each(['conflict', 'wait_for_winner'])('幂等%s不能进入档案写入', async kind => {
  const f = fixture(); f.reserve.mockResolvedValue({ kind, httpStatus: 409, errorType: 'IDEMPOTENCY_CONFLICT' })
  expect((await f.service({ command, idempotency, environment: {}, profilePolicy })).status).toBe(kind === 'conflict' ? 409 : 503); expect(f.save).not.toHaveBeenCalled()
})
test.each([['not_found', 404], ['version_conflict', 409]] as const)('确定拒绝%s可重放且不误报成功', async (status, code) => {
  const f = fixture(); f.save.mockResolvedValue({ status } as any)
  const result = await f.service({ command, idempotency, environment: {}, profilePolicy }); expect(result.status).toBe(code); expect(f.complete).toHaveBeenCalledWith(f.tx, expect.objectContaining({ response: result }))
})
test('完成收据失败和存储不可用均回滚，不提交半成品', async () => {
  for (const failure of ['receipt', 'storage']) {
    const f = fixture(); if (failure === 'receipt') { f.complete.mockResolvedValue({ kind: 'wait_for_winner' }) } else { f.save.mockResolvedValue({ status: 'unavailable' } as any) }
    await expect(f.service({ command, idempotency, environment: {}, profilePolicy })).rejects.toThrow(); expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled()
  }
})
test('提交未知只读返回已提交收据，不重新写入或回滚', async () => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('受控未知提交'))
  f.read.mockResolvedValue({ state: 'completed', requestHash: idempotency.requestHash, response } as HttpIdempotencyStoredRecord)
  expect(await f.service({ command, idempotency, environment: {}, profilePolicy })).toEqual(response); expect(f.save).toHaveBeenCalledOnce(); expect(f.read).toHaveBeenCalledOnce(); expect(f.driver.rollbackTransaction).not.toHaveBeenCalled()
})
test('未知提交缺收据或读取失败均503，不猜未提交并重跑', async () => {
  const f = fixture(); f.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('受控未知提交'))
  expect((await f.service({ command, idempotency, environment: {}, profilePolicy })).status).toBe(503); expect(f.save).toHaveBeenCalledOnce()
  f.read.mockRejectedValue(new Error('受限SQL')); expect((await f.service({ command, idempotency, environment: {}, profilePolicy })).status).toBe(503)
})
test('异步占位期间修改调用者对象不改变保存事实，非法输入在事务前拒绝', async () => {
  const f = fixture(), value = structuredClone(command)
  f.reserve.mockImplementation(async () => { value.nickname = '被更改'; value.measuredPot.potHeightCm = 99; return { kind: 'reserved' } })
  expect(await f.service({ command: value, idempotency, environment: {}, profilePolicy })).toEqual(response); expect(f.save.mock.calls[0]?.[1]).toEqual(command)
  const g = fixture(); await expect(g.service({ command: { ...command, nickname: 'a'.repeat(81) }, idempotency, environment: {}, profilePolicy })).rejects.toThrow(); expect(g.driver.beginTransaction).not.toHaveBeenCalled()
})

/**
 * Expected：user-plant-environment-profile/v1 §3（2026-10-10 用户审定）——五项齐全才算完整；首次完整写完成时间；
 * 同用户此前没有完整档案才写首株事件（终身一次）；已完成不再写；事件不带积分。层次：L1/unit_fake（替身端口）。
 */
const environmentReady = { location: { cityRef: 'chongqing', placement: 'indoor' }, lighting: { windowFacing: 'S', glassLayers: 2, distanceBand: 'within_1m', obstruction: 'none' }, ventilation: { airExchange: 'frequent', localAirflow: 'none', directBlowing: false } }
const completeFixture = (evidence: { profileCompletedAtMs: number | null; userPreviouslyCompletedProfile: boolean }, context: Record<string, unknown> = environmentReady) => {
  const f = fixture()
  f.saveCareContext.mockResolvedValue(context)
  f.readCompletenessEvidence.mockResolvedValue({ identityStatus: 'unidentified', ...evidence })
  f.getOwnedUserPlant.mockResolvedValue({ ...fullPlant, profile: { ...fullPlant.profile, ...context } })
  return f
}
test('五项齐全且用户首次完整：写完成时间并写一条首株事件（无积分字段、occurrence 绑定用户）', async () => {
  const f = completeFixture({ profileCompletedAtMs: null, userPreviouslyCompletedProfile: false })
  expect((await f.service({ command, idempotency, environment: {}, profilePolicy })).status).toBe(200)
  expect(f.markProfileCompleted).toHaveBeenCalledWith(f.tx, { userRef: command.userRef, userPlantRef: command.userPlantRef, completedAtMs: 3000, profileVersion: 'user-plant-profile/v1' })
  expect(f.insertPending).toHaveBeenCalledOnce()
  const [, event, aggregateVersion] = f.insertPending.mock.calls[0] as unknown as [unknown, Record<string, unknown>, number]
  expect(event).toMatchObject({ eventId: 'evt_fixture_event_0001', eventType: 'user_plant.profile_completed.v1', producerDomain: 'user-plant', userRef: command.userRef, userPlantRef: command.userPlantRef,
    occurrenceRef: `first_profile:${command.userRef}`, producerPolicyVersion: 'user-plant-profile/v1', occurredAt: '1970-01-01T00:00:03.000Z', payload: { profileVersion: 'user-plant-profile/v1' } })
  expect(aggregateVersion).toBe(2)
  expect(JSON.stringify(event)).not.toMatch(/point|amount/iu)
})
test('同用户已有完整档案：只写完成时间，不再写事件', async () => {
  const f = completeFixture({ profileCompletedAtMs: null, userPreviouslyCompletedProfile: true })
  await f.service({ command, idempotency, environment: {}, profilePolicy })
  expect(f.markProfileCompleted).toHaveBeenCalledOnce(); expect(f.insertPending).not.toHaveBeenCalled()
})
test('本株已完成过：不覆盖完成时间、不写事件（清空某项也不收回）', async () => {
  const f = completeFixture({ profileCompletedAtMs: 1500, userPreviouslyCompletedProfile: false }, { location: environmentReady.location })
  await f.service({ command, idempotency, environment: {}, profilePolicy })
  expect(f.markProfileCompleted).not.toHaveBeenCalled(); expect(f.insertPending).not.toHaveBeenCalled()
})
test.each(['location', 'lighting', 'ventilation'])('缺 %s 时不完整：不写完成时间与事件', async missing => {
  const context = { ...environmentReady } as Record<string, unknown>; delete context[missing]
  const f = completeFixture({ profileCompletedAtMs: null, userPreviouslyCompletedProfile: false }, context)
  await f.service({ command, idempotency, environment: {}, profilePolicy })
  expect(f.markProfileCompleted).not.toHaveBeenCalled(); expect(f.insertPending).not.toHaveBeenCalled()
})
test('盆器缺排水状态时不完整', async () => {
  const f = completeFixture({ profileCompletedAtMs: null, userPreviouslyCompletedProfile: false })
  f.save.mockResolvedValue({ status: 'saved', userPlantRef: 'upl_profile_save001', version: 2, nickname: '小青', measuredPot: { ...measuredPot, drainageAvailable: null } } as never)
  f.getOwnedUserPlant.mockResolvedValue({ ...fullPlant, profile: { nickname: '小青', measuredPot: { ...measuredPot, drainageAvailable: null }, ...environmentReady } })
  await f.service({ command, idempotency, environment: {}, profilePolicy })
  expect(f.markProfileCompleted).not.toHaveBeenCalled()
})
test('outbox 写入失败整体回滚，不提交半完成状态', async () => {
  const f = completeFixture({ profileCompletedAtMs: null, userPreviouslyCompletedProfile: false })
  f.insertPending.mockRejectedValue(new Error('outbox 写入失败'))
  await expect(f.service({ command, idempotency, environment: {}, profilePolicy })).rejects.toThrow()
  expect(f.driver.rollbackTransaction).toHaveBeenCalledOnce(); expect(f.driver.commitTransaction).not.toHaveBeenCalled(); expect(f.complete).not.toHaveBeenCalled()
})
