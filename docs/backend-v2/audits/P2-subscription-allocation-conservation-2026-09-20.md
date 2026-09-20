# P2 AI 额度预占分摊守恒证据

## 目标与 RED

- Expected：`care-points-ai-quota/v1` 与 v2 数据字典。
- 原 DDL 只记录 `reserved_amount`、`settled_amount`、`released_amount`，同时要求三者守恒，导致“刚预占、尚未结算或释放”的第一条合法记录无法插入。
- 先修改静态合同测试，要求显式 `remaining_amount` 和四项守恒公式；旧 DDL 按 Expected 失败。

## GREEN 与真实数据库证明

- DDL 新增 `remaining_amount`，含义是仍被当前动作锁定、尚未结算或释放的额度。
- 守恒公式固定为：`reserved_amount = remaining_amount + settled_amount + released_amount`。
- 测试层次：L3 / `unit_real_data`；使用官方 `mysql:8.4`、真实 v2 DDL和一次性空库，不经过 HTTP。
- 合法初态 `10 = 10 + 0 + 0` 成功写入。
- 破坏守恒的状态 `10 != 5 + 3 + 1` 被 MySQL CHECK 约束拒绝，原记录保持不变。
- 合法终态 `10 = 0 + 7 + 3` 成功写入并读回。
- 真实 MySQL 目标测试 1 个文件、3 项测试全部通过；静态合同、DDL 清单、类型检查均通过。

## 尚未覆盖

- subscription Repository 的跨批次锁顺序、并发预占、批次账户和不可变额度账本原子更新。
- 预占过期、未知 Provider 结果对账、提交结果未知和失败恢复。
- CloudBase MySQL、真实模型调用、HTTP 身份与公开响应。
