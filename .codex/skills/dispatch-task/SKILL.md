---
name: dispatch-task
description: "通用任务调度入口：支持 ClickUp ticket 模式和普通 prompt 模式；ClickUp 专属 gate 仅在存在 ticket 时启用，其余 Git、Agent Assignment、role_context_packets、实现/测试/QA/文档/commit 门禁始终生效。"
---

# Dispatch Task Skill

## 0. 外置规则读取策略

`dispatch-task` 的外置规则集中放在：

```text
docs/ai-rules/dispatch-task/
```

读取顺序：

1. 先读 `docs/ai-rules/dispatch-task/INDEX.md`。
2. 当前 Phase 需要什么，只读对应规则文件。
3. 禁止一次性读取整个 `docs/ai-rules/dispatch-task/` 目录。
4. 禁止把所有 phase 规则放进 role_context_packets。
5. 已读取规则必须压缩为当前 phase / 当前角色需要的最小摘要。

## 1. 定位

`dispatch-task` 是通用任务调度入口，不是 ClickUp 专用入口。

它支持两种模式：

```text
mode: clickup_ticket
mode: prompt_only
```

- 如果 prompt 包含有效 ClickUp ticket id / URL，则进入 `clickup_ticket` 模式，启用 ClickUp ticket、relationships、checklist、writeback 相关 gate。
- 如果 prompt 不包含 ClickUp ticket，则进入 `prompt_only` 模式，跳过 ClickUp 专属 gate，但保留 Git、Agent Assignment、role_context_packets、Execution Gate、Implementation Contract、Test Contract、QA、docs、Git commit 等通用门禁。

main agent 主导：

1. 技术方向。
2. Implementation Contract。
3. Test Contract。
4. Agent Assignment。
5. code review。
6. ClickUp checklist 回写（仅 clickup_ticket 模式且存在 checklist 时）。
7. Git commit。

代码实现、QA、文档落地必须交给对应 subagent。

---

## 2. Phase 0：通用必过硬门禁

在执行任何实现、测试、文档、ClickUp 回写或 Git commit 前，必须先完成 Phase 0。

Phase 0 必须先判断模式：

```text
Dispatch Mode:
- mode: clickup_ticket / prompt_only
- clickup_ticket_id:
- clickup_required: yes / no
- clickup_reason:
```



### 2.1 通用 gate，所有模式都必须完成

```text
Common Phase 0 Gate:
- Git Workspace Check completed: yes / no
- task intent understood: yes / no
- Agent Assignment completed: yes / no
- role_context_packets completed: yes / no
- Execution Gate passed: yes / no
```

硬规则：

1. 如果 Git 工作区 very_dirty，必须先征求用户确认。
2. 如果 Agent Assignment 未输出，停止。
3. 如果 role_context_packets 未生成，停止。
4. 如果 `code_changes_required=yes` 但未分配 implementer，停止。
5. 如果 Execution Gate 未通过，停止。

### 2.2 ClickUp 专属 gate，仅 clickup_ticket 模式启用

如果 prompt 包含 ClickUp ticket id / URL，必须完成：

```text
ClickUp Phase 0 Gate:
- ClickUp ticket id present: yes
- ClickUp ticket facts read: yes / no
- relationships checked: yes / no
- checklist / acceptance criteria checked: yes / no
- checklist writeback plan ready: yes / no / not_applicable
```

ClickUp 专属停止条件：

1. ClickUp MCP 不可用且无法读取 ticket。
2. relationships 未检查。
3. checklist / acceptance criteria 存在但未逐项映射。
4. checklist 需要回写但没有 writeback plan。
5. Figma / GitHub / 关系任务链接读取失败且影响验收。

### 2.3 prompt_only 模式跳过项

如果 prompt 不包含 ClickUp ticket：

1. 不要求 ClickUp ticket id。
2. 不读取 ClickUp ticket / relationships。
3. 不要求 Acceptance Checklist Matrix。
4. 不要求 ClickUp checklist writeback。
5. 不做 ClickUp 状态、评论、checklist 回写。

prompt_only 模式仍执行通用 gate。

但仍必须根据用户 prompt 生成：

```text
Prompt Task Facts:
- 原始需求:
- 硬约束:
- 非目标:
- 验收标准:
- 外部链接:
- 需要确认的问题:
```

---

## 3. Phase 1：事实读取

### 3.1 clickup_ticket 模式

读取规则见：

```text
docs/ai-rules/dispatch-task/clickup-ticket-read-policy.md
docs/ai-rules/dispatch-task/checklist-writeback-policy.md
```

若任务包含 Figma 且明确涉及 UI 开发 / 还原 / QA，按需引用：

```text
.codex/skills/figma-ui-implementation-policy/SKILL.md
.codex/skills/ui-implementation-scope-policy/SKILL.md
```

### 3.2 prompt_only 模式

只读取 prompt 中明确给出的事实、文件、链接和约束。

如果 prompt 中包含 Figma、GitHub、CloudBase、文档、截图或其他外部链接，仍必须按对应 MCP / 工具读取；不得因为没有 ClickUp ticket 就跳过外部事实。

Phase 1 输出：

```text
Task Facts:
- mode:
- hard_constraints:
- non_goals:
- acceptance_criteria:
- external_links:
- blocking_gaps:
```

---

## 4. Phase 2：Agent Assignment Gate

读取规则见：

```text
docs/ai-rules/dispatch-task/agent-assignment-gate.md
```

必须输出 `Agent Assignment`。

任何代码改动任务必须分配：

```text
implementer_fast
```

或：

```text
implementer_deep
```

main agent 默认不得亲自写代码。

---

## 5. Phase 3：role_context_packets

读取规则见：

```text
docs/ai-rules/dispatch-task/role-context-packets.md
```

不得把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。

必须输出：

```text
role_context_packets:
- code_explorer:
- implementer:
- QA:
- docs:
```

---

## 6. Phase 4：Implementation Contract 与 Test Contract

读取规则见：

```text
docs/ai-rules/dispatch-task/implementation-test-contract.md
```

main agent 必须输出 Implementation Contract 和 Test Contract。

在 `prompt_only` 模式下，Test Contract 基于用户 prompt 的验收标准和 task facts 生成；不要求 Acceptance Checklist Matrix。

在 `clickup_ticket` 模式下，Test Contract 必须基于 Acceptance Checklist Matrix 和 Test Case Base 生成。

---

## 6.4 Phase 4.4：Solution Discovery Gate

进入 Technical Direction Gate 前，main agent 必须完成 `Solution Discovery Gate`。

细则见：

```text
docs/ai-rules/dispatch-task/solution-discovery-gate.md
```

硬规则：

1. 复杂需求不得跳过需求复杂度评估。
2. 复杂功能不得跳过现有代码复用评估。
3. 明确有成熟方案可能时，不得跳过 uni-app 生态、微信小程序原生能力或稳定第三方方案评估。
4. 未完成 Discovery，不得允许手搓复杂实现。
5. Discovery 输出必须短，不得生成长篇调研报告。

## 6.45 Phase 4.45：Pre-Implementation Budget Fuse

进入 implementer 前，main agent 必须执行 pre-implementation 预算检查。

细则见：

```text
docs/ai-rules/dispatch-task/pre-implementation-budget-fuse.md
```

如果估算为 high / extreme，必须先压缩 facts、减少候选、推迟 Figma Drilldown，并只输出 Gate Receipt。

## 6.5 Phase 4.5：Main Agent Quality Gates

在派发 implementer 前，main agent 必须通过：

```text
Technical Direction Gate
Implementation Contract Completeness Gate
```

在 implementer 完成后、进入 QA 前，main agent 必须通过：

```text
Main Agent Code Review Gate
```

细则见：

```text
docs/ai-rules/dispatch-task/main-agent-quality-gates.md
```

硬规则：

1. Technical Direction Gate 未通过，不得派发 implementer。
2. Implementation Contract Completeness Gate 未通过，不得派发 implementer。
3. Main Agent Code Review Gate 未通过，不得进入 QA。
4. Main Agent Code Review Gate 发现 blocking findings 时，必须把 findings 转回同一 implementer 线程，main agent 不得亲自修复。

## 7. Phase 5：Subagent 执行

执行顺序：

```text
可选 code_explorer
→ implementer_fast / implementer_deep
→ main agent code review
→ qa_reviewer
→ docs_keeper（按需）
```

若 main agent code review 或 QA 不通过：

1. main agent 不得亲自改代码。
2. findings 必须转回同一 implementer 线程。
3. implementer 修复后重新 review / QA。

---

## 8. Phase 6：QA 与证据

读取规则见：

```text
docs/ai-rules/dispatch-task/qa-evidence-policy.md
```

QA 不审代码 diff，不做 code review。

QA 输出必须摘要化，不贴完整日志、完整 DevTools dump 或完整截图 OCR。

---

## 9. Phase 7：ClickUp 回写与 Git commit

### 9.1 ClickUp 回写，仅 clickup_ticket 模式

ClickUp checklist 回写见：

```text
docs/ai-rules/dispatch-task/checklist-writeback-policy.md
```

只有 `clickup_ticket` 模式且存在原始 checklist item 时，才执行真实 checklist 勾选。

如果 `prompt_only` 模式，不得尝试 ClickUp 回写。

### 9.2 Git commit，所有修改文件的任务都适用

Git 规则见：

```text
docs/ai-rules/dispatch-task/git-completion-policy.md
```

任务确认完成后必须做 Git commit，除非用户禁止提交、无文件变更、无法隔离本轮变更或存在阻塞验证。

---

## 10. 输出格式

```text
Dispatch Task Plan:
- Dispatch Mode:
- Phase 0 Gate:
- Task Facts:
- ClickUp Facts: not_applicable / ...
- Acceptance Checklist Matrix: not_applicable / ...
- Test Case Base: not_applicable / ...
- Agent Assignment:
- role_context_packets:
- Figma Drilldown Request:
- QA Visual Baseline Slice:
- Technical Direction Gate:
- Solution Discovery Gate:
  - mode: Lite / Expanded
- Pre-Implementation Budget Check:
- Technical Direction Gate:
- Implementation Contract:
- Implementation Contract Completeness Gate:
- Test Contract:
- Git Workspace Check:
- Execution order:
- Token budget:
- Final delivery standard:
- Risks:
- Blockers:
```

```text
Dispatch Task Summary:
- mode:
- Phase gates:
- Implementer status:
- Main Agent Code Review Gate:
- Main agent code review:
- QA status:
- Docs status:
- ClickUp Checklist Writeback: not_applicable / ...
- Git Commit:
- Blockers:
- Non-blocking risks:
- Open items:
```

---

## 11. 禁止事项

1. 禁止跳过 Phase 0。
2. 禁止把无 ClickUp ticket 的任务强行终止；应进入 prompt_only 模式。
3. 禁止在 prompt_only 模式要求 ClickUp ticket / relationships / checklist writeback。
4. 禁止未分配 implementer 就改代码。
5. 禁止 main agent 默认亲自写代码。
6. 禁止未生成 role_context_packets 就进入实现。
7. 禁止 checklist 未映射 Test Case Base 就进入 QA 或回写（仅 clickup_ticket 模式）。
8. 禁止用 emoji / 图标 / 评论 / 描述替代真实 checklist 勾选。
9. 禁止把完整 Figma / ClickUp / 日志广播给所有 agent。

## v50 Figma Drilldown Ownership Gate

如果任务涉及 Figma UI：

1. main agent pre-implementation 阶段默认只读取 `Figma Design Facts Lite`、`Technical Scope Slice`、`QA Visual Baseline Slice` 和 `Figma Drilldown Request`。
2. main agent 默认不得读取完整 `Figma Node Drilldown`。
3. 完整 Drilldown 默认由 implementer 在 implementation 阶段按 request 读取。
4. QA 默认读取 `QA Visual Baseline Slice`，不得读取完整 Drilldown。
5. QA 只有在 UI 对齐失败、baseline 不足或 variant 不明确时，才请求局部 Drilldown。
6. 缺少 `QA Visual Baseline Slice` 时，QA 不得判定 UI/Figma 对齐通过。


## v53 role-specific UI skills

如果任务涉及 Figma UI：

1. main agent 使用 `ui-implementation-scope-policy` 生成角色切片。
2. implementer packet 必须引用 `implementer-ui-execution-policy`。
3. QA packet 必须引用 `qa-ui-visual-baseline-policy`。
4. `dispatch-task` 不把完整 UI 规则广播给多个 agent。
5. `drilldown_required=yes` 时，implementer 必须显式调用 Figma MCP；不可用则停止。


## v54 Explicit UI Skill Trigger

UI/Figma 专用 skill 不再固定配置在 implementer / QA agent 中。`dispatch-task` 必须通过 `role_context_packets` 显式触发。

### implementer packet

当任务涉及 UI 实现、Figma Drilldown、Figma UI 还原或复杂小程序 UI 时：

```text
implementer:
- required_skill: $implementer-ui-execution-policy
- trigger_condition:
  - UI implementation required
  - Figma Drilldown Request exists
  - Figma component / variant / state implementation required
- Implementation Packet:
- Figma Drilldown Request:
```

如果不满足 trigger_condition，不得要求 implementer 读取该 skill。

### QA packet

当任务涉及 UI/Figma 验收、小程序端 UI、Figma reference screenshot 或 QA Visual Baseline Slice 时：

```text
QA:
- required_skill: $qa-ui-visual-baseline-policy
- trigger_condition:
  - QA Visual Baseline Slice exists
  - Figma/UI QA required
  - mini-program visual verification required
- QA Visual Baseline Slice:
- reference_screenshot:
- actual_evidence_required:
```

如果不满足 trigger_condition，不得要求 QA 读取该 skill。

### 禁止事项

1. 禁止在 agent 配置中长期固定挂载 UI skill。
2. 禁止非 UI 任务触发 UI skill。
3. 禁止依赖 UI skill 隐式触发。
4. `drilldown_required=yes` 时，必须通过 `$implementer-ui-execution-policy` 显式要求 implementer 调用 Figma MCP。


## v55 UI skill invocation policy location

`$implementer-ui-execution-policy` 和 `$qa-ui-visual-baseline-policy` 的禁止隐式触发策略不写在 `SKILL.md` frontmatter 中，而写在各自 skill 目录的：

```text
agents/openai.yaml
```

对应内容：

```yaml
policy:
  allow_implicit_invocation: false
```

`dispatch-task` 仍必须通过 `role_context_packets` 显式写入 `$skill` 才能触发这些 UI skill。
