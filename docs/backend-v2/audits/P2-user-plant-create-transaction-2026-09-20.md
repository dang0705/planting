# P2 创建用户植物同事务应用用例 TDD 审计

- 关联任务：`z8v0kmr9mj`（用户植物核心实现）、`z8v0kmr9mk`（共享基础设施实现）。
- Expected 来源：`user-plant/v1`、`http-api/v1` 与 P2 Foundation 原子事务要求。
- 测试层次：L3 `unit_fake`。
- 应用入口：`cloudfunctions-v2/src/user-plant/application/create-user-plant.ts`。
- 测试入口：`cloudfunctions-v2/test/user-plant/create-user-plant-application.spec.ts`、`test/foundation/transaction-runner.spec.ts`。

## 已验证

1. 首次请求在同一事务依次执行：幂等占位、统一用户行锁与 active 数量读取、领域规则、聚合写入、脱敏读回、幂等 completed、提交。
2. 同键同参 completed 只重放首次响应；同键异参返回稳定 409；已有获胜者处理中返回临时 503。三种情况均不执行用户植物领域写入。
3. active 数量达到上限等确定业务拒绝会在同一事务写为 completed 后提交，使后续同键同参稳定重放首次 403。
4. Repository 或内部数据故障会回滚幂等占位与业务写，不产生伪完成记录。
5. 数据库驱动可用 `数据库提交结果未知错误` 明确报告 COMMIT 结果未知；事务运行器对此禁止在旧连接回滚，并把错误交给后续新连接只读对账。

## RED、GREEN 与负向验证

- 应用 RED：测试先落盘，因应用模块不存在而失败。
- 事务 RED：提交结果未知测试先落盘，因专用错误类型不存在而失败。
- GREEN：应用用例 6 条、事务运行器 6 条目标测试全部通过。
- 应用负向验证：临时把真实 active 数量替换为 0，上限场景错误返回 200，目标测试按预期失败；随后完整恢复。
- 事务负向验证：临时反转“提交结果未知”判定，确定提交失败和未知提交两个用例均按预期失败；随后完整恢复。

## 明确未覆盖

- 尚未实现提交结果未知后的新连接只读幂等对账器；当前只保证不在旧连接回滚或自动重跑。
- 尚未把该应用服务接入真实 HTTP 路由、CloudBase MySQL 驱动或连接池。
- 尚未以两个真实并发连接验证数量上限与同键竞争。
- 创建用户植物本身没有已冻结的奖励事件，因此本切片不新增 outbox；不得为未来可能用途制造事件。
