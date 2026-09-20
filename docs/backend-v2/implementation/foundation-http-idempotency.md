# 共享 HTTP 幂等协议与持久化

## 任务边界

- ClickUp：[`[P2] 共享基础设施实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mk)
- Expected：`contracts/http-api.md` 第 4 节、`http.idempotency.retention_hours=168` 已冻结策略与 P2 Foundation 验收。
- 本切片只实现幂等决策协议、独立 DDL 和 MySQL 8.4 约束证据；不实现业务域 Repository、HTTP 轮询、云端清理任务或 CloudBase 部署。

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
- 合同测试：`cloudfunctions-v2/test/foundation/http-idempotency.spec.ts`
- DDL：`docs/backend-v2/schema/008_foundation.sql`
- RED：`docs/backend-v2/audits/evidence/P2-foundation-http-idempotency-red.md`
- GREEN 与 MySQL 读回：`docs/backend-v2/audits/P2-foundation-http-idempotency-2026-09-20.md`

下一切片必须把“占位 → 业务写入 → 域 outbox → 完成公开结果”放入同一真实事务，并验证回滚后无已确认幂等结果、无孤儿 outbox、无业务半写。
