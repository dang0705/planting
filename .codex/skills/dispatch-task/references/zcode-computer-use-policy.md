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

## **prompt 必须一次性剪贴板粘贴；禁止逐字输入和一次性输入注入，这会导致多行内容拆成队列被发送**

## 持久用户授权（persistent_user_authorization）

用户可永久授权 ZCode 的 dispatch-task 实现 prompt 使用剪贴板桥接，无需每轮确认。该授权只适用于以下全部条件满足时：

1. `external_contract.provider=zcode`（或旧 `implementation_mode=zcode_external`）。
2. 已验证的 external-implementer handoff（`implementation_mode=external_implementer|zcode_external`）。
3. handoff 显式声明 `external_contract.zcode_clipboard_bridge_authorization`，其中 `mode=persistent_user_authorization`、`enabled=true`。
4. 一次性粘贴：仍必须从剪贴板一次性粘贴 prompt，禁止逐字输入。
5. Computer Use 核验：仍必须通过 Computer Use 核验前台应用（ZCode）、目标会话、输入框、START-END sentinel、发送结果。

持久授权不豁免任何 Computer Use 核验或安全控制。它只免除"用户在当前 turn 明确授权"这一要求，且仅覆盖 ZCode 的已验证 dispatch prompt 的一次性剪贴板桥接子路径（即 `alternative_ui_automation.used=true` 且 receipt 声明 `authorization_source=persistent_user_authorization` 的分支）。不覆盖任意替代自动化。

receipt 必须显式声明 `authorization_source`，取值为 `persistent_user_authorization` 或 `current_turn_user_authorization` 二选一；不接受 omitted 或未知 source。

- `authorization_source=persistent_user_authorization`：仅在持久授权 enabled 时可用；alternative 分支可缺少/false `user_authorized_in_current_turn`。
- `authorization_source=current_turn_user_authorization`：无论持久授权是否启用均可用；alternative 分支必须 `user_authorized_in_current_turn=true`。

持久授权 enabled 时仍可使用 current-turn source（用户当前 turn 明确授权更严格，必须保持可用）。persistent source 在授权 disabled 时必须失败。

### 迁移来源

在 `external_contract.zcode_clipboard_bridge_authorization` schema 字段正式落地前，同一授权可暂存于 `validation.zcode_clipboard_bridge_authorization`。`validate-zcode-send-receipt.mjs` 安全支持这一迁移来源：正式 `external_contract` 字段优先，`validation` 字段作为回退。

### 撤销

用户可明确撤销持久授权。撤销后，后续 dispatch-task 必须恢复每轮确认。handoff 中 `zcode_clipboard_bridge_authorization.enabled=false` 即视为已撤销。

## 替代 UI 自动化

默认禁止用 shell、AppleScript、osascript、cliclick、xdotool 或类似脚本伪装完成 UI 操作。

只有在以下条件全部满足时，才能使用替代 UI 自动化：

1. 用户在当前会话明确授权替代方案，或持久剪贴板桥接授权覆盖该剪贴板桥接子路径（`persistentAuthEnabled` 且 receipt `authorization_source=persistent_user_authorization`）。持久授权仅覆盖 ZCode 一次性剪贴板桥接，不覆盖任意替代自动化。
2. Computer Use 已确认前台应用、目标会话和输入框。
3. 仍然只从剪贴板一次性粘贴，不逐字输入。
4. 发送后仍由 Computer Use 确认消息进入会话。
5. send receipt 记录 `alternative_ui_automation.used=true` 与安全控制。authorization source 决定 `user_authorized_in_current_turn` 要求：`persistent_user_authorization` source（持久授权 enabled 时）可缺少/false；`current_turn_user_authorization` source 必须 `user_authorized_in_current_turn=true`。

不存在“dispatch 标准预授权”。没有用户当前明确授权（或有效的持久剪贴板桥接授权）时，工具不可用就必须 `blocked: computer_use_unavailable`。

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

### 持久授权 receipt 字段

当使用持久剪贴板桥接授权时，send receipt 可声明 `authorization_source=persistent_user_authorization`，无需 `user_authorized_in_current_turn=true`。validator 在 `provider=zcode` 且授权 `mode=persistent_user_authorization`、`enabled=true` 时接受此来源。
