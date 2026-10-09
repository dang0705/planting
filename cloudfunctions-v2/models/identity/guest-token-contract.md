# 游客令牌签发合同 `guest-token/v1`（用户 2026-10-08 确认冻结）

依据：用户 2026-10-08 裁决——游客改为后端自发令牌（替代 CloudBase 匿名登录）；微信端 `wx.login` 静默登录不走游客；抖音、小红书未登录时使用游客令牌；游客令牌有效期 7 天（`identity.guest.session_ttl_hours`=168）。调研：`multi-platform-identity-research.md`。

## 1. 新增公开接口

`POST /api/v2/identity/guest-sessions`（security: `guest_issuance`（无需登录的写入口，仅此路由可用；需限流）；不要求 `Idempotency-Key`——每次调用签发新令牌，重复调用只会多一个短期游客会话）

请求：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `platform` | `'douyin' \| 'xiaohongshu'` | 是 | 微信不走游客，传 `wechat` 拒绝 |
| `anonymousCode` | string | 否 | 仅抖音：`tt.login` 返回的 `anonymousCode`，服务端换 `anonymous_openid` 后只存其 HMAC，作为防刷与限流键，不作为业务主键 |

响应 `{ data: { guestToken, guestSessionRef, expiresAt } }`：

- `guestToken`：≥256 位随机，base64url，**只在本响应出现一次**；前端存本地，后续请求以 `Authorization: Bearer guest.<token>` 携带。
- `guestSessionRef`：`gst_` 公开引用。
- `expiresAt`：签发时刻 + 168 小时。

错误：`VALIDATION_FAILED`、`RATE_LIMITED`、`SERVICE_UNAVAILABLE`（策略或依赖不可用时失败关闭）。

## 2. 后续业务请求的游客解析

`guest_or_authenticated` 接口收到 `Bearer guest.<token>` 时：进程内计算 SHA-256 → 按摘要定位 `guest_sessions` → 校验 `status=active` 且未过期 → 解析为 `GuestPrincipal { principalType:'guest', guestSessionRef, authProvider:'server_issued_guest_token', issuedAt, expiresAt }`。原始令牌不落库、不写日志。

## 3. 认领

沿用既有 `POST /api/v2/user-plants/claims`：登录用户同时携带原游客令牌（作为持有证明），同一事务中解析 `user_id`、迁移临时案例、把会话置为 `completed`；同一令牌第二次认领拒绝。

## 4. 数据模型调整（新增顺序迁移，不改已应用迁移）

`guest_sessions`：
- `possession_proof_hash` 存游客令牌 SHA-256（持有证明即令牌本身）。
- `anonymous_subject_hash` 改为可空，语义改为“可选平台匿名信号摘要”（抖音 `anonymous_openid` 的 HMAC）；新增 `identity_source` 列（`server_issued_guest_token`），历史 CloudBase 语义不再签发。
- 不保存令牌原文、设备 ID 或 IP。

## 5. 已确认的配置（用户 2026-10-08）

| 配置 | 建议 | 说明 |
|---|---|---|
| 签发限流 | 每小时 ≤ 10 次，**只对带抖音匿名信号（anonymous_openid 摘要）的请求按信号计数**；无信号请求不在应用层按来源计数，由网关路由 `/api/v2/identity/guest-sessions` 的单客户端限频（ClientIP，1 QPS）兜底（用户 2026-10-09 裁决） | 防刷；超出返回 `RATE_LIMITED` |
| 单个游客最多临时案例数 | 5 | 防止滥用存储 |
| 是否启用抖音匿名信号 | 启用 | 仅作防刷键 |

## 6. 签发入口实现裁决（Claude 2026-10-09，不改变公开 DTO）

- **客户端来源 IP（用户 2026-10-09 裁决，替代原「XFF 最右段」规则）**：应用代码**不读取任何 IP 请求头**（`x-forwarded-for`、`x-real-ip` 等）。依据 2026-10-09 测试环境临时诊断函数实测（证据 `.codex/backend-v2/evidence/E03-E06-test-env-deploy-2026-10-09.json` 的 `xffDiagnosis`）：CloudBase 默认域名走 CDN，函数收到的 `x-forwarded-for` 恒为 5 段——无伪造头时第 1 段是客户端、其余为 CDN 节点；客户端带伪造头时第 1 段变成伪造值、真实客户端段消失；`x-real-ip` 是 CDN 节点。函数无法从请求头可靠取得客户端 IP，原「XFF 最右段」规则不成立。按客户端防刷交给 CloudBase 网关「单客户端限频」（网关自行识别真实 IP，路由 `/api/v2/identity/guest-sessions`，ClientIP 1 QPS）。
- **无匿名信号时的限流键**：`issuance_source_hash` 写空串 `''`（列 NOT NULL DEFAULT ''），表示「无应用层来源」；应用层不计数，计数查询只接受 64 位十六进制摘要，`''` 永不被当作一个来源。
- **摘要密钥**：不新增密钥，用 HKDF-SHA256 从 `PLATFORM_SUBJECT_HMAC_KEY_V1` 派生专用子密钥（info=`qinghuazhi/guest-issuance-source/v1`），与平台主体摘要域隔离；匿名信号加前缀 `douyin_anonymous:` 再做 HMAC-SHA256（原 `client_ip:` 前缀随 IP 规则一并废止）。
- **抖音匿名信号**：策略开启且请求带 `anonymousCode` 时换取 `anonymous_openid`；成功则其摘要同时作为 `anonymous_subject_hash` 与限流键；换取失败不阻断签发，按无信号处理（应用层不计数，由网关兜底）（配置目录 `identity.guest.douyin_anonymous_signal_enabled`）。
- **策略来源**：游客有效期、限流上限、匿名信号开关须来自已发布身份策略 `identity-session-policy/v2`（v1 字段 + `guestSessionTtlHours`、`guestIssuanceRatePerHour`、`douyinAnonymousSignalEnabled`；v1 摘要算法不变）。活动发布仍为 v1 或不可用时入口一律 503（失败关闭）。
