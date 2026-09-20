# 共享 HTTP 请求链实施入口

## 1. 任务与边界

- ClickUp：[`[P2] 共享基础设施实现`](https://app.clickup.com/t/90182453517/z8v0kmr9mk)
- 当前切片只实现可复用的固定请求链编排、稳定公开错误、失败短路和最小脱敏审计事件。
- 当前切片不实现真实 CloudBase 身份解析、MySQL Repository、事务、通用幂等表、可靠事件派发或业务路由。

## 2. 实施入口

- 源码：`cloudfunctions-v2/src/foundation/http/request-chain.ts`
- 测试：`cloudfunctions-v2/test/foundation/request-chain.spec.ts`
- Expected：`docs/backend-v2/contracts/http-api.md`
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
→ 脱敏审计
```

不适用于某条路由的阶段必须使用 `not_applicable` 并填写中文原因；空原因失败关闭，禁止通过省略步骤形成隐式旁路。

## 4. 当前证据与未覆盖范围

- RED：请求链模块不存在时，目标测试因无法导入模块而失败。
- GREEN：7 条 `unit_fake` 测试覆盖成功顺序、身份短路、归属隐藏、DTO 短路、内部异常脱敏、显式不适用和空原因失败关闭。
- 类型检查通过；新增源码和测试的 oxlint 为 0 错误、0 告警。
- 身份、归属、DTO、领域、事务和审计端口均为可观测假边界；不得据此宣称真实 MySQL 回滚、CloudBase 身份或 HTTP 端到端已经通过。

下一切片先处理合同断层与 HTTP 适配器接线，再独立实施通用幂等、事务和可靠事件。
