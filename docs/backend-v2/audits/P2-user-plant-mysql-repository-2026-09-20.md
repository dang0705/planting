# P2 用户植物 MySQL Repository TDD 审计

- 关联任务：`z8v0kmr9mj`（用户植物核心实现）。
- Expected 来源：`user-plant/v1`、`001_identity.sql`、`003_user_plant.sql`。
- 测试层次：Repository 测试为 L3 `unit_fake`；另执行隔离 MySQL 8.4.11 真实 DDL 与读回。
- 实现入口：`cloudfunctions-v2/src/user-plant/repository/mysql-user-plant-repository.ts`。
- 测试入口：`cloudfunctions-v2/test/user-plant/mysql-user-plant-repository.spec.ts`。

## 已验证

1. 创建前先按 `users.public_user_id` 锁定唯一统一用户行，再读取该用户的 active 用户植物数量。
2. 同一用户所有会增加 active 数量的后续路径必须复用该用户行锁顺序，避免两个事务同时读到旧数量。
3. 用户非 active 时立即返回 `PRINCIPAL_INVALID`，不继续读取数量或插入植物。
4. 插入只写统一用户内部归属、服务端公开引用和 `active + unidentified + version 1` 固定初态。
5. 创建投影按 `user_id + user_plant_id` 语义读回，只返回六个公开字段；损坏版本、状态或时间失败关闭。
6. SQL 全部参数化，公开响应不包含用户内部主键、用户植物内部主键或平台主体标识。

## RED、GREEN 与负向验证

- RED：Repository 测试先落盘；模块不存在导致测试套件失败。
- GREEN：实现最小 Repository 后，目标测试 `6/6` 通过，新增源码和测试 oxlint 为 0 告警、0 错误。
- 负向验证：临时反转 active 用户状态判断，正常与暂停用户两个用例按预期失败；随后完整恢复正确实现。
- 隔离 MySQL：`mysql:8.4.11` 依次执行 `001_identity.sql`、`002_plant_knowledge.sql`、`003_user_plant.sql`；用户行锁读回 `active`，初始 active 数量为 0，插入后读回固定初态且提交后数量为 1。
- 回滚验证：同一事务插入第二株后回滚，目标公开引用数量读回为 0。
- 约束验证：`confirmed + NULL confirmed_identity_internal_id` 被 `ck_user_plant_identity_projection` 以 MySQL `3819` 拒绝。

## 明确未覆盖

- 当前未把共享 HTTP 幂等占位、领域决策、Repository 插入和幂等完成记录编排进同一事务。
- 未执行两个并发连接争抢同一用户数量上限的真实测试；目前只证明锁顺序和单事务 DDL/读回。
- 未处理 COMMIT 网络断开后的“提交结果未知”只读对账。
- 未验证 CloudBase MySQL、真实 HTTP 路由或网关。
