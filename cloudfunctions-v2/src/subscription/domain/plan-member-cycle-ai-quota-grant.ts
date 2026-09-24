import type { MemberAiQuotaPolicySnapshot } from '../../configuration/member-ai-quota-policy.js'
import type { UserRef } from '../../contracts/types.js'

/** 由订阅 Repository 读回的订阅与统一用户归属事实。 */
export type MemberSubscriptionGrantOwner = {
  /** 订阅公开引用；必须与会员周期记录中的订阅引用一致。 */
  readonly subscriptionRef: string
  /** 该订阅所属的统一用户公开引用；必须与请求主体及周期归属一致。 */
  readonly userRef: UserRef
}

/** 已支付订单及已应用回调的受信读回事实；不代表本领域函数执行了供应商验签。 */
export type MemberCyclePaymentOrderEvidence = {
  /** 支付订单公开引用；必须与会员周期及已应用回调记录指向同一订单。 */
  readonly paymentOrderRef: string
  /** 订单所属的统一用户公开引用；必须与订阅、周期和请求主体一致。 */
  readonly userRef: UserRef
  /** Repository 读回的支付完成 UTC 毫秒；缺失或非法时不得发放会员额度。 */
  readonly paidAtMs: number | null
  /** 与该订单关联的回调状态；只有已验签并对账应用后的 applied 可作为准入事实。 */
  readonly callbackStatus: string
  /** 回调收件记录关联的支付订单公开引用；必须与本证据中的订单引用相同。 */
  readonly callbackPaymentOrderRef: string
}

/** 订阅周期及其支付准入链所需的只读字段。 */
export type MemberSubscriptionPeriodGrantEvidence = {
  /** 已核验会员周期的稳定公开引用，也是 MEMBER grant 的唯一来源引用。 */
  readonly periodRef: string
  /** 周期外键实际指向的订阅公开引用；必须与读回的订阅身份一致。 */
  readonly subscriptionRef: string
  /** 周期记录所属统一用户的公开引用；必须与其他归属事实一致。 */
  readonly userRef: UserRef
  /** MySQL 读回的周期状态；只有 active 周期可用于新的额度发放。 */
  readonly status: string
  /** 会员周期起始 UTC 毫秒；额度只能在该时刻及之后发放。 */
  readonly startsAtMs: number
  /** 会员周期结束 UTC 毫秒；此值同时作为会员额度的绝对失效时刻。 */
  readonly endsAtMs: number
  /** 周期关联的支付订单公开引用；必须能与订单及已应用回调对上。 */
  readonly paymentOrderRef: string | null
  /** 由 Repository 关联读回的支付证据；缺失表示周期尚未完成支付准入。 */
  readonly paymentOrder: MemberCyclePaymentOrderEvidence | null
}

/** 将可信请求主体、周期、支付和当前策略快照组合成会员额度计划的输入。 */
export type MemberCycleAiQuotaGrantInput = {
  /** 已由身份域解析的统一用户公开引用，不接受平台主体标识。 */
  readonly principalUserRef: UserRef
  /** Repository 读回的订阅归属；当前周期即使已取消自动续费仍可有效至周期结束。 */
  readonly subscription: MemberSubscriptionGrantOwner
  /** Repository 读回的周期及支付准入链；不能由公开请求字段构造。 */
  readonly period: MemberSubscriptionPeriodGrantEvidence
  /** 由配置域发布解析器验证过的不可变会员额度策略快照。 */
  readonly policy: MemberAiQuotaPolicySnapshot
  /** 服务端可信时钟提供的发放时刻，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** MEMBER grant 计划中不可更改的能力范围，顺序与合同保持稳定。 */
export type MemberAiQuotaCapabilityScope = readonly [
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
]

/** 所有归属、支付、周期和策略准入通过后的额度批次计划。 */
export type PlannedMemberCycleAiQuotaGrant = {
  /** 额度来源固定为已核验会员周期。 */
  readonly sourceType: 'MEMBER'
  /** 额度唯一来源固定为会员周期 period_ref。 */
  readonly sourceRef: string
  /** grant 所属统一用户公开引用；不暴露数据库内部主键。 */
  readonly userRef: UserRef
  /** 已发布会员策略快照中的每周期 AI 点数。 */
  readonly grantedAmount: number
  /** 会员额度允许消费的三类已登记生成式能力。 */
  readonly capabilityScope: MemberAiQuotaCapabilityScope
  /** 发放时锁定的不可变策略发布版本。 */
  readonly policyVersion: string
  /** 本次额度计划的服务端发生时刻，UTC 毫秒。 */
  readonly grantedAtMs: number
  /** grant 的绝对失效时刻，固定等于会员周期结束时刻。 */
  readonly expiresAtMs: number
}

/** 会员额度发放准入失败时的内部、封闭原因集合。 */
export type MemberCycleAiQuotaGrantRejectionReason =
  | 'MEMBER_CYCLE_INVALID'
  | 'MEMBER_CYCLE_NOT_ACTIVE'
  | 'MEMBER_CYCLE_OUTSIDE_WINDOW'
  | 'MEMBER_CYCLE_OWNERSHIP_MISMATCH'
  | 'MEMBER_CYCLE_PAYMENT_NOT_RECONCILED'
  | 'MEMBER_AI_QUOTA_POLICY_INVALID'

/** 会员周期 AI 额度计划的完整结果；拒绝分支不携带可被误写入的额度数据。 */
export type MemberCycleAiQuotaGrantPlan =
  | {
      /** 判别值表示可以在同一 Repository 事务中尝试幂等落账。 */
      readonly kind: 'grant'
      /** 完整会员周期额度批次计划。 */
      readonly grant: Readonly<PlannedMemberCycleAiQuotaGrant>
    }
  | {
      /** 判别值表示必须失败关闭，不得写入额度批次、账本或账户投影。 */
      readonly kind: 'rejected'
      /** 内部准入拒绝分类，不应直接作为未经映射的公开错误响应。 */
      readonly reason: MemberCycleAiQuotaGrantRejectionReason
    }

/** 会员额度范围固定来自合同，金额则必须来自经配置域校验的策略快照。 */
const memberCapabilityScope: MemberAiQuotaCapabilityScope = Object.freeze([
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])

/** 当前策略发布标识的格式，和配置解析器及数据库发布合同保持一致。 */
const policyReleaseVersionPattern = /^[a-z][a-z0-9.-]*\/\d{4}-\d{2}-\d{2}\.\d+$/u
/** 策略发布版本在数据库中的最大字符数。 */
const maxPolicyReleaseVersionLength = 64
/** 发布摘要使用规范的小写 SHA-256 十六进制格式。 */
const policyContentSha256Pattern = /^[a-f0-9]{64}$/u
/** 引用字段的数据库最大长度，均定义为不含尾随空格的字符。 */
const maxPublicReferenceLength = 64
/** 与统一用户 DDL 公共引用约束一致，防止空/伪造类型值通过纯领域归属比较。 */
const userRefPattern = /^usr_[A-Za-z0-9_-]{8,}$/u
/** UTC 毫秒和会员策略点数使用的非负下界。 */
const zero = 0
/** 公开引用至少包含一个字符。 */
const oneCharacter = 1

/** 值必须是可安全表达的非负 UTC 毫秒时间或整数点数。 */
function isSafeNonNegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= zero
}

/** 引用必须是非空、未超出对应数据库字段长度的字符串。 */
function isValidReference(value: unknown, maxLength: number): value is string {
  return (
    typeof value === 'string' &&
    value.length >= oneCharacter &&
    value.trim() === value &&
    value.length <= maxLength
  )
}

/** 品牌类型只在编译期生效，运行时仍须核对统一用户公开引用格式。 */
function isValidUserRef(value: unknown): value is UserRef {
  return isValidReference(value, maxPublicReferenceLength) && userRefPattern.test(value)
}

/**
 * 根据已读取的订阅周期、支付对账事实与不可变策略快照生成会员额度计划。
 * 本函数不验签、不访问数据库、不写额度、账本或账户；Repository 必须在同一事务中再次
 * 锁定来源事实并幂等写入所有账务记录。支付回调状态只能由已完成验签和对账的适配器产生。
 */
export function planMemberCycleAiQuotaGrant(
  input: MemberCycleAiQuotaGrantInput
): MemberCycleAiQuotaGrantPlan {
  const { period, subscription, policy, principalUserRef, occurredAtMs } = input
  const paymentOrder = period.paymentOrder

  if (
    !isValidUserRef(principalUserRef) ||
    !isValidUserRef(subscription.userRef) ||
    !isValidUserRef(period.userRef) ||
    !isValidReference(subscription.subscriptionRef, maxPublicReferenceLength) ||
    !isValidReference(period.periodRef, maxPublicReferenceLength) ||
    !isValidReference(period.subscriptionRef, maxPublicReferenceLength) ||
    period.paymentOrderRef === null ||
    !isValidReference(period.paymentOrderRef, maxPublicReferenceLength)
  ) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_INVALID' }
  }

  if (
    principalUserRef !== subscription.userRef ||
    principalUserRef !== period.userRef ||
    subscription.subscriptionRef !== period.subscriptionRef
  ) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_OWNERSHIP_MISMATCH' }
  }

  if (period.status !== 'active') {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_NOT_ACTIVE' }
  }

  if (paymentOrder === null) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_PAYMENT_NOT_RECONCILED' }
  }

  if (
    !isValidUserRef(paymentOrder.userRef) ||
    !isValidReference(paymentOrder.paymentOrderRef, maxPublicReferenceLength) ||
    !isValidReference(paymentOrder.callbackPaymentOrderRef, maxPublicReferenceLength) ||
    paymentOrder.paymentOrderRef !== period.paymentOrderRef ||
    paymentOrder.callbackPaymentOrderRef !== period.paymentOrderRef ||
    paymentOrder.userRef !== principalUserRef
  ) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_OWNERSHIP_MISMATCH' }
  }

  if (paymentOrder.paidAtMs === null || paymentOrder.callbackStatus !== 'applied') {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_PAYMENT_NOT_RECONCILED' }
  }

  if (
    !Number.isSafeInteger(policy.aiPointsPerCycle) ||
    policy.aiPointsPerCycle <= zero ||
    !policyReleaseVersionPattern.test(policy.releaseVersion) ||
    policy.releaseVersion.length > maxPolicyReleaseVersionLength ||
    !policyContentSha256Pattern.test(policy.contentSha256)
  ) {
    return { kind: 'rejected', reason: 'MEMBER_AI_QUOTA_POLICY_INVALID' }
  }

  if (
    !isSafeNonNegativeInteger(occurredAtMs) ||
    !isSafeNonNegativeInteger(period.startsAtMs) ||
    !isSafeNonNegativeInteger(period.endsAtMs) ||
    !isSafeNonNegativeInteger(paymentOrder.paidAtMs) ||
    period.endsAtMs <= period.startsAtMs ||
    paymentOrder.paidAtMs > occurredAtMs
  ) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_INVALID' }
  }

  if (occurredAtMs < period.startsAtMs || occurredAtMs >= period.endsAtMs) {
    return { kind: 'rejected', reason: 'MEMBER_CYCLE_OUTSIDE_WINDOW' }
  }

  return {
    kind: 'grant',
    grant: Object.freeze({
      sourceType: 'MEMBER',
      sourceRef: period.periodRef,
      userRef: principalUserRef,
      grantedAmount: policy.aiPointsPerCycle,
      capabilityScope: memberCapabilityScope,
      policyVersion: policy.releaseVersion,
      grantedAtMs: occurredAtMs,
      expiresAtMs: period.endsAtMs
    })
  }
}
