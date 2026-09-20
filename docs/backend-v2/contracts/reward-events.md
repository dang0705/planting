# 奖励事件合同

- 合同版本：`reward-events/v1`
- 交付语义：至少一次（at-least-once）投递 + `subscription` inbox 幂等；不宣称恰好一次。

```text
user_plant.profile_completed.v1
care.soil_check_completed.v1
care.fertilizing_check_completed.v1
diagnosis.fixed_package_completed.v1
knowledge.contribution_released.v1
```

生产域只声明业务行为已完成，不携带奖励点数；`subscription` 根据事件发生时间和生效策略计算奖励。

事件至少包含：事件 ID、类型、版本、生产域、用户引用、可选用户植物引用、聚合引用、发生引用、发生时间、载荷和载荷哈希。

投递语义为至少一次；通过 inbox 唯一键和业务唯一键保证不重复。

```ts
export type RewardableDomainEvent = {
  /** 全局高熵事件引用；重试沿用同一值。 */
  eventId: string
  eventType:
    | 'user_plant.profile_completed.v1'
    | 'care.soil_check_completed.v1'
    | 'care.fertilizing_check_completed.v1'
    | 'diagnosis.fixed_package_completed.v1'
    | 'knowledge.contribution_released.v1'
  eventVersion: 1
  producerDomain: 'user-plant' | 'care' | 'diagnosis' | 'plant-knowledge'
  userRef: string
  userPlantRef?: string
  aggregateRef: string
  occurrenceRef: string
  /** 生产域形成事实时采用的策略版本；不能决定 subscription 的奖励分值。 */
  producerPolicyVersion: string
  occurredAt: string
  /** 只含奖励资格判断需要的最小业务事实，不含分值、凭证、图片或模型原文。 */
  payload: Record<string, unknown>
  /** 对规范化 payload 计算 SHA-256，用于同事件篡改检测。 */
  payloadHash: string
}
```

## outbox / inbox

- 生产域在业务事务内写本域 outbox；禁止多个域共享一个可写 outbox 表。
- Dispatcher 以租约批量领取，超时可被安全接管；网络失败重试沿用同一 `eventId` 和 payload。
- `subscription_reward_inbox` 先以 `eventId` 唯一索引去重，再校验业务唯一键；相同 ID 不同 payloadHash 必须隔离并告警。
- inbox、积分账本、积分账户、等级奖励和 AI grant 必须在同一 `subscription` 事务内提交。
- 消费端提交成功后，源域才标记 delivered；标记失败允许重放，不能重复入账。
- `knowledge.contribution_released.v1` 可不含 `userPlantRef`；其余养护奖励事件必须携带合法用户植物引用。
- 首次接收事件时，`subscription` 按 `occurredAt` 独立锁定已发布奖励策略版本及 SHA-256；后续重放沿用该快照，禁止使用新策略重算旧事件。事件携带的 `producerPolicyVersion` 只证明生产域形成业务事实时使用的规则，不能指定积分或奖励策略。

## 业务唯一键

- 首株完整档案：每个 `user_id` 终身一次。
- 盆土/浇水检查与施肥检查：按系统计划发生编号唯一。
- 固定题包：同一用户植物、症状类型与滚动 30×24 小时窗口唯一。
- CMS 身份/内容奖励：分别使用已冻结的全局主题键，游客无资格。
