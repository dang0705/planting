/** 已发布等级策略中的单级规则。 */
export type CareLevelPolicyEntry = {
  /** 稳定等级代码，例如 L0、L1。 */
  readonly code: string
  /** 达到该等级所需的累计净获得积分。 */
  readonly threshold: number
  /** 首次达到该等级时发放的 AI 额度；L0 固定为零。 */
  readonly aiReward: number
}

/** 规划奖励事件入账所需的账户与不可变策略快照。 */
export type PlanRewardEventApplicationInput = {
  /** 服务端根据事件发生时间解析出的正整数积分，不能来自事件生产域。 */
  readonly pointsAmount: number
  /** 积分账户当前可用余额。 */
  readonly availablePoints: number
  /** 积分账户当前累计净获得积分。 */
  readonly lifetimeNetEarned: number
  /** 积分账户当前等级代码。 */
  readonly currentLevelCode: string
  /** 已经终身发放过 AI 奖励的等级代码集合。 */
  readonly previouslyGrantedLevelCodes: readonly string[]
  /** 请求锁定的已发布等级策略快照。 */
  readonly levelPolicy: readonly CareLevelPolicyEntry[]
}

/** 本次跨越且尚未发放过的单级 AI 奖励。 */
export type PlannedCareLevelReward = {
  /** 首次达到的等级代码。 */
  readonly levelCode: string
  /** 该等级策略冻结的 AI 奖励额度。 */
  readonly aiReward: number
}

/** 奖励事件的积分账户与等级终态计划。 */
export type RewardEventApplicationPlan = {
  /** 本次写入不可变积分账本的正整数积分。 */
  readonly pointsAmount: number
  /** 入账后的可用积分。 */
  readonly nextAvailablePoints: number
  /** 入账后的累计净获得积分。 */
  readonly nextLifetimeNetEarned: number
  /** 入账后的最高已达等级代码。 */
  readonly nextLevelCode: string
  /** 本次需要首次发放的等级 AI 奖励，按等级阈值升序。 */
  readonly newLevelRewards: readonly PlannedCareLevelReward[]
}

const zero = Number('0')

/** 判断一个值是否为安全的非负整数。 */
function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/** 校验不可变等级策略并返回代码索引。 */
function verifyLevelPolicy(
  policy: readonly CareLevelPolicyEntry[]
): ReadonlyMap<string, CareLevelPolicyEntry> {
  const index = new Map<string, CareLevelPolicyEntry>()
  let previousThreshold = -Number('1')
  for (const entry of policy) {
    if (
      !/^L[0-9]+$/.test(entry.code) ||
      index.has(entry.code) ||
      !isSafeNonNegativeInteger(entry.threshold) ||
      entry.threshold <= previousThreshold ||
      !isSafeNonNegativeInteger(entry.aiReward)
    ) {
      throw new Error('奖励事件积分计划输入不合法')
    }
    index.set(entry.code, entry)
    previousThreshold = entry.threshold
  }
  const first = policy.at(zero)
  if (first?.code !== 'L0' || first.threshold !== zero || first.aiReward !== zero) {
    throw new Error('奖励事件积分计划输入不合法')
  }
  return index
}

/** 按累计净获得积分解析当前应处等级。 */
function resolveLevelCode(
  policy: readonly CareLevelPolicyEntry[],
  lifetimeNetEarned: number
): string {
  let resolved = policy[zero]!.code
  for (const entry of policy) {
    if (entry.threshold > lifetimeNetEarned) {
      break
    }
    resolved = entry.code
  }
  return resolved
}

/**
 * 根据已发布策略规划一次奖励事件的积分入账与等级奖励。
 *
 * 本函数不解析外部事件、不访问数据库，也不生成引用；Repository 必须在同一事务内应用计划。
 */
export function planRewardEventApplication(
  input: PlanRewardEventApplicationInput
): RewardEventApplicationPlan {
  if (
    !Number.isSafeInteger(input.pointsAmount) ||
    input.pointsAmount <= zero ||
    !isSafeNonNegativeInteger(input.availablePoints) ||
    !isSafeNonNegativeInteger(input.lifetimeNetEarned)
  ) {
    throw new Error('奖励事件积分计划输入不合法')
  }
  const nextAvailablePoints = input.availablePoints + input.pointsAmount
  const nextLifetimeNetEarned = input.lifetimeNetEarned + input.pointsAmount
  if (
    !Number.isSafeInteger(nextAvailablePoints) ||
    !Number.isSafeInteger(nextLifetimeNetEarned)
  ) {
    throw new Error('奖励事件积分计划输入不合法')
  }
  const policyIndex = verifyLevelPolicy(input.levelPolicy)
  if (
    !policyIndex.has(input.currentLevelCode) ||
    resolveLevelCode(input.levelPolicy, input.lifetimeNetEarned) !== input.currentLevelCode
  ) {
    throw new Error('奖励事件积分计划输入不合法')
  }
  const grantedLevels = new Set(input.previouslyGrantedLevelCodes)
  if (
    grantedLevels.size !== input.previouslyGrantedLevelCodes.length ||
    input.previouslyGrantedLevelCodes.some(code => code === 'L0' || !policyIndex.has(code))
  ) {
    throw new Error('奖励事件积分计划输入不合法')
  }

  const newLevelRewards = input.levelPolicy
    .filter(
      entry =>
        entry.threshold > zero &&
        entry.threshold > input.lifetimeNetEarned &&
        entry.threshold <= nextLifetimeNetEarned &&
        !grantedLevels.has(entry.code)
    )
    .map(entry => ({ levelCode: entry.code, aiReward: entry.aiReward }))

  return {
    pointsAmount: input.pointsAmount,
    nextAvailablePoints,
    nextLifetimeNetEarned,
    nextLevelCode: resolveLevelCode(input.levelPolicy, nextLifetimeNetEarned),
    newLevelRewards
  }
}
