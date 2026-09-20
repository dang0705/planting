# P2 统一用户主体解析 TDD 审计

- 关联任务：`z8v0kmr970`（统一身份 Principal）。
- Expected 来源：`docs/backend-v2/contracts/principal-and-capability.md`、`docs/backend-v2/schema/001_identity.sql`。
- 测试层次：`unit_fake`。
- 实现入口：`cloudfunctions-v2/src/identity/domain/resolve-user-principal.ts`。
- 测试入口：`cloudfunctions-v2/test/identity/resolve-user-principal.spec.ts`。

## 已验证

1. 只有统一用户、平台身份绑定和用户会话三者均为有效状态时，才能解析登录用户主体。
2. 用户、绑定和会话必须归属同一 `user_id`，会话认证入口必须与绑定平台一致。
3. 会话签发版本必须等于用户当前会话版本；解绑、撤销或风险处置导致版本递增后，旧会话失败关闭。
4. 当前时间必须处于 `[issuedAtMs, expiresAtMs)`；达到失效时间的同一毫秒即拒绝。
5. 时间、版本、公开引用或关联快照不合法时按内部身份数据损坏失败关闭，不返回平台主体、会话摘要或数据库内部主键。
6. 公开结果只包含 `user_id`、会话版本、认证入口和 ISO 8601 有效期。

## RED、GREEN 与负向验证

- RED：测试先落盘；缺少领域模块时，Vitest 因无法解析 `resolve-user-principal.js` 失败。
- GREEN：实现最小纯领域解析后，目标测试 `11/11` 通过。
- 负向验证：临时把到期判断从 `nowMs < expiresAtMs` 反转为 `nowMs <= expiresAtMs`，边界测试按预期失败；随后完整恢复正确实现，未保留探针改动。
- 全量验证：TypeScript 类型检查、构建、Node 22 制品验证通过；30 个测试文件、165 项测试全部通过。全仓 oxlint 为既有 65 个告警、0 错误，本次新增源码与测试单独检查为 0 告警、0 错误。

## 明确未覆盖

- 未验证微信、抖音、小红书或手机号 Provider 的真实外部凭证。
- 未验证原始 Bearer 的 SHA-256 检索、Repository SQL JOIN 或 CloudBase MySQL。
- 未实现会话签发、绑定/解绑、会话撤销或 HTTP 路由接线。
- 因 ClickUp MCP 当轮仍为 `100/100` 限额，远端任务状态尚未从 backlog 回写；本地证据不得替代远端回读。
