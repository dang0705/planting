# 已登录用户临时植物案例合同补充门

> 状态：已批准作为 P1 合同增量提案；用户身份与植物上下文分离、统一临时引用和游客兼容映射的方向已确认。路由 DTO、数据字典、DDL 与实际保留时限仍待冻结。登录临时案例 TTL 未由业务关键变量目录发布前，不得创建持久化登录临时案例，也不得声称此能力已实现或验收。

## 确认的业务语义

- 是否拥有 `user_id` 与本次是否选择临时植物是两个独立条件。游客首次只能临时使用；已有 `user_id` 的用户可以主动临时使用，也可以选择已有或创建长期用户植物。
- 已登录临时案例只表达本次所看的那一株植物。它有临时案例公开引用和有效期，但没有 `user_plant_id`，不进入任何现有用户植物的事实、状态、时间线或小青长期上下文。
- 用户选择保存时，明确选择创建新用户植物或绑定自己已有的用户植物；同一案例的必要识别、问诊、浇水结果增加归属引用，保持原时间、证据、结果与建议语义。建议不能直接成为已执行行为。
- 临时案例过期、被其他主体访问、已成功绑定或目标植物不属于当前 `user_id` 时必须拒绝；同一案例只能成功绑定一次，同键同参重放原结果，同键异参冲突。

## 访问主体与植物上下文是两个维度

访问主体由认证层验证并构造，植物上下文由本次业务请求选择。两者不能合并，也不能由请求正文自称身份：游客只能使用临时上下文；已有 `user_id` 的用户可在同一能力入口选择临时上下文，也可选择长期用户植物。`user_id` 本身不强迫本次操作写入长期植物。

以下是供跨域合同使用的最小联合类型提案，不表示路由和 DTO 已冻结。字段 `userPlantId` 必须是公开不透明引用，不得使用数据库内部主键：

```ts
export type PlantContext =
  | { type: 'ephemeral'; ephemeralPlantCaseRef: string }
  | { type: 'persistent'; userPlantId: string }
```

`Principal` 不出现在上述请求上下文里：HTTP 接入层必须独立验证平台凭证并解析为 `GuestPrincipal` 或 `UserPrincipal`。游客不能通过 `plantContext` 声称已登录；登录用户也不能通过请求正文声明其他 `user_id`。公开案例引用只用于定位，授权必须同时校验认证层主体与服务端保存的案例归属。游客原有接口继续使用 `guestPlantCaseRef` 等已冻结公开字段；如后续统一入口需要 canonical `ephemeralPlantCaseRef`，只允许由 `user-plant` 内部映射游客引用，不改变旧游客 API，也不把游客伪造成 `UserPrincipal` 或反向伪造 `GuestPrincipal`。

## 与游客合同的身份边界

[游客临时会话认领合同](guest-session-claim.md)使用经验证的匿名主体与 `X-QHZ-Guest-Proof`。已登录临时案例必须以认证层解析的统一 `user_id` 和服务端保存的案例归属持有权；不能要求或伪造游客匿名证明，也不能仅凭案例公开引用授权。游客登录后的认领仍走原游客合同，公开字段与证明方式均不改变。两条路径由 `user-plant` 单一编排，跨域临时结果只读取成功绑定投影，不各自更新归属。

## 最小公共命令与结果边界

下列命令和结果是待冻结合同的形状草案，**不是现有可调用接口**。在登录临时案例保留策略（TTL）经配置目录裁决并发布前，不得落地持久化创建命令或在环境中私设时长。批准实施后，新建案例才可作为显式写命令：请求使用 `Idempotency-Key`，但不接收 `user_id`、平台 OpenID、内部 `user_plant_id` 或游客持有证明。服务端只从经验证的 `UserPrincipal` 取得归属；一次新命令只创建一株临时案例，同键同参重放返回同一公开引用。是否填写植物候选、照片或题包答案属于后续各能力的独立命令，不允许在创建案例时把这些未验证输入自动写入现有用户植物。

```ts
export type CreateAuthenticatedEphemeralPlantCaseCommand = {
  /** HTTP Idempotency-Key 的规范化副本；不携带 user_id 或任何植物身份推断。 */
  idempotencyKey: string
}

export type CreateAuthenticatedEphemeralPlantCaseResult = {
  /** 本次单株临时案例的不透明公开引用；不包含用户或数据库内部主键。 */
  ephemeralPlantCaseRef: string
  /** 经批准并发布的保留策略计算的失效时间，ISO 8601；具体时长仍待配置目录裁决。 */
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

上述类型只描述待审阅的公共语义，不表示具体路由、运行 DTO、数据库结构、登录临时案例创建能力或默认有效期已冻结。`user-plant` 在同一事务内完成目标归属与一次性绑定事实；跨域临时对象只由该绑定事实派生归属，不能重写原时间、证据、结果或建议。绑定结果不声称用户执行过建议，也不能触发养护事件、计划、提醒或积分。公开错误至少区分非法输入、本人案例不可用、案例过期、已有植物不属当前用户、同键异参，以及提交结果未知；无权访问与不存在不得暴露其他用户案例细节。

## P1 必须冻结的增量

1. 将 `Principal` 与 `PlantContext` 分离的公共 DTO、身份/归属错误、幂等键和响应白名单；认证主体只从可信认证层产生。固定临时上下文使用 `ephemeralPlantCaseRef`，长期上下文使用公开不透明用户植物引用。
2. 明确旧游客 API 原样兼容：`guestPlantCaseRef` 由 `user-plant` 在内部映射，不改变游客证明、公开字段或游客登录认领流程；跨域能力不得自行复制或更新归属。
3. 临时案例和成功绑定事实的数据字典、状态机、唯一约束、失效规则、索引、事务与回滚。评审现有 `guest_plant_cases`、`guest_claim_commands` 和各域临时对象外键：要么引入统一案例表并安全迁移测试结构，要么单独建已登录临时案例表；未经评审不得简单给游客表补可空 `user_id`。
4. 登录用户创建临时案例时，明确用户归属与案例作用域；用户切换平台身份仍解析为同一 `user_id`，但不允许通过另一个用户的会话认领。
5. 测试 Expected 至少覆盖登录用户临时使用不写现有植物、显式创建/绑定、跨用户与跨植物拒绝、过期边界、重复提交、并发一次性绑定、事务提交未知读回、游客登录转用户的原路径不回归，以及临时结果不会自动变成事实。
6. 登录临时案例 TTL 是待主代理裁决的业务配置；配置目录未发布 confirmed 值及来源、消费方、阻断范围、失败行为与回退前，不得实现持久化创建。游客既有 24 小时会话规则只适用于游客合同，禁止作为登录临时案例的隐式默认。

此文档是 P1 合同补充入口，不是已冻结的运行实现合同；完成上述六项并更新架构/合同/DDL 哈希后，才允许进入对应 P3 实现。
