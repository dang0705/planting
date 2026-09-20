import { describe, expect, test } from 'vitest'

import { planAiQuotaReservationExpiry } from '../../src/subscription/domain/plan-ai-quota-reservation-expiry.js'

const expiresAtMs = Number('1758376800000')

/**
 * Expected 来源：`care-points-ai-quota/v1` 与 P1 订阅语义 2.3 的 TTL 禁止自动释放规则。
 * 测试层次：L1 / `unit_fake`；纯函数没有替换数据库或外部边界。
 * 明确未覆盖：扫描租约、MySQL 行锁、最终供应商证据、HTTP 与 CloudBase。
 */
describe('AI 额度预占 TTL 裁决', () => {
  test('reserved 到期边界只进入待对账，不产生自动释放金额', () => {
    expect(
      planAiQuotaReservationExpiry({
        status: 'reserved',
        expiresAtMs,
        occurredAtMs: expiresAtMs
      })
    ).toEqual({
      kind: 'require_reconciliation',
      reason: 'reservation_ttl_expired'
    })
  })

  test('尚未到期或已经进入其他状态均保持无动作', () => {
    expect(
      planAiQuotaReservationExpiry({
        status: 'reserved',
        expiresAtMs,
        occurredAtMs: expiresAtMs - Number('1')
      })
    ).toEqual({ kind: 'no_action' })
    for (const status of ['settled', 'released', 'pending_reconciliation'] as const) {
      expect(
        planAiQuotaReservationExpiry({ status, expiresAtMs, occurredAtMs: expiresAtMs })
      ).toEqual({ kind: 'no_action' })
    }
  })

  test('非法时间失败关闭', () => {
    expect(() =>
      planAiQuotaReservationExpiry({
        status: 'reserved',
        expiresAtMs: Number('-1'),
        occurredAtMs: expiresAtMs
      })
    ).toThrow('AI额度预占TTL输入不合法')
  })
})
