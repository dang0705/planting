# Role Ownership

本文件定义 dispatch-task 的所有权。当前没有内部 implementer、subagent 或 child role；所有实现和验收由 main 完成，external implementer 只作为显式外部桥接。

## main

main 负责：任务归一化、复杂度分级、项目约束、路径边界、风险路由、实现模式选择、代码实现、handoff 校验、external implementer 桥接控制、diff review、main QA、docs/BRV impact 处理、返工协调与 Completion Gate。

限制：

1. `main_direct` 的所有任务均由 main 直接实现；external provider 运行时仅对 provider 工作区遵守隔离和等待规则。
2. main_direct Figma 任务中 main 在首次 UI 编辑前直接读取必要设计证据；external bridge intake 才使用 Lite 路由。
3. main 不把大段历史、完整 ClickUp、完整 references 或旧 INDEX 广播给 external provider。
4. main 不用聊天完成状态、计划或 receipt 替代真实 git diff / status / validation evidence。
5. main 拥有 QA、docs、BRV 执行权，**不**产出 `main-*-receipt`；仅在 automator/batch 模式产出 `runtime-qa-evidence.json`。

## External implementer

仅在 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）时替代实现阶段。外部实现者只按 main 生成的 provider-specific prompt 修改代码和写 handoff manual，不替代架构判断、QA 或验收。

ZCode、Trae、Chrome 插件驱动的云端 agent 等都只是 provider/adapter。provider 失败、无 diff、越权修改、无法读取必要 Figma 数据、prompt 未完整发送或 adapter 不可用时，不得自动改派任何子代理；必须保持 blocked 或由用户重新决定是否取消外部桥接。

## QA

QA 由 main 独立验证 e2e、端上、UI/Figma 与运行时。main QA 不运行 unit tests，不替代 main code review，不修复业务代码。

Figma/UI main QA 必须使用 `$qa-ui-visual-baseline-policy` 独立读取视觉基准，并取得实际运行截图/目标页面状态。仅 automator/batch 模式需要 `runtime-qa-evidence.json`。

## Main docs / BRV

仅在公共契约、活文档、用户文档、索引或 ByteRover 影响确实存在时由 main 处理。main 负责知识卫生，不得把蓝图、历史设计或 archived 文档维护为当前事实。不产出 `main-docs-receipt` 或 `main-brv-receipt`。
