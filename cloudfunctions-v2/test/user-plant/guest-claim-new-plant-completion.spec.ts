import { expect, test, vi } from 'vitest'
import { createHash } from 'node:crypto'
import type { UserCapabilitySnapshotDto, UserRef } from '../../src/contracts/types.js'
import { createMysqlGuestClaimNewPlantCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-new-plant-completion-repository.js'

/** L1/unit_fake：Expected来自新建认领合同；实际创建领域，SQL及聚合Repository为替身，真实MySQL另验。 */
const principal = { principalType: 'user' as const, user_id: 'usr_user00001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat' as const, issuedAt: '1970-01-01T00:00:00Z', expiresAt: '1970-01-01T00:00:10Z' }
const capability: UserCapabilitySnapshotDto = { contractVersion: 'capability-snapshot/v1', snapshotRef: 'cps_claim_new0001', subjectType: 'user', user_id: principal.user_id, tier: 'free', allowedCapabilities: ['USER_PLANT_CREATE'], rewardedAiScopes: [], activeUserPlantLimit: 1, generatedAt: '1970-01-01T00:00:01Z', validUntil: '1970-01-01T00:00:09Z', policyVersion: 'user-plant-limit/v1' }
const input = () => ({ principal: { ...principal }, proof: { guestSessionRef: 'gst_session01', possessionProof: 'p'.repeat(43), nowMs: 2000, proofRotationGraceSeconds: 300 }, guestPlantCaseRef: 'gpc_case00001', target: { type: 'new_user_plant' as const }, claimRef: 'gcl_claim0001', idempotencyKeyHash: 'b'.repeat(64), leaseOwnerHash: 'c'.repeat(64), newUserPlantRef: 'upl_newplant01', capabilitySnapshot: { ...capability, allowedCapabilities: [...capability.allowedCapabilities], rewardedAiScopes: [] } as UserCapabilitySnapshotDto | null })
const hash = createHash('sha256').update('{"guestSessionRef":"gst_session01","guestPlantCaseRef":"gpc_case00001","target":{"type":"new_user_plant"}}').digest('hex')
function setup(activeCount = 0) {
 const query = vi.fn().mockResolvedValueOnce([{ case_id: '2', session_id: '5', status: 'completed', version: 1, created_at_ms: '0', completed_at_ms: '1000', updated_at_ms: '1000', expires_at_ms: '9000', claimed_user_internal_id: null, claimed_user_plant_internal_id: null }]).mockResolvedValueOnce([{ user_id: '1' }]).mockResolvedValueOnce([{ command_id: '4', claim_ref: 'gcl_claim0001', request_hash: hash, proof_version: 1, status: 'processing', requested_target_id: null, target_id: null, lease_owner_hash: 'c'.repeat(64), lease_expires_at_ms: '3000', attempt_count: 3, updated_at_ms: '1000' }]).mockResolvedValueOnce([{ plant_id: '3' }]).mockResolvedValueOnce([{ n: '0' }]).mockResolvedValueOnce([{ claim_ref: 'gcl_claim0001', proof_version: 1, claimed_at_ms: '2000', case_version: 2, session_status: 'completed', previous_possession_proof_hash: null, previous_proof_valid_until_ms: null }])
 const execute = vi.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 })
 const plants = { lockUserAndCountActive: vi.fn().mockResolvedValue({ userInternalId: '1', activeCount }), insertUnidentifiedUserPlant: vi.fn().mockResolvedValue(undefined), readCreateInitialProjection: vi.fn().mockResolvedValue({ user_plant_id: 'upl_newplant01' }) }
 const lockAndVerify = vi.fn().mockResolvedValue({ status: 'verified', proofVersion: 2 })
 const tx = { transactionContext: true as const, connection: { query, execute } }
 return { query, execute, plants, tx, repo: createMysqlGuestClaimNewPlantCompletionRepository({ lockAndVerify, plants: plants as never }) }
}
test('同事务创建并认领，保留命令原引用和原证明版本', async () => {
 const s = setup(), i = input(); expect(await s.repo.complete(s.tx as never, i)).toEqual({ status: 'completed', claimRef: i.claimRef, userPlantRef: i.newUserPlantRef, guestPlantCaseRef: i.guestPlantCaseRef, proofVersion: 1, claimedAtMs: 2000 }); expect(s.plants.insertUnidentifiedUserPlant).toHaveBeenCalledWith(s.tx, { userInternalId: '1', userPlantRef: i.newUserPlantRef, occurredAtMs: 2000 }); expect(s.execute).toHaveBeenCalledTimes(5) /* 裁决 2：会话最后一个案例认领后同事务置 completed */
})
test.each(['missing', 'limit', 'expired', 'denied', 'other_user'] as const)('能力%s拒绝且没有新植物或认领写入', async scenario => {
 const s = setup(scenario === 'limit' ? 1 : 0), i = input();
 if (scenario === 'missing') { i.capabilitySnapshot = null }
 else if (scenario === 'expired') { i.capabilitySnapshot!.validUntil = '1970-01-01T00:00:02Z' }
 else if (scenario === 'denied') { i.capabilitySnapshot!.allowedCapabilities = [] }
 else if (scenario === 'other_user') { i.capabilitySnapshot!.user_id = 'usr_other0001' as UserRef }
 expect(await s.repo.complete(s.tx as never, i)).toEqual({ status: scenario === 'missing' ? 'unavailable' : scenario === 'expired' ? 'capability_snapshot_expired' : 'capability_denied' }); expect(s.plants.insertUnidentifiedUserPlant).not.toHaveBeenCalled(); expect(s.execute).not.toHaveBeenCalled()
})
test('创建初态读回不一致抛错，不能写认领事实', async () => { const s = setup(); s.plants.readCreateInitialProjection.mockResolvedValue({ user_plant_id: 'upl_wrong0001' }); await expect(s.repo.complete(s.tx as never, input())).rejects.toThrow(); expect(s.execute).not.toHaveBeenCalled() })
test('同事务容量读回必须是相同统一用户', async () => { const s = setup(); s.plants.lockUserAndCountActive.mockResolvedValue({ userInternalId: '9', activeCount: 0 }); await expect(s.repo.complete(s.tx as never, input())).rejects.toThrow(); expect(s.plants.insertUnidentifiedUserPlant).not.toHaveBeenCalled() })
test('拒绝已有目标或客户端附带最终目标', async () => { const s = setup(); await expect(s.repo.complete(s.tx as never, { ...input(), target: { type: 'new_user_plant', user_plant_id: 'upl_newplant01' } } as never)).rejects.toThrow(); expect(s.query).not.toHaveBeenCalled() })
