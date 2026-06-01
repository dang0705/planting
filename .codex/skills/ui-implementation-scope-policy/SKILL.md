---
name: ui-implementation-scope-policy
description: "项目级 UI 实现范围规范：基于 ClickUp 硬约束和 Figma Design Facts 生成 UI Implementation Scope Map；定义组件复用、uni-app 插件优先、手搓、placeholder、visual-only、QA 范围。"
---

# UI Implementation Scope Policy

## 1. 定位

本 skill 定义项目级 UI 实现范围和代码策略。

输入通常来自：

1. ClickUp 硬约束摘录。
2. Figma Design Facts。
3. 项目技术栈与目录上下文。
4. 现有代码组件搜索结果。
5. main agent 的裁决。

本 skill 不负责读取 Figma MCP；Figma 读取由 `figma-ui-implementation-policy` 完成。

## 2. UI Implementation Scope Map

必须产出：

```text
UI Implementation Scope Map:
- source:
  - clickup_ticket:
  - figma_link:
  - figma_node_id:
  - figma_node_name:
  - figma_node_type:
  - figma_component_signal:
- implementation_type:
  - must_implement
  - reuse_existing_component
  - reuse_with_wrapper
  - use_uniapp_plugin
  - hand_code_component
  - visual_only
  - placeholder_do_not_expand
  - ignore
  - needs_confirmation
- code_search_queries:
- matched_code_components:
  - path:
  - match_type: exact / near / semantic
  - confidence: high / medium / low
- selected_code_path:
- decision_reason:
- handcode_allowed: false / true
- handcode_reason:
- qa_scope:
```

## 3. 组件复用优先规则

如果 Figma Design Facts 显示节点类型为 `component`、`symbol`、`instance`、`component_set`，或节点命名显示其为组件，默认视为代码复用强信号。

必须先按节点名及命名变体搜索现有代码组件，不得直接手搓。

搜索至少覆盖：

1. `src/components/`
2. `src/pages/`
3. `src/subpackages/`
4. `src/composables/`
5. `src/stores/`
6. `components/`
7. `uni_modules/`

如果命中名称相同或近似组件，默认复用。只有以下情况才允许手搓：

1. 没有命中可复用组件。
2. 命中组件职责明显不符。
3. 复用会引入更大改造或破坏旧用法。
4. ClickUp / Figma 明确要求新建。
5. `main agent` 明确裁定应新建。

未完成代码组件搜索前，不得把 `hand_code_component` 作为实现决策。

## 4. 实现策略优先级

默认优先级：

1. 复用项目已有组件。
2. 通过 wrapper / props 扩展已有组件。
3. 优先考虑 uni-app 生态插件。
4. 使用微信小程序 / uni-app 原生能力。
5. 最后才 hand code 新 Vue / UniApp 组件。

若 ClickUp 明确要求“优先考虑 uni-app 生态插件”，该约束必须进入计划和 implementer 输出，不得被压缩丢失。

## 5. 节点范围分类

| 类型 | 含义 | 实现规则 | QA 规则 |
|---|---|---|---|
| `must_implement` | 本次必须开发 | 实现 UI + 交互 + 数据路径 | 测 UI、交互、数据路径 |
| `reuse_existing_component` | 应复用已有代码组件 | 先查现有组件，不得手搓 | 测复用后视觉和旧用法 |
| `reuse_with_wrapper` | 复用并做轻 wrapper | wrapper 必须小而清晰 | 测 wrapper 与原组件兼容 |
| `use_uniapp_plugin` | 使用 uni-app 生态插件 | 评估兼容性、体积、样式可控性 | 测小程序端兼容性 |
| `hand_code_component` | 允许新写组件 | 必须拆模块，禁止堆进页面 | 测 UI、状态、交互 |
| `visual_only` | 只还原视觉 | 不新增业务逻辑/API/store/schema | 只测视觉 |
| `placeholder_do_not_expand` | 占位 | 不开发功能、不新增接口/状态 | 只确认布局不破坏 |
| `ignore` | 标注/参考/辅助层 | 不实现 | 不纳入 QA |
| `needs_confirmation` | 无法判断 | 停止并请求裁决 | 不放行 |

## 6. placeholder / visual-only / ignore 判断

如果节点名、注释、ClickUp 或设计事实中出现以下词，应优先识别为 placeholder、visual_only、ignore 或 needs_confirmation：

- placeholder
- WIP
- later
- coming soon
- mock
- demo
- sample
- dummy
- TODO
- 待补
- 占位
- 暂不实现
- 未来入口
- 示例数据
- 参考层
- 标注
- 不开发
- 仅展示

禁止从 placeholder 推导业务逻辑、接口、store、schema、云函数或真实数据模型。

## 7. implementer 约束

1. 必须读取 `UI Implementation Scope Map`。
2. 对 `figma_component_signal=strong` 的节点，必须先完成代码组件搜索。
3. 必须输出搜索 query、路径范围、候选组件和复用/不复用理由。
4. 未搜索前不得新建同名或近似组件。
5. 如果无法 100% 还原，必须说明差异、平台限制和替代方案，不得自行降级。
6. 不得把 Figma component 自动等同为“必须新写代码组件”。

## 8. main agent 约束

1. 必须审查是否优先匹配现有代码组件。
2. 必须审查是否重复造组件。
3. 必须审查是否可以通过 wrapper / props 扩展复用旧组件。
4. 必须审查是否应使用 uni-app 插件而非手搓。
5. 必须审查 placeholder / visual_only / ignore 是否被错误扩大为真实功能。
6. 必须审查单文件代码量、模块拆分和删减机会。

## 9. QA 约束

QA 必须按 `implementation_type` 测试：

1. `must_implement`：UI + 交互 + 数据路径。
2. `reuse_existing_component`：复用是否正确，旧组件其他使用处是否破坏。
3. `reuse_with_wrapper`：wrapper 是否破坏原组件。
4. `use_uniapp_plugin`：小程序端兼容性、性能、样式可控性。
5. `hand_code_component`：新组件 UI、状态、交互、边界。
6. `visual_only`：只测视觉，不测业务功能。
7. `placeholder_do_not_expand`：只确认布局不破坏，不要求点击、接口、真实数据。
8. `ignore`：不纳入 QA。
9. `needs_confirmation`：不得放行。

UI 目标还原度为 100%。若无法 100% 还原，必须列出差异、原因和是否需要产品/设计确认。

## 10. 输出要求

本 skill 被使用后，计划中必须包含：

```text
UI Implementation Policy Applied:
- 是否触发本规范:
- 触发原因:
- 未触发原因:
- Figma Design Facts 输入:
- UI Implementation Scope Map:
- 组件复用搜索要求:
- 允许手搓节点:
- placeholder / visual_only / ignore 节点:
- QA 范围:
```


## 11. 角色切片输出

本 skill 必须把 Figma 分层事实转换为面向角色的切片，避免所有 agent 读取完整实现细节。

### 11.1 Technical Scope Slice

只给 `main agent`。

```text
Technical Scope Slice:
- component_signals:
  - node_id:
  - name:
  - figma_node_type:
  - component_signal:
- code_reuse_required:
- code_search_queries:
- candidate_component_names:
- module_split_risks:
- single_file_growth_risks:
- wrapper_or_props_extension_opportunity:
- uniapp_plugin_candidate:
- handcode_allowed:
- handcode_reason:
- placeholder_or_visual_only_boundaries:
- main agent_decision_needed:
```

### 11.2 Implementation Packet

只给 `implementer_fast` / `implementer_deep`。

```text
Implementation Packet:
- design_facts_lite:
- implementation_slice:
- required_drilldown:
- selected_strategy:
- selected_code_path:
- must_match_visual:
- must_not_expand:
- component_reuse_decision:
- handcode_boundaries:
- platform_constraints:
```

### 11.3 QA Acceptance Slice

只给 `qa_reviewer`。QA 不读完整 Implementation Slice / Drilldown，除非缺少验收基准或出现 UI 对齐争议。

```text
QA Acceptance Slice:
- ui_target_match: 100%
- required_test_areas:
- visual_assertions:
  - layout:
  - text:
  - spacing:
  - colors:
  - typography:
  - states:
  - interactions:
  - small_program_rendering:
- component_variant_assertions:
  - variant:
  - expected_visual:
  - expected_behavior:
- placeholder_assertions:
- visual_only_assertions:
- ignore_nodes:
- wechat_devtools_required: false / true
- screenshot_baseline:
- allowed_to_read_drilldown: false / true，条件：
```

输出要求中必须包含 `Technical Scope Slice`、`Implementation Packet`、`QA Acceptance Slice`。

## 12. role_context_packets 对接

本 skill 输出的角色切片应直接进入 dispatch 的 `role_context_packets`：

1. `Technical Scope Slice` 只进入 main agent packet。
2. `Implementation Packet` 只进入 implementer packet。
3. `QA Acceptance Slice` 只进入 QA packet。
4. 不得把完整 Implementation Packet 或 Drilldown 复制给 QA。
5. 不得把 QA Acceptance Slice 当作 implementer 的实现事实源。


## v49 role slice budget

- main agent 默认读取 Technical Scope Slice，不读取完整 Implementation Packet。
- implementer 读取 Implementation Packet 和必要局部 Drilldown。
- QA 读取 QA Acceptance Slice。
- 所有 slice 超过预算时使用 evidence_ref / appendix_ref。

## v50 QA Visual Baseline Slice

### 定位

`QA Visual Baseline Slice` 是 QA 判断 UI/Figma 对齐的默认基准。它不是完整 Drilldown，也不是实现细节。

如果任务涉及 Figma UI / UI 还原 / 小程序端 UI 验收，必须生成 `QA Visual Baseline Slice`。

### 输出结构

```text
QA Visual Baseline Slice:
- figma_node:
  - root_node_id:
  - node_name:
  - reference_screenshot:
  - screenshot_source:
- required_visual_assertions:
  - layout:
  - text:
  - spacing:
  - colors:
  - typography:
  - component_states:
  - interactions:
  - mini_program_rendering:
- required_variants:
  - state_name:
  - expected_visual:
  - expected_behavior:
- placeholder_visual_only_ignore:
  - nodes:
  - qa_rule:
- allowed_deviation:
  - none / explicit_reason_required
- actual_evidence_required:
  - wechat_devtools_screenshot:
  - node_snapshot:
  - manual_observation:
- local_drilldown_allowed:
  - allowed: yes / no
  - condition:
  - target_node_hint:
```

### QA 通过条件

如果任务涉及 Figma UI，QA 通过前必须存在 `QA Visual Baseline Slice`。

如果缺少该 slice，QA 不得判定 UI 通过，只能输出：

```text
UI QA blocked: missing QA Visual Baseline Slice
```

### 与 Drilldown 的关系

QA 不读取完整 Drilldown。QA 使用 baseline + 实际小程序截图 / 节点状态 / 手工观察判断是否对齐。

只有 UI 对齐失败、baseline 缺失、variant 不明确时，才请求局部 Drilldown。


## v53 role-specific skill split

本 skill 只给 main agent 使用，用于生成角色切片：

1. Technical Scope Slice。
2. Implementation Packet。
3. Figma Drilldown Request。
4. QA Visual Baseline Slice。
5. QA Acceptance Slice。

本 skill 不承载 implementer 的执行细节，也不承载 QA 的执行细节。

- implementer 的 UI 执行细节见 `.codex/skills/implementer-ui-execution-policy/SKILL.md`。
- QA 的 UI/Figma 验收细节见 `.codex/skills/qa-ui-visual-baseline-policy/SKILL.md`。

main agent 只在 role_context_packets 中写明对应 skill 名和最小 packet，不广播本 skill 全文给各 subagent。
