/**
 * 由 Identity 受控只读边界读回的统一用户事实。
 * 本类型不接收平台身份、客户端时间或公开 bearer 中的起算时间。
 */
export type TrialEligibilityUser = {
  /** 服务端统一用户创建时刻，UTC 毫秒；是试用唯一的起算锚点。 */
  readonly createdAtMs: number
  /** MySQL `users.status` 读回值；只有 active 用户可以取得试用资格。 */
  readonly status: string
}

/**
 * 由配置适配器读回的试用策略最小发布投影。
 * 这是资格时间计算所需的窄投影，不是完整试用策略 JSON Schema，也不验证正文摘要或活动指针。
 */
export type TrialEligibilityPolicySnapshot = {
  /** 不可变已发布策略版本；必须是注册时刻生效的版本。 */
  readonly releaseVersion: string
  /** 领域策略发布状态；active 与 retired 表示已发布，draft/verified 不可供业务使用。 */
  readonly status: string
  /** 策略发布生效时刻，UTC 毫秒；注册时刻不得早于此值。 */
  readonly effectiveAtMs: number
  /** 策略失效时刻，UTC 毫秒；null 表示没有预设终止时刻。 */
  readonly expiresAtMs: number | null
  /** 注册时适用版本的试用时长，正整数小时；当前批准值为 24。 */
  readonly durationHours: number
}

/**
 * 试用资格判定的受信输入；不包含用户可提交的起算时间或策略字段。
 * user 和 policySnapshot 允许缺失，以便从上游读回异常时明确失败关闭。
 */
export type TrialEligibilityInput = {
  /** Identity 只读边界返回的统一用户；缺失或为空时试用资格拒绝。 */
  readonly user?: TrialEligibilityUser | null
  /** 服务端可信当前时刻，UTC 毫秒；不得使用客户端提交的时间。 */
  readonly nowMs: number
  /** 用户注册时生效的已发布试用策略；缺失或为空时不得推断默认值。 */
  readonly policySnapshot?: TrialEligibilityPolicySnapshot | null
}

/** 试用资格派生可预期的拒绝原因；不得作为公开错误原样暴露。 */
export type TrialEligibilityDenialReason =
  | 'INVALID_INPUT'
  | 'USER_INVALID'
  | 'USER_NOT_ACTIVE'
  | 'TRIAL_POLICY_UNAVAILABLE'
  | 'TRIAL_POLICY_INVALID'
  | 'TRIAL_POLICY_NOT_EFFECTIVE_AT_REGISTRATION'

/**
 * 资格派生的封闭结果；仅描述时间资格，不创建试用行或 AI 额度 grant。
 * active 的有效区间为 `[startsAtMs, expiresAtMs)`；到达 expiresAtMs 即为 expired。
 */
export type TrialEligibilityResolution =
  | {
      /** 在注册时刻存在有效策略，且当前请求时刻位于试用窗口内。 */
      readonly eligibility: 'active' | 'expired'
      /** 绝不因首次访问而改变的统一用户创建时刻。 */
      readonly startsAtMs: number
      /** 按注册时适用策略锁定的绝对到期时刻。 */
      readonly expiresAtMs: number
      /** 注册时刻适用的不可变策略版本。 */
      readonly policyVersion: string
    }
  | {
      /** 输入、用户状态或发布策略不满足资格条件时失败关闭。 */
      readonly eligibility: 'denied'
      /** 内部拒绝分类，不含用户、身份或策略正文细节。 */
      readonly reason: TrialEligibilityDenialReason
    }

/** 一小时对应的毫秒数；durationHours 来自显式策略快照，不提供代码默认策略。 */
const secondsPerMinute = 60
const minutesPerHour = 60
const millisecondsPerSecond = 1000
const millisecondsPerHour = secondsPerMinute * minutesPerHour * millisecondsPerSecond
/** UTC 毫秒时间戳的最小合法值。 */
const minimumTimestampMs = 0
/** 发布版本和正整数策略时长的最小合法正整数。 */
const minimumPositiveInteger = 1
/** `trial_entitlements.policy_version` 的 DDL 字段上限。 */
const maximumPolicyVersionLength = 64

/**
 * 验证服务端 UTC 毫秒时间戳是否为非负、安全整数。
 * JavaScript 不安全整数会造成数据库与领域窗口出现不同边界。
 */
function isValidTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= minimumTimestampMs
}

/**
 * 根据受信注册事实和注册时刻适用的策略派生当前试用状态。
 * 不读取 Identity 表、不物化 entitlement，也不发放或预占 AI 额度。
 */
export function deriveTrialEligibility(input: TrialEligibilityInput): TrialEligibilityResolution {
  if (!isValidTimestamp(input.nowMs)) {
    return { eligibility: 'denied', reason: 'INVALID_INPUT' }
  }

  const user = input.user
  if (user === null || user === undefined) {
    return { eligibility: 'denied', reason: 'USER_INVALID' }
  }
  if (typeof user.status !== 'string' || user.status !== 'active') {
    return { eligibility: 'denied', reason: 'USER_NOT_ACTIVE' }
  }
  if (!isValidTimestamp(user.createdAtMs) || input.nowMs < user.createdAtMs) {
    return { eligibility: 'denied', reason: 'INVALID_INPUT' }
  }

  const policy = input.policySnapshot
  if (policy === null || policy === undefined) {
    return { eligibility: 'denied', reason: 'TRIAL_POLICY_UNAVAILABLE' }
  }
  if (
    typeof policy.releaseVersion !== 'string' ||
    policy.releaseVersion.length < minimumPositiveInteger ||
    policy.releaseVersion.trim() !== policy.releaseVersion ||
    policy.releaseVersion.length > maximumPolicyVersionLength ||
    !Number.isSafeInteger(policy.durationHours) ||
    policy.durationHours < minimumPositiveInteger ||
    !Number.isSafeInteger(policy.durationHours * millisecondsPerHour) ||
    !isValidTimestamp(policy.effectiveAtMs) ||
    (policy.expiresAtMs !== null && !isValidTimestamp(policy.expiresAtMs)) ||
    (policy.expiresAtMs !== null && policy.expiresAtMs <= policy.effectiveAtMs)
  ) {
    return { eligibility: 'denied', reason: 'TRIAL_POLICY_INVALID' }
  }
  if (policy.status !== 'active' && policy.status !== 'retired') {
    return { eligibility: 'denied', reason: 'TRIAL_POLICY_UNAVAILABLE' }
  }
  if (
    user.createdAtMs < policy.effectiveAtMs ||
    (policy.expiresAtMs !== null && user.createdAtMs >= policy.expiresAtMs)
  ) {
    return {
      eligibility: 'denied',
      reason: 'TRIAL_POLICY_NOT_EFFECTIVE_AT_REGISTRATION'
    }
  }

  const expiresAtMs = user.createdAtMs + policy.durationHours * millisecondsPerHour
  if (!Number.isSafeInteger(expiresAtMs)) {
    return { eligibility: 'denied', reason: 'TRIAL_POLICY_INVALID' }
  }

  return {
    eligibility: input.nowMs < expiresAtMs ? 'active' : 'expired',
    startsAtMs: user.createdAtMs,
    expiresAtMs,
    policyVersion: policy.releaseVersion
  }
}
