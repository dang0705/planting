import type { EventRef, UserRef } from '../../contracts/types.js'

/** 提交结果未知后，由全新数据库连接读回的奖励事件最小快照。 */
export type RewardCommitUnknownReadOnlyRecord = {
  /** 全局高熵事件引用。 */
  readonly eventId: EventRef
  /** 奖励事件所属统一用户公开引用。 */
  readonly userRef: UserRef
  /** 首次规范化奖励资格载荷的 SHA-256。 */
  readonly payloadHash: string
  /** 首次接收时锁定的奖励策略版本。 */
  readonly rewardPolicyVersion: string
  /** 首次接收时锁定的奖励策略内容 SHA-256。 */
  readonly rewardPolicyContentSha256: string
  /** 已提交 inbox 的处理状态。 */
  readonly status: 'received' | 'applied' | 'rejected'
  /** 已应用积分账本公开引用；未应用时为空。 */
  readonly resultRef: string | null
}

/** 提交未知只读查询的完整用户与事件作用域。 */
export type ReadRewardAfterCommitUnknownInput = {
  /** 已验证统一用户公开引用；Repository 必须据此限制数据归属。 */
  readonly userRef: UserRef
  /** 待证明已经提交的奖励事件引用。 */
  readonly eventId: EventRef
}

/** 只允许使用新连接、无锁读取奖励事件终态的 Repository。 */
export type RewardCommitUnknownReadOnlyRepository = {
  /** 按用户和事件读取已提交记录；禁止写库、加锁或复用旧事务。 */
  readonly read: (
    input: ReadRewardAfterCommitUnknownInput
  ) => Promise<RewardCommitUnknownReadOnlyRecord | null>
}

/** 对账奖励事务提交结果所需的首次不可变证据。 */
export type ReconcileRewardCommitInput = ReadRewardAfterCommitUnknownInput & {
  /** 当前规范化奖励资格载荷的 SHA-256。 */
  readonly payloadHash: string
  /** 当前命令锁定的奖励策略版本。 */
  readonly rewardPolicyVersion: string
  /** 当前命令锁定的奖励策略内容 SHA-256。 */
  readonly rewardPolicyContentSha256: string
}

/** 新连接无法证明奖励事务提交结果时的内部原因。 */
export type RewardCommitUnknownReason =
  | 'missing'
  | 'processing'
  | 'evidence_mismatch'
  | 'read_failed'

/** 奖励事务提交结果未知后的封闭对账结果。 */
export type RewardCommitUnknownResult =
  | {
      /** 已证明相同奖励事务提交，可安全重放公开结果。 */
      readonly kind: 'replay'
      /** 已提交积分账本的公开引用。 */
      readonly resultRef: string
    }
  | {
      /** 当前证据不足以证明提交结果，应用层必须失败关闭。 */
      readonly kind: 'unresolved'
      /** 只供内部观测使用的失败分类。 */
      readonly reason: RewardCommitUnknownReason
    }

/** 使用全新连接只读证明奖励积分事务是否已经完整提交。 */
export async function reconcileRewardCommitResult(
  repository: RewardCommitUnknownReadOnlyRepository,
  input: ReconcileRewardCommitInput
): Promise<RewardCommitUnknownResult> {
  let record: RewardCommitUnknownReadOnlyRecord | null
  try {
    record = await repository.read({ userRef: input.userRef, eventId: input.eventId })
  } catch {
    return { kind: 'unresolved', reason: 'read_failed' }
  }
  if (record === null) {
    return { kind: 'unresolved', reason: 'missing' }
  }
  if (record.status === 'received') {
    return { kind: 'unresolved', reason: 'processing' }
  }
  if (
    record.status !== 'applied' ||
    record.eventId !== input.eventId ||
    record.userRef !== input.userRef ||
    record.payloadHash !== input.payloadHash ||
    record.rewardPolicyVersion !== input.rewardPolicyVersion ||
    record.rewardPolicyContentSha256 !== input.rewardPolicyContentSha256 ||
    !/^cpl_[A-Za-z0-9_-]{8,}$/u.test(record.resultRef ?? '')
  ) {
    return { kind: 'unresolved', reason: 'evidence_mismatch' }
  }
  return { kind: 'replay', resultRef: record.resultRef! }
}
