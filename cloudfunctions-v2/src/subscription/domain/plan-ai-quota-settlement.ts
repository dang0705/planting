/** 一条仍处于预占状态、等待结算或释放的批次分摊。 */
export type AiQuotaSettlementAllocationCandidate = {
  /** 被预占额度批次的高熵公开引用。 */
  readonly grantRef: string
  /** 该分摊仍待结算或释放的正整数额度。 */
  readonly remainingAmount: number
}

/** 计算一次额度结算和释放计划所需的可信输入。 */
export type PlanAiQuotaSettlementInput = {
  /** 原预占锁定的正整数总额。 */
  readonly estimatedAmount: number
  /** 成本策略根据可审计实际成本计算的结算额度，不得超过原预占。 */
  readonly settledAmount: number
  /** 按原预占稳定消费顺序排列的分摊。 */
  readonly allocations: readonly AiQuotaSettlementAllocationCandidate[]
}

/** 一条分摊在终态中被结算和释放的额度。 */
export type PlannedAiQuotaSettlementAllocation = {
  /** 被结算或释放额度批次的高熵公开引用。 */
  readonly grantRef: string
  /** 从该批次预占转为已消费的非负整数额度。 */
  readonly settledAmount: number
  /** 从该批次预占退回可用余额的非负整数额度。 */
  readonly releasedAmount: number
}

/** 具有实际消费额度的结算终态。 */
export type SettledAiQuotaPlan = {
  /** 判定类别；表示 reservation 应进入 settled。 */
  readonly kind: 'settled'
  /** 原预占锁定的额度总额。 */
  readonly estimatedAmount: number
  /** 本次从预占转为已消费的额度总额。 */
  readonly settledAmount: number
  /** 本次从预占退回可用余额的额度总额。 */
  readonly releasedAmount: number
  /** 按原稳定顺序生成的全部分摊终态。 */
  readonly allocations: readonly PlannedAiQuotaSettlementAllocation[]
}

/** 没有实际消费时的完整释放终态。 */
export type ReleasedAiQuotaPlan = {
  /** 判定类别；表示 reservation 应进入 released。 */
  readonly kind: 'released'
  /** 原预占锁定的额度总额。 */
  readonly estimatedAmount: number
  /** 完整释放时固定为零，并由领域测试锁定。 */
  readonly settledAmount: number
  /** 本次退回可用余额的全部预占额度。 */
  readonly releasedAmount: number
  /** 按原稳定顺序生成的全部释放分摊。 */
  readonly allocations: readonly PlannedAiQuotaSettlementAllocation[]
}

/** 实际成本折算额度超过预占时的待对账计划。 */
export type PendingAiQuotaReconciliationPlan = {
  /** 判定类别；表示不得提前结算、释放或继续扣减用户额度。 */
  readonly kind: 'pending_reconciliation'
  /** 原预占锁定的额度总额。 */
  readonly estimatedAmount: number
  /** 实际成本按不可变策略折算出的所需结算额度。 */
  readonly requestedSettlementAmount: number
  /** 超过用户原预占且不能直接转嫁给用户的额度缺口。 */
  readonly quotaShortfallAmount: number
  /** 待对账时固定为空，防止应用层提前改变分摊。 */
  readonly allocations: readonly []
}

/** 额度预占的确定性结算或释放计划。 */
export type AiQuotaSettlementPlan =
  | SettledAiQuotaPlan
  | ReleasedAiQuotaPlan
  | PendingAiQuotaReconciliationPlan

const zero = Number('0')

/** 判断额度是否为 JavaScript 可安全表达的非负整数。 */
function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/**
 * 将原预占分摊完整归约为结算与释放终态。
 *
 * 结算始终沿用原预占的稳定批次顺序；实际额度超过预占属于对账分支，禁止在本函数中
 * 多扣用户或制造负余额。
 */
export function planAiQuotaSettlement(input: PlanAiQuotaSettlementInput): AiQuotaSettlementPlan {
  if (
    !Number.isSafeInteger(input.estimatedAmount) ||
    input.estimatedAmount <= zero ||
    !isSafeNonNegativeInteger(input.settledAmount) ||
    input.allocations.length === zero
  ) {
    throw new Error('AI额度结算输入不合法')
  }

  const seenGrantRefs = new Set<string>()
  let allocationTotal = zero
  for (const allocation of input.allocations) {
    if (
      !/^aqg_[A-Za-z0-9_-]{1,}$/u.test(allocation.grantRef) ||
      !Number.isSafeInteger(allocation.remainingAmount) ||
      allocation.remainingAmount <= zero ||
      seenGrantRefs.has(allocation.grantRef)
    ) {
      throw new Error('AI额度结算输入不合法')
    }
    seenGrantRefs.add(allocation.grantRef)
    allocationTotal += allocation.remainingAmount
    if (!Number.isSafeInteger(allocationTotal)) {
      throw new Error('AI额度结算输入不合法')
    }
  }
  if (allocationTotal !== input.estimatedAmount) {
    throw new Error('AI额度结算分摊不守恒')
  }

  if (input.settledAmount > input.estimatedAmount) {
    return {
      kind: 'pending_reconciliation',
      estimatedAmount: input.estimatedAmount,
      requestedSettlementAmount: input.settledAmount,
      quotaShortfallAmount: input.settledAmount - input.estimatedAmount,
      allocations: []
    }
  }

  let unsettledAmount = input.settledAmount
  const allocations = input.allocations.map(allocation => {
    const settledAmount = Math.min(allocation.remainingAmount, unsettledAmount)
    unsettledAmount -= settledAmount
    return {
      grantRef: allocation.grantRef,
      settledAmount,
      releasedAmount: allocation.remainingAmount - settledAmount
    }
  })
  const releasedAmount = input.estimatedAmount - input.settledAmount

  if (input.settledAmount === zero) {
    return {
      kind: 'released',
      estimatedAmount: input.estimatedAmount,
      settledAmount: zero,
      releasedAmount,
      allocations
    }
  }
  return {
    kind: 'settled',
    estimatedAmount: input.estimatedAmount,
    settledAmount: input.settledAmount,
    releasedAmount,
    allocations
  }
}
