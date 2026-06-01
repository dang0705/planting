---
name: implementer-ui-execution-policy
description: "implementer 专用 UI 执行规则：只消费 Implementation Packet 与 Figma Drilldown Request；drilldown_required=yes 时必须显式调用 Figma MCP，MCP 不可用则停止，不得猜测。"
---

# Implementer UI Execution Policy

## 1. 定位

本 skill 只给 `implementer_fast` / `implementer_deep` 使用。

它不负责生成 Figma Design Facts，不负责 UI 范围裁决，不负责 QA 验收。  
它只负责把 main agent 已生成的 `Implementation Packet` 和 `Figma Drilldown Request` 落成代码实现。

---

## 2. 输入

implementer 默认读取：

```text
Implementation Packet
Figma Design Facts Lite
Figma Drilldown Request
allowed_paths
forbidden_paths
Implementation Contract
Test Contract 中需要补测试代码的部分
```

不得自行读取完整 ClickUp、完整 Figma、完整规则目录或完整 QA packet。

---

## 3. Figma Drilldown Request 是显式工具动作

如果 packet 中存在：

```text
Figma Drilldown Request:
- drilldown_required: yes
```

则 implementer 必须尝试使用 Figma MCP 获取指定 node 的 Drilldown。

必须遵守：

```text
Figma Drilldown Execution:
- tool_required: Figma MCP
- target_node_id:
- target_node_name:
- max_depth:
- sample_limit:
- expected_output: implementation-relevant details only
- no_guessing_allowed: true
```

## 4. MCP 不可用时的处理

以下任一情况发生，必须停止实现并回报 blocker：

1. Figma MCP 不可用。
2. 没有权限读取 Figma。
3. node_id 无效。
4. 返回内容不足以实现 1:1。
5. drilldown_required=yes 但 packet 缺少 target_node_id / max_depth / sample_limit。

输出：

```text
Figma Drilldown Blocker:
- reason:
- target_node_id:
- missing_or_failed_tool:
- required_next_action:
```

不得在缺少 Drilldown 的情况下猜测复杂 UI。

---

## 5. Drilldown 读取范围

实现阶段读取 Drilldown 必须限制：

1. 只读指定 node / frame / component。
2. 只读指定 max_depth。
3. 重复结构只保留 1-2 个样本。
4. 只提取实现必要字段。
5. 不读取整份 Figma 文件。
6. 不把完整 Drilldown 写入 handoff、QA packet 或文档。

---

## 6. 代码实现规则

1. 优先按 Implementation Packet 中的复用 / wrapper / adapter / 插件 / 原生能力 / 手搓裁决执行。
2. 不得重新做技术方向裁决。
3. 不得自行改变 allowed_paths / forbidden_paths。
4. 如发现 Contract 不可执行，停止并请求 main agent 修订。
5. 复杂组件必须拆模块，避免单文件膨胀。
6. 只把 QA 需要的实现映射摘要输出给 QA，不输出完整 Drilldown。

---

## 7. 输出

```text
UI Implementation Result:
- used_skill: implementer-ui-execution-policy
- figma_drilldown_required: yes / no
- figma_drilldown_read: yes / no
- figma_mcp_status: success / failed / not_needed
- implemented_files:
- reused_components:
- handcoded_components:
- module_split:
- deviations_from_packet:
- qa_implementation_summary:
- blockers:
```


## v54 显式触发规则

本 skill 禁止隐式触发；该策略由同目录下 `agents/openai.yaml` 定义。只有当 `dispatch-task` 的 `role_context_packet` 明确写入：

```text
required_skill: $implementer-ui-execution-policy
```

时，才允许读取和执行本 skill。

非 UI / 非 Figma 任务不得读取本 skill。
