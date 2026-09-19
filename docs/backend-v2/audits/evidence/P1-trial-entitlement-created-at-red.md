# P1 试用从统一用户创建时间起算 RED 证据

- Expected 来源：Canonical Master Plan、`state-machines/v1`、`care-points-ai-quota/v1`
- 测试层级：`unit_real_data`（读取真实 001/005 DDL；未访问数据库或 HTTP）
- RED 时间：2026-09-20（Asia/Shanghai）

先新增正式测试 `cloudfunctions-v2/test/p1-trial-entitlement.spec.ts`，要求：

1. 试用起点由复合外键绑定 `users.created_at_ms`；
2. 到期时间精确为起点后 86,400,000 毫秒；
3. 同一统一用户终身只有一条试用记录；
4. 禁止继续使用可空、可延后的 `activated_at_ms`。

实现前定向 Vitest 1/1 失败，首个失败为 `users` 缺少 `(id, created_at_ms)` 唯一候选键。随后才修改 001/005 DDL 与数据字典。

本证据不覆盖 P3 权益运行时、首次登录并发或 P5 真实 CloudBase MySQL/HTTP 验收。
