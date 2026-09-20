# 订阅域 AI 额度实施入口

## 1. 任务与当前切片

- ClickUp：[`[P2] 会员、试用、积分、奖励与 AI 额度`](https://app.clickup.com/t/90182453517/z8v0kmr9mh)
- 当前切片：先修正并验证 AI 额度预占分摊的数据库守恒合同，禁止在结构自相矛盾时继续实现 Repository。
- Expected：`care-points-ai-quota/v1`、`docs/backend-v2/data/v2-data-dictionary.md`、`005_subscription.sql`。

## 2. 已验证边界

- 每条分摊固定满足：`reserved_amount = remaining_amount + settled_amount + released_amount`。
- 初始预占：`remaining_amount = reserved_amount`，结算与释放均为零。
- 状态转移只能从 `remaining_amount` 扣减，并等额增加结算或释放；不得改变初始预占总额。
- 完成后 `remaining_amount = 0`，预占总额被完整拆分为结算与释放。
- 隔离 MySQL 8.4 已证明合法初态可插入、破坏守恒的更新被 CHECK 拒绝、合法终态可读回。
- 纯领域分摊规则已实现：只消费当前已生效、尚未失效、能力范围匹配且有余额的批次；按失效时间、发放时间和批次引用稳定排序。
- 可用额度不足时返回完整缺口且不携带部分分摊，应用层不得据此写入 reservation、allocation 或 ledger。

## 3. 尚未覆盖与继续条件

- 尚未实现 subscription Repository 对纯领域分摊结果的稳定批次锁定与同事务应用，以及结算、释放、对账状态与不可变额度账本。
- 尚未验证并发、事务回滚、提交结果未知、公开 HTTP 合同或 CloudBase MySQL。
- AI 动作成本策略与预占过期时长在配置目录冻结前，不得私设默认值或开放真实模型消费。
