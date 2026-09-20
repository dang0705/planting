# P2 用户植物奖励 outbox Repository 证据

- Expected：`reward-events/v1`、`user-plant/v1`、`006_reliable_events.sql`。
- 测试层次：L3 / `unit_fake`；真实执行 Repository 的参数化 SQL、载荷摘要核验和事务传递，替换 MySQL 驱动。
- RED：实现文件不存在时，目标测试因无法解析 `mysql-user-plant-outbox-repository.js` 失败。
- GREEN：新增 user-plant 域专属 Repository；事件类型固定为 `user_plant.profile_completed.v1`，新记录固定为 `pending`，租约、重试、投递终态均不能由调用方注入。
- 完整性：Repository 对递归稳定键序的 `payload_json` 重新计算 SHA-256；载荷摘要不一致时在写库前失败关闭。
- 事务边界：SQL 执行端口必须接收调用方事务上下文；Repository 不创建连接、不提交事务、不写 subscription inbox。
- 验证：目标测试 3/3；完整 `verify` 为 35 个测试文件、191 项测试通过；新增源码与测试 oxlint 0 错误、0 警告。

## 尚未覆盖

- 完整档案业务事实、outbox 与 HTTP 幂等完成记录的同一真实事务。
- MySQL 的唯一键、CHECK、回滚和重复事件冲突。
- 自动 dispatcher、subscription inbox 和奖励入账；这些能力仍受后续阶段与待冻结运行配置约束。
