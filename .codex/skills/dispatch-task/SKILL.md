---
name: dispatch-task
description: '低上下文任务调度：main 锁定工程约束与验收边界；实现阶段可分流到 Codex 具名 subagent 或 ZCode 外部实现者，完成后统一由 Codex 回收 diff、测试、QA 与 Completion Gate。'
---

# Dispatch Task

## 1. 角色所有权

- **main**：任务归一化、项目约束、路径边界、风险路由、实现模式选择、handoff 校验、ZCode 桥接控制、computer-use 操作执行、diff review、返工协调与完成收口；不得修改代码类文件。
- **Codex implementer**：仅在 `implementation_mode=codex_subagent` 时使用；读取目标路径适用规则并实现；负责 unit/lint/typecheck/build/self-check。
- **ZCode external implementer**：仅在 `implementation_mode=zcode_external` 时替代实现阶段；按 main 生成的 ZCode prompt 修改代码；不替代 main 架构判断、QA 或验收。
- **QA**：独立验证 e2e、端上、UI/Figma 与运行时；不运行单测，不替代 main code review。
- **docs_keeper**：仅在公共契约或活文档确实受影响时使用。

普通任务默认只读本文件。不得先读 references/INDEX、完整历史、完整 ClickUp、完整 Figma 或全仓规则。

## 2. Flow

### Gate A0 — Implementation Mode 简单触发路由

用户不需要输入完整 `Dispatch Options`。main 必须先做一次轻量触发词识别，再进入 Gate A。

只要本轮任务需要代码修改，且用户输入中出现以下任一正向触发词，就必须设置：

```text
implementation_mode = zcode_external
external_implementer = zcode_glm
zcode_target = current_open_chat
```

正向触发词包括：

```text
用 ZCode
走 ZCode
ZCode 实现
ZCode 写代码
交给 ZCode
外部实现者
外部 implementer
外部实现
zcode_external
implementation_mode=zcode_external
GLM 在 ZCode 里跑
让 GLM 在 ZCode 跑
实现阶段走 ZCode
```

最短可用输入示例：

```text
用 ZCode 做这个任务：<任务描述 / ClickUp 链接 / Figma 链接>
```

或：

```text
走 ZCode：<任务描述>
```

以下情况不得触发 `zcode_external`：

1. 用户明确否定：`不要用 ZCode`、`不用 ZCode`、`禁用 ZCode`、`别走 ZCode`、`no zcode`、`disable zcode`。
2. 任务不需要代码修改。
3. 用户只是询问 ZCode 流程、配置或故障，不是在派发实现任务。

触发成功后，用户不需要再写 `codex_self_implementation_forbidden`、`computer_use_required` 等长字段；这些由 Gate B2 自动补入 `zcode_contract`。

### Gate A — Intake

main 只读取：用户输入/显式 source、`git status --short`、目标路径最近的 AGENTS.md。UI 任务再定向读取 package.json、Tailwind 配置和组件库入口。

形成短 Brief：`objective / code_changes_required / ui_task / figma_link / risk / acceptance / likely_paths / implementation_mode`。

`implementation_mode`：

- `codex_subagent`：默认模式。使用 `implementer_fast` / `implementer_deep` 具名 subagent。
- `zcode_external`：当 Gate A0 命中“用 ZCode / 走 ZCode / 外部实现者 / zcode_external / GLM 在 ZCode 里跑”等简单触发词，或任务配置明确指定时使用。该模式只替代 implementer 写代码阶段。

代码任务必须形成 `Project Constraints`：

```text
rule_refs              # 路径 + 相关章节，不复制整份 AGENTS.md
framework
styling_system         # UI 必填
new_scss_policy        # UI 必填：forbidden / explicit_exception_only
scss_exceptions        # 默认 []
component_library      # UI 必填；若为 uni-ui 且存在 figma_link，必须触发 uni-ui 映射合同
dependency_policy
test_commands
```

项目声明 TailwindCSS 时，必须原样写入 `styling_system`；不得因 Vue/uni-app 习惯默认 SCSS。实现者还需独立核对 `rule_refs`。

### Gate B — Handoff Contract

main 只生成一份 JSON Handoff Contract：

```text
dispatch_run_id
implementation_mode: codex_subagent / zcode_external
task: {objective, code_changes_required, ui_task, risk, qa_required}
target_role                         # codex_subagent: exact custom-agent name; zcode_external: zcode_external
spawn_contract                      # codex implementer 或 QA 具名 spawn 合同
zcode_contract                      # implementation_mode=zcode_external 时必填
handoff_manual                      # implementation_mode=zcode_external 时必填，本地状态手册路径与完成判定规则
allowed_paths / forbidden_paths
acceptance
project_constraints
decision_lock:
  level: standard / strict
  architecture_invariants
  local_decisions_allowed
figma:
  link / node_id
  lite_status
  main_access: lite_only
  main_tools_used
  lite_receipt                       # 可选，仅身份/尺寸/顶层分区
  implementer_fetch_required
  qa_baseline_fetch_required
required_skills / required_prompt_sections
validation
output_evidence_required
```

`standard` 只锁目标、工程规则和不可破坏的不变量；组件拆分、命名、复用落点等局部决策归实现者。只有 API/schema、迁移、安全、跨系统或不可逆任务读取 `references/high-risk-workflow.md` 并使用 `strict`，不为普通任务生成架构长文或逐文件伪代码。

派发前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
```

失败不得进入实现阶段。

### Gate B1 — Codex Named Spawn

仅适用于 `implementation_mode=codex_subagent`，以及任何需要 QA subagent 的阶段。

`target_role` 不是描述文本，而是 `.codex/agents/*.toml` 中 `name` 的精确值。main 必须显式使用该值调用 `spawn_agent`，不得让运行时自行挑选角色。

```text
若工具 schema 支持 fork_turns：
  spawn_agent(agent_type=<exact name>, fork_turns="none", message=<minimal handoff>)
否则若支持 fork_context：
  spawn_agent(agent_type=<exact name>, fork_context=false, message=<minimal handoff>)
否则：
  blocked: named_agent_selector_unavailable
```

硬规则：

1. Codex implementer 必须传 `agent_type=spawn_contract.implementer_agent_type`；QA 必须传 `agent_type=spawn_contract.qa_agent_type`。
2. 不传 `model`、`reasoning_effort` 或 sandbox override；由具名 agent TOML 决定。
3. 禁止 full-history fork；具名角色与隔离 handoff 同时成立。
4. `agent_type` 不在 tool schema、角色不可用、spawn 被拒绝，或 runtime metadata 显示未加载目标配置时，立即阻断。
5. 禁止回退到 `default`、`worker`、generic agent，也禁止在 user prompt 中让 generic agent“扮演”目标角色。
6. child 最终 JSON 必须带 `agent_identity={agent_type, dispatch_run_id}`；与 Contract 不一致时结果 validator 阻断。
7. review/QA 返工发送到原 agent thread，不重新 spawn generic child。

### Gate B2 — ZCode External Implementer Bridge

仅适用于 `implementation_mode=zcode_external`。先读取 `references/zcode-external-implementer-bridge.md` 与 `references/zcode-computer-use-action-contract.md`。

该模式下：

1. main 不 spawn Codex implementer。
2. main 生成 ZCode 专用 prompt；不得把完整 dispatch、完整 references 或完整历史塞进 prompt。
3. Codex main 必须真实发起 `@ZCode` 或 `@Computer` computer-use tool invocation 操作 ZCode；若工具目标不可用，必须 `blocked: computer_use_unavailable`。
4. ZCode prompt 必须通过剪贴板一次性粘贴，不得让 Codex 逐字输入。
5. 不得仅用 shell、AppleScript、osascript、cliclick、xdotool 或类似脚本伪装完成 UI 操作，除非用户本轮明确授权替代方案。
6. 发送前必须验证：ZCode 当前会话、输入框、prompt sentinel、粘贴完整性。
7. 发送动作必须记录为 `send_action: enter | send_button | blocked`；不得只写“按 Enter”。
8. Send receipt 必须包含 `computer_use.tool_invoked=true`、`tool_invocation_evidence.tool_events_seen=true`、动作 trace、`manual_typing_used=false` 与 `shell_only_ui_automation_used=false`。
9. ZCode/GLM 聊天里说“完成”不算完成。
10. ZCode 修改后，Codex 必须重新读取真实 `git diff`、验证 allowed/forbidden paths、执行测试/构建、自审、必要时 QA。
11. ZCode 失败、无 diff、越权修改、无法读取 Figma、prompt 未完整发送或 computer-use 不可用时，不得 fallback 成 main 自己写代码。
12. ZCode prompt 成功发送后，main 不得实时盯屏或高频 `get_app_state` 轮询。监控采样频率必须至少降低 50%，默认使用低成本文件系统回收：`git status --short` / `git diff --name-only`；ZCode UI 状态读取默认间隔不得短于 5 分钟，且只在确认发送、疑似完成/阻断、diff 稳定、等待超时或需要提取最终 Result JSON 时使用。
13. ZCode prompt 必须包含 `Handoff Manual Contract`。外部实现者开始任务后必须写入 `handoff_manual.path`，先置 `status=working`，完成或阻塞时更新为 `status=completed|blocked`。main 低频回收必须优先读取该 JSON 手册来判定 ZCode 是否已结束；`status=working` 或手册缺失/损坏时默认仍在执行，不得用 UI 聊天状态臆断完成。

执行阶段必须出现以下实际工具调用命令，不能只写入 JSON 或自然语言说明：

```text
COMPUTER_USE_CALL 1 target=@ZCode|@Computer
command: Verify the foreground app is ZCode and the current open chat is the intended ZCode implementer session. Take a screenshot or inspect the app title/input area. Do not type code.

COMPUTER_USE_CALL 2 target=@ZCode|@Computer
command: Focus the current ZCode chat input. Confirm the input box is active and empty or safe to replace. Do not send anything.

COMPUTER_USE_CALL 3 target=@ZCode|@Computer
command: Put the exact generated ZCode handoff prompt into the system clipboard, paste it into the active ZCode chat input in one clipboard paste operation, and do not manually type the prompt character by character.

COMPUTER_USE_CALL 4 target=@ZCode|@Computer
command: Before sending, verify the input box contains both sentinel strings. If either sentinel is missing, block and do not send.

COMPUTER_USE_CALL 5 target=@ZCode|@Computer
command: Send the prompt using Enter or the visible send button, then confirm the message is present in the ZCode conversation.
```

`zcode-send-receipt.json` 必须引用真实 computer-use tool event / transcript step；没有工具事件时不得填写 `tool_invoked=true`。

ZCode prompt 派发前建议执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-prompt.mjs <handoff.json> <zcode-prompt.md>
```

粘贴/发送后记录并验证：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
```

低频回收时先读取并验证 handoff manual：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
```

ZCode 完成后由 Codex 生成 recovery result，并执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
```

### Gate C — Implementation Review

Codex subagent 返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
```

ZCode external 完成后执行 external recovery validator。两种模式都必须做 diff-first review：身份/来源、路径边界、项目约束、decision lock、依赖、验证证据。UI 重点检查 Tailwind/SCSS、组件复用与 uni-ui 映射证据；Figma 任务必须存在实现者直接读取证据。失败退回原实现路径，main 不亲自修复。

### Gate D — QA & Completion

Figma/UI、用户可观察行为、API/schema/数据链路、端上运行、高风险或用户明确要求时需要 QA。纯文档、注释或不影响行为的机械改动可跳过，但要记录理由。

QA 必须按 Gate B1 具名 spawn 为 `qa_reviewer`。返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs qa <handoff.json> <result.json>
```

完成条件：实现模式校验通过；main review 通过；所需 QA 通过；blocker 与未验证项已明确；只输出一份 Completion Receipt，不输出逐 gate telemetry。

## 3. Figma 硬边界

存在 `figma_link` 时：

| 角色                       | 必须/允许                                                                                                                                      | 禁止                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| main                       | 使用 `$figma-ui-implementation-policy`；可只解析 link/node，或最多一次 `get_metadata` 形成 Lite                                                | context、screenshot、variables、assets、视觉摘要、实现切片、Drilldown |
| Codex implementer          | 使用 `$implementer-ui-execution-policy`，在首次 UI 编辑前直接取 metadata + design context + screenshot；再用 `$ui-implementation-scope-policy` | 依赖 main Lite 猜实现、整文件读取                                     |
| ZCode external implementer | 在 ZCode prompt 中被强制要求直接读取 Figma context/screenshot；若 ZCode 无 Figma 能力，必须返回 blocker 且不改代码                             | 依赖 main Lite 猜实现、让 main 补读完整 Figma                         |
| QA                         | 使用 `$qa-ui-visual-baseline-policy`，独立取 metadata + reference screenshot，并取得实际运行截图                                               | 只凭 main/实现者转述判通过、整文件读取                                |

Handoff 必须保留原始 link/node，并满足：

```text
main_access: lite_only
implementer_fetch_required: true
qa_baseline_fetch_required: true
```

`codex_subagent` 模式还必须满足：

```text
required_skills.implementer:
  - $implementer-ui-execution-policy
  - $ui-implementation-scope-policy
required_skills.qa:
  - $qa-ui-visual-baseline-policy
```

`zcode_external` 模式还必须满足：

```text
zcode_contract.computer_use_required: true
zcode_contract.computer_use_tool_invocation_required: true
zcode_contract.required_computer_use_actions:
  - verify_zcode_current_session
  - focus_chat_input
  - set_clipboard_to_prompt
  - paste_clipboard
  - verify_prompt_sentinel_in_input
  - send_prompt
zcode_contract.required_prompt_sections:
  - implementation_contract
  - allowed_forbidden_paths
  - project_constraints
  - handoff_manual_contract
  - figma_direct_fetch
  - result_json_contract
```

若 `project_constraints.component_library` 包含 `uni-ui`，则：

- `codex_subagent`：handoff 必须追加 `$uni-ui-figma-component-mapper` 与 `uni_ui_mapping_evidence`。
- `zcode_external`：ZCode prompt 必须追加 `uni_ui_mapping_contract`，并要求外部实现者在首次 UI 编辑前输出最小 `Figma 区域/节点 → uni-ui 组件/备选/风险` 映射证据。

main 不得读取或转述该 skill 的组件索引、映射表、组件规则；只负责把 skill 名、prompt section 或 evidence 名写入 Contract。main Lite 仅用于路由，不是实现或 QA 的事实源。Lite 不可用不授权猜测；由实现者直接读取，失败则返回 blocker。

## 4. 路由

- `codex_subagent + implementer_fast`：既有架构内、局部、低风险。
- `codex_subagent + implementer_deep`：多模块、复杂状态、API/schema、迁移、安全、兼容或高风险。
- `zcode_external`：用户或配置明确要求 ZCode/GLM 写代码；仍由 main 写死 Architecture Direction + Implementation Contract。
- `code_explorer`：仅在两次定向搜索后仍找不到入口、规则来源或复用候选。
- `qa_reviewer`、`docs_keeper`：按 Gate D 与实际文档影响使用。

不得为“走完整流程”无条件 spawn 所有角色。同一角色返工优先复用原线程。同一 ZCode 会话返工优先追加“修正 prompt”，不得改由 main 自己写。

## 5. 条件引用

仅触发时读取：

- `references/zcode-external-implementer-bridge.md`：`implementation_mode=zcode_external`。
- `references/zcode-computer-use-action-contract.md`：`implementation_mode=zcode_external`，定义 Codex main 操作 ZCode 的 computer-use 动作协议。
- `references/high-risk-workflow.md`：高风险 contract lock。
- `references/clickup-workflow.md`：输入含有效 ClickUp ticket。
- `references/mini-program-runtime-qa.md`：acceptance 明确要求小程序端上验证。

其余旧 INDEX、BRV 默认门禁、Solution Discovery 仪式、逐 gate telemetry、budget fuse、长模板和重复 role packet 不属于默认流程。

## 6. Hard stops

1. `codex_subagent` 模式未显式传精确 `agent_type`，使用 full-history fork，或发生 generic/default/worker fallback。
2. `zcode_external` 模式 spawn 了 Codex implementer、没有 ZCode prompt sentinel、没有 computer-use 工具调用、没有剪贴板粘贴、没有 send receipt，或发送动作不是 `enter/send_button/blocked`。
3. ZCode 当前会话/输入框/prompt 完整性未通过 computer-use 验证，或 prompt 发送失败仍继续。
4. 仅用 shell/脚本/自然语言声明替代 computer-use 操作 ZCode，或 ZCode 聊天完成声明被当成完成依据，未由 Codex 回收真实 git diff 和测试。
5. ZCode 失败后 main 自己写代码，或自动 fallback 到 Codex implementer 而未获得用户明确批准。
6. `zcode_external` handoff 缺少 `handoff_manual`，ZCode prompt 缺少 `Handoff Manual Contract`，或 main 未先读取 handoff manual 就用 UI 状态判定外部实现者已结束。
7. child `agent_identity` 与 Contract 不一致，或可见 runtime metadata 显示 `agent_role/agent_path` 未加载目标配置。
8. UI handoff 缺少 styling system、SCSS policy、component library 或 rule refs。
9. main 在 Figma 任务使用 `get_design_context/get_screenshot/variables/assets`，或把视觉细节塞进 handoff。
10. figma_link 存在，但实现者没有直接 Figma 读取证据，或 QA 没有独立 baseline。
11. `component_library` 包含 `uni-ui` 且存在 figma_link，但缺 uni-ui 映射合同或实现者缺 `uni_ui_mapping_evidence`。
12. Tailwind 项目新增未授权 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
13. 变更越过 allowed/forbidden paths，或引入未授权依赖/API/schema。
14. QA 重跑单测；main/QA 用“看起来正确”替代运行证据。
