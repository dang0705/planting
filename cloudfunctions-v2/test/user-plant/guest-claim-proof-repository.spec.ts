import { createHash } from 'node:crypto'
import { expect, test, vi } from 'vitest'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'

/** L1/unit_fake：依据持有证明准入合同（guest-token/v1 §3，主代理 2026-10-09 裁决 A），替换SQL连接；执行真实Repository及证明算法，真实锁/数据另验。 */
const proof = Buffer.alloc(32, 17).toString('base64url')
const input = () => ({ guestSessionRef: 'gst_proof_session001', possessionProof: proof, nowMs: 2000, proofRotationGraceSeconds: null })
const proofHash = createHash('sha256').update(proof).digest('hex')
const row = () => ({ identity_source: 'server_issued_guest_token', possession_proof_hash: createHash('sha256').update(proof).digest('hex'), possession_proof_version: 1, previous_possession_proof_hash: null, previous_proof_valid_until_ms: null, status: 'active', issued_at_ms: '1000', expires_at_ms: '9000' })
function fixture(rows: unknown[] = [row()]) {
  const query = vi.fn(async (_sql: string, _parameters: unknown[]) => rows), execute = vi.fn()
  return { query, execute, tx: { transactionContext: true, connection: { query, execute } } as never, repository: createMysqlGuestClaimProofRepository() }
}
test('按令牌摘要定位且要求会话引用一致；同事务单次锁定，SQL不含原始令牌，结果不含受限信息', async () => {
  const f = fixture(); expect(await f.repository.lockAndVerify(f.tx, input())).toEqual({ status: 'verified', proofVersion: 1 })
  expect(f.query).toHaveBeenCalledOnce(); expect(f.query.mock.calls[0]).toEqual([expect.stringContaining('FOR UPDATE'), ['gst_proof_session001', proofHash, proofHash]])
  expect(f.query.mock.calls[0]?.[0]).toContain('possession_proof_hash'); expect(JSON.stringify(f.query.mock.calls)).not.toContain(proof); expect(f.execute).not.toHaveBeenCalled()
})
test('匿名信号为空的服务端令牌会话可认领；历史 cloudbase_anonymous 会话一律不可认领', async () => {
  const douyinFree = fixture([{ ...row(), anonymous_subject_hash: null }]); expect(await douyinFree.repository.lockAndVerify(douyinFree.tx, input())).toEqual({ status: 'verified', proofVersion: 1 })
  const legacy = fixture([{ ...row(), identity_source: 'cloudbase_anonymous' }]); expect(await legacy.repository.lockAndVerify(legacy.tx, input())).toEqual({ status: 'not_claimable' })
})
test('缺会话统一拒绝，重复或损坏行不可用', async () => {
  expect(await fixture([]).repository.lockAndVerify(fixture([]).tx, input())).toEqual({ status: 'not_claimable' })
  const duplicate = fixture([row(), row()]); expect(await duplicate.repository.lockAndVerify(duplicate.tx, input())).toEqual({ status: 'unavailable' })
  const damaged = fixture([{ ...row(), issued_at_ms: '1000garbage' }]); expect(await damaged.repository.lockAndVerify(damaged.tx, input())).toEqual({ status: 'unavailable' })
})
test.each(['extra', 'legacy_subject_field', 'bad_ref', 'unsafe_clock', 'bad_token'] as const)('非法可信输入%s先拒绝，无SQL', async kind => {
  const f = fixture(), value = input()
  if (kind === 'extra') { Object.assign(value, { userRef: 'usr_client001' }) }
  if (kind === 'legacy_subject_field') { Object.assign(value, { anonymousSubjectHash: 'a'.repeat(64) }) }
  if (kind === 'bad_ref') { value.guestSessionRef = 'gpc_other_case001' }
  if (kind === 'unsafe_clock') { value.nowMs = Number.MAX_SAFE_INTEGER + 1 }
  if (kind === 'bad_token') { value.possessionProof = 42 as never }
  await expect(f.repository.lockAndVerify(f.tx, value)).rejects.toThrow(); expect(f.query).not.toHaveBeenCalled()
})
test('没有显式事务不能锁定', async () => {
  const f = fixture(); await expect(f.repository.lockAndVerify({ connection: { query: f.query } } as never, input())).rejects.toThrow(); expect(f.query).not.toHaveBeenCalled()
})
test('等待SQL时修改原输入不改变固定证明上下文', async () => {
  const f = fixture(); let release!: (value: unknown[]) => void
  f.query.mockImplementation(() => new Promise(r => { release = r }))
  const value = input(), work = f.repository.lockAndVerify(f.tx, value); value.possessionProof = 'bad'; release([row()])
  expect(await work).toEqual({ status: 'verified', proofVersion: 1 })
})
test('数据库失败交给外层整体回滚，不伪装证明不匹配', async () => {
  const f = fixture(); f.query.mockRejectedValue(new Error('database unavailable')); await expect(f.repository.lockAndVerify(f.tx, input())).rejects.toThrow('database unavailable')
})
