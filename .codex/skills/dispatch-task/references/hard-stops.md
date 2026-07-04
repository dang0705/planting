# Hard Stops

命中任一条，当前阶段必须 `blocked`，不得 silent fallback。

1. `codex_subagent` 模式未显式传精确 `agent_type`，使用 full-history fork，或发生 generic/default/worker fallback。
2. `zcode_external` 模式 spawn 了 Codex implementer、没有 ZCode prompt sentinel、没有 computer-use 工具调用、没有剪贴板粘贴、没有 send receipt，或发送动作不是 `enter/send_button/blocked`。
3. ZCode 当前会话/输入框/prompt 完整性未通过 computer-use 验证，或 prompt 发送失败仍继续。
4. 仅用 shell/脚本/自然语言声明替代 computer-use 操作 ZCode，或 ZCode 聊天完成声明被当成完成依据。
5. ZCode 失败后 main 自己写代码，或自动 fallback 到 Codex implementer 而未获得用户明确批准。
6. ZCode handoff 缺少 handoff manual，或 main 未先读取 handoff manual 就用 UI 状态判定外部实现者已结束。
7. ZCode 已收到 prompt 并开始运行后，main 仍持续盯屏或 30 分钟内读取 ZCode UI 进度。
8. child `agent_identity` 与 Contract 不一致。
9. UI handoff 缺少 styling system、SCSS policy、component library 或 rule refs。
10. main 在 Figma 任务使用 `get_design_context/get_screenshot/variables/assets`，或把视觉细节塞进 handoff。
11. figma_link 存在，但实现者没有直接 Figma 读取证据，或 QA 没有独立 baseline。
12. `component_library` 包含 `uni-ui` 且存在 figma_link，但缺 uni-ui 映射合同或实现者缺 `uni_ui_mapping_evidence`。
13. Tailwind 项目新增未授权 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
14. 变更越过 allowed/forbidden paths，或引入未授权依赖/API/schema。
15. QA 重跑单测；main/QA 用“看起来正确”替代运行证据。
