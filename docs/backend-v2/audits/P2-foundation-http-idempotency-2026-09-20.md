# P2 Foundation HTTP 幂等协议与 DDL 验收

- ClickUp：`z8v0kmr9mk`
- 结论：`PROTOCOL_AND_LOCAL_MYSQL_DDL_PASS`
- 证据等级：`unit_fake` + `unit_real_data` + 本地真实 MySQL 8.4.11；不是 `e2e_real_api`。

## TDD 证据

RED 保存在 `audits/evidence/P2-foundation-http-idempotency-red.md`：产品源码不存在且总 DDL 缺少幂等表时，两个真实测试入口均失败。实现后：

- `http-idempotency.spec.ts` 5 条测试通过；
- `p1-total-ddl.spec.ts` 回读真实 manifest/DDL 通过；
- 新增源码与新测试 oxlint 为 0 告警、0 错误；
- TypeScript 源码和测试类型检查通过。

## 本地真实 MySQL 读回

使用 Docker Desktop 29.8.0 与一次性官方 `mysql:8.4` 容器，服务端版本 8.4.11，tmpfs 数据目录、不映射宿主端口、未连接 CloudBase。

- 当前 manifest 的 8 份 DDL 在两个独立空库均建立 87 张表。
- 两库规范化结构导出 SHA-256 均为 `0f5815a61bed2482d053476778fbd7a8b295e8893f134a343abc4a8bf4146dbb`。
- 幂等表共 18 列；总 DDL 读回外键/CHECK/UNIQUE 为 `104 / 93 / 143`。
- 合法 `processing → completed` 转换成功，公开结果读回为 `201 / upl_test_01`。
- `expires_at_ms-created_at_ms=604800000`，与已冻结 168 小时一致。
- 同作用域重复占位被 UNIQUE 拒绝。
- `processing` 携带响应、`completed` 缺失 JSON 响应均被 CHECK 拒绝。

## 测试真实性

- Break：反转“请求摘要不同才冲突”条件会把同参误判为冲突、把异参误重放。
- Expected：`http-api.md` 第 4 节和共享基础设施 ticket。
- Real path：真实执行 `判定HTTP幂等请求`；DDL 用仓库原始字节和 MySQL 8.4.11 执行，未用内存仓库代替。
- Mutation：临时把 `!==` 反转为 `===`，3 条重放/冲突/处理中测试 RED；随后完整还原源文件，相同套件再次 GREEN。

## 未覆盖

尚未实现 Repository 的原子占位与完成读回、业务写入/outbox/幂等结果同事务、并发等待策略、清理任务、真实 CloudBase MySQL 和 HTTP 端到端。这些不得由本地建表通过外推为已完成。

本轮产品改动：仅实现已有独立 Expected 和 RED 证据要求的共享 HTTP 幂等协议与 Foundation DDL。
