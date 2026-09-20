import type { UserGenerativeCapability } from '../../contracts/types.js'

/** 可供一次预占选择的已锁定额度批次快照。 */
export type AiQuotaGrantCandidate = {
  /** 高熵额度批次公开引用；排序和分摊结果均使用它，不暴露数据库内部主键。 */
  readonly grantRef: string
  /** 当前事务锁定后仍可用于新预占的正整数或零。 */
  readonly availableAmount: number
  /** 额度批次开始生效的 UTC 毫秒。 */
  readonly grantedAtMs: number
  /** 额度批次的开区间失效时刻；达到该时刻后不得参与新预占。 */
  readonly expiresAtMs: number
  /** 该批次允许支付的生成式能力集合；必须去重并按代码稳定排序。 */
  readonly capabilityScope: readonly UserGenerativeCapability[]
}

/** 计算一次额度预占分摊所需的可信输入。 */
export type PlanAiQuotaAllocationInput = {
  /** 本次产品动作实际需要的生成式能力。 */
  readonly capability: UserGenerativeCapability
  /** 成本策略计算出的正整数最大预占额度。 */
  readonly estimatedAmount: number
  /** 服务端可信时钟提供的业务发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** Repository 在同一事务中锁定并读回的额度批次快照。 */
  readonly grants: readonly AiQuotaGrantCandidate[]
}

/** 一条额度批次被本次产品动作锁定的额度。 */
export type PlannedAiQuotaAllocation = {
  /** 被分摊的额度批次公开引用。 */
  readonly grantRef: string
  /** 从该批次转入预占的正整数额度。 */
  readonly reservedAmount: number
}

/** 可用额度充足时产生的完整分摊计划。 */
export type AllocatedAiQuotaPlan = {
  /** 判定类别；表示可以在同一事务中写入全部分摊。 */
  readonly kind: 'allocated'
  /** 与输入成本策略一致的预占总额。 */
  readonly estimatedAmount: number
  /** 按消费顺序排列且总和严格等于预占总额的分摊。 */
  readonly allocations: readonly PlannedAiQuotaAllocation[]
}

/** 可用额度不足时的无副作用拒绝结果。 */
export type InsufficientAiQuotaPlan = {
  /** 判定类别；表示不得写入 reservation、allocation 或 ledger。 */
  readonly kind: 'insufficient_quota'
  /** 本次产品动作需要的预占总额。 */
  readonly estimatedAmount: number
  /** 所有当前有效且能力匹配批次的可用额度总和。 */
  readonly availableAmount: number
  /** 仍缺少的正整数额度。 */
  readonly shortfallAmount: number
  /** 余额不足时固定为空，防止应用层误写半分摊。 */
  readonly allocations: readonly []
}

/** 额度预占分摊的封闭领域结果。 */
export type AiQuotaAllocationPlan = AllocatedAiQuotaPlan | InsufficientAiQuotaPlan

const zero = Number('0')
const one = Number('1')
const knownCapabilities = new Set<UserGenerativeCapability>([
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])

/** 整数额度必须可由 JavaScript 安全表达，避免数据库与运行时发生精度分歧。 */
function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/** 能力集合必须非空、合法、去重并按代码稳定排序。 */
function isCapabilityScopeValid(scope: readonly UserGenerativeCapability[]): boolean {
  if (scope.length === zero) {
    return false
  }
  for (let index = zero; index < scope.length; index += one) {
    const capability = scope[index]
    const previousCapability = index > zero ? scope[index - one] : undefined
    if (
      capability === undefined ||
      !knownCapabilities.has(capability) ||
      (previousCapability !== undefined && previousCapability >= capability)
    ) {
      return false
    }
  }
  return true
}

/** 批次必须具有公开引用、守恒所需的安全整数与合法生效区间。 */
function assertGrantValid(grant: AiQuotaGrantCandidate): void {
  if (
    !grant.grantRef.startsWith('aqg_') ||
    !isSafeNonNegativeInteger(grant.availableAmount) ||
    !isSafeNonNegativeInteger(grant.grantedAtMs) ||
    !isSafeNonNegativeInteger(grant.expiresAtMs) ||
    grant.expiresAtMs <= grant.grantedAtMs ||
    !isCapabilityScopeValid(grant.capabilityScope)
  ) {
    throw new Error('额度批次候选不合法')
  }
}

/** 按到期时间、发放时间、批次引用形成跨运行时稳定的消费顺序。 */
function compareGrantOrder(first: AiQuotaGrantCandidate, second: AiQuotaGrantCandidate): number {
  if (first.expiresAtMs !== second.expiresAtMs) {
    return first.expiresAtMs - second.expiresAtMs
  }
  if (first.grantedAtMs !== second.grantedAtMs) {
    return first.grantedAtMs - second.grantedAtMs
  }
  if (first.grantRef === second.grantRef) {
    return zero
  }
  return first.grantRef < second.grantRef ? -one : one
}

/**
 * 从已锁定的额度批次计算一次原子预占的完整分摊。
 *
 * 本函数不访问数据库、不改变批次余额、不创建 reservation 或 ledger。Repository 只有在
 * `allocated` 时才可在同一事务应用全部分摊；余额不足结果绝不携带部分计划。
 */
export function planAiQuotaAllocation(input: PlanAiQuotaAllocationInput): AiQuotaAllocationPlan {
  if (!Number.isSafeInteger(input.estimatedAmount) || input.estimatedAmount <= zero) {
    throw new Error('预占额度不合法')
  }
  if (!isSafeNonNegativeInteger(input.occurredAtMs)) {
    throw new Error('预占时间不合法')
  }

  const seenGrantRefs = new Set<string>()
  for (const grant of input.grants) {
    assertGrantValid(grant)
    if (seenGrantRefs.has(grant.grantRef)) {
      throw new Error('额度批次候选不合法')
    }
    seenGrantRefs.add(grant.grantRef)
  }

  const eligibleGrants = input.grants
    .filter(
      grant =>
        grant.availableAmount > zero &&
        grant.grantedAtMs <= input.occurredAtMs &&
        input.occurredAtMs < grant.expiresAtMs &&
        grant.capabilityScope.includes(input.capability)
    )
    .sort(compareGrantOrder)

  let availableAmount = zero
  for (const grant of eligibleGrants) {
    availableAmount += grant.availableAmount
    if (!Number.isSafeInteger(availableAmount)) {
      throw new Error('额度批次候选不合法')
    }
  }

  if (availableAmount < input.estimatedAmount) {
    return {
      kind: 'insufficient_quota',
      estimatedAmount: input.estimatedAmount,
      availableAmount,
      shortfallAmount: input.estimatedAmount - availableAmount,
      allocations: []
    }
  }

  let remainingAmount = input.estimatedAmount
  const allocations: PlannedAiQuotaAllocation[] = []
  for (const grant of eligibleGrants) {
    if (remainingAmount === zero) {
      break
    }
    const reservedAmount = Math.min(grant.availableAmount, remainingAmount)
    allocations.push({ grantRef: grant.grantRef, reservedAmount })
    remainingAmount -= reservedAmount
  }

  return {
    kind: 'allocated',
    estimatedAmount: input.estimatedAmount,
    allocations
  }
}
