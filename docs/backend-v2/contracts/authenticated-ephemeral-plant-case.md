# 已登录用户临时植物案例合同补充门

> 状态：目标业务语义已确认；公共 DTO、数据字典、DDL 和 Expected 尚须在 P1 补充冻结。未完成此门前，不得声称“已登录用户临时植物 → 保存/绑定用户植物”已经实现或验收。

## 确认的业务语义

- 是否拥有 `user_id` 与本次是否选择临时植物是两个独立条件。游客首次只能临时使用；已有 `user_id` 的用户可以主动临时使用，也可以选择已有或创建长期用户植物。
- 已登录临时案例只表达本次所看的那一株植物。它有临时案例公开引用和有效期，但没有 `user_plant_id`，不进入任何现有用户植物的事实、状态、时间线或小青长期上下文。
- 用户选择保存时，明确选择创建新用户植物或绑定自己已有的用户植物；同一案例的必要识别、问诊、浇水结果增加归属引用，保持原时间、证据、结果与建议语义。建议不能直接成为已执行行为。
- 临时案例过期、被其他主体访问、已成功绑定或目标植物不属于当前 `user_id` 时必须拒绝；同一案例只能成功绑定一次，同键同参重放原结果，同键异参冲突。

## 与游客合同的身份边界

[游客临时会话认领合同](guest-session-claim.md)使用经验证的匿名主体与 `X-QHZ-Guest-Proof`。已登录临时案例必须以会话中的统一 `user_id` 和创建时记录的同一用户归属证明持有权；不能要求或伪造游客匿名证明，也不能仅凭案例公开引用授权。游客登录后的认领仍走原游客合同。两条路径由 `user-plant` 单一编排，跨域临时结果只读取成功绑定投影，不各自更新归属。

## 最小公共命令与结果边界

已登录主体新建临时案例是一个显式写命令：请求使用 `Idempotency-Key`，但不接收 `user_id`、平台 OpenID、`user_plant_id` 或游客持有证明。服务端只从经验证的 `UserPrincipal` 取得归属；一次新命令只创建一株临时案例，同键同参重放返回同一公开引用。是否填写植物候选、照片或题包答案属于后续各能力的独立命令，不允许在创建案例时把这些未验证输入自动写入现有用户植物。

```ts
export type CreateAuthenticatedEphemeralPlantCaseCommand = {
  /** HTTP Idempotency-Key 的规范化副本；不携带 user_id 或任何植物身份推断。 */
  idempotencyKey: string
}

export type CreateAuthenticatedEphemeralPlantCaseResult = {
  /** 本次单株临时案例的不透明公开引用；不包含用户或数据库内部主键。 */
  ephemeralPlantCaseRef: string
  /** 当前已发布保留策略计算的失效时间，ISO 8601；本合同尚未冻结具体时长。 */
  expiresAt: string
  /** 同键同参重放时为 true；首次创建时为 false。 */
  replayed: boolean
}

export type PromoteAuthenticatedEphemeralPlantCaseCommand = {
  /** 仅定位已由当前 user_id 创建、仍有效且未绑定的单株临时案例。 */
  ephemeralPlantCaseRef: string
  /** 用户明确选择新建植物或绑定本人已有植物；内部主键不作为输入。 */
  target: { type: 'new_user_plant' } | { type: 'existing_user_plant'; userPlantId: string }
  /** HTTP Idempotency-Key 的规范化副本；同键异参必须冲突。 */
  idempotencyKey: string
}

export type AuthenticatedEphemeralPlantPromotionResult = {
  /** 本次绑定命令的唯一公开引用，同键同参重放必须保持不变。 */
  promotionRef: string
  /** 新建或选定的用户植物公开引用。 */
  userPlantId: string
  /** 获得派生归属的临时对象类别摘要，不包含对象内容或内部主键。 */
  linkedObjectKinds: Array<
    'identification_candidate' | 'fixed_diagnosis_result' | 'independent_watering_advice' | 'soil_visual_evidence'
  >
  /** 同键同参重放时为 true；首次成功绑定时为 false。 */
  replayed: boolean
}
```

上述类型只冻结公共语义，不表示具体路由、TypeScript 源码、数据库结构或默认有效期已冻结。`user-plant` 在同一事务内完成目标归属与一次性绑定事实；跨域临时对象只由该绑定事实派生归属，不能重写原时间、证据、结果或建议。绑定结果不声称用户执行过建议，也不能触发养护事件、计划、提醒或积分。公开错误至少区分非法输入、本人案例不可用、案例过期、已有植物不属当前用户、同键异参，以及提交结果未知；无权访问与不存在不得暴露其他用户案例细节。

## P1 必须冻结的增量

1. 公共 `CreateEphemeralPlantCase` 与 `PromoteEphemeralPlantCase` DTO、身份/归属错误、幂等键和公开响应白名单；两种主体的身份凭证只能由服务端解析。
2. 临时案例和成功绑定事实的数据字典、状态机、唯一约束、失效规则、索引、事务与回滚。评审现有 `guest_plant_cases`、`guest_claim_commands` 和各域临时对象外键：要么引入统一案例表并安全迁移测试结构，要么单独建已登录临时案例表；未经评审不得简单给游客表补可空 `user_id`。
3. 登录用户创建临时案例时，明确用户归属与案例作用域；用户切换平台身份仍解析为同一 `user_id`，但不允许通过另一个用户的会话认领。
4. 测试 Expected 至少覆盖登录用户临时使用不写现有植物、显式创建/绑定、跨用户与跨植物拒绝、过期、重复提交、并发一次性绑定、事务提交未知读回、游客登录转用户的原路径不回归，以及临时结果不会自动变成事实。
5. 新业务数值（例如已登录临时案例有效期）先进入业务关键变量目录，明确 owner、来源、消费方、阻断范围与回退。未冻结前不得继承游客 24 小时值作为隐式默认。

此文档是 P1 合同补充入口，不是已冻结的运行实现合同；完成上述五项并更新架构/合同/DDL 哈希后，才允许进入对应 P3 实现。
