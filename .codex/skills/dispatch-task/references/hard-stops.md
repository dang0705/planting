# Hard Stops

命中任一条，当前阶段必须 `blocked`，不得 silent fallback。

1. `codex_subagent` 模式未显式传精确 `agent_type`，使用 full-history fork，或发生 generic/default/worker fallback。
2. `external_implementer` 模式 spawn 了 Codex implementer、没有 send receipt、非 Web provider 缺少 handoff manual，或 Web provider 同时缺少 PR/worktree recovery evidence；provider 交付证据与 `external_contract.prompt_transport` 不一致也必须阻断。
3. provider 当前会话/prompt 完整性未通过 adapter 验证，或 prompt 发送失败仍继续。
4. 仅用 shell/脚本/自然语言声明替代声明为 required 的 UI/Computer/Chrome adapter 操作，或 provider 聊天完成声明被当成完成依据。
5. external implementer 失败或返回 `blocked` 后 main 自己写代码，或自动 fallback 到 Codex implementer 而未获得用户明确批准；只有 provider 返回 `completed` 并进入 Gate C Main Review 后，才可执行 §1.3 的受限 maintenance patch。
6. 非 Web external handoff 缺少 handoff manual，或 main 未先读取可用的 handoff manual / PR recovery evidence 就用 UI/聊天状态判定外部实现者已结束。
7. external implementer 已收到 prompt 并开始运行后，main 仍持续盯屏、使用短轮询或在 30 分钟内读取 provider UI 进度；正式等待必须交给 5 分钟下限的 recurring wakeup。
8. Web external provider 已返回终态但 main 未通过 GitHub 插件合并 PR、未将 base branch fast-forward pull 到本地、或在三者未完成时报告 Completion。
9. child `agent_identity` 与 Contract 不一致。
10. UI handoff 缺少 styling system、SCSS policy、component library 或 rule refs。
11. main 在 Figma 任务使用 `get_design_context/get_screenshot/variables/assets`，或把视觉细节塞进 handoff。
12. figma_link 存在，但实现者没有直接 Figma 读取证据，或 QA 没有独立 baseline。
13. `component_library` 包含 `uni-ui` 且存在 figma_link，但缺 uni-ui 映射合同或实现者缺 `uni_ui_mapping_evidence`。
14. Tailwind 项目新增未授权 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
15. 变更越过 allowed/forbidden paths，或引入未授权依赖/API/schema。
16. QA 重跑单测；main/QA 用“看起来正确”替代运行证据。
