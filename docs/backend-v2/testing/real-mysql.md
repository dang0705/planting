# 真实 MySQL 验收

必须使用真实测试库验证：

- 空库 DDL 可重复执行。
- 唯一约束和外键。
- 事务回滚。
- 并发用户植物编辑。
- 并发积分兑换。
- 并发 AI 额度预占。
- outbox/inbox 重放不重复。
- CMS 全局奖励竞争。
- quarantine 记录无法被运行时读取。
- 写入后读回和 SHA-256 核对。

缺少真实库标记 `BLOCKED_ENV`，不能回退 mock 后声称通过。

## 2026-09-23 本地隔离库回归证据

在本机 Docker 可用的前提下执行 `npm --prefix cloudfunctions-v2 run test:mysql`：7 个 MySQL 8.4 测试文件、19 条测试全部通过。测试各自使用隔离的临时数据库或容器；这次运行没有访问 CloudBase 数据库。覆盖的已实现切片包括统一身份解析与绑定事务、用户植物创建上限竞争、AI 额度预占/分配/结算/待对账，以及奖励 inbox、积分和等级事务回滚。具体可回放用例位于 `cloudfunctions-v2/test/e2e/*.mysql.spec.ts`。

这不是本页全部验收项的完成证明：CMS 发布与隔离读取、全域 outbox 投递恢复、完整 HTTP→身份→Repository 路径、CloudBase MySQL 连接和跨域真实 API 回放仍须分别验证。上述测试不能替代 P5 的云端与供应商验收。同期完整本地 `npm --prefix cloudfunctions-v2 run verify` 为 59 个测试文件、294 条测试通过；lint 有 73 条告警、0 错误。另用独立的 Node.js `22.21.1` 运行时重新执行相同 `verify` 与 `test:mysql`，分别再次通过 294/294 和 19/19；这证明本地目标 Node 版本上的构建及隔离库测试，不证明 CloudBase 函数部署或云端 MySQL 连通。
