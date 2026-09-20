# 统一身份主体实施入口

## 当前已实现

- 领域入口：`cloudfunctions-v2/src/identity/domain/resolve-user-principal.ts`。
- 应用入口：`cloudfunctions-v2/src/identity/application/resolve-user-principal.ts`。
- 平台绑定应用事务：`cloudfunctions-v2/src/identity/application/manage-platform-identity-binding.ts`。
- MySQL Repository：`cloudfunctions-v2/src/identity/repository/mysql-user-principal-repository.ts`。
- 平台绑定 Repository：`cloudfunctions-v2/src/identity/repository/mysql-platform-identity-binding-repository.ts`。
- 平台凭证验真端口与 HMAC 轮换边界：`cloudfunctions-v2/src/identity/provider/platform-credential-evidence.ts`。
- TDD：`cloudfunctions-v2/test/identity/resolve-user-principal.spec.ts`、`resolve-user-principal-application.spec.ts`、`mysql-user-principal-repository.spec.ts`。
- 真实 MySQL：`cloudfunctions-v2/test/e2e/identity-principal.mysql.spec.ts`。
- 绑定应用真实 MySQL：`cloudfunctions-v2/test/e2e/identity-binding-application.mysql.spec.ts`。
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

平台绑定 Repository 已固定执行“活跃用户 → 平台主体唯一行 → 当前用户同平台/应用 active 槽位”的锁顺序：同一用户同一 active 主体安全重放，已撤销的原主体只能为原用户恢复，跨用户主体或同槽位其他主体一律返回绑定冲突。解绑会先锁定该用户全部 active 入口；最后一个入口拒绝删除，其余解绑在同一事务内撤销目标绑定、把逻辑过期会话推进为 expired、撤销其余 active 会话并递增 `users.session_version`。真实 MySQL 已证明新建第三个平台入口、解绑后版本递增和会话撤销，以及最后入口拒绝时零状态变更。

绑定/恢复/解绑的应用层已接入共享 HTTP 幂等记录：processing 占位、平台绑定状态转换、会话撤销、会话版本递增和 completed 脱敏响应共用同一事务；同键同参只重放首次结果，同键异参不执行身份写入。跨用户绑定冲突与最后入口保护使用泛化公开 409，不回显内部用户、摘要或密文。COMMIT 结果未知时只用新连接按完整幂等作用域只读对账，未证明 completed 就返回 503，绝不自动重跑绑定命令。隔离 MySQL 8.4 已证明绑定/解绑及其幂等结果的原子读回。

平台凭证验真端口已固定 Provider 与 identity 的最小边界：Provider 只在当前调用栈接触短时凭证和规范主体；identity 复核平台与 `app_scope` 未被替换后，按“当前密钥优先、退役中密钥随后”的只读密钥快照生成 HMAC-SHA-256 候选。输出只包含平台、应用范围、摘要和密钥版本，不包含原始凭证、平台主体或密钥材料。Principal 应用用例会查询全部候选：零命中按无效会话拒绝，恰好一条命中才进入领域裁决，多条命中按内部身份数据损坏失败关闭。该切片不设置 Provider 超时、重试、端点或凭证默认值；`cloudbase_auth` 配置仍为 `pending`，真实 Provider 接入尚未验收。

## 下一步实施顺序

1. 分别冻结微信、抖音、小红书和手机号的公开凭证 DTO 与 Adapter 输出映射；统一 Provider 端口和 HMAC 当前/退役密钥轮换边界已经落地。
2. 在 `cloudbase_auth` Provider 配置真实冻结后接入受控平台凭证 Provider；业务域不得自行解析平台凭证或主体字段。
3. 实现新会话签发事务；解绑时的版本递增、会话撤销、共享 HTTP 幂等与提交未知对账已经在应用层和隔离 MySQL 证明。
4. 接入 identity 独立 HTTP 云函数与共享请求链，并补真实 Provider、CloudBase MySQL 与 HTTP 验证。

## 禁止事项

- 不得把 OpenID、手机号、匿名 UID、设备 ID、IP 或 Cookie 当作 `user_id`。
- 不得在公开错误、日志或响应中输出平台主体、Bearer、摘要、数据库内部主键。
- 不得在本领域函数内读取数据库、调用 Provider 或查询会员权益。
- 不得把本地 MySQL 摘要读回宣称为真实平台凭证或 CloudBase 闭环证据。
