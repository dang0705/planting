# P2 AI 额度批次分摊领域证据

- Expected：`care-points-ai-quota/v1` 的最早到期优先、能力范围、`[grantedAt, expiresAt)` 有效区间和余额不足不产生副作用。
- 测试层次：L1 / `unit_fake`；直接执行纯领域规则，不替换依赖。
- RED：实现文件不存在时，目标测试因无法解析 `plan-ai-quota-allocation.js` 失败。
- GREEN：4 项测试通过；分摊按失效时间、发放时间、批次引用稳定排序，可跨多个批次精确凑足预占额。
- 资格过滤：尚未生效、达到失效时刻、能力范围不匹配或零余额的批次不参与。
- 失败关闭：重复批次引用、非法金额、非法时间或不稳定能力范围被拒绝。
- 原子边界：总余额不足时返回总可用额和缺口，`allocations` 固定为空，不允许应用层写半分摊。
- 变异证据：临时把开区间失效判断从 `< expiresAt` 改为 `<= expiresAt` 后，边界测试按 Expected 失败；完整恢复后 4/4 通过。

## 尚未覆盖

- MySQL `SELECT ... FOR UPDATE` 的查询条件和稳定锁顺序。
- reservation、grant、allocation、account 与不可变 ledger 的同一事务更新。
- 并发预占、回滚、提交结果未知、CloudBase MySQL 和 HTTP。
