---
name: implementer-ui-execution-policy
description: "implementer 专用：在首次 UI 编辑前直接读取目标 Figma 节点，并按项目 UI 栈完成实现和证据回传。"
---

# Implementer Figma UI Execution

## 前置

Handoff 必须含原始 `figma.link/node_id`、Project Constraints、allowed/forbidden paths 和 acceptance。缺少 styling system、SCSS policy、component library 或 rule refs，立即 blocked。

## Direct Acquisition

在首次 UI 编辑前，implementer 必须亲自调用：

1. `get_metadata`：确认目标节点与必要子节点。
2. `get_design_context`：读取目标根节点；过大时按 metadata 分片到实现相关子节点。
3. `get_screenshot`：取得 reference screenshot。
4. `get_variable_defs`：仅在 token 映射确有需要时。
5. 使用 MCP 返回的必要 assets；不得用占位资产替代可用资产。

只读目标 node/frame/component，禁止整文件读取。Figma 不可用、node 无效或上下文不足时返回 blocker，不得依赖 main Lite、文字转述或模型习惯猜 UI。

Acquisition 完成后读取 `$ui-implementation-scope-policy`，基于直接设计事实与代码搜索生成最小 `ui_scope_map`。

## 项目规则

- 独立核对 `project_constraints.rule_refs`、最近 AGENTS.md、Tailwind 配置与组件入口。
- 先搜索现有组件/utility/composable，再决定新建。
- Tailwind 项目用 utility/token；除 Contract 明确例外外，禁止新增 `.scss`、`<style lang="scss">` 或大段 scoped style。
- 复用顺序由 `$ui-implementation-scope-policy` 决定；无法同时满足设计与工程约束时返回 deviation/blocker，不静默降级。

## Evidence

完成结果必须包含：

```json
{
  "figma_fetch_evidence": {
    "status": "success",
    "acquired_by": "implementer",
    "acquired_before_first_ui_edit": true,
    "source_link": "",
    "node_id": "",
    "calls": ["get_metadata", "get_design_context", "get_screenshot"],
    "nodes_read": [],
    "screenshot_ref": "",
    "variables_or_assets_used": [],
    "unresolved": []
  }
}
```

并回传 `ui_scope_map / style_stack_compliance / component_reuse_evidence / validation_evidence`。自检不替代 QA。
