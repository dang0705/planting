# Role Ownership

本文件定义 dispatch-task 内部角色所有权。所有角色只接收最小必要上下文，禁止 full-history fork。

## main

main 负责：任务归一化、复杂度分级、项目约束、路径边界、风险路由、实现模式选择、handoff 校验、external implementer 桥接控制、diff review、main QA、docs/BRV impact 处理、受限 `simple_patch` / `maintenance_patch`、返工协调与 Completion Gate。

限制：

1. `standard_task`、`deep_contract`、`external_implementer` 中 child / provider 仍运行时 main 不直接修改代码类文件；provider/child 返回 `completed` 且进入 Gate C Main Review 后，main 才可按 `SKILL.md` §1.3 执行受限 `maintenance_patch`。`blocked` 不授权接管实现，`simple_patch` 由 main 直接实现。
2. Figma 任务中 main 只执行 Lite 路由，不读取 context / screenshot / variables / assets。
3. main 不把大段历史、完整 ClickUp、完整 Figma、完整 references 或旧 INDEX 广播给子角色。
4. main 不用聊天完成状态、计划或 receipt 替代真实 git diff / status / validation evidence。
5. main 拥有 QA、docs、BRV 执行权，**不**产出 `main-*-receipt`；仅在 automator/batch 模式产出 `runtime-qa-evidence.json`。

## Codex implementer

仅在 `implementation_mode=codex_subagent` 时修改代码。负责实现、单测/lint/typecheck/build/self-check 与结果 JSON。

- `implementer_fast`：既有架构内的普通实现。
- `implementer_deep`：API/schema/迁移/状态机/高风险 contract lock。

implementer 必须遵守 allowed_paths、forbidden_paths、decision_lock、project_constraints 和 required_skills。

## External implementer

仅在 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）时替代实现阶段。外部实现者只按 main 生成的 provider-specific prompt 修改代码和写 handoff manual，不替代架构判断、QA 或验收。

ZCode、Trae、Chrome 插件驱动的云端 agent 等都只是 provider/adapter。provider 失败、无 diff、越权修改、无法读取必要 Figma 数据、prompt 未完整发送或 adapter 不可用时，不得自动 fallback 为 main 自己写代码，也不得自动改派 Codex implementer，除非用户明确批准。

## QA

QA 由 main 独立验证 e2e、端上、UI/Figma 与运行时。main QA 不运行 unit tests，不替代 main code review，不修复业务代码。

Figma/UI main QA 必须使用 `$qa-ui-visual-baseline-policy` 独立读取视觉基准，并取得实际运行截图/目标页面状态。仅 automator/batch 模式需要 `runtime-qa-evidence.json`。

## Main docs / BRV

仅在公共契约、活文档、用户文档、索引或 ByteRover 影响确实存在时由 main 处理。main 负责知识卫生，不得把蓝图、历史设计或 archived 文档维护为当前事实。不产出 `main-docs-receipt` 或 `main-brv-receipt`。
