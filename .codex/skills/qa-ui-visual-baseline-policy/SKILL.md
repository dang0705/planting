---
name: qa-ui-visual-baseline-policy
description: "QA 专用 UI/Figma 验收规则：只消费 QA Visual Baseline Slice 与实际端上证据；不读完整 Implementation Packet 或完整 Drilldown；必要时请求局部 Drilldown。"
---

# QA UI Visual Baseline Policy

## 1. 定位

本 skill 只给 `qa_reviewer` 使用。

它负责基于 `QA Visual Baseline Slice`、Figma reference screenshot 和实际端上证据判断 UI/Figma 对齐。  
它不做代码 review，不读取完整 Implementation Packet，不读取完整 Figma Drilldown。

---

## 2. 必要输入

如果任务涉及 Figma UI / UI 还原 / 小程序端 UI 验收，QA 必须收到：

```text
QA Visual Baseline Slice
Figma Design Facts Lite
reference_screenshot
actual_evidence_required
Test Contract
QA Acceptance Slice
```

缺少 `QA Visual Baseline Slice` 时，不得判定 UI/Figma 对齐通过。

---

## 3. QA Visual Baseline Slice 必须包含

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
- actual_evidence_required:
- local_drilldown_allowed:
```

## 4. 验收方式

QA 必须优先使用：

1. Figma reference screenshot。
2. 微信开发者工具截图 / 节点状态 / 端上交互证据。
3. Test Contract。
4. QA Acceptance Slice。
5. QA Visual Baseline Slice。

只在以下情况请求局部 Drilldown：

1. UI 对齐失败，需要定位具体节点。
2. baseline 缺少关键视觉基准。
3. variant / state 不明确。
4. Figma reference screenshot 与实际截图差异无法归因。

局部 Drilldown 请求必须包含：

```text
QA Local Drilldown Request:
- reason:
- target_node_id:
- max_depth:
- specific_state_or_variant:
```

## 5. 禁止事项

1. 禁止读取完整 Figma Node Drilldown。
2. 禁止读取完整 Implementation Packet。
3. 禁止做代码 review。
4. 禁止用“页面大体相似”代替基准断言。
5. 禁止在缺少 reference screenshot / baseline 时判定 UI 通过。
6. 禁止粘贴完整截图 OCR 或完整 DevTools dump。

---

## 6. 输出

```text
UI/Figma QA Result:
- used_skill: qa-ui-visual-baseline-policy
- baseline_present: yes / no
- reference_screenshot:
- actual_evidence:
- visual_assertions:
  - passed:
  - failed:
  - not_verified:
- variant_assertions:
- allowed_deviation_used:
- local_drilldown_requested: yes / no
- blockers:
- pass: yes / no
```


## v54 显式触发规则

本 skill 禁止隐式触发；该策略由同目录下 `agents/openai.yaml` 定义。只有当 `dispatch-task` 的 `role_context_packet` 明确写入：

```text
required_skill: $qa-ui-visual-baseline-policy
```

时，才允许读取和执行本 skill。

非 UI / 非 Figma 任务不得读取本 skill。
