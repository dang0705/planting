import { createHash } from 'node:crypto'

import type { EventRef, RewardableDomainEventDto, UserPlantRef, UserRef } from '../../contracts/types.js'

/** 首株完整档案奖励资格事件的构造输入。 */
export interface FirstProfileRewardEventInput {
  /** 服务端生成的高熵事件引用 evt_…；重试沿用同一值。 */
  readonly eventId: string
  /** 获得资格的统一用户公开引用。 */
  readonly userRef: string
  /** 首次完整的那株用户植物公开引用。 */
  readonly userPlantRef: string
  /** 首次完整时刻（服务端 UTC 毫秒）。 */
  readonly completedAtMs: number
  /** 判定时锁定的完整度策略版本（user-plant-profile/v1）。 */
  readonly profileVersion: string
}

/**
 * 构造 `user_plant.profile_completed.v1`（user-plant-environment-profile/v1 §3.3、reward-events/v1）。
 * 只声明“业务事实已发生”，不带积分；occurrenceRef 绑定用户（每个 user_id 终身一次），subscription inbox 业务唯一键再兜底。
 */
export function buildFirstProfileRewardEvent(input: FirstProfileRewardEventInput): RewardableDomainEventDto {
  const payload = { profileVersion: input.profileVersion }
  const payloadHash = createHash('sha256').update(JSON.stringify({ profileVersion: payload.profileVersion }), 'utf8').digest('hex')
  return {
    eventId: input.eventId as EventRef,
    eventType: 'user_plant.profile_completed.v1',
    eventVersion: 1,
    producerDomain: 'user-plant',
    userRef: input.userRef as UserRef,
    userPlantRef: input.userPlantRef as UserPlantRef,
    aggregateRef: input.userPlantRef,
    occurrenceRef: `first_profile:${input.userRef}`,
    producerPolicyVersion: input.profileVersion,
    occurredAt: new Date(input.completedAtMs).toISOString(),
    payload,
    payloadHash
  }
}
