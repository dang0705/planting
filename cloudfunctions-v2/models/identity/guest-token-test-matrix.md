# 游客令牌签发用例测试矩阵（E03，cases 先于产品）

对象：`issueGuestSession`。Runner：Vitest。层次 L3 `unit_fake`：替换存储与随机源（确定性夹具），签发规则不替换。
Expected 来源：`guest-token-contract.md`（用户 2026-10-08 冻结）＋配置目录 `identity.guest.session_ttl_hours`=168、`identity.guest.issuance_rate_per_hour`=10。
未覆盖：真实 MySQL（另做 mysql 套件）、HTTP 入口与限流键摘要的计算（在入口切片）。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 抖音/小红书 → 返回一次性 token（32 字节 base64url）、`gst_` 引用、+168 小时失效；存储记录只含 token 的 SHA-256、来源 server_issued_guest_token、证明版本 1、状态 active | Happy | 待写 |
| U3 非法 | 平台为 wechat 或未知、限流键不是 64 位小写十六进制 → invalid，不读写存储 | Reverse | 待写 |
| U2 边界 | 过去一小时已签发 9 次 → 仍签发；10 次 → rate_limited 且不写入；计数窗口起点 = now − 1 小时 | Edge | 待写 |
| I2 | 无已发布策略 → unavailable，不写入 | Edge | 待写 |
| I5 写中断 | 写入失败 → unavailable，结果不含 token | Reverse | 待写 |
| 脱敏 | 存储记录序列化后不含 token 原文 | Reverse | 待写 |

## 游客会话存储 `createMysqlGuestSessionRepository`（真实 MySQL）

层次 `unit_real_data`：真实 MySQL 8.4，按 003 建表后应用 023 迁移；不经过 HTTP 或云端。Expected 来源：迁移 023、guest-token/v1。

| 维 | 用例 | 形态 | 状态 |
|---|---|---|---|
| I1 Happy | 写入后按限流键计数为 1；按令牌摘要找到有效会话（引用、签发与失效时刻） | Happy | 待写 |
| U2 边界 | 计数窗口起点晚于签发时刻 → 0；其他限流键 → 0 | Edge | 待写 |
| Reverse | 已过期、状态非 active、未知摘要 → 找不到 | Reverse | 待写 |
| I3 约束 | 重复公开引用写入被唯一键拒绝；非法 identity_source 被 CHECK 拒绝 | Edge | 待写 |
