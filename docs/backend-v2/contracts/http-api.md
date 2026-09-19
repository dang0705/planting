# HTTP API 公共合同

- 合同版本：`http-api/v1`
- 适用范围：`/api/v2` 公开接口、游客接口、登录接口，以及受控内部服务接口。
- 事实来源：Canonical Master Plan、已冻结领域合同和 `AGENTS.md` 的固定请求处理顺序。
- 本合同冻结跨业务域共同遵守的协议边界；P1 只建立可执行骨架，P6 才发布完整 OpenAPI 3.1 文档和前端接入包。

## 1. 固定处理顺序

```text
请求大小与媒体类型限制
→ 身份令牌或内部签名校验
→ 解析 GuestPrincipal / UserPrincipal / ServicePrincipal
→ user_id 与 user_plant_id 归属校验
→ AJV DTO 校验
→ Command 或 Query
→ 领域规则
→ Repository 与 MySQL 事务
→ 脱敏公开响应、结构化日志和审计事件
```

路由层不得跳过、交换或把其中任一步下放给客户端。失败后立即停止，不进入后续步骤。

普通 JSON 请求正文上限固定为 `1,048,576` 字节（1 MiB），唯一配置项为 `http.json_body_limit_bytes`。HTTP 适配层必须按原始字节数在 JSON 解析前拒绝超限请求；恰好达到上限的请求不得被大小门误拒绝。内部 Job/Callback 的正文上限是独立配置，未冻结前不得复用此数值或开放对应入口。

## 2. 接口安全级别

| 级别 | 中文含义 | 允许的主体 | 硬边界 |
|---|---|---|---|
| `public` | 公开只读 | 无登录主体 | 只返回已发布、非个性化内容 |
| `guest` | 游客临时能力 | `GuestPrincipal` 或 `UserPrincipal` | 游客不能获得 `user_id`、用户植物、会员、积分或个人 Agent 上下文 |
| `authenticated` | 登录用户能力 | `UserPrincipal` | 先解析统一 `user_id`，再校验对象归属和能力快照 |
| `service` | 内部服务能力 | `ServicePrincipal` | 必须同时校验服务签名、时间窗口、nonce、正文哈希和最小 scope |

同一路由若同时允许游客和登录用户，路由登记表必须明确写成 `guest_or_authenticated`；禁止用“可选 token”进行隐式分支。

## 3. 公开成功与错误响应

- `/api/v2` 业务接口成功响应统一使用 `{ "data": ... }`，其中 `data` 的字段由具体响应 DTO 冻结。
- `/health` 与本地 `/probe` 是部署和构建探针，不属于 `/api/v2` 业务接口，可以继续使用固定 `{ "ok": true }` 白名单响应。
- 所有公开错误只有以下稳定形状，字段名固定为 `error.type`，禁止增加 `ok`、`code`、内部 ID、SQL、堆栈、Prompt、模型原文、token 或追踪 ID：

```json
{
  "error": {
    "type": "VALIDATION_FAILED",
    "message": "请求内容不完整"
  }
}
```

### 错误目录与 HTTP 状态

| `error.type` | HTTP | 中文语义 |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | JSON 或 DTO 不满足合同 |
| `PRINCIPAL_INVALID` | 401 | 身份凭证无效、过期或无法解析 |
| `CAPABILITY_DENIED` | 403 | 主体有效，但无该项能力 |
| `IDENTITY_BINDING_CONFLICT` | 409 | 平台身份已被占用、与当前主体冲突或不能安全恢复；统一消息不得暴露原绑定用户 |
| `IDENTITY_LAST_BINDING_REQUIRED` | 409 | 当前绑定是账户最后一个有效登录入口，必须改走账户删除流程 |
| `NOT_FOUND` | 404 | 路由或普通公开资源不存在 |
| `USER_PLANT_NOT_FOUND` | 404 | 当前用户不可见的用户植物；不得泄露其是否属于他人 |
| `METHOD_NOT_ALLOWED` | 405 | 路由存在但方法不支持 |
| `GUEST_SESSION_EXPIRED` | 410 | 游客会话已永久过期，不能继续使用 |
| `PAYLOAD_TOO_LARGE` | 413 | 请求正文超过该路由上限 |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | 媒体类型不受支持 |
| `IDEMPOTENCY_CONFLICT` | 409 | 同一幂等键对应不同规范化请求 |
| `USER_PLANT_VERSION_CONFLICT` | 409 | 用户植物版本已变化，需要重新读取 |
| `CAPABILITY_SNAPSHOT_EXPIRED` | 409 | 用例执行时能力快照已失效，需要重新解析 |
| `GUEST_SESSION_NOT_CLAIMABLE` | 409 | 游客案例状态不允许认领或已经被认领 |
| `AI_QUOTA_INSUFFICIENT` | 409 | 当前可用 AI 额度不足；不暗示购买是唯一解决方式 |
| `INTERNAL_ERROR` | 500 | 未分类的服务端失败，公开消息必须泛化 |
| `SERVICE_UNAVAILABLE` | 503 | 必要依赖暂时不可用，且当前用例不能安全降级 |

## 4. 幂等和并发

- 所有改变状态的公开写接口必须接收 `Idempotency-Key` 请求头；长度为 8 至 128 个可打印 ASCII 字符。
- HTTP 适配层将请求头写入内部 Command；公开请求正文不得再次接受 `idempotencyKey`，避免两个来源冲突。
- 唯一作用域至少包含主体、HTTP method、规范化 path 和业务动作；AI 额度还必须绑定 `user_id + productActionId`。
- 同键同参返回首次确定结果；同键异参返回 `409 IDEMPOTENCY_CONFLICT`。
- 并发请求由事务和唯一约束选出唯一结果，不能重复建植物、认领、扣积分、发额度或创建订单。
- 覆盖式更新必须携带资源版本；版本不一致返回 `409 USER_PLANT_VERSION_CONFLICT`。
- 支付回调和可靠事件使用供应商事件 ID 或事件 ID 作为 inbox 唯一键，不依赖客户端请求头。

## 5. 内部服务签名

`service` 接口至少验证：

- `key_id`：标识当前可用的签名密钥版本；
- `timestamp`：位于已冻结的允许时钟窗口；
- `nonce`：在窗口内只能使用一次；
- `body_sha256`：签名覆盖的原始正文哈希；
- `scope`：与路由登记表要求完全匹配；
- `signature`：使用服务端受控密钥校验，密钥和签名原文不得进入日志或响应。

签名失败统一返回 `PRINCIPAL_INVALID`；不能向调用方透露具体失败环节。

MVP 固定允许时钟偏差为正负 300 秒；验签成功后，`(service_name, nonce_hash)` 必须在同一原子操作中占用并至少保留 600 秒。nonce 唯一性不包含 `key_id`，因此轮换密钥也不能重放同一服务 nonce。数据库清理只能发生在到期之后，不能先删再依赖请求时间判断重放。

签名算法固定为 `HMAC-SHA-256`。规范化明文按 UTF-8 和换行符 `\n` 连接：合同版本、服务名、`key_id`、十进制 UTC 秒时间戳、nonce、HTTP 大写方法、规范化路径与按键排序查询串、原始请求体 SHA-256、唯一 scope。签名使用 base64url；任何字段缺失、重复、非法编码或规范化结果不一致均按 `PRINCIPAL_INVALID` 失败关闭。验签使用常量时间比较；密钥只由 `credential_ref` 从 CloudBase 受控环境解析。

## 6. AI 额度输入边界

- 客户端只提交产品动作标识和所请求的生成式能力，不得提交点数、成本策略版本、预占值、结算值或额度批次。
- `subscription` 根据服务端发布的成本策略计算预计额度，再生成内部预占 Command。
- 内部预占 Command 可以包含 `costPolicyVersion`、`estimatedAmount` 和幂等键，但只能由受信应用服务产生。
- 额度不足返回 `409 AI_QUOTA_INSUFFICIENT`，并且不得发起供应商模型调用。

## 7. 已裁决的跨文档冲突

- 游客植物案例认领只有 `user-plant` 一个编排者；`care` 和 `diagnosis` 只保存自己的临时对象并通过内部查询解析认领后的归属。
- 游客会话和未认领案例的有效期正式冻结为 24 小时。P0 卡片中的 `CONTRACT_STOP` 仅表示当时未决，自本合同与 `guest-session-claim/v1` 生效后被替代。
- 状态枚举以 `state-machines/v1` 为准：试用 `eligible → active → expired` 或 `eligible → denied`；会员 `pending → active → cancelled/expired` 或 `pending → failed`；兑换 `requested → committed/rejected/reversed`。
- 支付回调唯一归属 `subscription`；P5 必须以真实网关回读和沙箱回放验证路由赢家，本合同不授权线上切换。

## 8. P1 与后续阶段边界

P1 必须具备机器可检查的具体路由登记表、严格 TypeScript/AJV 公共 DTO、错误结构、幂等规则和安全级别。养护、诊断、支付、模型调用和 Agent 工具的真实业务行为只登记 owner 与合同引用，不在 P1 冒充已实现；真实 CloudBase 网关、MySQL、供应商和回放验收按后续 Phase 执行。
