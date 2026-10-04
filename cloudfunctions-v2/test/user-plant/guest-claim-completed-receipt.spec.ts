import { expect, test, vi } from 'vitest'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'

/** L1/unit_fake：独立成功收据合同；实际Reader/规范哈希，替换连接；实际MySQL另验。 */
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_guestclaim_owner001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:09Z' }
const input = () => ({ principal: { ...principal }, guestSessionRef: 'gst_guestclaim_session001', guestPlantCaseRef: 'gpc_guestclaim_case001', target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_guestclaim_existing001' }, idempotencyKeyHash: 'b'.repeat(64), nowMs: 2000 })
const row = () => ({ claim_ref: 'gcl_guestclaim_original001', request_hash: 'e029bce1f6b017ec076d2246b03813ae7e4673e5eb998abf3cba1d64aa0f172c', proof_version: 1, target_type: 'existing_user_plant', requested_target_ref: 'upl_guestclaim_existing001', user_plant_ref: 'upl_guestclaim_existing001', guest_case_ref: 'gpc_guestclaim_case001', claimed_at_ms: '1500' })
function fixture(rows: unknown[] = [row()]) {
 const query = vi.fn(async () => rows), release = vi.fn(), destroy = vi.fn(), execute = vi.fn(), beginTransaction = vi.fn()
 const acquire = vi.fn(async () => ({ query, release, destroy, execute, beginTransaction })), reader = createMysqlGuestClaimCompletedReceiptReader({ getConnection: acquire } as never)
 return { query, release, destroy, execute, beginTransaction, acquire, reader }
}
test('完整原收据只读返回白名单，无锁写入或原始哈希', async () => {
 const f = fixture(); expect(await f.reader.readCompleted(input())).toEqual({ status: 'completed', claimRef: 'gcl_guestclaim_original001', userPlantRef: 'upl_guestclaim_existing001', guestPlantCaseRef: 'gpc_guestclaim_case001', proofVersion: 1, claimedAtMs: 1500 }); expect(f.query).toHaveBeenCalledOnce(); expect(f.release).toHaveBeenCalledOnce(); expect(f.execute).not.toHaveBeenCalled(); expect(f.beginTransaction).not.toHaveBeenCalled()
})
test('没有完整原收据返回null，不重新创建', async () => { const f = fixture([]); expect(await f.reader.readCompleted(input())).toBeNull(); expect(f.query).toHaveBeenCalledOnce(); expect(f.execute).not.toHaveBeenCalled() })
test('完整同键异参返回冲突', async () => { const f = fixture([{ ...row(), request_hash: 'a'.repeat(64) }]); expect(await f.reader.readCompleted(input())).toEqual({ status: 'idempotency_conflict' }) })
test.each(['extra', 'bad_ref', 'expired_actor', 'bad_target', 'unsafe_time'] as const)('可信输入%s拒绝且不建连', async kind => {
 const f = fixture(), value = input()
 if (kind === 'extra') { Object.assign(value, { proofVersion: 9 }) }
 if (kind === 'bad_ref') { value.guestSessionRef = 'wrong' }
 if (kind === 'expired_actor') { value.principal.expiresAt = '1970-01-01T00:00:02Z' }
 if (kind === 'bad_target') { Object.assign(value.target, { internalId: '1' }) }
 if (kind === 'unsafe_time') { value.nowMs = Number.MAX_SAFE_INTEGER + 1 }
 await expect(f.reader.readCompleted(value)).rejects.toThrow(); expect(f.acquire).not.toHaveBeenCalled()
})
test.each(['bad_hash', 'bad_version', 'unsafe_date', 'future', 'mismatched_case', 'mismatched_target'] as const)('损坏收据%s不可用', async kind => {
 const value = row()
 if (kind === 'bad_hash') { value.request_hash = 'broken' }
 if (kind === 'bad_version') { value.proof_version = 0 }
 if (kind === 'unsafe_date') { value.claimed_at_ms = '9007199254740992' }
 if (kind === 'future') { value.claimed_at_ms = '2001' }
 if (kind === 'mismatched_case') { value.guest_case_ref = 'gpc_othercase001' }
 if (kind === 'mismatched_target') { value.user_plant_ref = 'upl_anothertarget001' }
 const f = fixture([value]); expect(await f.reader.readCompleted(input())).toEqual({ status: 'unavailable' })
})
test('重复行与数据库错误不伪装成没有收据', async () => {
 const f = fixture([row(), row()]); expect(await f.reader.readCompleted(input())).toEqual({ status: 'unavailable' })
 const failure = fixture(); failure.query.mockRejectedValue(new Error('restricted database details')); expect(await failure.reader.readCompleted(input())).toEqual({ status: 'unavailable' }); expect(failure.query).toHaveBeenCalledOnce(); expect(failure.execute).not.toHaveBeenCalled()
})
test('等待连接时原输入变化不改变用户/目标/时刻', async () => {
 const f = fixture(); let release!: (v: unknown) => void
 f.acquire.mockImplementation(() => new Promise(r => { release = r }) as never)
 const value = input(), work = f.reader.readCompleted(value); value.principal.user_id = 'usr_another_owner001' as UserRef; value.target.user_plant_id = 'upl_anothertarget001'; value.nowMs = 9999
 release({ query: f.query, release: f.release }); expect(await work).toMatchObject({ status: 'completed', userPlantRef: 'upl_guestclaim_existing001' })
})
