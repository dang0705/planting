# 游客令牌签发用例测试矩阵（E03，cases 先于产品）

对象：`issueGuestSession`。Runner：Vitest。层次 L3 `unit_fake`：替换存储与随机源（确定性夹具），签发规则不替换。
Expected 来源：`guest-token-contract.md`（用户 2026-10-08 冻结）＋配置目录 `identity.guest.session_ttl_hours`=168、`identity.guest.issuance_rate_per_hour`=10。
未覆盖：真实 MySQL（另做 mysql 套件）、HTTP 入口与限流键摘要的计算（在入口切片）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 抖音/小红书 → 返回一次性 token（32 字节 base64url）、`gst_` 引用、+168 小时失效；存储记录只含 token 的 SHA-256、来源 server_issued_guest_token、证明版本 1、状态 active | Happy | 已写（绿） |
| U3 非法 | 平台为 wechat 或未知、限流键非 null 且不是 64 位小写十六进制 → invalid，不读写存储 | Reverse | 已写（绿） |
| U4 无信号（用户 2026-10-09 裁决：不读 IP 头，无信号不计数） | 限流键为 null → 不调用计数，照常签发，存储 `issuanceSourceHash=''` | Edge | 新写（RED→绿） |
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
| U5 空键 | 计数传入 `''` 或非 64 位十六进制 → 抛错，不把 `''` 当作一个来源 | Reverse | 新写（RED→绿） |

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
Expected 来源：`guest-token-contract.md` §1（公开 DTO 与错误）、§5（已确认配置）、§6（用户 2026-10-09 裁决：不读任何 IP 头，无匿名信号不在应用层计数，网关单客户端限频兜底）；route-registry `createGuestSession`（错误仅 VALIDATION_FAILED / RATE_LIMITED / SERVICE_UNAVAILABLE）。
未覆盖：真实 MySQL（另做 e2e）、CloudBase 网关单客户端限频实测（网关配置由主代理负责）、抖音真实换取。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| H1 Happy | 小红书、XFF=`203.0.113.9` → 200 `{data:{guestToken(43 位 base64url), guestSessionRef(gst_), expiresAt(+168h)}}`、`cache-control: no-store`；请求带伪造 XFF；不计数，存储限流键 `''`，匿名摘要 null | Happy | 改写（RED→绿） |
| H2 Happy | 抖音带 anonymousCode、策略开启 → 匿名摘要 = HMAC(派生键, `douyin_anonymous:<openid>`)，且作为限流键 | Happy | 已写（绿） |
| H3 降级 | 抖音匿名换取失败 → 仍 200，按无信号处理：不计数，限流键 `''`，匿名摘要 null | Edge | 改写（RED→绿） |
| H4 开关 | 策略关闭匿名信号 → 不调用换取，按无信号处理（不计数，限流键 `''`） | Edge | 改写（RED→绿） |
| X1 来源 | 不同 XFF/x-real-ip 头 → 结果与写入完全相同（代码不读 IP 头） | Edge | 改写（RED→绿） |
| V1 非法 | 平台 wechat / 未知、小红书带 anonymousCode、多余字段、非 JSON 媒体类型、坏 JSON → 400 VALIDATION_FAILED，不读写存储 | Reverse | 已写（绿） |
| R1 限流 | 抖音匿名信号过去一小时已 10 次 → 429 RATE_LIMITED，不写入 | Edge | 改写（绿） |
| S1 策略 | 无游客策略 → 503，不调用换取、不写入 | Reverse | 已写（绿） |
| S2 来源 | 无 XFF、非法 IP 且无匿名信号 → 仍 200 签发（不再 503） | Edge | 改写（RED→绿） |
| S3 写失败 | 存储写入抛错 → 503，响应不含令牌 | Reverse | 已写（绿） |
| 脱敏 | 审计事件与错误响应不含令牌、IP、anonymousCode | Reverse | 已写（绿） |

突变证据（仓库外副本，用户 2026-10-09 裁决后）：无信号也计数 → U4/H1/H3/X1 红；仓储接受空串计数 → U5 红；无信号写伪键 → U4/H1/H3/H4 红。
突变证据（仓库外副本，旧规则时期）：XFF 改取首段 → X1/S2 红（该规则已废止）；匿名换取失败改为抛出 → H3 红；忽略匿名信号开关 → H4 红；限流改 503 → R1 红。
OpenAPI 制品（`test/identity/identity-session-openapi.spec.ts`，L1 unit_real_data）：游客签发组件与多平台登录组件；反事实 RED：生成器回退到 HEAD → 两条均红，恢复后绿。

## 身份策略 v2（含游客字段）`identity-session-policy/v2`（E03，cases 先于产品）

裁决（主代理 2026-10-09）：不改 v1（测试库已发布 v1，摘要 `5d7592f4…`，登录依赖它）；新增 v2 = v1 字段 + `guestSessionTtlHours`、`guestIssuanceRatePerHour`、`douyinAnonymousSignalEnabled`（配置目录 `identity.guest.session_ttl_hours`=168、`identity.guest.issuance_rate_per_hour`=10、`identity.guest.douyin_anonymous_signal_enabled`=true，均已冻结）。v1 快照的游客部分为 null（签发入口 503）；v2 正文摘要按固定字段顺序计算，v1 摘要算法不变。
对象：`resolveIdentitySessionPolicySnapshot`（L1 unit_real_data：v1 用测试库已发布正文与摘要制品）、`createMysqlIdentitySessionPolicyReader`（L3 unit_fake：替换 SQL 连接）。
未覆盖：v2 写入测试库（需用户授权）、真实 MySQL 读回 v2。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| P1 Happy | v2 合法发布 → 快照含 `guest {ttlHours:168, ratePerHour:10, douyinAnonymousSignalEnabled:true}`，摘要按 v2 顺序 | Happy | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |
| P2 回归 | 测试库已发布 v1 正文 → 摘要仍为 `5d7592f4…`，快照 `guest` 为 null | Happy | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |
| P3 非法 | v2 缺任一游客字段、限流 0、有效期非整数、开关非布尔、v1 混入游客字段 → invalid | Reverse | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |
| P4 摘要 | v2 摘要按 v1 算法算（漏游客字段）→ invalid | Reverse | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |
| D1 读取 | 读取器：schema_version v2 行 → 快照含 guest；v1 行声明 v2 版本不一致 → null | Happy/Reverse | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |
| D2 读取 | 读取器：v2 行正文含未知字段 → null | Reverse | 已写（绿；突变：v2 摘要退回 v1 算法→P1/P4/D1 红，游客恒 null→P1/D1 红，限流下限改 0→P3 红；P3/D2 在 v2 前因未知版本已拒绝，属守护用例） |

## 游客签发与解析 MySQL 端到端（E03）

层次 `unit_real_data`：真实 MySQL 8.4（007 策略表、003 guest_sessions + 023 迁移）、真实 `createIdentityServer` HTTP、真实策略读取器与 HMAC 派生；只替换登录 Provider（本用例不调用）与抖音匿名换取（确定性替身 code → openid-<code>，用于 E3 按信号限流）。不是 CloudBase 部署或真机验收。
Expected 来源：guest-token-contract.md §1/§2/§5/§6（§5/§6 用户 2026-10-09 裁决）、配置目录已冻结值（168 小时、10 次/小时）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| E1 Happy | v2 活动发布 → 200；库中一行，`possession_proof_hash`=SHA-256(令牌)、来源 server_issued_guest_token、限流键 `''`（无信号）、+168h；任何列不含令牌原文或伪造头 IP | Happy | 改写（RED→绿） |
| E2 读回 | 用返回令牌经真实存储解析 → GuestPrincipal，引用与响应一致 | Happy | 已写（绿） |
| E3 限流 | 同一抖音匿名信号 10 次成功后第 11 次 → 429；另一信号仍可签发 | Edge | 改写（RED→绿） |
| E5 无信号 | 小红书无信号连续 11 次（库中已有 10 行 `''`）→ 均 200，`''` 不被当作一个来源 | Edge | 新写（RED→绿） |
| E4 失败关闭 | 活动指针切回 v1 发布 → 503，不新增行 | Reverse | 已写（绿） |

反事实 RED：读取器不认 v2（仓库外副本）→ E1/E3 红；恢复后 3/3 绿。

## 游客或登录主体合并解析 `createResolveGuestOrUserPrincipal`（E03，cases 先于产品）

对象：`guest_or_authenticated` 路由使用的统一解析端口。L3 `unit_fake`：替换登录用户解析与游客存储。
Expected 来源：guest-token-contract.md §2（`Bearer guest.<token>` → 游客）；principal-and-capability 合同（其他 Bearer 为登录会话）；登录会话令牌为 base64url，不含 `.`，与前缀不冲突。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| G1 | `guest.<合法令牌>` → 游客主体，不调用登录解析 | Happy | 已写（绿） |
| G2 | 无前缀 Bearer → 交给登录解析并原样返回其结果，不查游客存储 | Happy | 已写（绿） |
| G3 | `guest.` 后令牌非法/找不到 → PRINCIPAL_INVALID（统一主体解析错误），不回落到登录解析 | Reverse | 已写（绿） |

突变：游客失败回落登录解析 → G3 红。接线：diagnosis 入口改用合并解析（入口组合代码，构建与类型检查覆盖；未做 diagnosis 游客 MySQL 端到端）。
