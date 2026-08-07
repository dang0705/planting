# 简单触发示例

用户输入：

```text
用 ZCode 做这个任务：根据 ClickUp 任务 86xxxx 实现首页信息完整度和提醒按钮。
```

Dispatch 必须解析为：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode
external_contract.target_session = current_open_chat
external_contract.prompt_transport = clipboard_paste
external_contract.computer_use_required = true
external_contract.clipboard_bridge_required = true
external_contract.clipboard_bridge_evidence_required = true
external_contract.direct_input_injection_forbidden = true
external_contract.manual_typing_forbidden = true
external_contract.required_computer_use_actions = dynamic focus -> bridge -> Cmd+V -> verify -> Edit > Paste if needed -> verify -> send -> post-send verify
external_contract.zcode_clipboard_bridge_authorization = current explicit user authorization
```

用户输入：

```text
走 ZCode：根据这个 Figma 节点实现 UI：<figma_link>
```

Dispatch 必须进入 Gate B2 — ZCode External Implementer Bridge。

这些字段由 main 生成到 `external_contract`。bridge 先从 canonical prompt regular file 读取 UTF-8 正文，按 NSPasteboard → pbcopy 写入并逐次读回 SHA-256/bytes/lines；未验证就继续下一方法。main 随后用最新 ZCode app state 动态聚焦唯一输入区，先尝试 Cmd+V，未交付再用 Edit > Paste；发送前后都必须验证当前会话实际收到完整 prompt。任何失败只返回 blocked，不得自动回退 headless、新会话、手输或逐字输入。
