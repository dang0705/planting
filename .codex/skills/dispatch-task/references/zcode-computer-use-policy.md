# ZCode Computer Use Policy

仅用于 `external_contract.provider=zcode`、`target_session=current_open_chat`、`prompt_transport=clipboard_paste`。本文件定义可见 ZCode 会话的交付步骤；实现者不执行 UI 验收，真实 ZCode 操作由 main 按已授权范围完成。

## 授权边界

handoff 必须声明 `zcode_clipboard_bridge_authorization.enabled=true`，mode 仅允许 `current_turn_explicit` 或 `persistent_user_authorization`。授权只覆盖：

- macOS NSPasteboard；
- `/usr/bin/pbcopy` 与 `/usr/bin/pbpaste`；
- Computer Use 在 ZCode 中执行 Cmd+V；
- ZCode `Edit > Paste`；
- 在完整性验证后点击发送并读取最新 app state 验证当前会话交付。

不得修改系统安全设置、ZCode.app、`~/.zcode`、credential 或其他应用。不得保存旧剪贴板正文，也不得把 prompt 正文写入 receipt。

## 固定交付顺序

1. 验证当前前台应用是 ZCode，目标是已存在的 `current_open_chat`。
2. 读取最新 app state，动态定位唯一 entry area。
3. 点击该 entry area，再读取最新 app state，确认 focused UI element 正是它。
4. 运行 `zcode-clipboard-bridge.mjs`。只有 bridge evidence 为 `prepared`，且 SHA-256、bytes、lines 读回一致，才继续。
5. 在已聚焦的 entry area 执行系统 Cmd+V。
6. 读取最新 app state，验证 `direct_text` 或 `pasted_text_attachment` 已完整交付。
7. 若 Cmd+V 未交付，重新读取 app state，打开 ZCode Edit 菜单并点击 Paste，再读取 app state验证。
8. 只有发送前完整性通过，才点击发送。
9. 读取发送后的最新 app state，证明输入已提交、会话状态发生变化、消息或同一附件进入当前会话。
10. 记录 `sent` 后断开 Computer Use；后续 recovery 遵循 external implementer 公共合同。

每次 app state 后取得的 element index 只在该 state 内有效。禁止跨 state 复用或把 index 写入 receipt。任一路径成功后立即停止 fallback；两种 paste 方法都失败则 blocked，不得进入 headless、新会话、手输或逐字输入。

## 交付分支

### direct_text

必须从 entry area 的最新可观察文本计算 SHA-256、UTF-8 bytes 与 lines，并与 canonical prompt identity 完全相等。仅看到 START/END sentinel 不足以证明完整。

### pasted_text_attachment

必须记录 bridge 的 canonical SHA-256，并观察附件名称、bytes/大小和 lines；attachment 的 SHA-256/bytes/lines 必须与 prompt identity 一致。发送前附件存在，发送后同一附件仍在当前会话消息中。sentinel 不要求可见，也不得伪造其可见性。

## Receipt

`status=sent` 必须同时满足：

- `clipboard.readback_verified=true`；
- `input_focus` 的最新 state、唯一 entry area、点击和 focused element 全部验证；
- `paste_delivery.pre_send_verified=true`，attempt 顺序为 Cmd+V 后必要时 Edit > Paste；
- `prompt_identity.verified_before_after=true`；
- `send_delivery` 的 send click、input submitted、conversation state changed、conversation delivery 全部验证；
- 时间证据单调，`sent_at` 在发送后验证之后。

receipt 只保存 canonical path、hash、bytes、lines、方法、布尔验证和时间；不得保存 prompt、旧剪贴板、credential、原始 UI dump 或 element index。
