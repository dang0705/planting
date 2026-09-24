# 共享 HTTP 请求链实施入口

## 1. 任务与边界

- ClickUp：[`[P2] 共享基础设施实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mk)
- 当前切片只实现可复用的固定请求链编排、稳定公开错误、失败短路和最小脱敏请求结果事件；可靠业务审计不由链尾事件代替。
- 当前切片不实现真实 CloudBase 身份解析、MySQL Repository、事务、通用幂等表、可靠事件派发或业务路由。

## 2. 实施入口

- 源码：`cloudfunctions-v2/src/foundation/http/request-chain.ts`
- 测试：`cloudfunctions-v2/test/foundation/request-chain.spec.ts`
- Expected：`docs/backend-v2/contracts/http-api.md`
- 链尾事件失败边界：`docs/backend-v2/contracts/foundation-request-outcome-audit.md`；它不替代业务事务内的可靠审计。
- 任务验收：`docs/backend-v2/clickup/ticket-specs.md` 中的 `[P2] 共享基础设施实现`

## 3. 已实现合同

固定顺序如下，业务云函数只能注入各阶段实现，不能交换步骤：

```text
请求大小与媒体类型限制
→ 身份校验
→ 统一访问主体解析
→ 用户植物归属校验
→ DTO 校验
→ Command / Query 构造
→ 领域规则
→ Repository / 事务持久化
→ 公开 DTO 转换
→ 脱敏请求结果事件
```

不适用于某条路由的阶段必须使用 `not_applicable` 并填写中文原因；空原因失败关闭，禁止通过省略步骤形成隐式旁路。

## 4. 当前证据与未覆盖范围

- RED：本切片的两条请求链用例在结果事件写入或失败告警永不完成时落到 `next_turn`；真实 Node HTTP 用例由测试专用中止信号触发 `TimeoutError`。反写探针临时把成功分支改为等待投递 Promise 后，同一成功用例再次 RED；写回后源码 SHA-256 与探针前一致。
- GREEN：请求链 13 条 `unit_fake` 测试和 Node 原生 HTTP 适配器 8 条测试共 21/21 通过。Node 22.21.1 的本机真实 HTTP 请求证明：成功结果不等待永不完成的链尾事件写入；异步写入拒绝及告警拒绝被消费，不产生 `unhandledRejection`。
- 类型检查：Node 22.21.1 下 `npm run typecheck` 已通过；本切片请求链及本机 HTTP 目标测试 21/21 通过。整包 `npm test` 当前仅由并行中的分类证据回放校验失败阻断（WFO 名称 SHA-256 不匹配，452/454 通过），不属于本切片。目标三文件 oxlint 为 0 错误、0 告警，oxfmt 检查通过。
- 链尾请求结果事件与失败告警是非阻塞的尽力观测，不是强制安全审计或可靠事件；永不完成不等同失败，不触发超时或新配置。Node `warning` 监听器在后续事件派发中异步抛错属于运行时外部风险，不能由同步 `try/catch` 或 Promise 拒绝处理隔离。
- 身份、归属、DTO、领域、事务和审计端口均为可观测假边界；Node HTTP 证据只覆盖本机 `node:http` 与真实请求链，不能据此宣称真实 MySQL 审计事务、CloudBase 网关、身份或告警送达已经通过。

## 5. 事务编排切片

- 源码：`cloudfunctions-v2/src/foundation/database/transaction-runner.ts`
- 测试：`cloudfunctions-v2/test/foundation/transaction-runner.spec.ts`
- 已保证：开始失败不执行回调；成功只提交；业务或提交失败尝试回滚；回滚失败进入独立内部可观测端口且不覆盖最先异常。
- 当前只冻结适配器无关的生命周期协议；不含 MySQL 连接、SQL、隔离级别、连接池、唯一约束或真实写后读回。

共享幂等已转入独立切片，见 [共享 HTTP 幂等协议与持久化](foundation-http-idempotency.md)。后续继续实施 Repository 占位/完成读回、HTTP 适配器接线、真实业务写事务和可靠事件。
