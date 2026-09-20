# P2 共享 HTTP 幂等 Repository 验收记录

## 1. 范围和 Expected

- ClickUp：`z8v0kmr9mk`，`[P2] 共享基础设施实现`。
- Expected：`http-api/v1` 第 4 节、`008_foundation.sql` 和已冻结的 `http.idempotency.retention_hours=168`。
- 本切片只实现共享幂等表的参数化 Repository：唯一占位、锁定读回、同参重放、异参冲突、完成结果写入、公开响应哈希核验和一致性失败关闭。
- 明确不包含：业务领域写入、领域 outbox、HTTP 等待策略、提交结果未知后的新连接对账、CloudBase MySQL 或网关部署。

## 2. RED / GREEN

- RED：`mysql-http-idempotency-repository.js` 不存在时，目标测试在模块加载阶段失败。
- GREEN：`cloudfunctions-v2/test/foundation/http-idempotency-repository.spec.ts` 的 7 条测试全部通过。
- TypeScript 双配置类型检查通过；新增源码和测试 oxlint 为 0 错误、0 告警；oxfmt 通过。

## 3. 测试矩阵

| 对象 | 层级 | 形态 / 风险 | 独立 Expected | 结果 |
|---|---|---|---|---|
| 唯一占位 | L3 `unit_fake` | Happy / I1 | HTTP 幂等合同、DDL 唯一作用域 | PASS |
| 已完成同参请求 | L3 `unit_fake` | Happy / I1 | 首次公开响应必须原样重放 | PASS |
| 同键异参 | L3 `unit_fake` | Reverse / I3 | `409 IDEMPOTENCY_CONFLICT` | PASS |
| 已有处理中请求 | L3 `unit_fake` | Edge / I3 | 不重复执行领域命令 | PASS |
| 完成首次结果 | L3 `unit_fake` | Happy / I1 | 只更新同摘要 processing 记录 | PASS |
| 响应哈希损坏 | L3 `unit_fake` | Reverse / I3 | 失败关闭，不返回被篡改响应 | PASS |
| 唯一冲突后无记录 | L3 `unit_fake` | Reverse / I5 | 一致性损坏不能降级为首次请求 | PASS |

- I2：N/A；该 Repository 读取唯一记录，不提供列表响应。
- I4：N/A；身份认证在固定请求链前置阶段完成，不属于该 Repository 职责。
- I5 的业务半写、outbox 与提交结果未知仍未完成；本切片只覆盖 Repository 自身一致性失败关闭。

## 4. 真实性与反写

| Break | Expected | Real path | Mutation |
|---|---|---|---|
| 重复请求再次执行领域命令 | 唯一冲突后锁定读回并裁决 | `尝试占位 → INSERT IGNORE → 读取 → 判定HTTP幂等请求` | 把影响行数 0 当 reserved 会使同参/异参用例失败 |
| 数据库响应被篡改仍被重放 | 公开 JSON 规范化后 SHA-256 必须一致 | `读取 → 映射数据库行 → 计算公开响应摘要` | 临时把 `hash !== response_hash` 反转为 `===`，两条用例 RED；恢复后 7/7 GREEN |
| 完成态覆盖错误请求 | 只允许相同 request hash 且 processing | `完成首次结果 → 参数化 UPDATE` | 删除 `request_hash` 或 `state` 条件会使 SQL 合同断言失败 |

执行反写已经完整写回：`mysql-http-idempotency-repository.ts` 不保留反转条件，恢复后目标套件再次 7/7 通过。

## 5. 隔离 MySQL 8.4.11 证据

一次性容器 `qhz-v2-idempotency-20260920` 在无宿主端口映射的隔离空库执行 `008_foundation.sql`，完成后已经停止并由 `--rm` 删除。

- 首次 `INSERT IGNORE`：`ROW_COUNT() = 1`。
- 相同唯一作用域再次占位：`ROW_COUNT() = 0`。
- 同摘要 processing 更新为 completed：`ROW_COUNT() = 1`。
- 读回：`completed / 201 / upl_test / 64 字符响应摘要`。
- 事务内插入后 `ROLLBACK`：目标作用域记录数为 `0`。
- processing 记录携带响应：MySQL 拒绝并返回 `ERROR 3819`，命中 `ck_http_idempotency_completion`。

该证据证明 DDL 行为和 Repository SQL 前提在本地 MySQL 8.4.11 成立，不证明 CloudBase MySQL、真实并发连接、业务/outbox 原子事务或 HTTP 端到端。

## 6. 产品改动声明

本轮产品改动：仅修已冻结幂等合同的 Repository 缺口；会红的用例为“同键同参已完成时原样重放首次公开结果且不再占位”和“完成态读回的响应摘要不匹配时失败关闭”。

## 7. 下一步

在不引入共享可写 outbox 的前提下，由首个业务域把领域写入和本域 outbox 端口传入同一事务编排；随后实现提交结果未知分类与新连接只读对账。任何自动派发、租约、重试、退避或 dead-letter 参数仍受 P3 待冻结配置约束。
