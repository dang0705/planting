# P1 能力快照—策略发布关联 RED 证据

- 关联 ClickUp：`z8v0kmr9gn`（业务策略与统一 Provider 配置架构）与后续 `z8v0kmr970`（统一身份 Principal）。
- Expected 来源：`principal-capability/v1` 要求能力快照的策略版本可回放；`configuration-provider-architecture/v1` 要求业务策略发布具有不可变发布引用与内容 SHA-256。
- 测试层次：`unit_real_data`；读取真实总 DDL 与 manifest，不连接 MySQL、CloudBase 或 HTTP。
- RED 时间：2026-09-20（Asia/Shanghai）。
- 命令：`cd cloudfunctions-v2 && npm test -- --run test/p1-total-ddl.spec.ts`。

## RED 结果

测试失败于 `能力快照不得只保存无从核验的 policy_version`。当时 `capability_snapshots` 只有
`policy_version` 与快照自身 SHA-256，未保存策略发布内部键、发布引用或策略内容 SHA-256，也没有
到 `business_policy_releases` 的外键。且 manifest 将 `007_configuration.sql` 排在
`005_subscription.sql` 之后，不能在空库首次创建快照表时建立该真实关系。

## 最小修复目标与边界

1. 快照使用发布内部键、领域/策略代码、发布引用、发布版本与内容 SHA-256 复合外键锁定同一条不可变策略发布。
2. 配置 DDL 在被引用的订阅 DDL 之前执行；不使用 `ALTER`、启动期 DDL、万能 KV 或第二份策略内容事实源。
3. 本证据不代表 MySQL 或 CloudBase 验收；实现后仍需静态回归及可用的本地空库语法检查。
