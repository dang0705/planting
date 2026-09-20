# 统一身份主体实施入口

## 当前已实现

- 领域入口：`cloudfunctions-v2/src/identity/domain/resolve-user-principal.ts`。
- TDD：`cloudfunctions-v2/test/identity/resolve-user-principal.spec.ts`。
- 审计证据：`docs/backend-v2/audits/P2-identity-resolve-user-principal-2026-09-20.md`。

当前切片只负责把已经验证、已经由 Repository 关联读回的统一用户、平台绑定和登录会话最小快照，解析为 `UserPrincipalDto`。它固定执行：

1. 用户、绑定、会话状态校验；
2. 三份快照的统一用户归属校验；
3. 绑定平台与会话认证入口一致性校验；
4. 用户当前会话版本与签发版本校验；
5. `[issuedAtMs, expiresAtMs)` 时间窗口校验；
6. 只返回脱敏公开主体字段。

## 下一步实施顺序

1. 先建立 identity Repository：只按平台主体 HMAC 摘要和 Bearer SHA-256 摘要查询，不保存原始标识或令牌。
2. 再接入受控平台凭证 Provider；业务域不得自行解析微信、抖音、小红书或手机号凭证。
3. 把 Repository 读回接入本纯领域函数。
4. 最后接入共享 HTTP 请求链，并补真实 MySQL 与 HTTP 验证。

## 禁止事项

- 不得把 OpenID、手机号、匿名 UID、设备 ID、IP 或 Cookie 当作 `user_id`。
- 不得在公开错误、日志或响应中输出平台主体、Bearer、摘要、数据库内部主键。
- 不得在本领域函数内读取数据库、调用 Provider 或查询会员权益。
- 不得把本地纯领域测试宣称为平台凭证、MySQL 或 CloudBase 闭环证据。
