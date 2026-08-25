# ZCode Routing Policy

仅当 `external_contract.provider=zcode` 时读取。公共 prompt、handoff manual、recovery、main review、QA 与 Completion Gate 仍由 external implementer 合同负责。

## 正式路由

新任务固定：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode
external_contract.target_session = current_open_chat
external_contract.prompt_transport = clipboard_paste
```

还必须声明 Computer Use、真实 tool invocation/action trace、input check、send action、clipboard bridge/evidence、direct-input/manual-typing/shell-only 禁令、required actions、post-send policy 与显式 clipboard authorization。正式路由不自动触发 `zcode-headless-bridge.mjs`；历史 headless 文件只可解释旧记录。

## Canonical clipboard bridge

handoff、prompt、bridge evidence 与 send receipt 必须直接位于仓库 `.tmp/dispatch-task/`，文件名包含同一 `dispatch_run_id`。handoff/prompt 必须是真实 regular file，不能是 symlink；evidence 目标不存在时可原子创建，已存在时也必须是真实 regular file。

bridge 在任何 writer 前运行正式 validator：

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-zcode-prompt.mjs <handoff.json> <prompt.md>
```

调用：

```bash
node .codex/skills/dispatch-task/scripts/zcode-clipboard-bridge.mjs \
  --handoff .tmp/dispatch-task/<dispatch_run_id>-handoff.json \
  --prompt .tmp/dispatch-task/<dispatch_run_id>-prompt.md \
  --evidence .tmp/dispatch-task/<dispatch_run_id>-clipboard-bridge-evidence.json
```

bridge 从 canonical regular file 读取非空 UTF-8 正文，依次尝试：

1. macOS NSPasteboard；
2. `/usr/bin/pbcopy`。

每次写入后使用对应本机读取通道获取 bytes，比较 SHA-256、UTF-8 bytes 与 lines。写入失败、读取失败或 mismatch 都继续下一方法；首次完整匹配立即停止。全部失败返回 `blocked`。每个本机子进程有 5 秒硬超时；prompt 通过 stdin 或 canonical file 读取，正文不进入 argv。

bridge evidence 闭集为：`dispatch_run_id`、`status=prepared|blocked`、`prompt_identity`、`write_attempts`、`selected_method`、`readback_verified`、`created_at`、`verified_at`。不得保存 prompt、旧剪贴板、credential、stderr/stdout 或其他敏感正文。

## Visible delivery

bridge 只准备并验证剪贴板，不操作 ZCode。main 按 [zcode-computer-use-policy.md](./zcode-computer-use-policy.md) 执行：

```text
verify current ZCode chat
-> latest app state: locate unique entry area
-> focus and verify focused element
-> prepared clipboard bridge
-> Cmd+V
-> latest app state: verify visible delivery (attachment line count may be used)
-> verify direct text identity or pasted-text attachment visible line count
-> click send
-> latest app state: verify current-chat delivery
```

任一层未通过时不得点击发送。Cmd+V 无可见交付时直接 blocked；不得自动回退到 Edit 菜单、headless、新会话、手输、逐字输入、credential 注入或其他应用。

## Send receipt

新 receipt 使用 `zcode_visible_clipboard`，包含：

- canonical `prompt_identity={path,sha256,bytes,lines,verified_before_after}`；
- clipboard write attempts、selected method、readback verification；
- dynamic focus evidence，并固定 `element_index_persisted=false`；
- paste attempt、selected method 与 `direct_text|pasted_text_attachment` 分支证据；只记录 Cmd+V；
- send click、input submitted、conversation state change 与 post-send delivery；
- redaction 和单调时间证据。

`status=sent` 只有在 clipboard、focus、paste、prompt identity 和 post-send delivery 全部验证后成立。blocked receipt 使用闭集 blocker，不得声称 transport sent 或 conversation delivered。

校验：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
```

provider 收到 prompt 只触发 recovery，不代表 dispatch 完成。main 仍须读取 handoff manual、真实 git status/diff，完成独立 review、所需 QA 与 Completion Gate。
