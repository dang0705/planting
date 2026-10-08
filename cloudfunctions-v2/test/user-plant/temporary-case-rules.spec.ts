import { describe, expect, it } from 'vitest'

import {
  decideAuthenticatedTemporaryCase,
  decideGuestTemporaryCase
} from '../../src/user-plant/domain/temporary-case-rules.js'

/**
 * unit_fake（L1 纯函数）。Expected：temporary-case-contract.md §1 expiresAt、§2 游客/登录规则；
 * 测试矩阵 D1–D4（D2 依据 2026-10-09 更新的合同 §1：游客案例 expiresAt 等于游客会话 expiresAt）。夹具 5 / 168 为配置目录 confirmed 值，由调用方以策略快照传入。
 */
const hour = 3_600_000
const now = Date.UTC(2026, 9, 9, 4)
const guestBase = {
  guestSessionStatus: 'active',
  guestSessionExpiresAtMs: now + 24 * hour,
  activeCaseCount: 0,
  maxCasesPerSession: 5,
  nowMs: now
}

describe('游客临时案例裁决', () => {
  it('D1 第 5 个（已有 4 个）仍可创建', () => {
    expect(decideGuestTemporaryCase({ ...guestBase, activeCaseCount: 4 }).kind).toBe('create')
  })
  it('D1 已有 5 个 → limit_reached', () => {
    expect(decideGuestTemporaryCase({ ...guestBase, activeCaseCount: 5 })).toEqual({ kind: 'limit_reached' })
    expect(decideGuestTemporaryCase({ ...guestBase, activeCaseCount: 7 })).toEqual({ kind: 'limit_reached' })
  })
  it('D2 会话先于案例有效期到期 → 取会话 expiresAt', () => {
    expect(decideGuestTemporaryCase(guestBase)).toEqual({ kind: 'create', expiresAtMs: now + 24 * hour })
  })
  it('D2 会话晚于 now+168h 到期 → 仍等于会话 expiresAt，不借用登录案例有效期', () => {
    expect(decideGuestTemporaryCase({ ...guestBase, guestSessionExpiresAtMs: now + 200 * hour }))
      .toEqual({ kind: 'create', expiresAtMs: now + 200 * hour })
  })
  it('D3 会话非 active 或已到期 → principal_invalid（优先于数量判断）', () => {
    for (const status of ['completed', 'failed', 'expired']) {
      expect(decideGuestTemporaryCase({ ...guestBase, guestSessionStatus: status })).toEqual({ kind: 'principal_invalid' })
    }
    expect(decideGuestTemporaryCase({ ...guestBase, guestSessionExpiresAtMs: now })).toEqual({ kind: 'principal_invalid' })
    expect(decideGuestTemporaryCase({ ...guestBase, guestSessionExpiresAtMs: now - 1, activeCaseCount: 5 })).toEqual({ kind: 'principal_invalid' })
  })
  it('非法内部输入抛出，不猜默认', () => {
    expect(() => decideGuestTemporaryCase({ ...guestBase, maxCasesPerSession: 0 })).toThrow(TypeError)
    expect(() => decideGuestTemporaryCase({ ...guestBase, activeCaseCount: -1 })).toThrow(TypeError)
  })
})

describe('登录临时案例裁决', () => {
  it('D4 expiresAt = now + 有效期小时', () => {
    expect(decideAuthenticatedTemporaryCase({ caseTtlHours: 168, nowMs: now })).toEqual({ expiresAtMs: now + 168 * hour })
  })
  it('非法有效期抛出', () => {
    expect(() => decideAuthenticatedTemporaryCase({ caseTtlHours: 0, nowMs: now })).toThrow(TypeError)
  })
})
