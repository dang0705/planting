---
name: figma-layered-ui-contract
description: "共享 Figma UI 分层契约 skill：用于 ClickUp 或 dispatch 中明确涉及 Figma UI 开发/还原/QA 的任务；统一触发 Figma Design Facts、UI Scope、Implementation Packet、QA Acceptance Slice。"
---

# Figma Layered UI Contract Skill

## 1. 定位

本 skill 是 ClickUp 和 dispatch 共享的 Figma UI 分层入口。它不直接读取 ClickUp，不直接写代码，不直接测试。

它负责协调两类 skill：

1. `figma-ui-implementation-policy`：只读取 Figma MCP，产出 Figma 分层设计事实。
2. `ui-implementation-scope-policy`：基于 ClickUp / 用户硬约束与 Figma 分层事实，产出项目级 UI 实现范围切片。

## 2. 触发条件

仅在同时满足以下条件时触发：

1. 输入中存在 Figma URL / fileKey + nodeId / Figma Design Facts。
2. 任务明确涉及 UI 开发、页面实现、组件实现、视觉还原、Figma 对齐、UI QA 或小程序端 UI 验收。

不满足条件时，不触发本 skill，只记录“不触发原因”。

## 3. 已有分层数据时

如果上游已经提供以下完整数据，则不得重复读取 Figma 或重复调用分层 skill：

```text
Figma Layered Contract:
- Figma Design Facts Lite:
- Figma Implementation Slice:
- Figma Node Drilldown: none / partial / required
- UI Implementation Scope Map:
- Architecture Scope Slice:
- Implementation Packet:
- QA Acceptance Slice:
```

此时只做完整性校验：

1. 是否有 Lite。
2. 是否有 UI Implementation Scope Map。
3. 是否有 Architecture Scope Slice。
4. 是否有 Implementation Packet。
5. 是否有 QA Acceptance Slice。
6. 若复杂 component / symbol / instance 属于实现范围，是否有局部 Drilldown 或明确“不需要 Drilldown”的理由。

## 4. 缺少分层数据时

如果任务明确涉及 Figma UI 开发 / 还原 / QA，但只有人工压缩版 Figma 摘要、截图描述或普通链接，视为分层数据缺失。

必须执行：

```text
figma-ui-implementation-policy
→ 生成 Figma Design Facts Lite / Implementation Slice / 必要局部 Node Drilldown
→ ui-implementation-scope-policy
→ 生成 UI Implementation Scope Map / Architecture Scope Slice / Implementation Packet / QA Acceptance Slice
```

不得把人工压缩版 Figma 摘要当作 1:1 design contract。

## 5. 输出要求

必须输出：

```text
Figma Layered Contract:
- source:
  - figma_link:
  - from_clickup: true / false
  - from_dispatch_direct: true / false
- layer_status:
  - lite: present / generated / missing
  - implementation_slice: present / generated / not_needed / missing
  - node_drilldown: none / partial / required / missing
  - ui_scope_map: present / generated / missing
  - architecture_scope_slice: present / generated / missing
  - implementation_packet: present / generated / missing
  - qa_acceptance_slice: present / generated / missing
- missing_layers:
- blocking_reason:
- allowed_to_dispatch: true / false
```

## 6. 禁止事项

1. 禁止在明确 Figma UI 开发任务中只传人工压缩版 Figma 摘要。
2. 禁止把完整 Figma Drilldown 广播给所有 agent。
3. 禁止在上游已有完整分层数据时重复读取同一 Figma link。
4. 禁止将 QA Acceptance Slice 省略后让 QA 只读 Lite。
5. 禁止把 Figma component 自动等同为必须手搓组件。
