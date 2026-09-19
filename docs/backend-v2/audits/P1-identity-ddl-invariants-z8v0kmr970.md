# P1 identity DDL 不变量审计

- 审计编号：`P1-identity-ddl-invariants-2026-09-20`
- 关联 ClickUp：`z8v0kmr970`（统一身份 Principal）；上游公共 HTTP 合同：`z8v0kmr9ge`。
- 结论：`DDL_INVARIANTS_PASS / P2_RUNTIME_OPEN / LOCAL_STATIC_ONLY`。
- 变更边界：仅调整 `001_identity.sql`、对应正式 TypeScript 测试、身份数据字典、schema manifest 与本审计；未修改公共合同、配置目录、tracker、ClickUp、前端或 P2 运行时代码。

## Expected 来源与 TDD 证据

Expected 来自 `principal-capability/v1`、`http-api/v1`、`state-machines/v1` 和
`v2-data-dictionary.md`。本次只把数据库可以独立判断的非法值写成 DDL CHECK；跨表状态查询、状态转换和验签原子性不伪装成 DDL 能力。

| 阶段 | 证据 |
|---|---|
| RED | 先新增 `cloudfunctions-v2/test/p1-identity-foundation.spec.ts` 的具体约束 Expected；02:04:54 定向运行 `6 tests / 1 failed`，首个缺口为 `ck_users_public_ref`。 |
| GREEN | 补齐 001 DDL 后，02:05:15 定向运行 `6 tests / 6 passed`。 |
| MySQL 兼容性 RED | 初版使用 `BINARY column REGEXP` 固定大小写；本机 MySQL 8.4.11 建表返回 ERROR 3995（二进制字符串与 utf8mb4 正则不兼容），该方案不作为交付实现。 |
| MySQL 兼容性 GREEN | 改为 `REGEXP_LIKE(column, pattern, 'c')`，`'c'` 明确大小写敏感；本机 MySQL 8.4.11 按 001 完整建表成功，4 张 identity 表读回存在。 |
| 负向读回 | 同一隔离空库中，非法 `public_user_id`、大写主体摘要、session 撤销时间等于失效时间、非法 nonce 摘要均被 MySQL CHECK 拒绝；合法用户行保留 1 条。 |
| 测试层级 | `unit_real_data + unit_fake`：读取真实仓库 DDL，严格断言 DDL 合同和 AJV；未连接 CloudBase 或真实 MySQL。 |

## 已由 001 DDL 固定的边界

- `users.public_user_id` 必须为 `usr_` 加至少 8 位 `[A-Za-z0-9_-]`；`updated_at_ms >= created_at_ms`；`session_version > 0`。
- `platform_identities.platform_subject_hash`、`user_sessions.session_ref_hash`、`service_replay_nonces.nonce_hash` 和 `body_sha256` 必须是 64 位小写十六进制摘要。
- 平台主体检索算法固定为 `HMAC-SHA-256`；密钥版本只允许安全引用字符，不保存密钥材料。
- 平台绑定的绑定/更新时间和撤销时间具备可表达的顺序约束；`active` 不得带撤销时间，`revoked` 必须带撤销时间，`conflicted` 不得伪装为 revoked。
- session 版本必须大于 0；`expires_at_ms > issued_at_ms`；更新时间不早于创建时间；撤销时间位于签发与失效开区间内。
- service nonce 的失效时间晚于验签时间，验签和更新时间不早于创建时间；`(service_name, nonce_hash)` 仍是唯一消费键，不包含 `key_id`。

## 负向 Expected

以下值必须被数据库拒绝：错误的 `usr_` 前缀或低熵/非法字符、大小写混杂的摘要、非 `HMAC-SHA-256` 算法、空或非法 key version、时间倒流、conflicted 带 revoked 时间、session version 为 0、撤销时间早于签发或不早于失效、nonce/body 摘要不是 64 位小写十六进制、nonce 在验签前或创建前失效。

## 明确留给 P2 的规则

- 不能用静态 CHECK 判断 `users.status` 与平台绑定/会话当前状态的跨表一致性。
- 不能用 DDL 实现状态机发起者、幂等键、审计事件、最后登录入口保护、`users.session_version` 原子递增或 session version 与 users 当前值相等。
- 不能用 DDL 实现平台凭证验证、原始 bearer 摘要查找、常量时间比较、时钟偏差窗口、nonce 验签后原子占用和过期清理。
- 这些边界必须在 P2 identity 事务/Repository/HTTP 的 `unit_real_data` 与 `e2e_real_api` 测试中保留正向和负向 Expected。

## 完整性与回退

- `001_identity.sql` 当前 SHA-256：`e1adf7fc04a33cfd1bb0945c9298e4c6a832edc28096d874973eb420890466d6`。
- schema manifest 已同步该 SHA；其他 schema 文件未因本次身份 DDL 工作改写。
- 本次只执行了本机 MySQL 8.4.11 隔离空库建表和合成负向读回，未执行 CloudBase 或生产 DDL；如需已有数据库迁移，必须另行建立顺序化迁移、失败回退和真实读回证据。
