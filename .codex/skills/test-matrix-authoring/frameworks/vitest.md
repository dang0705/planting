# Vitest 本地摘要（本 skill 附带 · 目标确认为 Vitest 时必读）

本文件是 skill 的一部分，不是可缺附件。分层、任务权限、跳过、N/A、排雷口径只认 `SKILL.md`。  
本页只补 Vitest 写/跑/审的坑，摘自官方 [Writing Tests with AI](https://vitest.dev/guide/learn/writing-tests-with-ai)，并与主文对齐。

**不要**在读完本页后再默认打开官网。仅当本仓 `vitest` 主版本的 API、`vitest.config.*` 或报错无法用源码/邻近测试解释时，再拉上述 URL（或该主版本的文档）。

## 写之前（本仓上下文优先于本页）

- 读被测实现（含 import / 类型），不要只凭函数名编测试。
- 对齐**目标路径**邻近测试：`test`/`it`、`describe`、`test.extend` vs `beforeEach`、命名。
- 读**该包**的 `vitest.config.*`：`globals`、`environment`、`setupFiles`、`restoreMocks`。未读配置不要乱加/漏 `import { test, expect } from 'vitest'`。
- 要 mock 的依赖：用真实模块或类型；没见过的客户端不要编 mock。

## Mock 传参与提升（本仓高频坑）

- Hook/mutation 工厂：**把调用方 options 传入** mock，例如  
  `usePayOrderWithWechatMutation: (opts) => mockPay(opts)`。  
  写成 `() => mockPay()` 时，产品注册的 `onError`/`onSuccess` 丢失。
- mock 工厂闭包用到的 `vi.fn`：用 `vi.hoisted(() => ({ ... }))` 再在 `vi.mock` 里引用，避免提升顺序导致 TDZ。
- `clearMocks` 会清调用记录；不要依赖「上次用例留下的 mockImplementation」跨文件存活——在 `beforeEach` 里显式 stub。

## 断言与审查（官网 + 主文）

- 点名函数、适用的失败/边界、要验证的行为。泛问「给这文件写测试」只会出浅层 Happy。
- 断言须对应用例名，并足以区分正确与错误实现。不得用存在性或 mock 调用顺序，替代本应验证的字段、状态或业务结果。契约本身就是「入口是否出现」时，存在性断言可以成立。
- 测行为不测实现：内部调用顺序变了但对外结果不变时，测试不应碎。
- 明确禁止项可写在提示里（「不要 mock 模块」「不要快照」）；模型默认会过度 mock。
- 测试名宜短、描述行为，不要长篇 `should correctly…`。

## 跑法

- Agent 环境用 `vitest run` 或 `vitest --no-watch`，不要默认 watch。
- API 用 `vi.fn` / `vi.mock` / `vi.spyOn`，不要 `jest.fn` / `jest.mock`。优先 `vi.mock(import('./mod.js'))`。
- spy 必须还原，或确认配置了 `restoreMocks`。
- 任务权限、N/A、排雷表只认 `SKILL.md`，本页不另立门禁。编写任务改完后用 `vitest run` 跑目标路径。

## 与主文冲突时

| 主题 | 听谁 |
| :--- | :--- |
| 分层、skip、证明范围、A 发现 vs N 已修、任务权限 | `SKILL.md` |
| Vitest CLI、`vi.*`、globals/import | 本页；仍不清再拉与 `package.json` 中 `vitest` 版本匹配的官网 |
