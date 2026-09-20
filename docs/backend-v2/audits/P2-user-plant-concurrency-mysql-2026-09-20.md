# P2 用户植物创建 MySQL 双连接并发证据

## 目标与环境

- 关联 ClickUp：`z8v0kmr9mj` 用户植物核心实现、`z8v0kmr9mk` 共享基础设施实现。
- Expected：所有增加同一用户 active 用户植物数量的路径，必须先锁同一条 `users` 行，再读取数量并决定是否写入。
- 环境：Docker Desktop、官方 `mysql:8.4` 镜像，实际服务端 MySQL `8.4.11`；一次性容器、`tmpfs /var/lib/mysql`、不映射宿主端口、不连接 CloudBase。
- 测试入口：`cloudfunctions-v2/test/e2e/user-plant-create.mysql.spec.ts`；执行命令：`npm --prefix cloudfunctions-v2 run test:mysql`。
- 测试层次：L3 / `unit_real_data`；使用真实 v2 DDL 与两个独立 mysql 客户端连接，不经过 HTTP。

## 首次失败与修正

初次探针只等待 `mysqladmin ping`，误把官方镜像初始化阶段的临时服务端当作最终服务端。临时服务端按官方入口流程收到 `SHUTDOWN` 后，两个客户端出现 `2013 Lost connection`。日志明确显示临时服务端端口为 `0`，随后正式服务端才以端口 `3306` 启动。

测试就绪门改为真实查询 `SELECT @@port`，且只有返回 `3306` 才继续应用 DDL。该修正只解决测试环境判定，不改变业务规则或数据库结构。

## 已验证

1. 空库按依赖顺序应用 `001_identity.sql`、`002_plant_knowledge.sql`、`003_user_plant.sql`、`008_foundation.sql`。
2. 连接 A 对统一用户行执行 `SELECT ... FOR UPDATE`，持锁后插入第一株 `active + unidentified` 用户植物并提交。
3. 连接 B 在 A 持锁期间请求同一用户行锁；A 提交后，B 才继续并读到 active 数量为 `1`。
4. B 在 active 上限为一的条件下执行受控条件插入，`ROW_COUNT()` 为 `0`。
5. 最终 active 用户植物数量严格为 `1`，不存在两个事务都基于旧数量写入的幻读竞争。
6. 另一条全新连接按完整幂等唯一作用域读取 `http_idempotency_records`，可读回相同请求摘要、`completed` 状态、HTTP 200 和脱敏公开用户植物引用；查询不使用旧事务。
7. 正式 MySQL 测试结果为 `1` 个测试文件、`2` 项测试全部通过。

## 明确未覆盖

- CloudBase MySQL 驱动和连接池行为。
- 在真实网络断线中区分“确定未提交”和“提交结果未知”。
- HTTP 身份解析、DTO、网关和客户端携带相同幂等键重试。
- 产生奖励事件的业务写、域 outbox 与幂等完成结果同事务。
