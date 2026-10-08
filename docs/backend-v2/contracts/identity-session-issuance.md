# 微信小程序登录与统一会话签发合同

- 合同版本：`identity-session-issuance/v1`
- 所属领域：`identity`
- 当前范围：本地 v2 的微信小程序登录纵向切片；不代表真实微信 Provider、CloudBase HTTP 或部署验收。
- 代码标识符使用英文；本文以中文解释业务含义和约束。

## 1. 独立 Expected 与信任边界

Expected 来自已批准的后端架构、`docs/backend-v2/data/state-machines.md` §1、`docs/backend-v2/contracts/principal-and-capability.md` §1/§4、`identity-session-policy.md` 和 `schema/001_identity.sql`，以及主代理已裁决的首版微信登录字段和一次性凭证语义。

微信 `wx.login` 产生的短时 `code` 只可用于一次服务端验真。后端不得信任 `x-wx-openid` 等客户端可伪造请求头，也不得将 Provider 凭证、`session_key`、OpenID 或数据库内部主键交给客户端。微信验真和主体规范化只能发生在 `identity` 域的 Provider Adapter；业务域只接收平台无关的统一 `user_id`。

`wechat_miniprogram_login` 是微信小程序登录专用 Provider 档案，不复用 `cloudbase_auth`。`credential_ref`、`appScope`、外呼超时等未确认时，真实外呼必须失败关闭；本地测试可以注入受控 fake Provider，但不得把该测试替身称为真实微信验真。

## 2. HTTP DTO 与公开响应

路由：`POST /api/v2/identity/sessions`，安全类别为“平台凭证换取青花植登录会话”（`credential_exchange`）。

请求正文（用户 2026-10-09 冻结多平台变更）：

```json
{"platform":"wechat","code":"平台登录接口返回的短时凭证","guestToken":"可选：同一设备之前签发的游客令牌"}
```

字段规则：

| 字段 | 类型 | 规则 |
|---|---|---|
| `platform` | `'wechat' \| 'douyin' \| 'xiaohongshu'` | 必填；只决定调用哪个受控 Provider Adapter，不能替代平台验真。某平台 Provider 未配置时返回 `503 SERVICE_UNAVAILABLE`（例如小红书 AppSecret 未配置）。 |
| `code` | 非空字符串 | 微信 `wx.login`／抖音 `tt.login`／小红书 `xhs.login` 的一次性短时凭证；只用于本次 Provider 验真；不得写日志、数据库、幂等记录或审计。 |
| `guestToken` | 可选字符串 | 抖音、小红书游客先前签发的游客令牌（guest-token/v1）。只在登录成功后用于标记该游客会话可被本用户认领；真正认领仍走 `POST /api/v2/user-plants/claims`。微信端不走游客：`platform='wechat'` 同时携带 `guestToken` 返回 `400 VALIDATION_FAILED`。 |

拒绝额外字段；应用范围 `appScope` 从受控 Provider 配置读取，不接受客户端提交的 OpenID、AppID 或应用范围。客户端不得通过 `x-wx-openid` 等请求头改变身份解析结果。

成功使用 HTTP `200`，公开正文严格为：

```json
{"data":{"accessToken":"青花植新签发的不透明会话令牌","expiresAt":"2026-09-27T15:00:00.000Z"}}
```

- `accessToken`：首次成功响应中一次性披露给当前调用者的青花植高熵 Bearer；客户端后续放入 `Authorization: Bearer <accessToken>`。这是唯一窄凭证披露例外。
- `expiresAt`：按现有合同使用带 `Z` 的 ISO 8601 UTC 时间字符串，与数据库 `expires_at_ms` 对应。
- `data` 不得增加 `user_id`、平台主体、内部会话引用、策略版本或其他字段；错误、日志、审计和数据库不得含 Bearer 原文。
- 此路由不要求 `Idempotency-Key`。微信短时 `code` 只能使用一次，不能用通用“同键重放首次响应”模型处理。

稳定错误：

| 情况 | HTTP | 错误类型 | 约束 |
|---|---:|---|---|
| 缺少/格式错误的 `code` 或存在额外请求字段 | 400 | `VALIDATION_FAILED` | 不调用 Provider、不写用户、绑定或会话。 |
| code 无效、已消费或 Provider 明确拒绝 | 401 | `PRINCIPAL_INVALID` | 使用泛化中文消息，不泄露 Provider 错误码、主体或凭证。 |
| Provider 配置/策略不可用、数据库结果不能确认 | 503 | `SERVICE_UNAVAILABLE` | 失败关闭；不得伪造登录成功或自动重跑写事务。 |

## 3. 一次性 code 与重复请求

首版语义如下：

1. 第一次收到有效 `code`，Provider 验真成功后，Identity 按已验证主体摘要找到或创建统一用户及平台绑定，并签发一个新的青花植会话。
2. 若同一个已消费的 `code` 再次提交，Provider 应按无效/已消费凭证拒绝；HTTP 返回脱敏 `401 PRINCIPAL_INVALID`，不创建第二个用户、绑定或会话。
3. 首次成功响应丢失时，客户端重新调用 `wx.login` 获得新 `code` 后再登录。Provider 将新 code 验真为同一平台主体时，后端复用原 `user_id` 和平台绑定，只新增一个会话；不得重复创建用户或绑定。
4. 一个请求内如果 MySQL 提交结果未知，服务端不得自动重试、不得回放或披露当前 Bearer，返回 `503 SERVICE_UNAVAILABLE`。客户端拿到新 code 后可重新登录；若前一事务实际已提交，则复用同一用户/绑定并签发新会话。失去响应的旧会话不能交给客户端使用。

## 4. 会话签发与持久化

- 请求开始时必须取得有效的 `identity-session-policy/v1` 不可变策略快照。当前已确认的发布 TTL 为 24 小时、续期窗口为 0；无有效策略时拒绝签发，不得在源码中补默认 TTL。新策略只影响之后签发的会话。
- Provider 验真证据复用 `platform-credential-evidence.ts` 的受控输出：固定平台、服务端 `appScope` 和受控 HMAC-SHA-256 主体摘要候选。规范化主体原文只在当前调用栈用于生成摘要，不持久化。
- 对新用户，`users`、`platform_identities`、`user_sessions` 必须在一个 Identity 数据库事务中创建；任一步失败都不得留下孤儿用户或绑定。对已存在的有效主体，只复用原用户与绑定并创建新会话。
- Bearer 原文仅在当前请求内存中短暂存在；数据库仅保存 `SHA-256(accessToken)`。不得将原文写入任何表、日志、错误、审计、响应缓存或 outbox。
- `user_sessions` 需要保存签发时的会话策略发布版本和请求快照摘要，供审计与回放。字段为 `session_policy_release_version` 和 `session_policy_snapshot_sha256`；摘要关联当前请求的只读配置快照，不能被说成保存了策略正文。
- 会话绝对过期时间由显式服务端 UTC 毫秒和已锁定 TTL 快照计算；不能静默续期。新 code 登录不会重复创建统一用户或平台绑定。
- 本切片不创建试用资格、能力快照、奖励、订阅记录或 Identity outbox；这些由各自业务域按独立合同处理。

## 5. TDD 与可执行验收矩阵

层次由 `AGENTS.md` 测试分层表选择：HTTP、Identity、MySQL 与既有用户植物读取协作属于 L3 `unit_real_data`；纯 DTO/材料规则属于 L1 `unit_fake`。实际验收不能以假 Provider 代表微信，也不能以手工预置会话代表登录签发。

| 用例 | Expected 来源 | 真实路径与断言 | 未覆盖 |
|---|---|---|---|
| 首次成功登录 | 本合同 §2/§4、身份状态机 §1、会话策略合同 | TypeScript HTTP Expected → fake Provider 的一次性 code 验真 → Identity 应用/Repository → 隔离 MySQL；只返回 `accessToken`/`expiresAt`，数据库仅有 Bearer 摘要和策略快照引用。 | 真实微信网络、CloudBase 网关及部署。 |
| 登录后读取本人植物 | 本合同 §2、`contracts/user-plant.md`、P2 identity/user-plant 接口合同 | 先由登录接口产生 Bearer，再用该 Bearer 调用现有 user-plant GET，确认按统一 `user_id` 读到本人植物。 | 小程序端登录态保存和端上页面。 |
| 同一个 code 再用 | 微信一次性 code 语义与本合同 §3 | 一次性 fake Provider 对同一 code 第二次返回验真失败；HTTP 返回 `401 PRINCIPAL_INVALID`，用户/绑定/会话数量不增加。 | 真实微信 Provider 错误码与网络边界。 |
| 新 code 对应已有主体 | 本合同 §3、平台身份唯一约束 | fake Provider 为新 code 返回同一已验证主体；MySQL 读回仍只有一个用户和一条活跃绑定，但增加一条新会话。 | 跨平台账号绑定。 |
| 伪造身份请求头 | `AGENTS.md` §4、Provider 信任边界 | 提交伪造 `x-wx-openid` 但 code 无效；仍返回 `PRINCIPAL_INVALID` 且零身份写入。 | CloudBase 网关是否覆盖同名头。 |
| 提交中途失败 | 身份状态机 §1 的同事务约束 | 真实 MySQL 在会话写入阶段失败；请求不返回 Bearer，用户与绑定写入同时回滚。 | 云端故障注入。 |
| 提交结果未知 | `mysql-transaction-driver.ts` 未知提交边界、本合同 §3 | 模拟提交后调用方无法确认；本请求返回 503、不重试、不泄露 Bearer；新 code 再登录后复用同一 user/binding。 | 真实网络断连与 CloudBase MySQL。 |
| 无有效策略/Provider 配置 | `identity-session-policy.md` §3、配置目录对应 confirmed/pending 项 | 无有效会话策略或生产 Provider 仍 pending 时失败关闭；不生成会话，不发生真实外呼。 | active 发布指针和 CloudBase 凭证系统读回。 |

测试必须在文件中写明 Expected 来源、替身边界、真正经过的路径和未覆盖范围。测试替身只能替代微信 Provider；MySQL 行为须经过真实隔离 MySQL 与参数化 Repository。目标全链路通过后仍只表示“本地 fake Provider + MySQL 的 HTTP 链路已验证”。

## 6. 本次明确不验收

- 真实微信、抖音、小红书或手机号凭证 Provider；当前微信 Provider 所需 `credential_ref`、`appScope` 和外呼时限仍为 pending。
- CloudBase MySQL 网络、HTTP 云函数、网关、部署和生产环境。
- 小程序前端拿取 code、存储 accessToken、刷新/退出登录交互。
- 试用、会员、AI 额度、积分、CMS、用户植物写操作或自动创建植物。
- 登录会话同键幂等重放；一次性微信 code 的重用按 §3 拒绝，新 code 负责重新登录。
