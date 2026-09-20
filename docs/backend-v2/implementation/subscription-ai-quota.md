# 订阅域 AI 额度实施入口

## 1. 任务与当前切片

- ClickUp：[`[P2] 会员、试用、积分、奖励与 AI 额度`](https://app.clickup.com/t/90182453517/z8v0kmr9mh)
- 当前切片：额度预占、结算、释放与超额待对账的领域规则、Repository、应用编排和本地真实 MySQL 已形成闭环；下一步处理提交结果未知的只读对账，仍不得越过尚未冻结的真实 Provider 与 HTTP 边界。
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
- 结算沿用原预占分摊顺序：实际消费 6 时，真实 MySQL 将前一批次完整消费 5、后一批次消费 1，并把剩余 2 退回可用额度；账户、批次、分摊及 settle/release ledger 同一事务守恒。
- 实际消费为零时进入 `released`；等于预占时全部结算；超过预占时不得追加扣减用户额度，而是仅把预占标记为 `pending_reconciliation`（待对账）。
- 待对账真实读回已证明：账户与批次仍保留原预占，分摊不结算也不释放，不生成 settle/release ledger；只保存脱敏用量证据、实际成本和平台暂时承担成本。
- 已进入 `settled`、`released` 或 `pending_reconciliation` 的相同证据可安全重放；证据或金额冲突时事务失败，禁止覆盖既有终态。
- 变异验证已故意把“超过预占”破坏为“大于等于预占”，测试准确拦截“等额消费被误判为待对账”；恢复规则后测试重新通过。
- 预占与结算应用用例已接入数据库提交结果未知分支：旧事务不回滚、不自动重跑写入，只调用新连接只读端口；只有相同预占摘要或完全一致的结算证据终态可以重放，其余情况以稳定内部错误失败关闭。
- MySQL 只读 Repository 已按公开 `user_id` 与业务唯一作用域查询，不接收事务对象、不使用行锁且不暴露写方法；不存在返回空，重复、错归属或畸形行失败关闭。
- 隔离 MySQL 8.4 已在关闭原写连接后，以仅授予 `SELECT` 的数据库账号建立不同连接，成功读回预占摘要和结算证据；尝试写入被 MySQL 权限拒绝，其他用户读取同一预占返回空。

## 3. 尚未覆盖与继续条件

- 尚未实现预占过期释放；当前已证明关闭旧连接后的本地 MySQL 只读读回，但尚未模拟 COMMIT 响应在真实网络中途断开，也不得冒充 CloudBase 连接池验收。
- 尚未验证公开 HTTP 合同、真实 Provider 或 CloudBase MySQL；本地 MySQL 证据不得冒充云环境验收。
- AI 动作成本策略与预占过期时长在配置目录冻结前，不得私设默认值或开放真实模型消费。
