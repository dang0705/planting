import { expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { createMysqlAuthenticatedEphemeralBindingRepository } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-binding-repository.js'
import type { Mysql2QueryConnection, SqlParameter } from '../../src/foundation/database/mysql2-connection-source.js'

// L1/unit_fake。Expected来自显式绑定合同及016唯一绑定约束；SQL边界为替身，不证明实际事务。
const input = { userRef: 'usr_binding_owner001', ephemeralCaseRef: 'epc_binding_case001', targetUserPlantRef: 'upl_binding_target001', promotionRef: 'prm_binding_command001', idempotencyKeyHash: 'b'.repeat(64), occurredAtMs: 2000 }
const requestHash = createHash('sha256').update(JSON.stringify({ ephemeralCaseRef: input.ephemeralCaseRef, targetType: 'existing_user_plant', targetUserPlantRef: input.targetUserPlantRef })).digest('hex')
const caseRow = { case_id: '11', status: 'completed', version: 1, expires_at_ms: '3000', created_at_ms: '1000', completed_at_ms: '1500', updated_at_ms: '1500', bound_user_plant_internal_id: null }
const receipt = { promotion_ref: input.promotionRef, request_hash: requestHash, status: 'completed', target_type: 'existing_user_plant', public_user_plant_id: input.targetUserPlantRef, bound_at_ms: '2000' }
function fixture(rows: Record<string, unknown>[][]) {
  const query = vi.fn(async (_sql: string, _params: readonly SqlParameter[]) => rows.shift() ?? [])
  const execute = vi.fn(async (_sql: string, _params: readonly SqlParameter[]) => ({ affectedRows: 1, insertId: 22 }))
  const connection: Mysql2QueryConnection = { query, execute, beginTransaction: async () => undefined, commit: async () => undefined, rollback: async () => undefined, release: () => undefined, destroy: () => undefined }
  return { query, execute, tx: { transactionContext: true as const, connection }, repository: createMysqlAuthenticatedEphemeralBindingRepository() }
}
test('完成三表绑定并读回公开引用，不写原结果或期限', async () => {
  const f = fixture([[{ user_id: '1' }], [caseRow], [], [{ plant_id: '2' }], [receipt]])
  expect(await f.repository.bindExisting(f.tx, input)).toEqual({ status: 'bound', promotionRef: input.promotionRef, userPlantRef: input.targetUserPlantRef, boundAtMs: 2000 })
  expect(f.execute).toHaveBeenCalledTimes(3)
  const statements = f.execute.mock.calls.map(x => x[0]).join('\n')
  expect(statements).not.toMatch(/(?:expires_at_ms|completed_at_ms|created_at_ms)\s*=/u)
  expect(statements).not.toMatch(/(?:care_|diagnosis_|reward_|user_plants\s+SET)/u)
})
test('同参数已完成收据超期仍重放，零写入', async () => {
  const f = fixture([[{ user_id: '1' }], [{ ...caseRow, status: 'bound', bound_user_plant_internal_id: '2' }], [receipt]])
  expect(await f.repository.bindExisting(f.tx, { ...input, occurredAtMs: 9000 })).toEqual({ status: 'bound', promotionRef: input.promotionRef, userPlantRef: input.targetUserPlantRef, boundAtMs: 2000 })
  expect(f.execute).not.toHaveBeenCalled()
})
test('同键异目标冲突，即使案例到期也不返回另一目标', async () => {
  const f = fixture([[{ user_id: '1' }], [caseRow], [receipt]])
  expect(await f.repository.bindExisting(f.tx, { ...input, targetUserPlantRef: 'upl_binding_other001' })).toEqual({ status: 'idempotency_conflict' }); expect(f.execute).not.toHaveBeenCalled()
})
test.each(['failed','expired','bound'] as const)('%s 案例新命令不写入', async status => {
  const f = fixture([[{ user_id: '1' }], [{ ...caseRow, status, bound_user_plant_internal_id: status === 'bound' ? '2' : null }], []])
  expect(await f.repository.bindExisting(f.tx, input)).toEqual({ status: status === 'bound' ? 'already_bound' : 'expired' }); expect(f.execute).not.toHaveBeenCalled()
})
test('截止边界拒绝，与已确认完成时间无关', async () => {
  const f = fixture([[{ user_id: '1' }], [caseRow], []]); expect(await f.repository.bindExisting(f.tx, { ...input, occurredAtMs: 3000 })).toEqual({ status: 'expired' }); expect(f.execute).not.toHaveBeenCalled()
})
test.each([{ rows: [] }, { rows: [[{ user_id: '1' }]] }, { rows: [[{ user_id: '1' }], [caseRow], [], []] }])('不存在或不归属统一不写', async ({ rows }) => {
  const f = fixture(rows); expect(await f.repository.bindExisting(f.tx, input)).toEqual({ status: 'not_found' }); expect(f.execute).not.toHaveBeenCalled()
})
test('非法输入及伪造摘要在SQL之前拒绝', async () => {
  for (const value of [{ ...input, occurredAtMs: 1.5 }, { ...input, occurredAtMs: -1 }, { ...input, userRef: '' }, { ...input, requestHash: 'a'.repeat(64) }, { ...input, idempotencyKeyHash: 'raw-key' }]) {
    const f = fixture([]); await expect(f.repository.bindExisting(f.tx, value)).rejects.toThrow(TypeError); expect(f.query).not.toHaveBeenCalled()
  }
})
test('读回损坏或缺失必须抛错，交由事务整体回滚', async () => {
  const f = fixture([[{ user_id: '1' }], [caseRow], [], [{ plant_id: '2' }], [{ ...receipt, public_user_plant_id: 'upl_other_target001' }]])
  await expect(f.repository.bindExisting(f.tx, input)).rejects.toThrow(); expect(f.execute).toHaveBeenCalledTimes(3)
})
