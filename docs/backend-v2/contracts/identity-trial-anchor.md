# 统一用户试用起算锚点只读合同

- 合同版本：`identity-trial-anchor/v1`
- 数据事实所有者：`identity`
- 唯一调用方：`subscription` 服务主体
- 独立 Expected：试用的起算事实是统一用户的 `users.created_at_ms`；身份域仅提供身份域拥有的用户事实，试用资格、有效期、权益和额度由 `subscription` 按其已发布策略判定。
- 运行状态：P3 内部 API 合同已登记；本合同不代表运行时路由、服务主体签发、MySQL Repository 或 CloudBase 部署已经实现。

## 1. 用途与边界

`subscription` 需要一个受控的身份域只读端口，读取指定统一用户的最小试用判定输入。身份域仍是用户创建时间和账户状态的唯一事实所有者；`subscription` 不得跨函数直接查询 `users` 表，也不得要求 Identity 同步写入权益或额度表。

此端点只返回事实，不负责或暗示：

- 判断用户是否符合试用资格；
- 计算试用开始/结束时间、剩余额度或能力集合；
- 创建或修改订阅、试用权益、AI 额度 grant；
- 解析平台凭证、读取平台主体标识或返回登录会话。

`subscription` 根据返回事实和自己的已发布策略执行试用判定。用户创建时刻是起算依据，不等于 Identity 的业务规则，也不允许本端点复制试用时长或 AI 点数。

## 2. 路由与权限

```text
GET /api/v2/internal/identity/users/{userRef}/trial-anchor
```

| 项目 | 固定合同 |
|---|---|
| 路由所有者 | `identity` |
| 阶段 | `P3` |
| 调用主体 | 受控内部服务 `subscription` |
| 唯一 scope | `identity.trial-anchor.read` |
| 幂等 | 不适用；只读请求不创建业务状态 |
| 请求正文 | 无 |
| 查询参数 | 不接受 |

调用必须通过内部服务签名、时钟窗口、nonce 防重放、原始正文摘要和精确 scope 校验。`X-QHZ-Scope` 必须逐字等于 `identity.trial-anchor.read`；不能接受通配权限、附加 scope 或 `cloudbase_agent` 主体。通用规则见[访问主体与能力快照合同](principal-and-capability.md)及[HTTP API 公共合同](http-api.md)。

路径参数 `userRef` 是高熵、对外可用的统一用户引用，必须解析到 Identity 所有的统一用户记录；它不是数据库内部主键，不能填写平台 OpenID、手机号、匿名 UID 或平台主体摘要。

## 3. 路径参数

| 字段 | 类型 | 含义与约束 |
|---|---|---|
| `userRef` | 字符串 | 高熵统一用户公开引用，格式为 `usr_...`；不得是 `BIGINT UNSIGNED` 内部键或任何平台身份值。必须按身份域现行公开引用格式校验。 |

## 4. 成功响应

成功响应使用 HTTP 公共合同规定的 `{ "data": ... }` 外壳，字段严格如下：

```ts
/** Identity 提供给 subscription 的最小用户试用锚点事实；不包含权益结论。 */
export type UserTrialAnchorInternalResponse = {
  /** 被查询用户的高熵公开引用；绝不返回数据库内部用户主键。 */
  userRef: string
  /** Identity 当前账户状态；subscription 必须把非 active 状态按合同拒绝授予付费能力。 */
  status: 'active' | 'suspended' | 'deleting' | 'deleted'
  /** 统一用户在 Identity 中的创建时刻，Unix UTC 毫秒数，必须为安全整数。 */
  createdAtMs: number
}
```

```json
{
  "data": {
    "userRef": "usr_7N3qL5tB8mK2vX9cR4pW1a",
    "status": "active",
    "createdAtMs": 1790215200000
  }
}
```

响应必须拒绝新增字段，尤其不得包含 `user_internal_id`、平台主体标识、手机号、邮箱、bearer、会话版本、试用资格布尔值、会员等级、权益、AI 额度、请求追踪 ID 或 SQL 信息。

## 5. 错误语义

| `error.type` | HTTP | 语义 |
|---|---:|---|
| `VALIDATION_FAILED` | 400 | `userRef` 格式非法或请求附带禁止的正文/查询参数。 |
| `PRINCIPAL_INVALID` | 401 | 内部服务签名、服务主体、nonce 或精确 scope 无效。 |
| `NOT_FOUND` | 404 | `userRef` 不对应 Identity 中的统一用户。 |
| `SERVICE_UNAVAILABLE` | 503 | Identity 用户事实读取依赖暂时不可用；调用方不得自行降级为猜测的创建时间。 |

错误响应只采用 HTTP 公共合同中定义的稳定 `{ "error": { "type", "message" } }` 形状，不泄露失败的具体签名字段、查询内容、平台身份或用户是否存在于其他域。

## 6. 实现与验收边界

此合同冻结后，运行时实现仍需单独完成并验收：

1. `subscription` 独占该 scope 的服务主体类型及严格校验；Agent、调度器、支付回调和其他服务主体均不得持有该 scope。
2. Identity 只读 Repository 通过 `userRef` 查询 `users.status` 与 `users.created_at_ms`，不将内部主键带出 Repository/应用边界。
3. HTTP 路由执行真实服务签名验证、路径校验、SQL 查询和响应字段白名单投影；数据库失败按 `SERVICE_UNAVAILABLE` 失败关闭。
4. `unit_real_data` 覆盖状态和毫秒时间读回、非法/不存在用户引用、附加字段拒绝及响应脱敏；另以真实 MySQL 验证查询读回。静态合同测试不声称覆盖以上运行时行为。

