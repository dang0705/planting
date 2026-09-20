/** `user-plant-profile/v1` 冻结的最低档案字段。 */
export type UserPlantProfileRequiredField =
  | 'identityStatus'
  | 'pot'
  | 'location'
  | 'lightingEnvironment'
  | 'ventilationEnvironment'

/** 当前合同允许作为完整档案基础的用户植物身份状态。 */
export type AcceptedUserPlantIdentityStatus = 'unidentified' | 'candidate_pending' | 'confirmed'

/** 配置中心发布的不可变最低档案策略快照。 */
export type UserPlantProfileCompletenessPolicy = {
  /** 本次判断锁定的策略版本；当前只接受已冻结的 v1。 */
  readonly profileVersion: string
  /** 完整档案必须具备的字段集合；不得由客户端删减。 */
  readonly requiredFields: readonly string[]
  /** 允许参与完整度判断的当前身份状态集合。 */
  readonly acceptedIdentityStates: readonly string[]
  /** 首株完整档案奖励资格必须按统一用户终身只产生一次。 */
  readonly rewardOncePerUser: boolean
}

/** Repository 对已通过各自 Schema 的档案与环境字段生成的存在性证据。 */
export type UserPlantProfileCompletenessInput = {
  /** 用户植物当前身份状态；数据库损坏值会作为身份缺项处理。 */
  readonly identityStatus: string
  /** 盆器与介质档案已经通过对应 Schema。 */
  readonly hasPot: boolean
  /** 脱敏位置配置已经通过对应 Schema。 */
  readonly hasLocation: boolean
  /** 用户植物光照环境已经通过对应 Schema。 */
  readonly hasLightingEnvironment: boolean
  /** 通风与空气环境已经通过对应 Schema。 */
  readonly hasVentilationEnvironment: boolean
  /** 首次完成时间；为空表示尚未完成，非空后不得覆盖。 */
  readonly profileCompletedAtMs: number | null
  /** 同一统一用户是否已有其他档案完成；由持有用户行锁的 Repository 查询。 */
  readonly userPreviouslyCompletedProfile: boolean
  /** 服务端可信时钟提供的本次判断时间，UTC 毫秒。 */
  readonly occurredAtMs: number
  /** 请求开始时锁定的不可变策略快照。 */
  readonly policy: UserPlantProfileCompletenessPolicy
}

/** 档案尚未满足最低要求。 */
export type IncompleteUserPlantProfileDecision = {
  /** 判定类别；`incomplete` 表示仍有最低档案字段未满足。 */
  readonly kind: 'incomplete'
  /** 按冻结字段顺序返回缺项，供应用层记录脱敏业务结果。 */
  readonly missingFields: readonly UserPlantProfileRequiredField[]
}

/** 档案在本次命令中首次满足最低要求。 */
export type NewlyCompletedUserPlantProfileDecision = {
  /** 判定类别；`completed_now` 表示本次命令首次完成档案。 */
  readonly kind: 'completed_now'
  /** 必须写入档案记录和奖励事件的策略版本。 */
  readonly profileVersion: 'user-plant-profile/v1'
  /** 首次完成时间，之后不得被覆盖。 */
  readonly completedAtMs: number
  /** 只有该统一用户终身第一次完成档案时才允许产生奖励资格事件。 */
  readonly rewardEligible: boolean
}

/** 档案此前已经完成；本次不得再次产生奖励事件。 */
export type AlreadyCompletedUserPlantProfileDecision = {
  /** 判定类别；`already_completed` 表示此前已完成且不得重复奖励。 */
  readonly kind: 'already_completed'
  /** 首次完成时锁定的策略版本。 */
  readonly profileVersion: 'user-plant-profile/v1'
  /** 数据库中已有的首次完成时间。 */
  readonly completedAtMs: number
}

/** 最低档案判断的封闭结果集合。 */
export type UserPlantProfileCompletenessDecision =
  | IncompleteUserPlantProfileDecision
  | NewlyCompletedUserPlantProfileDecision
  | AlreadyCompletedUserPlantProfileDecision

const zero = Number('0')
const frozenProfileVersion = 'user-plant-profile/v1' as const
const frozenRequiredFields = [
  'identityStatus',
  'pot',
  'location',
  'lightingEnvironment',
  'ventilationEnvironment'
] as const satisfies readonly UserPlantProfileRequiredField[]
const frozenIdentityStates = ['unidentified', 'candidate_pending', 'confirmed'] as const

/** 数组必须与冻结策略拥有相同顺序和值，防止运行时配置静默删项或重复。 */
function matchesFrozenList(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index])
}

/** 拒绝未发布、被删项或改变“一用户一次”语义的策略快照。 */
function assertPolicyValid(policy: UserPlantProfileCompletenessPolicy): void {
  if (
    policy.profileVersion !== frozenProfileVersion ||
    policy.rewardOncePerUser !== true ||
    !matchesFrozenList(policy.requiredFields, frozenRequiredFields) ||
    !matchesFrozenList(policy.acceptedIdentityStates, frozenIdentityStates)
  ) {
    throw new Error('档案完整度策略不合法')
  }
}

/** 可信时间必须是 JavaScript 可安全表达的非负 UTC 毫秒。 */
function assertTimeValid(value: number): void {
  if (!Number.isSafeInteger(value) || value < zero) {
    throw new Error('档案完整度时间不合法')
  }
}

/**
 * 根据已验证字段存在性判断最低档案是否首次完成。
 *
 * 本函数不解析自由 JSON、不访问数据库、不生成奖励分值，也不写 outbox；应用层只有在
 * `completed_now` 时才能在同一事务设置首次完成时间并产生资格事件。
 */
export function evaluateUserPlantProfileCompleteness(
  input: UserPlantProfileCompletenessInput
): UserPlantProfileCompletenessDecision {
  assertPolicyValid(input.policy)
  assertTimeValid(input.occurredAtMs)

  if (input.profileCompletedAtMs !== null) {
    assertTimeValid(input.profileCompletedAtMs)
    return {
      kind: 'already_completed',
      profileVersion: frozenProfileVersion,
      completedAtMs: input.profileCompletedAtMs
    }
  }

  const missingFields: UserPlantProfileRequiredField[] = []
  if (!input.policy.acceptedIdentityStates.some(status => status === input.identityStatus)) {
    missingFields.push('identityStatus')
  }
  if (!input.hasPot) {
    missingFields.push('pot')
  }
  if (!input.hasLocation) {
    missingFields.push('location')
  }
  if (!input.hasLightingEnvironment) {
    missingFields.push('lightingEnvironment')
  }
  if (!input.hasVentilationEnvironment) {
    missingFields.push('ventilationEnvironment')
  }

  if (missingFields.length > zero) {
    return { kind: 'incomplete', missingFields }
  }

  return {
    kind: 'completed_now',
    profileVersion: frozenProfileVersion,
    completedAtMs: input.occurredAtMs,
    rewardEligible: !input.userPreviouslyCompletedProfile
  }
}
