import { describe, expect, test } from 'vitest'

import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import type { DatabaseTransactionDriver, TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import { createClaimGuestPlantCaseApplicationService, type ClaimGuestPlantCaseApplicationInput } from '../../src/user-plant/application/claim-guest-plant-case.js'

/**
 * unit_fake（L3 应用编排）。Expected：guest-claim-lease-test-matrix.md A1–A5（guest-session-claim/v1 状态机
 * requested→processing→completed；硬规则 30 秒租约；完成阶段复用既有完成应用）。
 * 替换：事务驱动、登记/租约仓储、完成应用、收据读取器为记录调用顺序的替身。
 */
/** 测试事务。 */
type Tx = TransactionExecutionContext & {
  /** 测试用事务标识。 */
  readonly ref: string
}
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_claimfull_owner01' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:00:09Z' }
const receipt = { status: 'completed' as const, claimRef: 'gcl_claimfull_original01', userPlantRef: 'upl_claimfull_existing1', guestPlantCaseRef: 'gpc_claimfull_case0001', proofVersion: 2, claimedAtMs: 3000 }
function input(): ClaimGuestPlantCaseApplicationInput {
  return {
    principal,
    proof: { guestSessionRef: 'gst_claimfull_session01', possessionProof: Buffer.alloc(32, 7).toString('base64url'), nowMs: 3000, proofRotationGraceSeconds: null },
    guestPlantCaseRef: 'gpc_claimfull_case0001',
    target: { type: 'existing_user_plant', user_plant_id: 'upl_claimfull_existing1' },
    claimRef: 'gcl_claimfull_candidate1',
    idempotencyKeyHash: 'b'.repeat(64)
  }
}

function setup(overrides: {
  /** 事务前读到的原成功收据。 */
  readonly prior?: typeof receipt | null
  /** 登记结果。 */
  readonly registration?: Record<string, unknown>
  /** 租约结果。 */
  readonly lease?: Record<string, unknown>
  /** 完成应用结果。 */
  readonly completion?: Record<string, unknown>
} = {}) {
  const events: string[] = []
  const completions: unknown[] = []
  let reads = 0
  const tx: Tx = { transactionContext: true, ref: 'tx1' }
  const driver: DatabaseTransactionDriver<Tx> = {
    async beginTransaction() { events.push('begin'); return tx },
    async commitTransaction() { events.push('commit') },
    async rollbackTransaction() { events.push('rollback') },
    async recordRollbackFailure() { events.push('rollback-failed') }
  }
  const service = createClaimGuestPlantCaseApplicationService<Tx>({
    nowMs: () => 3000,
    driver,
    createLeaseOwnerHash: () => 'c'.repeat(64),
    completedReceiptReader: { readCompleted: async () => { reads += 1; events.push(`receipt:${reads}`); return reads === 1 ? (overrides.prior ?? null) : receipt } },
    registrationRepository: { register: async (t, value) => { events.push(`register:${t.ref}:${value.claimRef}`); return (overrides.registration ?? { status: 'registered', claimRef: 'gcl_claimfull_original01', proofVersion: 2, replayed: true }) as never } },
    leaseRepository: { acquire: async (t, value) => { events.push(`lease:${t.ref}:${value.claimRef}:${value.leaseOwnerHash}`); return (overrides.lease ?? { status: 'acquired', leaseExpiresAtMs: 33_000, attemptCount: 1, takeover: false }) as never } },
    completeClaim: async value => { events.push('complete'); completions.push(value); return (overrides.completion ?? receipt) as never }
  })
  return { service, events, completions }
}

describe('游客认领完整应用用例', () => {
  test('A1 登记→租约（同一事务提交）→完成；完成输入使用原 claimRef 与服务端持有者', async () => {
    const f = setup()
    expect(await f.service(input())).toEqual(receipt)
    expect(f.events).toEqual(['receipt:1', 'begin', 'register:tx1:gcl_claimfull_candidate1', `lease:tx1:gcl_claimfull_original01:${'c'.repeat(64)}`, 'commit', 'complete'])
    expect(f.completions[0]).toMatchObject({ claimRef: 'gcl_claimfull_original01', leaseOwnerHash: 'c'.repeat(64), guestPlantCaseRef: 'gpc_claimfull_case0001' })
  })
  test('A2 原成功收据存在 → 直接返回，不登记、不取得', async () => {
    const f = setup({ prior: receipt })
    expect(await f.service(input())).toEqual(receipt)
    expect(f.events).toEqual(['receipt:1'])
  })
  test.each(['not_claimable', 'expired', 'principal_invalid', 'idempotency_conflict'] as const)('A3 登记拒绝 %s → 原样返回并提交，不取得租约', async status => {
    const f = setup({ registration: { status } })
    expect(await f.service(input())).toEqual({ status })
    expect(f.events.some(event => event.startsWith('lease') || event === 'complete')).toBe(false)
  })
  test('A4 租约被他人持有 → processing，不调用完成', async () => {
    const f = setup({ lease: { status: 'held' } })
    expect(await f.service(input())).toEqual({ status: 'processing' })
    expect(f.events).not.toContain('complete')
  })
  test('A5 租约阶段命令已 completed → 只读核对原收据', async () => {
    const f = setup({ lease: { status: 'completed' } })
    expect(await f.service(input())).toEqual(receipt)
    expect(f.events.at(-1)).toBe('receipt:2')
    expect(f.events).not.toContain('complete')
  })
  test('命令 failed → not_claimable；租约读不到/不可用 → 回滚 unavailable', async () => {
    expect(await setup({ lease: { status: 'failed' } }).service(input())).toEqual({ status: 'not_claimable' })
    const missing = setup({ lease: { status: 'not_found' } })
    expect(await missing.service(input())).toEqual({ status: 'unavailable' })
    expect(missing.events).toContain('rollback')
  })
  test('新建目标：候选植物与能力原样交给完成应用', async () => {
    const f = setup({ completion: { ...receipt, userPlantRef: 'upl_claimfull_newplant1' } })
    const value = { ...input(), target: { type: 'new_user_plant' as const }, newUserPlantRef: 'upl_claimfull_newplant1', capabilitySnapshot: null }
    await f.service(value)
    expect(f.completions[0]).toMatchObject({ target: { type: 'new_user_plant' }, newUserPlantRef: 'upl_claimfull_newplant1', capabilitySnapshot: null })
  })
})
