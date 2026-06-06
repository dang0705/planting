---
name: figma-ui-implementation-policy
description: "纯 Figma 读取与设计事实提取规范：调用方已确认需要读取 Figma 时使用；只产出 Figma Design Facts，不判断 ClickUp 触发条件，也不包含代码复用、插件、手搓或 QA 执行策略。"
---

# Figma UI Design Facts Policy

## 1. 定位

本 skill 只定义如何通过 Figma MCP 读取 Figma 设计，并产出结构化设计事实 `Figma Design Facts`。

本 skill 不负责判断“是否应该读取 Figma”。是否需要读取 Figma、是否与 ClickUp ticket 有关、是否属于 UI 开发范围，必须由调用方决定，例如 `clickup-task-dispatch`、main agent 或其他上游 skill。

本 skill 不定义：

1. ClickUp 触发条件。
2. 是否复用代码组件。
3. 是否手搓组件。
4. 是否使用 uni-app 插件。
5. placeholder 是否开发。
6. implementer 如何写代码。
7. qa_reviewer 如何执行测试。
8. 项目目录搜索规则。

这些项目级实现决策由 `ui-implementation-scope-policy` 负责。

---

## 2. 调用前置条件

调用本 skill 前，上游调用方必须已经完成触发判断，并传入明确的 Figma 读取目标。

最小输入应包含：

1. Figma URL，或 `fileKey + nodeId`。
2. 本轮需要读取的 node / frame / component 范围。
3. 读取目的：实现参考 / UI 还原 / QA 基准 / 组件识别 / 变量提取 / 截图基准。
4. 是否需要 screenshot、design context、variables、Code Connect 相关信息。

如果缺少 Figma URL 或 `fileKey + nodeId`，本 skill 只回报缺少输入，不尝试猜测。

---

## 3. Figma MCP 读取范围

读取 Figma 时必须优先限定 node / frame / component 范围，不得默认读取整份 Figma 文件。

优先调用顺序：

1. `get_metadata`：确认节点类型、名称、层级、尺寸、位置。
2. `get_design_context`：在需要实现或视觉对齐时获取设计上下文、截图和上下文元数据。
3. `get_variable_defs`：在需要颜色、字号、spacing、变量或 token 对齐时调用。
4. `get_screenshot`：在 QA 或视觉对齐需要基准图时调用。
5. `get_code_connect_map` / `get_code_connect_suggestions`：仅用于判断 Figma 节点是否已有 Code Connect 信息；不在本 skill 中做代码实现决策。

如果 `get_metadata` 返回的信息不足以支持实现或 QA，且本轮目标确实是实现 / UI 对齐 / QA 基准，必须继续读取 `get_design_context` 或 `get_screenshot`；不得把 metadata 当成完整设计事实。

---

## 4. 节点类型事实

必须记录 MCP 返回的原始节点类型，例如：

- `component`
- `symbol`
- `instance`
- `component_set`
- `frame`
- `group`
- `text`
- `vector`
- `unknown`

若 MCP 返回 `symbol`，可记录为“Figma 组件强信号”，但本 skill 不判断其代码实现方式。

---

## 5. Figma Design Facts 输出

读取成功后必须产出：

```text
Figma Design Facts:
- figma_link:
- file_key:
- node_id:
- node_name:
- figma_node_type:
- figma_component_signal: none / weak / strong
- parent_frame / page:
- dimensions:
  - width:
  - height:
  - x:
  - y:
- layout:
  - auto_layout:
  - direction:
  - alignment:
  - padding:
  - gap:
  - constraints:
- text:
  - visible_text:
  - font_family:
  - font_size:
  - font_weight:
  - line_height:
  - color:
- colors:
  - fills:
  - strokes:
  - effects:
- spacing:
  - margin_like:
  - padding_like:
  - item_gap:
- states:
  - default:
  - hover / active / disabled / selected / loading / empty / error:
- assets:
  - images:
  - icons:
  - masks:
- variables / tokens:
- interactions:
- screenshots:
  - reference_screenshot:
  - max_dimension:
- code_connect:
  - has_mapping:
  - mapped_component:
  - mapping_source:
- unknown_or_unread:
- notes:
```

---

## 6. 防重复读取

Figma MCP 读取结果不得只停留在本 skill 的临时上下文中。读取成功后，必须把 `Figma Design Facts` 放入最终 plan conclusion 或 handoff。

防重复读取规则：

1. 如果 plan conclusion 已包含完整 `Figma Design Facts`，后续 agent 默认不得重新读取同一个 Figma link。
2. 后续 agent 必须优先使用 `Figma Design Facts` 作为设计事实源。
3. 只有摘要缺失、冲突、需要更高分辨率截图、QA 缺少基准节点，或用户 / main agent 明确要求时，才允许回查 Figma MCP。
4. 回查时必须说明原因，并只读取相关 node / frame，不得重新读取整份 Figma 文件。
5. 不得把“可能有 MCP 缓存”当作默认重复读取的理由；缓存只能视为性能优化，不能作为工作流前提。

---


## 8. 三层输出与 token 预算规则

本 skill 的默认输出必须采用三层策略，禁止默认输出完整复杂节点树。

### 8.1 默认输出：Figma Design Facts Lite

默认必须输出。Lite 层只描述根节点和关键 UI 分区，用于让所有相关 agent 理解“这是什么设计”，不得展开完整嵌套结构。

```text
Figma Design Facts Lite:
- figma_link:
- file_key:
- root_node_id:
- root_node_name:
- root_node_type:
- root_component_signal: none / weak / strong
- size:
- primary_structure:
  - section:
    - node_id:
    - name:
    - role_guess:
    - key_text:
    - size_or_position:
- visual_summary:
- key_tokens:
- component_signals:
- unknown_or_needs_slice:
- unknown_or_needs_drilldown:
```

### 8.2 按需输出：Figma Implementation Slice

仅当任务明确涉及 UI 实现 / UI 还原 / UI QA 时输出。Slice 层只保留实现相关节点，不展开所有容器、装饰层、隐藏层或重复项。

```text
Figma Implementation Slice:
- root:
  - node_id:
  - name:
  - type:
  - role_guess:
- implementation_relevant_sections:
  - node_id:
  - name:
  - role_guess:
  - required_for_implementation: true / false
  - reason:
  - key_visual_props:
  - key_text:
  - key_interactions:
- component_signals:
  - node_id:
  - name:
  - figma_node_type:
  - component_signal: none / weak / strong
  - needs_code_search: false / true
- repeated_structure_candidates:
  - name:
  - reason:
  - sample_nodes:
- state_candidates:
  - state_name:
  - node_id:
  - visual_difference:
- asset_nodes:
- qa_critical_nodes:
- needs_drilldown:
  - node_id:
  - reason:
```

### 8.3 极少数情况：Figma Node Drilldown

只有以下情况才允许输出局部 Drilldown：Implementation Slice 不足以实现、节点是复杂 component / symbol / instance 且属于实现范围、存在重复结构或状态变体、QA 对齐失败、main agent 需要判断拆模块 / 组件复用冲突、用户或 main agent 明确要求。

Drilldown 必须限定目标节点，不得默认展开整棵树。

```text
Figma Node Drilldown:
- drilldown_reason:
- target_node_id:
- target_node_name:
- max_depth:
- max_children:
- excluded_nodes:
- repeated_nodes_strategy:
- structure_summary:
- variant_samples:
  - variant_name:
  - sample_node_id:
  - key_visual_props:
  - key_text:
  - qa_assertions:
- assets:
- interactions:
- implementation_notes:
- qa_notes:
```

### 8.4 输出预算硬规则

1. 默认只输出 `Figma Design Facts Lite`。
2. 只有任务明确涉及 UI 实现 / UI 还原 / UI QA 时，才输出 `Figma Implementation Slice`。
3. 只有摘要不足、实现受阻、QA 对齐失败、复杂 component 需要拆解或 main agent 明确要求时，才输出 `Figma Node Drilldown`。
4. Drilldown 必须指定 `target_node_id`、`max_depth` 和原因。
5. 重复结构只保留 1～2 个样本，不展开全部重复项。
6. placeholder / ignore / hidden / annotation 节点默认不展开。
7. 已输出的 Figma 摘要必须被后续 agent 复用，不得重复读取同一 Figma link。
8. 输出不得把完整 Figma React/Tailwind 参考代码原样传给后续 agent；只提取设计事实。

## 9. Agent 消费规则

| agent | 默认读取 |
|---|---|
| `dispatch` | Lite + 是否存在 Slice / Drilldown 的摘要，不读完整 Drilldown |
| `code_explorer` | Lite + Slice 中的 component_signals / code_search query |
| `main agent` | Lite + Technical Scope Slice，由 `ui-implementation-scope-policy` 基于 Slice 生成 |
| `implementer_fast/deep` | Lite + Implementation Packet + 必要的局部 Drilldown |
| `qa_reviewer` | Lite + QA Acceptance Slice，不读完整 Implementation Slice / Drilldown |
| `docs_keeper` | 默认不读 |
| `发布 / CloudBase 证据复核流程` | 不读 |

如果 QA 或 main agent 需要回查 Drilldown，必须说明原因并限定节点。

## 7. 禁止事项

1. 禁止在本 skill 中判断 ClickUp 是否应触发 Figma 读取。
2. 禁止在本 skill 中定义代码复用策略。
3. 禁止在本 skill 中定义 uni-app 插件优先级。
4. 禁止在本 skill 中裁定 placeholder 是否开发。
5. 禁止在本 skill 中裁定 hand code / reuse / wrapper。
6. 禁止在本 skill 中替代 QA 输出测试计划。
7. 禁止默认读取整份 Figma 文件。
8. 禁止下游 agent 在已有完整 `Figma Design Facts` 时重复读取同一 Figma link。

## 10. 输出预算补充规则

1. `get_design_context` 返回的 React/Tailwind 参考代码不得原样传给下游 agent。
2. 对复杂节点，Lite 必须短；Slice 必须只列实现相关节点；Drilldown 必须只列关键变体样本。
3. Drilldown 的 `max_depth`、`max_children`、`sample_nodes` 必须写入输出。
4. 同一复杂组件若已生成 Drilldown，下游 agent 默认使用摘要，不重复读取 Figma。
5. QA 默认只接收 `QA Acceptance Slice`，不得接收完整 Drilldown。


## Main agent Figma budget

main agent 默认只读取 `Figma Design Facts Lite`。

`Figma Implementation Slice` 和 `Figma Node Drilldown` 默认不进入 main agent 长上下文；只通过 role_context_packet 传给 implementer 或 QA 的验收切片。

main agent 如需判断复用、拆分或技术方向，只能读取以下最小字段：

```text
- component_signal
- node_name
- node_type
- reusable_candidate
- drilldown_reason
- qa_critical_summary
```

禁止把 get_design_context 返回的完整 React/Tailwind 参考代码传入默认上下文。

## Figma Drilldown Ownership

### 默认所有权

完整 `Figma Node Drilldown` 的默认消费者是 implementer，不是 main agent。

pre-implementation 阶段：

- main agent 默认不得读取完整 `Figma Node Drilldown`。
- main agent 只允许记录 Drilldown 请求元信息。
- 完整 Drilldown 默认在 implementation 阶段由 implementer 按需读取。

### main agent 在 pre-implementation 阶段允许读取的 Figma 信息

main agent 默认只读取：

```text
Figma Design Facts Lite
Technical Scope Slice
QA Visual Baseline Slice
Figma Drilldown Request
```

其中 `Figma Drilldown Request` 只能包含：

```text
Figma Drilldown Request:
- drilldown_required: yes / no
- target_node_id:
- target_node_name:
- reason:
- max_depth:
- sample_limit:
- expected_consumer: implementer
- allowed_reader: implementer by default
```

### main agent 读取完整 Drilldown 的例外

只有以下情况，main agent 才允许读取局部 Drilldown：

1. 技术方向无法裁决。
2. 组件边界无法判断。
3. 复用 / 手搓 / wrapper 冲突无法判断。
4. UI 验收基准无法生成。
5. 用户明确要求。

读取时必须限定 `target_node_id`、`max_depth`、`sample_limit` 和原因。

### implementer 读取 Drilldown

implementer 在 implementation 阶段根据 `Figma Drilldown Request` 读取完整或局部 Drilldown。

硬规则：

1. 只读取指定 node / frame / component。
2. 只读取指定 depth。
3. 重复结构只取 1-2 个代表样本。
4. 不读取整份 Figma 文件。
5. 读取结果只进入 implementer 当前上下文和必要 handoff，不广播给所有角色。

### QA 不读完整 Drilldown

QA 默认不读取完整 `Figma Node Drilldown`。QA 读取：

```text
Figma Design Facts Lite
QA Visual Baseline Slice
```

QA 只有在以下情况才允许请求局部 Drilldown：

1. UI 对齐失败，需要定位具体节点。
2. QA Visual Baseline Slice 缺失关键验收基准。
3. variant / state 不明确。
4. Figma reference screenshot 与实现截图差异无法归因。

请求时必须指定 target node、原因和最小 depth。


## Explicit Drilldown MCP Contract

`Figma Drilldown Request` 不是普通摘要，而是 implementer 的显式工具动作。

当 `drilldown_required=yes`：

1. implementer 必须调用 Figma MCP。
2. 不得依赖隐式 MCP 继承。
3. Figma MCP 不可用时必须停止并报告 blocker。
4. 不得猜测复杂 UI。
