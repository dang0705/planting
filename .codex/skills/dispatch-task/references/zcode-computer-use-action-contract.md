# ZCode Computer Use Action Contract

本文件只在 `implementation_mode=zcode_external` 时启用。它定义 **Codex main 如何真正操作 ZCode 应用**，不是给 ZCode/GLM 的实现 prompt。


## 0. 实际工具调用命令层（必须出现）

本文件中的 JSON 字段只是校验回执，不等于执行。`implementation_mode=zcode_external` 进入发送阶段时，Codex main 必须在当前 Codex 运行时中发起真实的 computer-use tool invocation。

当前官方入口是通过在任务中点名 `@Computer` 或 `@AppName` 启动 computer use；因此本流程要求使用以下二选一目标：

- `@ZCode`：如果 Codex 已识别并允许 ZCode 作为应用目标，优先使用。
- `@Computer`：通用 computer-use 目标，要求其切换/聚焦 ZCode。

必须出现的工具调用命令形态如下。注意：这些不是写入 `zcode-send-receipt.json` 的描述，而是 Codex main 在执行阶段必须真实发起的 computer-use 指令。

```text
COMPUTER_USE_CALL 1 target=@ZCode|@Computer
command: Verify the foreground app is ZCode and the current open chat is the intended ZCode implementer session. Take a screenshot or inspect the app title/input area. Do not type code.

COMPUTER_USE_CALL 2 target=@ZCode|@Computer
command: Focus the current ZCode chat input. Confirm the input box is active and empty or safe to replace. Do not send anything.

COMPUTER_USE_CALL 3 target=@ZCode|@Computer
command: Put the exact generated ZCode handoff prompt into the system clipboard, paste it into the active ZCode chat input in one clipboard paste operation, and do not manually type the prompt character by character.

COMPUTER_USE_CALL 4 target=@ZCode|@Computer
command: Before sending, verify the input box contains both sentinel strings: <<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START>>> and <<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:END>>>. If either sentinel is missing, block and do not send.

COMPUTER_USE_CALL 5 target=@ZCode|@Computer
command: Send the prompt using Enter or the visible send button, then confirm the message is present in the ZCode conversation. Return the actual send action used: enter, send_button, or blocked.
```

硬性判断：

1. 只生成上述命令文本，不实际调用 `@Computer` / `@ZCode`，视为失败。
2. 只在 receipt 里写 `tool_invoked=true`，但 transcript 中没有 computer-use tool event，视为失败。
3. `tool_invocation_evidence.tool_events_seen` 必须来自真实工具调用后的 transcript / event id / step id，不得由模型凭空填写。
4. 如果当前 Codex 形态没有 computer-use 工具目标，必须 `send_action=blocked`，不得改用 main agent 写代码。
5. 如果 Computer Use 能验证 ZCode 会话/输入框，但当前工具不暴露剪贴板粘贴或发送动作，必须自动进入“已验证替代 UI 自动化通道”：使用系统剪贴板（如 `pbcopy`）写入 prompt，用 macOS UI 自动化（如 `osascript System Events`）聚焦、粘贴、发送，再用 Computer Use 读取状态校验 sentinel 和发送结果；不得再以“缺少 computer-use 粘贴/发送动作”为理由要求用户重复授权。

## 1. 核心原则

ZCode 外部实现者桥接不是“生成一段 prompt 让用户自己复制”。Codex main 必须通过当前运行环境可用的 **computer-use / UI automation 工具族**完成应用操作。

强制边界：

1. 必须调用 computer-use / UI automation 工具聚焦 ZCode、定位输入框、粘贴 prompt、校验 sentinel、发送消息。
2. 不得只输出“请复制到 ZCode”或“按 Enter”。
3. 不得逐字键入长 prompt。
4. 若遇到会话/窗口漂移提示（如“user changed”“Re-query the latest state”），必须先回到步骤 1 与 2，重建前台会话与输入框上下文，再继续。
5. 不得仅用 shell、AppleScript、osascript、cliclick、xdotool 或类似脚本伪装完成 UI 操作。已验证替代 UI 自动化通道必须先由 Computer Use 读取并确认 ZCode 会话/输入框，随后才能用系统剪贴板与 OS UI 自动化完成粘贴发送，并在发送后再由 Computer Use 确认消息进入会话。
6. 当前 Codex 运行时没有 computer-use / UI automation 工具时，必须阻断：`blocked_reason=computer_use_unavailable`。若只有 Computer Use 动作能力不足，但已能读取 ZCode 状态，不得直接阻断，必须先走已验证替代 UI 自动化通道。
7. 若实现者模型为 GLM 且受 AGENTS 约束（规则 2.18）禁止截图，可在 zcode recovery result 里用 `screenshot_policy_skip` 例外跳过 `get_screenshot`，并带出 `policy_ref`。
8. 发送成功不代表实现完成；仍必须回收真实 git diff、测试、QA 和 Completion Gate。
9. 发送成功后不得实时盯屏。ZCode/GLM 执行阶段的 Computer Use UI 状态采样频率必须至少降低 50%，默认间隔不短于 5 分钟；优先读取 `handoff_manual.path` 判断外部实现者是否结束，再用 `git status --short`、`git diff --name-only`、`git diff --stat` 做低成本回收。只有手册缺失/损坏、等待超时或排障需要时才读取 ZCode UI。

## 2. Handoff 必填字段

`zcode_contract` 必须包含：

```json
{
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
  ]
}
```

字段含义：

| 字段 | 含义 |
|---|---|
| `computer_use_required` | 该阶段必须真实操作桌面应用。 |
| `actual_tool_invocation_required` | 必须发起真实 computer-use tool invocation，不得只写 JSON。 |
| `allowed_tool_targets` | 允许的实际工具目标，优先 `@ZCode`，其次 `@Computer`。 |
| `minimum_tool_event_count` | 发送前后至少应出现的 computer-use tool event 数量。 |
| `computer_use_tool_invocation_required` | 必须在工具 trace 中出现 computer-use / UI automation 调用。 |
| `computer_use_action_trace_required` | send receipt 必须记录动作序列。 |
| `clipboard_write_via_computer_use_required` | prompt 必须进入剪贴板后一次性粘贴。 |
| `manual_typing_forbidden` | 禁止逐字输入长 prompt。 |
| `shell_only_ui_automation_forbidden` | 禁止只靠 shell 脚本声称完成 ZCode 操作。 |
| `required_computer_use_actions` | 必须完成的动作序列。 |

## 3. Computer Use 动作序列

Codex main 必须按以下顺序执行或确认：

1. `verify_zcode_current_session`
   - 确认当前前台应用为 ZCode，或通过 computer-use 切换到 ZCode。
   - 确认当前打开的是目标聊天会话。

2. `focus_chat_input`
   - 聚焦 ZCode 当前聊天输入框。
   - 若无法确认输入框，停止并生成 blocked receipt。

3. `set_clipboard_to_prompt`
   - 将完整 ZCode handoff prompt 写入剪贴板。
   - 默认通过系统剪贴板通道写入（含 pbcopy/应用内 clipboard），不允许逐字键入；不需要每次额外申请用户授权。
   - prompt 必须包含 start/end sentinel。
   - 若该步回执提示会话漂移，必须放弃旧状态重试，不允许重复落旧 `element_index`。

4. `paste_clipboard`
   - 优先使用 computer-use 触发粘贴动作。
   - 如果当前 computer-use 只支持读取状态、不能触发粘贴动作，使用已验证替代 UI 自动化通道：`pbcopy` 写入剪贴板，`osascript System Events` 聚焦 ZCode 输入框并执行一次 `Cmd+V`。
   - 不允许逐字输入。

5. `verify_prompt_sentinel_in_input`
   - 发送前确认输入框内容包含：
     - `<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START>>>`
     - `<<<ZCODE_IMPLEMENTER_HANDOFF:{dispatch_run_id}:END>>>`
   - 若无法确认 sentinel，必须清理/阻断，不得发送。

6. `send_prompt`
   - 发送方式只允许：
     - `send_action=enter`
     - `send_action=send_button`
     - `send_action=blocked`
   - 具体选择取决于 ZCode 当前 UI。
   - 如果辅助功能无法按名称按下发送按钮，但 Computer Use 已确认 sentinel 完整且输入框聚焦，允许通过 `Enter` 发送；发送后必须再次读取 ZCode 状态，确认输入框清空、消息出现在会话中，或出现“工作中”等实现者状态。

## 4. Send Receipt 必填字段

发送后必须生成 `zcode-send-receipt.json`：

```json
{
  "dispatch_run_id": "example-zcode-ui-001",
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
      "transcript_event_refs": ["computer-use-event-1", "computer-use-event-2", "computer-use-event-3", "computer-use-event-4", "computer-use-event-5"],
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
  },
  "alternative_ui_automation": {
    "used": true,
    "reason": "Computer Use verified ZCode state but direct paste/send actions were unavailable in the current runtime.",
    "tools": ["pbcopy", "osascript System Events"],
    "safety_controls": [
      "Computer Use verified ZCode app/session/input before paste",
      "Prompt was pasted once from system clipboard; no manual prompt typing",
      "Computer Use verified both sentinel strings before send",
      "Computer Use confirmed the message appeared in the ZCode conversation"
    ]
  }
}
```

如果阻断：

```json
{
  "dispatch_run_id": "example-zcode-ui-001",
  "status": "blocked",
  "send_action": "blocked",
  "blocked_reason": "computer_use_unavailable",
  "no_code_changes_by_codex": true,
  "computer_use": {
    "tool_invoked": false,
    "tool_invocation_evidence": {
      "actual_tool_invocation_required": true,
      "tool_events_seen": false,
      "tool_event_count": 0,
      "transcript_event_refs": [],
      "commands_issued": []
    },
    "actions": [],
    "shell_only_ui_automation_used": false,
    "manual_typing_used": false
  }
}
```

## 5. Hard Stops

以下任一情况必须停止，不得继续到 ZCode 实现等待阶段：

1. 没有 computer-use / UI automation 工具可调用。
2. 无法验证当前应用为 ZCode。
3. 无法验证当前会话或输入框。
4. 无法写入或粘贴剪贴板内容。
5. 输入框中看不到完整 start/end sentinel。
6. `send_action` 不是 `enter/send_button/blocked`。
7. receipt 缺 `computer_use.tool_invoked=true`、缺动作 trace，或缺 `tool_invocation_evidence.tool_events_seen=true`。
8. 使用 shell-only UI 自动化替代 computer-use，且没有 Computer Use 前后状态验证。
9. 收到会话漂移提示后仅允许一次完整重试（verify→focus→paste）；再次失败只能 `send_action=blocked`，`blocked_reason=clipboard_state_retry_failed`。
10. Computer Use 已能验证 ZCode 会话但缺少直接粘贴/发送动作时，不得使用 `blocked_reason=computer_use_required_actions_unavailable` 结束；必须先尝试已验证替代 UI 自动化通道。只有替代通道自身不可用或校验失败时，才允许用具体 blocker（如 `alternative_ui_automation_unavailable`、`sentinel_verification_failed`）停止。
