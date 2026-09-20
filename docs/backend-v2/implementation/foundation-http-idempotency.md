# 共享 HTTP 幂等协议与持久化

## 任务边界

- ClickUp：[`[P2] 共享基础设施实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mk)
- Expected：`contracts/http-api.md` 第 4 节、`http.idempotency.retention_hours=168` 已冻结策略与 P2 Foundation 验收。
- 已完成幂等决策协议、独立 DDL、MySQL 8.4 约束证据和共享幂等表 Repository。
- Repository 只负责参数化 SQL、唯一占位、锁定读回、同参重放、异参冲突、完成结果完整性；它不拥有任何领域表或领域 outbox。
- 当前仍不实现 HTTP 轮询、云端清理任务或 CloudBase 部署。首个无 outbox 的用户植物创建命令已经完成“幂等占位 → 业务写 → 幂等完成”的同事务应用编排，并接入提交结果未知后的新连接只读对账；需要 outbox 的奖励事实仍须在所属域独立证明。

## 唯一作用域

`http_idempotency_records` 以以下字段联合唯一：

```text
主体类型
+ 主体作用域不可逆摘要
+ HTTP 方法
+ 规范化路由模板
+ 稳定业务动作 operation_id
+ Idempotency-Key 不可逆摘要
```

不保存原始幂等键、OpenID、平台主体、会话、Authorization、Cookie 或 token。请求内容另存 SHA-256，同键异参稳定返回 `IDEMPOTENCY_CONFLICT / 409`。

## 状态与重放

- 无记录：尝试写入 `processing` 唯一占位。
- 同参 `processing`：不再执行领域命令，交给适配器等待获胜者的确定结果。
- 同参 `completed`：原样重放首次脱敏公开状态码与 JSON 包装。
- 同键异参：立即返回 409，不执行领域写入。

`processing` 禁止携带响应；`completed` 必须同时具备公开状态码、JSON 包装、响应摘要和完成时间。已冻结的 168 小时由当次请求锁定策略计算为 `expires_at_ms`，DDL 不私设运营默认值。

## 实施与证据

- 协议源码：`cloudfunctions-v2/src/foundation/idempotency/http-idempotency.ts`
- Repository：`cloudfunctions-v2/src/foundation/idempotency/mysql-http-idempotency-repository.ts`
- 合同测试：`cloudfunctions-v2/test/foundation/http-idempotency.spec.ts`
- Repository 测试：`cloudfunctions-v2/test/foundation/http-idempotency-repository.spec.ts`
- 提交未知只读对账：`cloudfunctions-v2/src/foundation/idempotency/commit-unknown-reconciliation.ts`
- 提交未知对账测试：`cloudfunctions-v2/test/foundation/commit-unknown-reconciliation.spec.ts`
- DDL：`docs/backend-v2/schema/008_foundation.sql`
- RED：`docs/backend-v2/audits/evidence/P2-foundation-http-idempotency-red.md`
- GREEN 与 MySQL 读回：`docs/backend-v2/audits/P2-foundation-http-idempotency-2026-09-20.md`
- Repository RED/GREEN 与隔离 MySQL 证据：`docs/backend-v2/audits/P2-foundation-http-idempotency-repository-2026-09-20.md`
- 提交未知 RED/GREEN 与应用接入证据：`docs/backend-v2/audits/P2-foundation-commit-unknown-reconciliation-2026-09-20.md`

下一切片必须把“占位 → 业务写入 → 域 outbox → 完成公开结果”放入同一真实事务，并验证回滚后无已确认幂等结果、无孤儿 outbox、无业务半写。还需在隔离 MySQL 以两个真实连接验证同键并发、用户植物数量上限竞争和未知提交读回；本地 fake 不能替代该证据。

事务运行器提供 `数据库提交结果未知错误`：驱动在 COMMIT 已发送但因网络或连接中断无法确认结果时必须抛出该类型。运行器不会在旧连接回滚，也不会重跑工作回调。对账 Repository 不接收旧事务、不提供写方法，也不使用 `FOR UPDATE`；只有新连接读到相同请求摘要的 `completed` 记录才原样重放。缺失、仍处理中、摘要不一致、数据损坏或读取失败全部返回脱敏 `SERVICE_UNAVAILABLE`，不能猜测提交成功或失败。
