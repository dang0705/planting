# 简单触发示例

用户输入：

```text
用 ZCode 做这个任务：根据 ClickUp 任务 86xxxx 实现首页信息完整度和提醒按钮。
```

Dispatch 必须解析为：

```text
implementation_mode = zcode_external
external_implementer = zcode_glm
zcode_target = current_open_chat
```

用户输入：

```text
走 ZCode：根据这个 Figma 节点实现 UI：<figma_link>
```

Dispatch 必须进入 Gate B2 — ZCode External Implementer Bridge。

不得要求用户额外输入：

```text
codex_self_implementation_forbidden=true
computer_use_required=true
actual_tool_invocation_required=true
```

这些由 `dispatch-task` 自动生成到 `zcode_contract`。
