/** AI 额度预占 TTL 裁决允许接收的生命周期状态。 */
export type AiQuotaReservationExpiryStatus =
  | 'reserved'
  | 'settled'
  | 'released'
  | 'pending_reconciliation'

/** 判断预占 TTL 是否需要转入待对账的可信输入。 */
export type PlanAiQuotaReservationExpiryInput = {
  /** 当前已持久化的预占生命周期状态。 */
  readonly status: AiQuotaReservationExpiryStatus
  /** 预占租约的失效边界，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 扫描任务使用的服务端可信当前时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** TTL 尚未命中或预占已经离开 reserved 时的结果。 */
export type AiQuotaReservationExpiryNoAction = {
  /** 固定为无动作，禁止据此修改余额或账本。 */
  readonly kind: 'no_action'
}

/** TTL 到期后要求进入待对账的结果。 */
export type AiQuotaReservationExpiryRequiresReconciliation = {
  /** 固定要求待对账，不包含任何自动释放或结算金额。 */
  readonly kind: 'require_reconciliation'
  /** 可审计的固定原因：预占租约已经到期。 */
  readonly reason: 'reservation_ttl_expired'
}

/** AI 额度预占 TTL 的封闭裁决结果。 */
export type AiQuotaReservationExpiryPlan =
  | AiQuotaReservationExpiryNoAction
  | AiQuotaReservationExpiryRequiresReconciliation

const zero = Number('0')

/**
 * 裁决预占 TTL，且明确禁止把时间到期等同于“模型调用未发生”。
 *
 * 只有最终供应商证据能够决定结算或释放；本函数永远不返回额度金额。
 */
export function planAiQuotaReservationExpiry(
  input: PlanAiQuotaReservationExpiryInput
): AiQuotaReservationExpiryPlan {
  if (
    !Number.isSafeInteger(input.expiresAtMs) ||
    input.expiresAtMs < zero ||
    !Number.isSafeInteger(input.occurredAtMs) ||
    input.occurredAtMs < zero
  ) {
    throw new Error('AI额度预占TTL输入不合法')
  }
  if (input.status !== 'reserved' || input.occurredAtMs < input.expiresAtMs) {
    return { kind: 'no_action' }
  }
  return {
    kind: 'require_reconciliation',
    reason: 'reservation_ttl_expired'
  }
}
