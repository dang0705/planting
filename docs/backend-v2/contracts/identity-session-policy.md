# 登录用户会话策略发布与请求快照合同

- 合同版本：`identity-session-policy/v1`
- 所属领域：`identity`
- 配置范围：`identity_sessions`
- 当前实施边界：发布内容的严格结构校验、有效发布解析和请求级不可变快照；不包含登录会话签发、数据库表结构、HTTP 路由、平台凭证验证或 CloudBase 部署。

## 1. 独立 Expected 与当前已确认值

本合同的 Expected 来自以下已冻结事实，而不是从实现或测试输出反推：

- `docs/backend-v2/architecture/configuration-variable-catalog.json` 中已确认的 `identity.user.session_ttl_hours`：当前策略值为 `24` 小时，并由不可变策略发布承载。
- 同目录中已确认的 `identity.user.refresh_window_hours`：当前值为 `0` 小时；MVP 禁止静默续期。
- `docs/backend-v2/architecture/configuration-variable-catalog.md`：没有有效身份策略发布时拒绝签发新会话；策略新版本只向前生效，不延长旧会话。
- `docs/backend-v2/architecture/configuration-and-providers.md`：进行中的请求锁定只读配置快照；配置不可用时身份能力失败关闭，不使用隐式默认值。

因此 v1 Schema 要求 TTL 为正整数且不设最大值；`24` 是当前 active 发布值，不是代码默认值或上限。续期窗口在 v1 固定为 `0`。缺失策略不能补成 24 小时；未来 TTL 调整须经目录治理并发布新的不可变策略版本，不能改写旧发布。启用非零续期则必须先更新身份合同版本和策略版本，并补齐轮换与撤销测试。

## 2. 发布载荷与 SHA-256 规则

运行时只接受完整、严格的发布载荷：

```json
{
  "contractVersion": "identity-session-policy/v1",
  "scopeCode": "identity_sessions",
  "releaseVersion": "v1.0.0",
  "sessionTtlHours": 24,
  "refreshWindowHours": 0,
  "contentSha256": "5d7592f4830373bcad41a162ab033a796dfaac0b81c54297296ef154c6bb0e22",
  "releaseStatus": "active",
  "effectiveAt": "2026-09-24T00:00:00.000Z"
}
```

`contentSha256` 是策略内容摘要。先按下列固定属性顺序构造 JSON，再对其 UTF-8 字节计算 SHA-256；发布版本、生效/失效时间和发布状态属于发布元数据，不进入策略内容摘要：

```json
{"contractVersion":"identity-session-policy/v1","scopeCode":"identity_sessions","sessionTtlHours":24,"refreshWindowHours":0}
```

`expiresAt` 是可选发布元数据；若给出，必须是有效 UTC 时间，且晚于 `effectiveAt`。有效时间区间为 `[effectiveAt, expiresAt)`；省略表示该发布没有预先声明失效时刻，不代表没有策略发布。

Schema 拒绝未知字段、额外敏感字段、缺失字段、未知版本、非正整数 TTL、非零续期值、非法摘要与非 UTC 时间。TTL 不设上限，避免把可版本化策略写死成源码上限；当前 active 发布制品仍按已确认值使用 24 小时。策略摘要必须由服务端按上述算法重算并完全匹配；不匹配时不得形成快照。

## 3. 有效发布解析与失败语义

解析器接收配置仓库已选择的单个发布记录及显式 `capturedAt`，不自行读取环境变量、不自行补默认值、不自行选择旧版本：

| 条件 | 结果 |
|---|---|
| 没有发布记录 | `IDENTITY_SESSION_POLICY_UNAVAILABLE` |
| 发布状态不是 `active` | `IDENTITY_SESSION_POLICY_UNAVAILABLE` |
| `capturedAt < effectiveAt` | `IDENTITY_SESSION_POLICY_NOT_EFFECTIVE` |
| 已达到或越过 `expiresAt` | `IDENTITY_SESSION_POLICY_UNAVAILABLE` |
| TTL 非正整数、续期窗口非零，或其他结构、时间与摘要不合法 | `IDENTITY_SESSION_POLICY_INVALID` |
| 完整有效 | 返回绑定发布版本、内容摘要和捕获时间的只读策略快照 |

无有效策略时，上层身份用例必须拒绝签发新会话。此解析器本身不签发 bearer，也不读写会话。切换发布只影响在切换后捕获新快照的请求；已有会话的绝对失效时间不得被延长，续期窗口仍为 `0`。

## 4. 请求快照与哈希

解析成功时，策略快照只包含当前合同允许的 TTL/续期值以及发布版本、内容摘要、生效时间、显式捕获时间。另通过共享配置快照生成器构建统一快照：

- `policyReleases` 恰好包含 `{ scopeCode, releaseVersion, sha256: contentSha256 }` 一项；
- `providerReleases` 为空；
- `capturedAt` 必须由调用方明确提供；
- `snapshotSha256` 因而同时绑定捕获时点、策略作用域、发布版本和内容摘要。

返回对象、引用数组及引用项均不可变。快照哈希不含用户、平台主体、bearer、数据库主键、凭证或追踪标识。

## 5. 此切片的验证边界

测试层为 `unit_fake`：覆盖严格 Schema、当前 confirmed 值、无默认值失败关闭、内容 SHA 重算、生效/失效时间窗口、发布状态和不可变版本快照。测试不声称覆盖数据库 active 指针、审批人真实性、会话签发、MySQL 持久化、CloudBase、HTTP 或真实平台凭证验证；这些必须由相应后续合同与真实环境验收。
