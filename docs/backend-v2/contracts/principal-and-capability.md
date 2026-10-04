# 访问主体与能力快照合同

- 合同版本：`principal-capability/v1`
- 所有者：`identity` 解析访问主体，`subscription` 生成能力快照。
- 适用范围：所有 `/api/v2` 公开请求、Agent 工具请求、内部任务和供应商回调。

## 1. 访问主体 Principal

访问主体只描述“谁正在调用”，不等同于会员、额度或业务对象归属。

```ts
/** 游客主体只能访问明确开放的临时能力，不能拥有用户植物、积分、会员或个人 Agent 上下文。 */
export type GuestPrincipal = {
  principalType: 'guest'
  /** 短期、不可反推出设备指纹的会话公开引用。 */
  guestSessionRef: string
  /** 匿名登录提供方，仅用于验证来源，不作为 user_id。 */
  authProvider: 'cloudbase_anonymous'
  /** 会话签发时间，ISO 8601。 */
  issuedAt: string
  /** 会话失效时间，ISO 8601。 */
  expiresAt: string
}

/** 登录用户主体已经由平台凭证解析到统一、平台无关的 user_id。 */
export type UserPrincipal = {
  principalType: 'user'
  /** 对外可用的高熵用户引用，格式 usr_...；不是数据库 BIGINT 主键。 */
  user_id: string
  /** 当前身份会话版本；解绑、撤销或风险处置时递增，使旧会话失效。 */
  sessionVersion: number
  /** 已验证的平台来源；业务域不得读取平台主体标识。 */
  authenticatedVia: 'wechat' | 'douyin' | 'xiaohongshu' | 'phone'
  issuedAt: string
  expiresAt: string
}

/** 服务主体只用于受控内部 API；每次签名只能声明一个精确 scope。 */
export type ServicePrincipal =
  | { principalType: 'service'; service: 'cloudbase_agent'; scopes: Array<'identity.resolve' | 'user-plant.context.read' | 'user-plant.agent-context.read' | 'subscription.ai-quota.reserve' | 'subscription.ai-quota.settle' | 'subscription.ai-quota.release'>; issuedAt: string; expiresAt: string }
  | { principalType: 'service'; service: 'scheduler'; scopes: Array<'plant-knowledge.enrichment.lease' | 'plant-knowledge.enrichment.submit'>; issuedAt: string; expiresAt: string }
  | { principalType: 'service'; service: 'payment_callback'; scopes: Array<'subscription.payment-callback.receive'>; issuedAt: string; expiresAt: string }
  | { principalType: 'service'; service: 'outbox_dispatcher'; scopes: Array<'subscription.reward-event.consume'>; issuedAt: string; expiresAt: string }
  | { principalType: 'service'; service: 'subscription'; scopes: Array<'identity.trial-anchor.read'>; issuedAt: string; expiresAt: string }

export type Principal = GuestPrincipal | UserPrincipal | ServicePrincipal
```

固定规则：

- 平台 OpenID、手机号、匿名 UID、设备 ID、IP 和 Cookie 永不成为 `user_id`。
- `GuestPrincipal` 结构中禁止出现 `user_id`；游客登录后必须重新签发 `UserPrincipal`。
- 业务域只接收已经解析的 Principal，不自行解析微信、抖音、小红书或手机号凭证。
- 服务主体必须同时通过服务签名、时钟窗口、nonce 防重放和 scope 校验。
- `identity.trial-anchor.read` 只授予 `subscription` 服务主体，用于从 Identity 读取统一用户的账户状态和创建时刻；不得加入 `cloudbase_agent` 的 Agent 工具权限，也不得扩展既有 `identity.resolve` 响应。字段和路由见[统一用户试用起算锚点只读合同](identity-trial-anchor.md)。
- `scopes` 在当前合同中固定只有一项，且必须同时属于该服务白名单并等于路由登记的 `requiredScope`；未知、跨服务、多个或 `ALL_*` scope 全部拒绝。
- Principal 不包含订单、会员、积分或 AI 余额。
- 同一 `(platform, app_scope, platform_subject)` 记录终身只归属一个统一用户；撤销后只能为原用户恢复。禁止把已绑定过的同一平台主体静默转绑给另一个 `user_id`，需要合并主体时必须进入独立人工裁决和审计流程。
- 游客会话只保存 CloudBase 匿名主体的不可逆摘要与服务端持有证明摘要；IP、设备指纹和 User-Agent 只用于防刷，不能作为认领凭证。
- 当前已确认的登录会话策略发布采用 24 小时有效期；会话必须锁定签发时的策略版本，策略新版本只影响之后签发的新会话。MVP 续期窗口为 0，不提供静默续期；到期后必须重新验证平台凭证并签发新会话，不能延长旧会话。没有有效策略发布时拒绝签发新会话，不得回退到代码默认值。策略发布字段与快照规则见[登录用户会话策略发布与请求快照合同](identity-session-policy.md)。
- 平台凭证只在登录、重新登录和需要重新验真的身份操作中验证；验真后经 `platform_identities` 解析到统一用户，再签发青花植会话。后续携带该会话的业务请求不得要求重复提交平台凭证或信任客户端提供的平台身份请求头。
- 后续业务请求仅在进程内计算原始 Bearer 的 SHA-256，按摘要读取 `user_sessions`，关联 `users` 和会话签发时的平台绑定，检查会话状态、有效期、撤销版本、用户状态及绑定状态，解析统一 `user_id`；然后按 `user_id` 校验用户植物归属。原始 Bearer 不落库、不写日志。
- 平台主体检索摘要使用受控密钥的 `HMAC-SHA-256`，数据库记录密钥版本但不记录密钥；手机号等低熵标识禁止使用无密钥 SHA-256。轮换时同时加载当前与退役中密钥，只允许由受控迁移根据服务端密文重算，并在唯一约束校验后原子切换版本。

平台绑定写操作固定遵守以下语义：

- `POST /api/v2/identity/bindings` 在当前已认证用户内创建或恢复绑定；同一规范主体已经属于其他用户时返回 `409 IDENTITY_BINDING_CONFLICT`，公开消息不能说明原用户是否存在或是谁。
- `DELETE /api/v2/identity/bindings/{platform}` 只解绑当前已认证会话的 `app_scope`，不得跨小程序或跨应用范围删除同平台绑定。
- 同一用户在同一 `(platform, app_scope)` 最多一个 active 绑定；同一平台主体终身不得静默转绑其他用户。
- 最后一个 active 登录入口不能由解绑接口删除，返回 `409 IDENTITY_LAST_BINDING_REQUIRED`；需要失去全部登录入口时必须进入账户删除流程。
- 绑定、恢复和解绑都必须使用 `Idempotency-Key`、数据库事务与唯一约束。解绑成功时在同一事务中递增 `users.session_version` 并撤销该用户全部 active 会话。

## 2. 生效能力快照 CapabilitySnapshot

能力快照描述“当前主体此刻能做什么”，是有有效期的只读判定结果，不是账本副本。

```ts
type CapabilitySnapshotBase = {
  /** 快照合同版本。 */
  contractVersion: 'capability-snapshot/v1'
  /** 高熵快照引用，只供内部链路关联，不进入公开响应。 */
  snapshotRef: string
  /** 当前允许的产品能力代码，只能来自已发布能力目录。 */
  allowedCapabilities: string[]
  /** 允许由奖励额度支付的生成式能力范围。 */
  rewardedAiScopes: Array<'USER_AGENT_TEXT' | 'USER_DIAGNOSIS_TEXT' | 'USER_DIAGNOSIS_VISUAL'>
  /** 免费用户最多可拥有的 active 用户植物数量；游客固定为 0。 */
  activeUserPlantLimit: number
  generatedAt: string
  validUntil: string
  /** 生成该快照的策略版本，便于回放。 */
  policyVersion: string
}

/** 游客快照结构中禁止出现 user_id，植物上限固定为 0。 */
type GuestCapabilitySnapshot = CapabilitySnapshotBase & {
  subjectType: 'guest'
  tier: 'guest'
  activeUserPlantLimit: 0
}

/** 登录用户快照必须绑定平台无关的统一用户。 */
type UserCapabilitySnapshot = CapabilitySnapshotBase & {
  subjectType: 'user'
  user_id: string
  tier: 'free' | 'trial' | 'member'
  activeUserPlantLimit: number
}

export type CapabilitySnapshot = GuestCapabilitySnapshot | UserCapabilitySnapshot
```

可执行事实源为 `cloudfunctions-v2/src/contracts/types.ts` 与
`cloudfunctions-v2/src/contracts/schemas.ts`。AJV 使用严格互斥分支：游客分支拒绝
`user_id`，登录分支缺少 `user_id` 时拒绝；能力数组必须去重。快照只作为内部服务合同和
审计关联依据，`snapshotRef`、数据库内部主键及快照哈希不得进入小程序公开响应。

`subscription.capability_snapshots` 保存请求级不可变审计投影：主体类型、统一用户内部键、
能力层级、允许能力、奖励额度范围、植物上限、策略版本、有效期及规范化内容 SHA-256。
业务用例必须在 `validUntil` 前使用同一快照完成；过期后重新裁决，禁止原地延长或修改。
`generatedAt` 必须早于 `validUntil`，该跨字段规则由合同校验包装器执行。

`capability-snapshot/v1` 当前仅接受十个已登记能力代码：
`PLANT_IDENTIFICATION`、`FIXED_DIAGNOSIS`、`INDEPENDENT_WATERING`、
`SOIL_VISUAL_EVIDENCE`、`USER_PLANT_CREATE`、`POINTS_LEVEL_QUERY`、`REWARDED_AI`、
`USER_AGENT_TEXT`、`USER_DIAGNOSIS_TEXT`、`USER_DIAGNOSIS_VISUAL`。
游客只允许前四项且 `rewardedAiScopes` 必须为空；试用和会员当前明确登记的付费生成式能力只有后三项，
新增付费能力必须发布新的能力目录版本；未发布能力一律失败关闭，
不能用任意字符串或 `ALL_PAID_CAPABILITIES` 放行。

`REWARDED_AI` 不是一个可直接调用的模型动作。它表示免费、试用或会员主体可以在
`rewardedAiScopes` 与有效奖励额度共同允许的范围内使用后三项生成式能力；它不能绕过
具体产品动作的额度预占、用户植物归属、资产归属或幂等校验。

固定能力边界：

| 主体层级 | 基础能力 | 用户植物 | 生成式 AI |
|---|---|---:|---|
| 游客 | 百度植物识别、已发布固定题包、独立基础浇水 | 0 | 不开放付费生成式能力 |
| 登录免费用户 | 游客能力、积分/等级查询 | 最多 1 株 active | 仅可使用有效且 scope 匹配的奖励额度 |
| 24 小时试用 | 所有付费能力 | 同免费用户当前上限 | 共 200 AI 点，仅限三项用户生成式能力 |
| 会员 | 所有付费能力 | 由已发布策略决定 | 每订阅周期 2,000 点，不设日/周窗口且不结转 |

## 3. 顺序与失败语义

登录与后续业务请求共用统一主体和能力判定，但验真入口不同：

```text
登录：验证外部平台凭证 → identity 解析/创建统一用户 → 签发青花植会话
后续业务请求：验证青花植会话摘要、状态和归属 → identity 解析 Principal
→ subscription 生成 CapabilitySnapshot
→ 业务域执行归属与能力校验
```

登录成功只证明用户身份，不代表已有可用能力快照。首次需要能力判定的业务请求，应由 `subscription` 按统一用户的可信创建时刻和当前已发布策略生成快照；有效快照可在有效期内复用，过期后仍由 `subscription` 重新裁决。业务域只消费该快照，不自行推算试用时间、植物上限或补写默认权益；缺少已发布策略时拒绝该业务动作，但不把已验真的登录会话误判为无效。由此，首版“微信登录 → 创建用户植物 → 读回”验收必须从**未预置能力快照**的状态开始，证明首次请求完成订阅域裁决，而不能只用数据库预置快照冒充整条用户旅程。

- Principal 无效返回 `401 PRINCIPAL_INVALID`。
- 主体有效但能力不允许返回 `403 CAPABILITY_DENIED`。
- 用户植物不属于当前用户返回 `404 USER_PLANT_NOT_FOUND`，避免泄露对象是否存在。
- 快照过期返回 `409 CAPABILITY_SNAPSHOT_EXPIRED`，调用方只能重新获取，不得自行延长。
- 快照不携带原始订单、支付主体、grant 明细、余额或任何平台主体标识。
