# ZCode 外部实现者桥接

## 1. 定位

本流程只在 `implementation_mode=zcode_external` 时启用。

ZCode/GLM **只替代 implementer 写代码阶段**，不替代：

- Codex main 的事实读取、架构方向、Implementation Contract。
- Codex main 的 allowed/forbidden paths 审核。
- Codex main 的 git diff 回收、测试、构建、review。
- Codex QA 的独立验收。
- Completion Gate。

外部实现者失败时，不得让 main agent 自己写代码。只有用户明确批准，才允许切换回 `codex_subagent` implementer。

## 2. 何时使用

使用条件：

1. 用户用简单触发词要求 ZCode / GLM 作为实现者；或
2. 项目级 dispatch 配置明确指定 `implementation_mode=zcode_external`；且
3. 当前任务需要代码修改。

简单触发词：

```text
用 ZCode / 走 ZCode / ZCode 实现 / ZCode 写代码 / 交给 ZCode
外部实现者 / 外部 implementer / 外部实现
zcode_external / implementation_mode=zcode_external
GLM 在 ZCode 里跑 / 让 GLM 在 ZCode 跑 / 实现阶段走 ZCode
```

用户最短只需要输入：

```text
用 ZCode 做这个任务：<任务描述>
```

命中简单触发词后，main 必须自动补齐 ZCode handoff、computer-use、send receipt、recovery validator 所需合同字段。不得要求用户每次手写完整 Dispatch Options。

不使用条件：

- 纯分析、纯文档、纯 QA。
- ZCode 当前会话不可验证。
- Codex 运行时没有可调用的 computer-use / UI automation 工具。
- 无法通过 computer-use 直接操作，且无法在 Computer Use 状态验证前后使用已验证替代 UI 自动化通道写入剪贴板、粘贴完整 prompt 或发送。
- 用户要求 main agent 直接修。

## 3. Handoff Contract 增量字段

`implementation_mode=zcode_external` 时，handoff 必须包含：

```json
{
  "implementation_mode": "zcode_external",
  "target_role": "zcode_external",
  "zcode_contract": {
    "external_implementer": "zcode_glm",
    "application": "ZCode",
    "target_session": "current_open_chat",
    "prompt_transport": "clipboard_paste",
    "prompt_sentinel_required": true,
    "prompt_integrity_check_required": true,
    "input_box_check_required": true,
    "send_receipt_required": true,
    "send_action_required": true,
    "allowed_send_actions": ["enter", "send_button", "blocked"],
    "completion_claim_not_authoritative": true,
    "codex_self_implementation_forbidden": true,
    "generic_fallback_forbidden": true,
    "recovery_required": true,
    "handoff_manual_required": true,
    "handoff_completion_status_source": "handoff_manual",
    "computer_use_required": true,
    "actual_tool_invocation_required": true,
    "allowed_tool_targets": ["@ZCode", "@Computer"],
    "minimum_tool_event_count": 5,
    "computer_use_tool_invocation_required": true,
    "computer_use_action_trace_required": true,
    "clipboard_write_via_computer_use_required": true,
    "manual_typing_forbidden": true,
    "shell_only_ui_automation_forbidden": true,
    "required_computer_use_actions": [
      "verify_zcode_current_session",
      "focus_chat_input",
      "set_clipboard_to_prompt",
      "paste_clipboard",
      "verify_prompt_sentinel_in_input",
      "send_prompt"
    ],
    "required_prompt_sections": [
      "implementation_contract",
      "allowed_forbidden_paths",
      "project_constraints",
      "handoff_manual_contract",
      "validation_commands",
      "result_json_contract"
    ]
  },
  "handoff_manual": {
    "required": true,
    "path": ".tmp/dispatch-task/{dispatch_run_id}-handoff-manual.json",
    "status_field": "status",
    "working_status": "working",
    "terminal_statuses": ["completed", "blocked"],
    "main_completion_probe": "read_json_before_ui"
  }
}
```

若存在 Figma link，`required_prompt_sections` 还必须包含：

```json
["figma_direct_fetch", "figma_blocker_policy"]
```

若 Figma + uni-ui，必须再包含：

```json
["uni_ui_mapping_contract"]
```

## 4. ZCode prompt 生成规则

main 生成的是 **ZCode 专用 handoff prompt**，不是 dispatch 全量上下文。

必须包含：

1. sentinel 起止标记：

```text
<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START>>>
...
<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:END>>>
```

2. `Architecture Direction`：main 写死的架构方向和不可破坏不变量。
3. `Implementation Contract`：目标、allowed_paths、forbidden_paths、acceptance、dependency_policy、test_commands。
4. `Project Constraints`：framework、styling_system、new_scss_policy、component_library、rule_refs。
5. `Handoff Manual Contract`：要求 ZCode/GLM 启动、完成或阻塞时写入本地 handoff manual JSON。
6. `Figma Direct Fetch`：仅在存在 figma_link 时要求 ZCode/GLM 自己读取 Figma metadata/context/screenshot。
7. `uni-ui Mapping Contract`：仅在 Figma + uni-ui 时要求先输出最小映射表，再改 UI。
8. `Result JSON Contract`：要求 ZCode 完成后在聊天里输出结构化 JSON，但该 JSON 只作为线索，不是最终完成依据。

禁止包含：

- 完整 dispatch-task skill。
- 完整 references 目录。
- 完整 AGENTS.md。
- 完整历史对话。
- main 从 Figma Drilldown 摘录的视觉细节。
- 要求 ZCode 改 allowed_paths 外的文件。

## 5. Figma 规则

main 仍然只能做 Lite：link 解析或最多 `get_metadata`。

ZCode prompt 必须写明：

```text
如果存在 Figma link，你必须在 ZCode 内直接获取 Figma metadata + design context + screenshot 后再编辑 UI。
如果 ZCode 当前环境没有 Figma 能力、没有权限、节点无效或 context 不足，立即输出 BLOCKED_ZCODE_FIGMA_UNAVAILABLE，不得根据 main Lite 或记忆猜 UI。
如运行时为 GLM 且受 AGENTS 约束 2.18 禁止 get_screenshot，可在 figma_fetch_evidence 提交 `screenshot_policy_skip`，并说明 policy_ref 为 AGENTS.md 对应条款；同一结果下仍需完整读取 metadata 与 design context。
```

Codex main 不得为了弥补 ZCode 无法读取 Figma 而改为自己读取 design context/screenshot/assets。

## 6. UI / Tailwind / uni-ui 规则

ZCode prompt 必须写明：

- 项目声明 TailwindCSS 时，新增 UI 默认使用 Tailwind utility / design token / uni-ui props/slots。
- 不得默认新增 `<style lang="scss" scoped>`。
- `new_scss_policy=forbidden` 时，禁止新增 `.scss` 或 scoped style 来重建常规 UI。
- 只有 Contract 明确列出的 `scss_exceptions` 才能写 SCSS。
- 组件库为 uni-ui 且存在 Figma link 时，必须在首次 UI 编辑前输出 `uni_ui_mapping_evidence`。
- `uni_ui_mapping_evidence` 至少包含：Figma 区域/节点、视觉与交互线索、首选 uni-ui 组件、备选、采用/自定义决策、风险或限制。

## 7. Computer Use 动作层

该层属于 Codex main 操作 ZCode 的工具调用协议，不属于发给 ZCode/GLM 的实现 prompt。

硬规定：

1. 必须真实发起 `@ZCode` 或 `@Computer` computer-use tool invocation 完成 ZCode 应用操作。
2. 若工具目标不可用，立即生成 `send_action=blocked` 与 `blocked_reason=computer_use_unavailable`，不得继续。
3. 不得只通过自然语言描述、shell 脚本、AppleScript、osascript、cliclick、xdotool 或类似方式声称已操作 ZCode。若 Computer Use 能读取并确认 ZCode 会话/输入框，但当前 runtime 不暴露直接粘贴/发送动作，必须自动使用已验证替代 UI 自动化通道：系统剪贴板写入 prompt，`osascript System Events` 聚焦/粘贴/发送，发送前后都用 Computer Use 校验状态。
4. 若出现会话漂移提示（如“user changed”“Re-query the latest state”），停止当前动作并先重走 verify/focus，再继续一次 set_clipboard/paste；仍失败才 `send_action=blocked`，`blocked_reason=clipboard_state_retry_failed`。
5. 必须在 send receipt 中记录 `computer_use.tool_invoked=true`、真实 `tool_invocation_evidence` 和动作序列。
6. transcript 中必须出现真实 computer-use tool event；否则不得填写 `tool_invoked=true`。
7. 2026-06-29 起，`computer_use_required_actions_unavailable` 不再是可接受的默认 blocker；若 ZCode 可验证但 Computer Use 缺少直接操作动作，应尝试已验证替代 UI 自动化通道，并在 receipt 的 `alternative_ui_automation` 中记录工具、授权来源或标准来源、前后校验证据。

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

必须完成的动作序列：

```text
verify_zcode_current_session
focus_chat_input
set_clipboard_to_prompt
paste_clipboard
verify_prompt_sentinel_in_input
send_prompt
```

## 8. 剪贴板与发送规则

不要让 Codex 逐字输入 prompt。必须：

1. 把完整 prompt 写入剪贴板（统一使用系统剪贴板通道，不得逐字符输入；默认视为有 pbcopy/clipboard 写入能力，无需重复征求“逐条授权”）。
2. 聚焦 ZCode 当前打开的聊天输入框。
3. 粘贴一次完整 prompt。
4. 如果出现会话漂移提示，先回到 1+2 重建上下文后，再执行一次 2+3，确认后再发。
5. 发送前校验输入框内能看到 sentinel 起止标记，或通过可用 UI 机制确认粘贴内容完整。
6. 发送动作记录为：
   - `send_action: "enter"`
   - `send_action: "send_button"`
   - `send_action: "blocked"`
7. 如果 blocked，必须记录 `blocked_reason`，不得进入实现等待或回收。

标准替代通道：

```text
Computer Use get_app_state 验证 ZCode 当前会话/输入框
pbcopy < zcode-prompt.md
osascript System Events 聚焦 AXTextArea，Cmd+A，Cmd+V
Computer Use get_app_state 验证 start/end sentinel
osascript System Events 按 Enter 或点击发送按钮
Computer Use get_app_state 确认消息进入会话并开始工作
```

该路径已经是本 repo 的 ZCode bridge 标准路径；只要前后 Computer Use 状态验证成立，就不得再要求用户为“缺少直接 computer-use 粘贴/发送动作”单独授权。

## 8.1 发送后的低频回收硬规则

ZCode prompt 发送成功后，Codex main 不得实时盯屏或用 Computer Use 高频读取 ZCode UI。GLM/ZCode 执行阶段的默认策略是低成本文件系统回收，而不是 UI 直播式观察。

硬规定：

1. UI 状态采样频率必须至少降低 50%。默认 `get_app_state` 最小间隔为 5 分钟；除非发送确认、疑似完成/阻断、diff 稳定、等待超时或需要提取最终 Result JSON，不得主动读取 ZCode UI。
2. 发送后优先读取 `handoff_manual.path`。若手册存在且 `status=completed|blocked`，main 可进入真实 diff/验证回收；若 `status=working` 或手册缺失/损坏，默认仍未结束，不得用 ZCode UI 聊天状态臆断完成。
3. 低成本命令用于辅助观察真实工作区：`git status --short`、`git diff --name-only`、`git diff --stat`。不要用大段 ZCode accessibility tree 代替文件系统事实。
4. 不要主动催促、追问或排队后续 prompt；GLM 系实现阶段必须等待其自然完成或明确 blocker。
5. 若需要等待，使用粗粒度等待窗口（默认 5 分钟以上）后再做一次 handoff manual + 文件系统回收；只有手册不可读且必须判断状态时，才读取一次 ZCode UI。
6. Completion Gate 仍以 Codex 回收的真实 diff、路径边界、validator、测试/构建和 QA 为准；ZCode 聊天状态只作为辅助线索。

## 8.2 Handoff Manual Contract

`handoff_manual.path` 是 ZCode 外部实现者与 Codex main 之间的本地状态手册，属于调度控制面文件，不属于业务 `allowed_paths`。

ZCode prompt 必须要求外部实现者按以下时机写入：

1. 接收 prompt 并开始执行时，创建或更新手册，置 `status=working`。
2. 完成代码修改和自检后，更新为 `status=completed`。
3. 无法继续执行时，更新为 `status=blocked`，并写明 blocker。

手册 JSON 最小结构：

```json
{
  "dispatch_run_id": "{dispatch_run_id}",
  "status": "working | completed | blocked",
  "updated_at": "ISO-8601 timestamp",
  "phase": "audit | editing | validation | final | blocked",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

Codex main 低频回收规则：

1. 先执行 `node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>`。
2. validator 输出 `terminal=false` 时继续等待，不读取 UI 追问。
3. validator 输出 `status=completed` 后，才进入 `git status`、`git diff`、路径边界、测试/构建和 QA 回收。
4. validator 输出 `status=blocked` 后，读取 blocker 并请求用户裁决或给同一 ZCode 会话追加修正 prompt。
5. 手册不存在或 JSON 损坏时，默认按“外部实现者未结束”处理；只有等待超时或需要排查工具状态时，才允许一次低频 UI 状态读取。

发送回执示例：

```json
{
  "dispatch_run_id": "example-zcode-001",
  "status": "sent",
  "application_verified": "ZCode",
  "current_session_verified": true,
  "input_box_verified": true,
  "clipboard_paste_used": true,
  "prompt_integrity_verified": true,
  "sentinel_start_seen_before_send": true,
  "sentinel_end_seen_before_send": true,
  "send_action": "enter",
  "codex_typed_prompt_manually": false,
  "computer_use": {
    "tool_invoked": true,
    "tool_family": "computer_use_or_ui_automation",
    "tool_invocation_evidence": {
      "actual_tool_invocation_required": true,
      "tool_target": "@ZCode",
      "tool_events_seen": true,
      "tool_event_count": 5,
      "transcript_event_refs": [
        "computer-use-event-1",
        "computer-use-event-2",
        "computer-use-event-3",
        "computer-use-event-4",
        "computer-use-event-5"
      ],
      "commands_issued": [
        "Verify ZCode current session",
        "Focus ZCode chat input",
        "Set clipboard to generated handoff prompt and paste",
        "Verify prompt sentinels in input",
        "Send prompt and confirm message appears"
      ]
    },
    "actions": [
      "verify_zcode_current_session",
      "focus_chat_input",
      "set_clipboard_to_prompt",
      "paste_clipboard",
      "verify_prompt_sentinel_in_input",
      "send_prompt"
    ],
    "clipboard_write_confirmed": true,
    "shell_only_ui_automation_used": false,
    "manual_typing_used": false
  }
}
```

## 9. 回收与完成判定

ZCode 聊天中出现“完成”“已修改”“测试通过”都不能直接判定完成。

Codex 必须先读取 `handoff_manual.path` 并按 `status` 分支：

- `working`：视为外部实现者仍在执行，继续低频等待。
- `completed`：进入真实工作区回收。
- `blocked`：读取 `blockers`，请求用户裁决或给同一 ZCode 会话追加修正 prompt。
- 手册缺失或损坏：默认未结束；等待超时或排障时才允许一次低频 UI 状态读取。

进入真实工作区回收后，Codex 必须重新执行：

1. `git status --short`
2. `git diff --stat`
3. `git diff -- <allowed_paths>`
4. forbidden paths 检查
5. dependency diff 检查
6. Contract 中的 test/typecheck/build 命令
7. UI / Figma / 小程序任务的必要 QA

Codex 生成 `zcode-recovery-result.json` 后再执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
```

完成标准：

- 有真实 diff，且只在 allowed_paths 内。
- handoff manual 经 validator 读取，且 `status=completed`。
- 没有 forbidden_paths 修改。
- 未新增未授权依赖/API/schema。
- 测试/构建/类型检查按 Contract 通过或有合理 not_applicable。
- Figma/UI 任务存在实现者直接获取 Figma 的证据声明，且 QA 独立 baseline 通过。
- main review 通过。

## 10. 失败处理

失败时只能：

1. 生成修正后的 ZCode prompt，粘贴到同一 ZCode 会话。
2. 输出 blocker 并请求用户裁决。
3. 经用户明确批准后切换 `implementation_mode=codex_subagent`。

禁止：

- main 自己动手改代码。
- 自动回退到 Codex generic agent。
- 自动回退到 `implementer_fast/deep` 而不告知用户。
- 把 ZCode 的完成声明当作测试结果。

## 11. 最小 ZCode Result JSON

ZCode prompt 应要求外部实现者最终写入 handoff manual，并在聊天里输出：

```text
<<<ZCODE_IMPLEMENTER_RESULT:{dispatch_run_id}:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "figma_fetch_evidence": {},
  "style_stack_compliance": {},
  "component_reuse_evidence": {},
  "uni_ui_mapping_evidence": {},
  "validation_claims": {},
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:{dispatch_run_id}:END>>>
```

该 JSON 只作为 Codex 回收线索。最终以 Codex 重新读取的 diff、测试、QA 和 Completion Gate 为准。
