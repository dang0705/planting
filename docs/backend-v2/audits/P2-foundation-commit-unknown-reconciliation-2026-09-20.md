# P2 数据库提交结果未知只读对账证据

## 目标与边界

- ClickUp：`z8v0kmr9mk` 共享基础设施实现、`z8v0kmr9mj` 用户植物核心实现。
- Expected：数据库已经收到 `COMMIT`、但调用方无法确认结果时，不得把网络异常解释成“未提交”，不得在旧连接回滚，也不得自动重跑领域命令。
- 本切片覆盖 TypeScript 对账协议、无事务只读 Repository 和用户植物创建应用接入；不冒充真实 CloudBase MySQL 网络故障、连接池销毁或 HTTP 端到端验证。

## RED

1. `commit-unknown-reconciliation.spec.ts` 先落盘，对账模块尚不存在，目标测试因模块缺失失败。
2. Repository 测试先要求无事务新连接查询且 SQL 不含 `FOR UPDATE`，实现尚不存在时目标测试失败。
3. 用户植物应用测试让驱动在提交阶段抛出 `数据库提交结果未知错误`，实现接线前两条测试均直接拒绝，证明旧路径没有误吞失败。

## GREEN

- `commit-unknown-reconciliation.ts` 只暴露只读端口和封闭联合结果；相同请求摘要且状态为 `completed` 才返回 `replay`。
- `missing`、`processing`、`request_hash_mismatch` 和 `read_failed` 都只能返回 `unresolved`，应用统一映射为脱敏 503。
- `创建MySQLHTTP幂等提交未知只读Repository` 不接收事务上下文、不提供写方法，参数化 SQL 不含 `FOR UPDATE`。
- 用户植物创建应用仅捕获显式 `数据库提交结果未知错误`；其他错误保持原有回滚/抛出语义。对账成功原样重放，对账未决返回 503，领域写入只发生一次。

## 反向突变

临时把请求摘要比较从“不相等即拒绝”反转为“相等即拒绝”，Foundation 和用户植物目标测试出现 3 个失败；恢复实现后重新转绿。该探针未进入最终工作树。

## 当前验证

- Foundation Repository、只读对账、事务执行器和用户植物应用共 4 个测试文件、26 项测试通过。
- TypeScript 源码与测试类型检查通过。
- 待全量 `verify`、中文 TSDoc 门、lint、build、Node.js 22 制品校验通过后，本切片才可提交。

## 明确未覆盖

- 两个真实 MySQL 连接的并发上限竞争。
- 驱动在真实网络断开时将错误准确分类为“确定未提交”或“提交结果未知”。
- CloudBase MySQL 新连接读回、HTTP 503 与相同幂等键重试。
- 产生奖励事件的业务写、域 outbox 与幂等完成结果同事务。
