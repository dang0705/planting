# P2 Foundation HTTP 幂等 RED 证据

- 时间：2026-09-20 17:41:23 Asia/Shanghai
- 测试命令：`npm test -- --run test/foundation/http-idempotency.spec.ts test/p1-total-ddl.spec.ts`
- 独立 Expected：`contracts/http-api.md` 第 4 节、`http.idempotency.retention_hours=168` 已冻结配置、P2 共享基础设施 ticket。
- RED 1：`http-idempotency.ts` 不存在，协议判定测试无法导入。
- RED 2：总 DDL 不包含 `http_idempotency_records`，真实 schema manifest 读回失败。
- 未覆盖：真实 CloudBase MySQL 并发、HTTP 接线、清理任务和业务域写事务。

该 RED 发生在任何幂等产品源码或 Foundation DDL 落盘之前。
