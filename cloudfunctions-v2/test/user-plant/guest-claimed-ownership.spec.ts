import { expect, test } from 'vitest'
import type { UserPrincipalDto } from '../../src/contracts/types.js'
import { createMysqlGuestClaimedOwnershipReader } from '../../src/user-plant/repository/mysql-guest-claimed-ownership-reader.js'

/** L3/unit_fake：独立Expected来自guest-claimed-ownership-contract.md。
 * 真实输入校验、Repository投影与连接释放；只替换SQL返回边界，不证明SQL归属过滤或HTTP签名。 */
const principal = { principalType: 'user', user_id: 'usr_owner_001', authenticatedVia: 'wechat', sessionVersion: 1,
  issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:09Z' } as UserPrincipalDto
const input = () => ({ principal: { ...principal }, guestPlantCaseRef: 'gpc_case_0001', nowMs: 4000 })
const row = () => ({ claim_ref: 'gcl_claim_001', user_plant_ref: 'upl_plant_001', guest_case_ref: 'gpc_case_0001', claimed_at_ms: '3000' })
function fixture(rows: Record<string, unknown>[] = [row()], fail = false) {
  let calls = 0, released = 0
  const source = { getConnection: async () => { calls++; return {
    query: async () => { if (fail) { throw new Error('private database error') } return rows },
    execute: async () => { throw new Error('禁止写入') }, beginTransaction: async () => { throw new Error('禁止事务') },
    commit: async () => { throw new Error('禁止提交') }, rollback: async () => { throw new Error('禁止回滚') },
    release: async () => { released++ }, destroy: () => { /* 故障连接可按共享连接生命周期销毁；不模拟额外异步拒绝。 */ }
  } } }
  return { reader: createMysqlGuestClaimedOwnershipReader(source), counts: () => ({ calls, released }) }
}
test('本人案例只返回公开归属摘要并释放连接', async () => {
  const f = fixture()
  expect(await f.reader.readOwnership(input())).toEqual({ status: 'owned', claimRef: 'gcl_claim_001', userPlantRef: 'upl_plant_001', guestPlantCaseRef: 'gpc_case_0001' })
  expect(f.counts()).toEqual({ calls: 1, released: 1 })
})
test('无成功归属返回not_found，不伪造空类别', async () => { expect(await fixture([]).reader.readOwnership(input())).toEqual({ status: 'not_found' }) })
test.each([[row(), row()], [{ ...row(), secret: 'hidden' }], [{ ...row(), claim_ref: '12' }], [{ ...row(), guest_case_ref: 'gpc_other001' }], [{ ...row(), claimed_at_ms: '4001' }], [{ ...row(), claimed_at_ms: null }]].map(rows => ({ rows })))('损坏或重复投影保持不可用 %#', async ({ rows }) => {
  expect(await fixture(rows).reader.readOwnership(input())).toEqual({ status: 'unavailable' })
})
test('数据库故障不泄露原文', async () => { expect(await fixture([], true).reader.readOwnership(input())).toEqual({ status: 'unavailable' }) })
test.each([{ ...input(), nowMs: 9000 }, { ...input(), nowMs: NaN }, { ...input(), guestPlantCaseRef: '1' }, { ...input(), owner: 'other' }])('非法或过期请求不访问数据库 %#', async raw => {
  const f = fixture(); await expect(f.reader.readOwnership(raw)).rejects.toThrow(TypeError); expect(f.counts()).toEqual({ calls: 0, released: 0 })
})
