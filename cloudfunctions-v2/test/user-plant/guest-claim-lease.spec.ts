import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { RUNTIME_PARAMETERS } from '../../src/configuration/runtime-parameters.js'
import { decideGuestClaimLease } from '../../src/user-plant/domain/guest-claim-lease.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1（L1 规则 unit_fake + 配置目录 unit_real_data）。Expected：硬规则 `user-plant.guest_claim.processing_lease_seconds` = 30
 * （主代理 2026-10-09 裁决：取得 lease_expires = now + 30000；requested→processing attempt=1；过期接管 attempt+1 换持有者；
 * 未过期非本人不接管；failed/completed 不取得）。矩阵 L1–L5。
 */
const now = 100_000
const mine = 'a'.repeat(64)
const other = 'b'.repeat(64)
const leaseMs = 30_000
const catalog = JSON.parse(readFileSync(join(findProjectRoot(), 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as {
  variables: Array<{ id: string; status: string; currentValue: unknown }>
}

describe('游客认领处理租约规则', () => {
  // 用户 2026-10-10 第三轮裁定：租约改为运维参数（代码默认 30 秒，部署环境变量 V2_USER_PLANT_GUEST_CLAIM_LEASE_SECONDS 在 10–120 内覆盖），由入口注入 leaseMs。
  it('L1 代码默认 30 秒且与配置目录一致（环境变量可覆盖）', () => {
    expect(catalog.variables.find(item => item.id === 'user-plant.guest_claim.processing_lease_seconds')).toMatchObject({ status: 'confirmed', configurationTier: 'env_overridable', currentValue: 30 })
    expect(RUNTIME_PARAMETERS.userPlant.guestClaimProcessingLeaseSeconds.value * 1000).toBe(leaseMs)
  })
  it('L2 requested → 首次取得：attempt=1，期限 now+30000', () => {
    expect(decideGuestClaimLease({ status: 'requested', leaseOwnerHash: null, leaseExpiresAtMs: null, attemptCount: 0, updatedAtMs: now - 10, nowMs: now, candidateOwnerHash: mine, leaseMs }))
      .toEqual({ kind: 'acquire', attemptCount: 1, leaseExpiresAtMs: now + 30_000, takeover: false })
  })
  it('L3 processing 且租约已过期（含到期边界）→ 接管：attempt+1，新期限', () => {
    for (const expiresAt of [now, now - 1]) {
      expect(decideGuestClaimLease({ status: 'processing', leaseOwnerHash: other, leaseExpiresAtMs: expiresAt, attemptCount: 2, updatedAtMs: expiresAt - 30_000, nowMs: now, candidateOwnerHash: mine, leaseMs }))
        .toEqual({ kind: 'acquire', attemptCount: 3, leaseExpiresAtMs: now + 30_000, takeover: true })
    }
  })
  it('L4 processing 且未过期、持有者不同 → held', () => {
    expect(decideGuestClaimLease({ status: 'processing', leaseOwnerHash: other, leaseExpiresAtMs: now + 1, attemptCount: 1, updatedAtMs: now - 29_999, nowMs: now, candidateOwnerHash: mine, leaseMs })).toEqual({ kind: 'held' })
  })
  it('L4 processing 且未过期、本人持有 → already_owned，不写', () => {
    expect(decideGuestClaimLease({ status: 'processing', leaseOwnerHash: mine, leaseExpiresAtMs: now + 1, attemptCount: 1, updatedAtMs: now - 29_999, nowMs: now, candidateOwnerHash: mine, leaseMs }))
      .toEqual({ kind: 'already_owned', leaseExpiresAtMs: now + 1 })
  })
  it('L5 completed / failed 不取得', () => {
    expect(decideGuestClaimLease({ status: 'completed', leaseOwnerHash: null, leaseExpiresAtMs: null, attemptCount: 1, updatedAtMs: now, nowMs: now, candidateOwnerHash: mine, leaseMs })).toEqual({ kind: 'completed' })
    expect(decideGuestClaimLease({ status: 'failed', leaseOwnerHash: null, leaseExpiresAtMs: null, attemptCount: 1, updatedAtMs: now, nowMs: now, candidateOwnerHash: mine, leaseMs })).toEqual({ kind: 'failed' })
  })
  it.each([
    ['未知状态', { status: 'unknown' }],
    ['requested 却有租约', { status: 'requested', leaseOwnerHash: other, leaseExpiresAtMs: now + 1 }],
    ['processing 缺租约', { status: 'processing', leaseOwnerHash: null, leaseExpiresAtMs: null, attemptCount: 1 }],
    ['processing attempt=0', { status: 'processing', leaseOwnerHash: other, leaseExpiresAtMs: now - 1, attemptCount: 0 }],
    ['时钟早于命令更新', { status: 'requested', updatedAtMs: now + 1 }],
    ['候选持有者非法', { status: 'requested', candidateOwnerHash: 'XYZ' }]
  ])('损坏或非法输入 %s → invalid', (_name, patch) => {
    const base = { status: 'requested', leaseOwnerHash: null, leaseExpiresAtMs: null, attemptCount: 0, updatedAtMs: now - 10, nowMs: now, candidateOwnerHash: mine }
    expect(decideGuestClaimLease({ ...base, ...patch } as Parameters<typeof decideGuestClaimLease>[0])).toEqual({ kind: 'invalid' })
  })
})
