# 订阅域 AI 额度实施入口

## 1. 任务与当前切片

- ClickUp：[`[P2] 会员、试用、积分、奖励与 AI 额度`](https://app.clickup.com/t/90182453517/z8v0kmr9mh)
- 当前切片：额度预占的数据库守恒、Repository、应用编排与本地真实 MySQL 并发已经形成闭环；下一步实现结算、释放和提交结果未知对账，仍不得越过尚未冻结的真实 Provider 与 HTTP 边界。
- Expected：`care-points-ai-quota/v1`、`docs/backend-v2/data/v2-data-dictionary.md`、`005_subscription.sql`。

## 2. 已验证边界

- 每条分摊固定满足：`reserved_amount = remaining_amount + settled_amount + released_amount`。
- 初始预占：`remaining_amount = reserved_amount`，结算与释放均为零。
- 状态转移只能从 `remaining_amount` 扣减，并等额增加结算或释放；不得改变初始预占总额。
- 完成后 `remaining_amount = 0`，预占总额被完整拆分为结算与释放。
- 隔离 MySQL 8.4 已证明合法初态可插入、破坏守恒的更新被 CHECK 拒绝、合法终态可读回。
- 纯领域分摊规则已实现：只消费当前已生效、尚未失效、能力范围匹配且有余额的批次；按失效时间、发放时间和批次引用稳定排序。
- 可用额度不足时返回完整缺口且不携带部分分摊，应用层不得据此写入 reservation、allocation 或 ledger。
- Repository 固定先锁用户唯一额度账户，再读幂等预占、按稳定顺序锁定批次；写入 reservation、allocation、reserve ledger、grant 和账户投影均处于同一事务。
- 同键同摘要直接重放原预占；同键异摘要稳定冲突，不重新读取或扣减批次。
- 本地真实 MySQL 8.4 双连接并发已经证明：两个不同幂等键同时争用同一账户时，只能有一笔完整预占，另一笔返回完整额度缺口；随后同键重放不会新增 reservation、allocation 或 ledger。
- 真实读回已经证明账户和两个批次按 `5 + 3` 完整分摊，批次状态进入 `partially_used`，账户、批次、allocation 和不可变 reserve ledger 数量及金额一致。

## 3. 尚未覆盖与继续条件

- 尚未实现结算、释放、过期与供应商结果未知时的 `pending_reconciliation` 状态转移；对应 settle/release ledger 和账户投影尚未形成完整闭环。
- 尚未验证提交结果未知后的新连接只读对账、公开 HTTP 合同、真实 Provider 或 CloudBase MySQL；本地 MySQL 证据不得冒充云环境验收。
- AI 动作成本策略与预占过期时长在配置目录冻结前，不得私设默认值或开放真实模型消费。
