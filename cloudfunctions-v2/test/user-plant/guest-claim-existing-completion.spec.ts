import { describe, it, expect, vi } from 'vitest'
import { createMysqlGuestClaimExistingCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-existing-completion-repository.js'
import { createHash } from 'node:crypto'
import type { UserRef } from '../../src/contracts/types.js'

/** unit_fake：Expected来自已冻结原子完成合同；SQL边界替身不证明真实数据库或Provider。 */
const now = 2000
const input = { principal: { principalType: 'user' as const, user_id: 'usr_user00001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat' as const, issuedAt: new Date(0).toISOString(), expiresAt: new Date(10000).toISOString() }, proof: { guestSessionRef: 'gst_session01', possessionProof: 'p'.repeat(43), nowMs: now, proofRotationGraceSeconds: 300 }, guestPlantCaseRef: 'gpc_case00001', target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_plant0001' }, claimRef: 'gcl_claim0001', idempotencyKeyHash: 'b'.repeat(64), leaseOwnerHash: 'c'.repeat(64) }
const hash = createHash('sha256').update('{"guestSessionRef":"gst_session01","guestPlantCaseRef":"gpc_case00001","target":{"type":"existing_user_plant","user_plant_id":"upl_plant0001"}}').digest('hex')
function setup(command: Record<string, unknown> = {}, affected = 1) {
  const row = { command_id: '4', claim_ref: input.claimRef, request_hash: hash, proof_version: 1, status: 'processing', requested_target_id: '3', target_id: null, lease_owner_hash: input.leaseOwnerHash, lease_expires_at_ms: '3000', attempt_count: 1, updated_at_ms: '1000', ...command }
  const query = vi.fn().mockResolvedValueOnce([{ case_id: '2', session_id: '5', status: 'completed', version: 1, created_at_ms: '0', completed_at_ms: '1000', updated_at_ms: '1000', expires_at_ms: '9000', claimed_user_internal_id: null, claimed_user_plant_internal_id: null }]).mockResolvedValueOnce([{ user_id: '1' }]).mockResolvedValueOnce([{ plant_id: '3' }]).mockResolvedValueOnce([row]).mockResolvedValueOnce([{ n: '0' }]).mockResolvedValueOnce([{ claim_ref: input.claimRef, proof_version: 1, claimed_at_ms: '2000', case_version: 2, session_status: 'completed', previous_possession_proof_hash: null, previous_proof_valid_until_ms: null }])
  const execute = vi.fn().mockResolvedValue({ affectedRows: affected, insertId: 1 })
  const lockAndVerify = vi.fn().mockResolvedValue({ status: 'verified', proofVersion: 1 })
  const tx = { transactionContext: true as const, connection: { query, execute } }
  return { query, execute, lockAndVerify, tx, repo: createMysqlGuestClaimExistingCompletionRepository({ lockAndVerify }) }
}
describe('游客已有目标原子完成', () => {
  it('只返回原收据并在同事务完成四项写入', async () => {
    const s = setup(); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: 'completed', claimRef: input.claimRef, userPlantRef: input.target.user_plant_id, guestPlantCaseRef: input.guestPlantCaseRef, proofVersion: 1, claimedAtMs: now }); expect(s.execute).toHaveBeenCalledTimes(5) /* 裁决 2：会话最后一个案例认领后同事务置 completed */; expect(s.lockAndVerify).toHaveBeenCalledWith(s.tx, input.proof)
  })
  it.each([{ lease_owner_hash: 'd'.repeat(64) }, { lease_expires_at_ms: '2000' }, { status: 'requested' }, { status: 'failed' }, { claim_ref: 'gcl_other0001' }, { requested_target_id: '9' }])('拒绝租约/原命令不匹配且零写入%j', async command => {
    const s = setup(command); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: Object.hasOwn(command, 'lease_expires_at_ms') ? 'expired' : 'not_claimable' }); expect(s.execute).not.toHaveBeenCalled()
  })
  it('同键不同语义冲突且零写入', async () => {
    const s = setup({ request_hash: 'd'.repeat(64) }); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: 'idempotency_conflict' }); expect(s.execute).not.toHaveBeenCalled()
  })
  it('证明拒绝不能进入任何SQL写入', async () => {
    const s = setup(); s.lockAndVerify.mockResolvedValue({ status: 'not_claimable' } as never); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: 'not_claimable' }); expect(s.query).not.toHaveBeenCalled(); expect(s.execute).not.toHaveBeenCalled()
  })
  it('写入数量未知抛错供外层回滚', async () => { const s = setup({}, 0); await expect(s.repo.complete(s.tx as never, input)).rejects.toThrow(); expect(s.execute).toHaveBeenCalledTimes(1) })
  it('拒绝额外归属或客户端租约期限', async () => { const s = setup(); await expect(s.repo.complete(s.tx as never, { ...input, leaseExpiresAtMs: 5000 } as never)).rejects.toThrow(); expect(s.lockAndVerify).not.toHaveBeenCalled() })
})
it.each([2, 4294967295])('已认领案例更新晚于本请求捕获时刻时只拒绝写入供原收据核对，版本%s', async version => {
 const s = setup(); s.query.mockReset().mockResolvedValueOnce([{ case_id: '2', session_id: '5', status: 'claimed', version, created_at_ms: '0', completed_at_ms: '1000', updated_at_ms: '2001', expires_at_ms: '9000', claimed_user_internal_id: '1', claimed_user_plant_internal_id: '3' }]); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: 'not_claimable' }); expect(s.execute).not.toHaveBeenCalled(); expect(s.query).toHaveBeenCalledOnce()
})
it('已认领投影缺失owner时不可用，不能当普通同键并发结果', async () => { const s = setup(); s.query.mockReset().mockResolvedValueOnce([{ case_id: '2', session_id: '5', status: 'claimed', version: 2, created_at_ms: '0', completed_at_ms: '1000', updated_at_ms: '2001', expires_at_ms: '9000', claimed_user_internal_id: null, claimed_user_plant_internal_id: '3' }]); expect(await s.repo.complete(s.tx as never, input)).toEqual({ status: 'unavailable' }); expect(s.execute).not.toHaveBeenCalled() })
