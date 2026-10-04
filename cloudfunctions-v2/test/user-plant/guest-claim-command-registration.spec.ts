import { expect, test, vi } from 'vitest'
import { createMysqlGuestClaimCommandRegistrationRepository } from '../../src/user-plant/repository/mysql-guest-claim-command-registration-repository.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'

/** L1/unit_fake：Expected为独立命令登记合同；实际Repository，替换证明端口和SQL连接；真实数据库另验。 */
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_guestclaim_owner001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:09Z' }
const input = () => ({ principal, proof: { guestSessionRef: 'gst_guestclaim_session001', anonymousSubjectHash: 'a'.repeat(64), possessionProof: Buffer.alloc(32).toString('base64url'), nowMs: 2000, proofRotationGraceSeconds: null }, guestPlantCaseRef: 'gpc_guestclaim_case001', target: { type: 'new_user_plant' as const }, claimRef: 'gcl_guestclaim_generated001', idempotencyKeyHash: 'b'.repeat(64) })
function fixture() {
 const lockAndVerify = vi.fn(async (_tx: unknown, _proof: unknown) => ({ status: 'not_claimable' as const })), query = vi.fn(), execute = vi.fn()
 const tx = { transactionContext: true, connection: { query, execute } } as never
 return { lockAndVerify, query, execute, tx, repository: createMysqlGuestClaimCommandRegistrationRepository({ lockAndVerify }) }
}
test('证明拒绝时绝不查询案例/用户或写命令', async () => {
 const f = fixture(); expect(await f.repository.register(f.tx, input())).toEqual({ status: 'not_claimable' }); expect(f.query).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
})
test.each(['client_user', 'extra_target', 'invalid_ref', 'expired_principal', 'guest_principal'] as const)('可信输入%s不通过且不执行证明端口', async kind => {
 const f = fixture(), value = input()
 if (kind === 'client_user') { Object.assign(value, { userId: 'usr_client001' }) }
 if (kind === 'extra_target') { Object.assign(value.target, { user_plant_id: 'upl_injected001' }) }
 if (kind === 'invalid_ref') { value.claimRef = 'invalid' }
 if (kind === 'expired_principal') { value.principal = { ...principal, expiresAt: '1970-01-01T00:00:02Z' } }
 if (kind === 'guest_principal') { value.principal = { principalType: 'guest' } as never }
 await expect(f.repository.register(f.tx, value)).rejects.toThrow(); expect(f.lockAndVerify).not.toHaveBeenCalled()
})
test('不接受缺显式事务调用', async () => {
 const f = fixture(); await expect(f.repository.register({ connection: {} } as never, input())).rejects.toThrow(); expect(f.lockAndVerify).not.toHaveBeenCalled()
})
test.each([{ status: 'unexpected' }, { status: 'not_claimable', secret: 'restricted' }])('损坏证明端口结果不进入登记或输出', async result => {
 const f = fixture(); f.lockAndVerify.mockResolvedValue(result as never)
 await expect(f.repository.register(f.tx, input())).rejects.toThrow(); expect(f.query).not.toHaveBeenCalled(); expect(f.execute).not.toHaveBeenCalled()
})
test('completed已有目标的最终植物不能偏离原请求目标', async () => {
 const f = fixture(), value = { ...input(), target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_guestclaim_existing001' } }
 f.lockAndVerify.mockResolvedValue({ status: 'verified', proofVersion: 1 } as never)
 f.query.mockResolvedValueOnce([{ case_id: '2', status: 'claimed', claimed_user_internal_id: '1', claimed_user_plant_internal_id: '4' }])
 f.query.mockResolvedValueOnce([{ user_id: '1' }]).mockResolvedValueOnce([{ plant_id: '3' }])
 // 规范哈希只按冻结请求语义生成，不能使用被测实现反推。
 f.query.mockResolvedValueOnce([{ command_id: '5', claim_ref: 'gcl_guestclaim_original001', request_hash: 'e029bce1f6b017ec076d2246b03813ae7e4673e5eb998abf3cba1d64aa0f172c', proof_version: 1, status: 'completed', target_type: 'existing_user_plant', requested_target_id: '3', target_id: '4' }]).mockResolvedValueOnce([{ linked: 1 }])
 expect(await f.repository.register(f.tx, value)).toEqual({ status: 'unavailable' }); expect(f.execute).not.toHaveBeenCalled()
})
