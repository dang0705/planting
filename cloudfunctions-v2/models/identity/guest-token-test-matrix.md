# 游客令牌签发用例测试矩阵（E03，cases 先于产品）

对象：`issueGuestSession`。Runner：Vitest。层次 L3 `unit_fake`：替换存储与随机源（确定性夹具），签发规则不替换。
Expected 来源：`guest-token-contract.md`（用户 2026-10-08 冻结）＋配置目录 `identity.guest.session_ttl_hours`=168、`identity.guest.issuance_rate_per_hour`=10。
未覆盖：真实 MySQL（另做 mysql 套件）、HTTP 入口与限流键摘要的计算（在入口切片）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 抖音/小红书 → 返回一次性 token（32 字节 base64url）、`gst_` 引用、+168 小时失效；存储记录只含 token 的 SHA-256、来源 server_issued_guest_token、证明版本 1、状态 active | Happy | 已写（绿） |
| U3 非法 | 平台为 wechat 或未知、限流键不是 64 位小写十六进制 → invalid，不读写存储 | Reverse | 已写（绿） |
| U2 边界 | 过去一小时已签发 9 次 → 仍签发；10 次 → rate_limited 且不写入；计数窗口起点 = now − 1 小时 | Edge | 已写（绿） |
| I2 | 无已发布策略 → unavailable，不写入 | Edge | 已写（绿） |
| I5 写中断 | 写入失败 → unavailable，结果不含 token | Reverse | 已写（绿） |
| 脱敏 | 存储记录序列化后不含 token 原文 | Reverse | 已写（绿） |

## 游客会话存储 `createMysqlGuestSessionRepository`（真实 MySQL）

层次 `unit_real_data`：真实 MySQL 8.4，按 003 建表后应用 023 迁移；不经过 HTTP 或云端。Expected 来源：迁移 023、guest-token/v1。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 写入后按限流键计数为 1；按令牌摘要找到有效会话（引用、签发与失效时刻） | Happy | 已写（绿） |
| U2 边界 | 计数窗口起点晚于签发时刻 → 0；其他限流键 → 0 | Edge | 已写（绿） |
| Reverse | 已过期、状态非 active、未知摘要 → 找不到 | Reverse | 已写（绿） |
| I3 约束 | 重复公开引用写入被唯一键拒绝；非法 identity_source 被 CHECK 拒绝 | Edge | 已写（绿） |

## 游客令牌解析 `resolveGuestPrincipal` / `parseGuestBearer`（E03，cases 先于产品）

对象：后续业务请求携带 `Authorization: Bearer guest.<token>` 时把令牌解析为 `GuestPrincipal`。Runner：Vitest。层次 L3 `unit_fake`：只替换存储（按摘要查找），摘要与裁决规则不替换。
Expected 来源：`guest-token-contract.md` §2（用户 2026-10-08 冻结）——进程内 SHA-256 → 按摘要定位 → active 且未过期 → `GuestPrincipal { principalType:'guest', guestSessionRef, authProvider:'server_issued_guest_token', issuedAt, expiresAt }`；令牌格式来自签发合同（32 字节 base64url，43 字符）。
未覆盖：真实 MySQL 查找（已由存储套件覆盖）、HTTP 入口接线（diagnosis/care 入口切片）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 合法令牌、存储找到会话 → 返回 GuestPrincipal（ISO 时刻带 Z）；存储只收到令牌 SHA-256 与 nowMs | Happy | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| U3 非法 | 令牌为空、长度非 43、含非 base64url 字符 → PRINCIPAL_INVALID，不查存储 | Reverse | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| Reverse | 存储找不到（未知/过期/已认领）→ PRINCIPAL_INVALID | Reverse | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| U2 边界 | 存储读回 expiresAtMs = nowMs → 拒绝；nowMs + 1 → 通过（防御存储过滤失效） | Edge | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| I5 依赖失败 | 存储抛错 → 原错误向上抛出（入口映射 503），不被伪装成 PRINCIPAL_INVALID | Reverse | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| 脱敏 | 拒绝错误的消息不含令牌原文 | Reverse | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |
| 前缀 | `parseGuestBearer`：`guest.<token>` → token；无前缀的用户 Bearer、仅 `guest.` → null | Edge | 已写（绿；突变：去掉过期复核→U2 红，去掉格式校验→U3 红） |

## 游客签发 HTTP 入口 `POST /api/v2/identity/guest-sessions`（E03，cases 先于产品）

对象：`createGuestSessionRouteHandler`（挂在真实 `node:http` 服务上调用）。层次 L3 `unit_fake`：替换游客存储、抖音匿名换取与策略端口；请求解析、DTO 校验、来源摘要、签发规则与公开响应不替换。
Expected 来源：`guest-token-contract.md` §1（公开 DTO 与错误）、§5（已确认配置）、§6（来源 IP 与摘要裁决，CloudBase 官方文档）；route-registry `createGuestSession`（错误仅 VALIDATION_FAILED / RATE_LIMITED / SERVICE_UNAVAILABLE）。
未覆盖：真实 MySQL（另做 e2e）、CloudBase 网关实测 XFF、抖音真实换取。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| H1 Happy | 小红书、XFF=`203.0.113.9` → 200 `{data:{guestToken(43 位 base64url), guestSessionRef(gst_), expiresAt(+168h)}}`、`cache-control: no-store`；存储限流键 = HMAC(派生键, `client_ip:203.0.113.9`)，匿名摘要 null | Happy | 已写（绿） |
| H2 Happy | 抖音带 anonymousCode、策略开启 → 匿名摘要 = HMAC(派生键, `douyin_anonymous:<openid>`)，且作为限流键 | Happy | 已写（绿） |
| H3 降级 | 抖音匿名换取失败 → 仍 200，限流键回落为 IP 摘要，匿名摘要 null | Edge | 已写（绿） |
| H4 开关 | 策略关闭匿名信号 → 不调用换取，按 IP 限流 | Edge | 已写（绿） |
| X1 来源 | XFF=`198.51.100.1, 203.0.113.9` → 取最右段 203.0.113.9 | Edge | 已写（绿） |
| V1 非法 | 平台 wechat / 未知、小红书带 anonymousCode、多余字段、非 JSON 媒体类型、坏 JSON → 400 VALIDATION_FAILED，不读写存储 | Reverse | 已写（绿） |
| R1 限流 | 过去一小时同来源已 10 次 → 429 RATE_LIMITED，不写入 | Edge | 已写（绿） |
| S1 策略 | 无游客策略 → 503，不调用换取、不写入 | Reverse | 已写（绿） |
| S2 来源 | 无 XFF 或非法 IP 且无匿名信号 → 503，不写入 | Reverse | 已写（绿） |
| S3 写失败 | 存储写入抛错 → 503，响应不含令牌 | Reverse | 已写（绿） |
| 脱敏 | 审计事件与错误响应不含令牌、IP、anonymousCode | Reverse | 已写（绿） |

突变证据（仓库外副本）：XFF 改取首段 → X1/S2 红；匿名换取失败改为抛出 → H3 红；忽略匿名信号开关 → H4 红；限流改 503 → R1 红。
OpenAPI 制品（`test/identity/identity-session-openapi.spec.ts`，L1 unit_real_data）：游客签发组件与多平台登录组件；反事实 RED：生成器回退到 HEAD → 两条均红，恢复后绿。
