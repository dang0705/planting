# Codex / AI Workflow

## 1. 当前入口

统一使用：

```text
.codex/skills/dispatch-task/SKILL.md
```

`dispatch-task` 是阶段门禁入口，不是普通实现入口。

## 2. Phase Gate 模型

```text
Phase 0: 硬门禁
Phase 1: ClickUp / MCP 事实读取
Phase 2: Agent Assignment
Phase 3: role_context_packets
Phase 4: Implementation Contract + Test Contract
Phase 5: Subagent 执行
Phase 6: QA 与证据
Phase 7: ClickUp checklist 回写 + Git commit
```

任何 phase 未完成，不得进入下一 phase。

## 3. 当前可用 subagent

| agent | 用途 |
|---|---|
| `code_explorer` | 可选低成本代码定位 |
| `implementer_fast` | 低风险局部契约执行 |
| `implementer_deep` | 高风险 / 多文件契约执行 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma、失败归因 |
| `docs_keeper` | 文档落地、索引同步、术语一致性 |

## 4. main agent 主导职责

main agent 负责技术方向、Implementation Contract、Test Contract、Agent Assignment、code review、ClickUp 回写和 Git commit。

main agent 默认不得亲自写代码。

## 5. 外置规则

| 规则 | 文件 |
|---|---|
| ClickUp 读取 | `docs/ai-rules/dispatch-task/clickup-ticket-read-policy.md` |
| checklist / writeback | `docs/ai-rules/dispatch-task/checklist-writeback-policy.md` |
| Agent Assignment Gate | `docs/ai-rules/dispatch-task/agent-assignment-gate.md` |
| Git commit | `docs/ai-rules/dispatch-task/git-completion-policy.md` |
| Review Scope / QA 边界 | `docs/ai-rules/dispatch-task/review-scope-policy.md` |
| handoff | `docs/ai-rules/subagent-handoff.md` |
| thread reuse | `docs/ai-rules/subagent-thread-reuse.md` |

## 6. token 预算

1. `dispatch-task` 只保留阶段门禁。
2. 细节规则按需读取。
3. role_context_packets 必须生成。
4. 不得广播完整 ClickUp、完整 Figma、完整日志、完整规则。
5. handoff 默认只读轻量恢复摘要。


## Dispatch-task 外置规则目录

`dispatch-task` 的配套细则位于：

```text
docs/ai-rules/dispatch-task/
```

默认先读 `INDEX.md`，再按 Phase 读取对应规则。不得一次性读取整个目录。


## v44 Dispatch-task ClickUp 可选模式

`dispatch-task` 是通用任务入口，不是 ClickUp 专用入口。

- 有 ClickUp ticket：进入 `clickup_ticket` 模式，启用 ticket、relationships、checklist、writeback 等 ClickUp 专属 gate。
- 无 ClickUp ticket：进入 `prompt_only` 模式，跳过 ClickUp 专属 gate，但保留 Git、Agent Assignment、role_context_packets、Execution Gate、Implementation Contract、Test Contract、QA、docs、Git commit 等通用门禁。



## v47 Main Agent Quality Gates

在无独立架构角色的 workflow 下，main agent 必须通过三道质量门禁：

1. `Technical Direction Gate`
   - 进入 implementer 前必须通过。
   - 必须评估复用、wrapper/adapter、插件/原生能力、手搓、删减/收敛旧逻辑、模块边界、风险回滚。

2. `Implementation Contract Completeness Gate`
   - 派发 implementer 前必须通过。
   - 文件级改动计划、数据流、禁止修改范围、模块拆分、Test Contract、role_context_packet 缺一不可。

3. `Main Agent Code Review Gate`
   - implementer 完成后、QA 前必须通过。
   - 未完成 code review 不得进入 QA。
   - blocking findings 必须转回同一 implementer，main agent 不得亲自修复。

细则见：

```text
docs/ai-rules/dispatch-task/main-agent-quality-gates.md
```


## v48 Solution Discovery Gate

Technical Direction Gate 前必须先完成 Solution Discovery Gate。

目的：

1. 证明 main agent 已评估需求复杂度。
2. 证明已检查项目已有实现 / 复用可能性。
3. 证明在复杂功能或通用能力场景下已评估 uni-app 生态、微信小程序原生能力或稳定第三方方案。
4. 防止没有证据就直接选择手搓。
5. 控制输出预算，避免把方案调研变成长篇报告。

细则见：

```text
docs/ai-rules/dispatch-task/solution-discovery-gate.md
```


## v49 Pre-Implementation Budget Optimization

v49 在不删除 Phase Gate 的前提下降低 pre-implementation token：

1. Gate 默认输出 `Gate Receipt`。
2. `Solution Discovery Gate` 分为 Lite / Expanded。
3. `role_context_packets` 增加预算上限。
4. Figma Drilldown 默认延迟，不进入 main agent 长上下文。
5. ClickUp 默认只保留硬约束句、非目标、checklist matrix、关系摘要和 blocking gaps。
6. 新增 `Pre-Implementation Budget Fuse`，估算 high / extreme 时必须压缩上下文或请求用户确认。

## v50 Figma Drilldown Ownership

1. main agent pre-implementation 阶段默认不读取完整 `Figma Node Drilldown`。
2. main agent 只生成 `Figma Drilldown Request`。
3. implementer 是默认 Drilldown 消费者，在 implementation 阶段按 target node / depth / sample limit 读取。
4. QA 不读完整 Drilldown，但必须读取 `QA Visual Baseline Slice`。
5. 缺少 `QA Visual Baseline Slice` 时，QA 不得判定 UI/Figma 对齐通过。
6. QA 只有在 UI 对齐失败、baseline 不足或 variant 不明确时，才请求局部 Drilldown。


## v53 role-specific UI skills

UI 相关规则按角色拆分：

1. main agent 使用 `ui-implementation-scope-policy` 生成 Technical Scope Slice、Implementation Packet、Figma Drilldown Request 和 QA Visual Baseline Slice。
2. implementer 使用 `implementer-ui-execution-policy`，在 `drilldown_required=yes` 时显式调用 Figma MCP。
3. QA 使用 `qa-ui-visual-baseline-policy`，只消费 QA Visual Baseline Slice 和端上证据。
4. 不再由 dispatch-task 广播完整 UI 大规则给多个 agent。


## v54 Explicit UI Skill Trigger

UI/Figma 专用 skill 不固定挂载在 implementer / QA agent 中。只有 `dispatch-task` 在 role_context_packet 中显式写入 `$implementer-ui-execution-policy` 或 `$qa-ui-visual-baseline-policy` 时，对应 subagent 才读取这些 skill。非 UI 任务不得触发 UI skill。


## v55 UI skill invocation policy

UI/Figma 专用 skill 的禁止隐式触发策略采用官方结构：放在各 skill 目录的 `agents/openai.yaml`，不写入 `SKILL.md` frontmatter。

```text
.codex/skills/implementer-ui-execution-policy/agents/openai.yaml
.codex/skills/qa-ui-visual-baseline-policy/agents/openai.yaml
```

内容为：

```yaml
policy:
  allow_implicit_invocation: false
```
