# 奖励事件可靠投递

只有积分和 AI 奖励事实使用 outbox/inbox；不建设通用消息总线。

```text
本域业务事务
→ 同事务写本域 outbox
→ dispatcher 租约领取
→ 带签名调用 subscription
→ reward_event_inbox 幂等去重
→ 积分账本/账户/等级/AI grant 同事务入账
→ 返回确认
→ outbox 标记 delivered
```

生产域只能写自己的 outbox；`subscription` 只能写 inbox、积分、等级和 AI 额度。失败可重放，重复不可重复奖励。

## P2 Foundation 已实现边界

- 机械协议源码：`cloudfunctions-v2/src/foundation/outbox/reward-outbox.ts`。
- 合同测试：`cloudfunctions-v2/test/foundation/reward-outbox.spec.ts`。
- 真实 DDL：`docs/backend-v2/schema/006_reliable_events.sql`。
- 证据：`docs/backend-v2/audits/P2-foundation-reward-outbox-2026-09-20.md`。

Foundation 已冻结并执行以下不含业务分值的约束：

1. 五种事件类型只能由合同登记的四个生产域产生；当前 Repository 不能写其他域的 outbox。
2. 除知识贡献外，奖励事件必须携带用户植物公开引用。
3. 事件载荷递归拒绝积分、金额、AI 额度、凭证、Prompt、模型原文、SQL、会话/追踪标识、内部主键与私有对象路径字段。
4. 新记录只能以 `pending` 状态进入本域 outbox；事件 ID、载荷和载荷摘要由生产域生成并在重试时保持不变。
5. 四张奖励生产域表可无损保存事件版本、生产域、统一用户、用户植物、发生引用和生产域事实策略版本，并由 MySQL CHECK 约束状态与租约字段组合。该版本不能决定 `subscription` 的积分策略。
6. `user-plant` 域已具备专属 MySQL outbox Repository：复核事件域与类型、规范化载荷并校验 SHA-256，只在调用方事务中写入 `pending`，不接触 subscription inbox。

## 尚未实现边界

自动 dispatcher、领取批量、租约时长、重试次数、退避、自动 dead-letter 和重放窗口仍是 P3 待冻结配置，P2 不启动。当前只完成 user-plant outbox 的受控写入 Repository；业务事实、outbox 和 HTTP 幂等完成结果的同事务写入仍要由首个完整档案命令验证。当前证据不能解释为跨域奖励已经自动入账，也不宣称恰好一次。

## P2 subscription 已实现边界

- `subscription_reward_inbox` 已分离生产域事实策略版本与 `subscription` 奖励策略版本/内容 SHA-256，并保存事件版本、聚合引用、发生引用和事实发生时间，具备首次策略快照的持久化载体。
- `mysql-reward-inbox-repository.ts` 已实现事务内固定锁顺序：先按 `user_id` 锁定活跃统一用户，再按事件 ID/业务唯一键锁定 inbox；既有记录在写入前分类为安全重放、业务事实重复或幂等冲突，不依赖 MySQL `affectedRows` 猜测首次写入。
- 新事件使用不吞约束错误的 `INSERT ... ON DUPLICATE KEY UPDATE` 作为跨主体竞争的最后一道唯一键保护，写后必须读回完整事实、策略快照和状态；同事件载荷摘要或策略被改写时失败关闭。
- `subscription-reward-inbox.mysql.spec.ts` 已在一次性 MySQL 8.4 中回放真实 DDL，证明两个并发同事件投递只产生一条 inbox：一个首次预留、一个安全重放；不同事件命中同一业务唯一键不新增，同事件合法但不同载荷被拒绝。
- `planRewardEventApplication` 已按不可变等级策略计算积分账户终态和本次跨越的未发等级奖励；积分消费历史不降低由累计净获得积分决定的等级，已发等级终身不重复。

## P2 subscription 尚未实现边界

积分不可变账本、积分账户投影、等级 AI grant、贡献 AI 奖励、兑换命令、跨域 HTTP 消费与提交结果未知对账仍未完成。当前 inbox 和纯领域计划不能冒充奖励已经完整入账。
