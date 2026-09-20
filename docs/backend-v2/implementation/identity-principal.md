# 统一身份主体实施入口

## 当前已实现

- 领域入口：`cloudfunctions-v2/src/identity/domain/resolve-user-principal.ts`。
- 应用入口：`cloudfunctions-v2/src/identity/application/resolve-user-principal.ts`。
- MySQL Repository：`cloudfunctions-v2/src/identity/repository/mysql-user-principal-repository.ts`。
- TDD：`cloudfunctions-v2/test/identity/resolve-user-principal.spec.ts`、`resolve-user-principal-application.spec.ts`、`mysql-user-principal-repository.spec.ts`。
- 真实 MySQL：`cloudfunctions-v2/test/e2e/identity-principal.mysql.spec.ts`。
- 审计证据：`docs/backend-v2/audits/P2-identity-resolve-user-principal-2026-09-20.md`。

当前切片已经把平台 Provider 验证后的受控摘要证据、原始 Bearer 的内存摘要、MySQL 三表归属读回和纯领域裁决串成一个内部应用用例。它固定执行：

1. 仅在应用调用栈内对原始 Bearer 计算 SHA-256，Repository 永不接收原始 Bearer；
2. 平台主体只接受受控 HMAC-SHA-256 摘要和密钥版本，不接收 OpenID、手机号等原文；
3. Repository 通过 `platform_identities + users + user_sessions` 的同用户、同平台 JOIN 读取最小快照；
4. 用户、绑定、会话状态和三份快照统一用户归属校验；
5. 绑定平台与会话认证入口、用户当前会话版本与签发版本一致性校验；
6. `[issuedAtMs, expiresAtMs)` 时间窗口校验；
7. 只返回脱敏公开主体字段。

真实 MySQL 8.4 已证明摘要命中后可解析 Principal，会话撤销后同一 Bearer 立即拒绝，错误 Bearer 不命中；数据库只保存 SHA-256 摘要，不保存原始 Bearer。

## 下一步实施顺序

1. 冻结微信、抖音、小红书和手机号统一 Provider 端口，以及 HMAC 当前/退役密钥版本轮换合同。
2. 接入受控平台凭证 Provider；业务域不得自行解析平台凭证或主体字段。
3. 实现会话签发、绑定、恢复和解绑事务，解绑时原子递增会话版本并撤销全部 active 会话。
4. 接入 identity 独立 HTTP 云函数与共享请求链，并补真实 Provider、CloudBase MySQL 与 HTTP 验证。

## 禁止事项

- 不得把 OpenID、手机号、匿名 UID、设备 ID、IP 或 Cookie 当作 `user_id`。
- 不得在公开错误、日志或响应中输出平台主体、Bearer、摘要、数据库内部主键。
- 不得在本领域函数内读取数据库、调用 Provider 或查询会员权益。
- 不得把本地 MySQL 摘要读回宣称为真实平台凭证或 CloudBase 闭环证据。
