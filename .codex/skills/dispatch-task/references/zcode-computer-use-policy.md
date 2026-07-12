# ZCode Computer Use Policy

仅当 `external_contract.provider=zcode` 或旧 `implementation_mode=zcode_external`，且需要 Codex main 操作 ZCode UI 时读取。本文定义 ZCode provider adapter 的 UI/Computer Use 协议。

## 必须真实调用工具

ZCode bridge 不是“生成 prompt 让用户复制”。Codex main 必须通过 `@ZCode` 或 `@Computer` 真实完成：聚焦 ZCode、定位输入框、剪贴板粘贴 prompt、验证 sentinel、发送消息。

不得只在 JSON 中写 `tool_invoked=true`。send receipt 必须引用真实 tool event / transcript step。

## 固定动作序列

```text
verify_zcode_current_session
focus_chat_input
set_clipboard_to_prompt
paste_clipboard
verify_prompt_sentinel_in_input
send_prompt
```

prompt 必须一次性剪贴板粘贴；禁止逐字输入。

## 替代 UI 自动化

默认禁止用 shell、AppleScript、osascript、cliclick、xdotool 或类似脚本伪装完成 UI 操作。

只有在以下条件全部满足时，才能使用替代 UI 自动化：

1. 用户在当前会话明确授权替代方案。
2. Computer Use 已确认前台应用、目标会话和输入框。
3. 仍然只从剪贴板一次性粘贴，不逐字输入。
4. 发送后仍由 Computer Use 确认消息进入会话。
5. send receipt 记录 `alternative_ui_automation.used=true`、`user_authorized_in_current_turn=true` 与安全控制。

不存在“dispatch 标准预授权”。没有用户当前明确授权时，工具不可用就必须 `blocked: computer_use_unavailable`。

## 发送后低频回收

发送成功且确认 ZCode 已收到 prompt 后，必须断开持续 UI 监视。

前 30 分钟只允许每 5 分钟检查：

```text
handoff_manual
scoped_git_status
scoped_git_diff_name_only
scoped_git_diff_stat
```

30 分钟后才允许低频查看 ZCode UI，且间隔不得短于 10 分钟。禁止盯屏、保活 UI 观察或连续读取 app state。

## Send Receipt 校验

发送后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
```

核心字段：

```json
{
  "status": "sent | blocked",
  "send_action": "enter | send_button | blocked",
  "clipboard_paste_used": true,
  "prompt_integrity_verified": true,
  "computer_use": {
    "tool_invoked": true,
    "actions": [
      "verify_zcode_current_session",
      "focus_chat_input",
      "set_clipboard_to_prompt",
      "paste_clipboard",
      "verify_prompt_sentinel_in_input",
      "send_prompt"
    ],
    "manual_typing_used": false,
    "shell_only_ui_automation_used": false
  }
}
```
