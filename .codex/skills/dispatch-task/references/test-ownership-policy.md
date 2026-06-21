# Test Ownership Policy

## 定位

本文件定义 implementer 与 QA 的测试职责边界，防止重复执行同一类测试。

硬规则：单测只归 implementer；QA 只负责 e2e、端上测试、UI/Figma 验收和运行时链路取证。

## 职责划分

| 测试类型 | 唯一 owner | 说明 |
|---|---|---|
| unit test / 单元测试 | implementer | 包括 vitest / jest / repository unit tests / composable unit tests / service unit tests |
| lint / typecheck / build check | implementer | 作为实现自检与交付前验证 |
| 测试代码新增或修复 | implementer | main agent 不写测试代码，QA 不改测试代码 |
| e2e / 端到端流程 | QA | 按 Test Contract 执行，不审 diff |
| 小程序端上测试 | QA | 使用 `miniprogram-automator` / `9420` / 小程序运行时 `wx.request` |
| UI / Figma 验收 | QA | 消费 QA Visual Baseline Slice |
| 运行时链路验收 | QA | 真实页面、真实小程序运行时或等价端到端链路 |
| 手动验收 | QA | 仅在自动化不可覆盖或用户指定时使用 |

## implementer 必须做

如果本轮修改产品代码、测试代码、配置代码、云函数代码、页面组件代码或数据适配层，Implementation Contract 必须要求 implementer 完成相关单测或说明不适用理由。

implementer 输出必须包含：

```text
unit_test_evidence:
- required: yes / no
- commands:
- result: pass / fail / blocked / not_applicable
- evidence_ref:
- not_applicable_reason:
```

若单测失败且属于本轮改动，implementer 必须先修复；不得把失败单测交给 QA 处理。

## QA 禁止做

QA 不得运行、重复运行或补跑单元测试。

禁止 QA 将以下内容作为自己的正式验收项：

1. `npm test` 中的 unit-only 测试。
2. `vitest` / `jest` 单测。
3. repository / service / composable unit tests。
4. 只验证函数内部逻辑的 Node 单测。
5. 只依赖 mock 的后端单测。

QA 可以读取 implementer 的 `unit_test_evidence` 作为上游前置证据，但不得重复执行。

如果 QA 发现 Test Contract 要求自己运行单测，必须退回 `contract_blocker=test_ownership_violation`。

如果 implementer 未提供必需的单测证据，QA 不得自行补跑；必须输出 `upstream_unit_evidence_missing`，由 main agent 转回 implementer。

## Test Contract 拆分

main agent 必须把 Test Contract 拆成两段：

```text
Implementer Validation Contract:
- unit_tests:
- lint:
- typecheck:
- build_check:
- self_check:
```

```text
QA Validation Contract:
- e2e:
- mini_program_runtime:
- ui_figma:
- runtime_api_flow:
- manual_if_needed:
```

禁止把 unit tests 写入 QA Validation Contract。

## Completion Gate

Completion Gate 必须分别检查：

```text
- implementer_unit_tests_completed: yes / no / not_applicable
- qa_e2e_completed: yes / no / not_applicable
- qa_mini_program_runtime_completed: yes / no / not_applicable
```

单测未完成时，Completion Gate 不能通过，但责任归 implementer，不归 QA。

QA e2e / 端上测试未完成时，Completion Gate 不能通过，责任归 QA 或工具 blocker。

## 返工路由

1. 单测失败、lint/typecheck/build 失败、测试代码缺失：转回同一 implementer 线程。
2. e2e / 端上失败且归因产品问题：main agent review 后转回同一 implementer 线程修复。
3. e2e / 端上失败且归因工具 / 会话 / 环境：QA 输出 tool/session blocker。
4. QA 不得为了绕过上游单测缺口而补跑单测。
