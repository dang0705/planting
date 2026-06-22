---
name: dispatch-task
description: '通用任务调度入口：按 phase 执行硬门禁、Agent Assignment、role_context_packets、Implementation/Test Contract、QA、ClickUp 回写和 Git commit；ClickUp ticket 可选。'
---

# Dispatch Task Skill

## 1. 定位

`dispatch-task` 是通用任务调度入口。

支持两种模式：

```text
mode: clickup_ticket
mode: prompt_only
```

main agent 主导技术方向、Implementation Contract、Test Contract、Agent Assignment、code review、ClickUp 回写和 Git commit。  
代码实现、代码修复、测试代码改动、配置代码改动、云函数代码改动、页面组件代码改动必须交给 implementer subagent。QA 与文档落地必须交给对应 subagent。

## 2. 规则读取策略

详细规则在本 skill 的 `references/` 目录内，模板在 `assets/templates/` 目录内。

默认读取顺序：

1. 先读 `references/INDEX.md`。
2. 当前 phase 需要什么，只读对应 reference 文件。
3. 禁止一次性读取整个 `references/` 目录。
4. 禁止把全部 phase 规则放进 `role_context_packets`。
5. 输出模板只引用 `assets/templates/` 下的对应模板，不在本文件重复粘贴。

模板入口：

```text
assets/templates/INDEX.md
```

## 3. Main thread budget

main agent 必须读取并遵守：

```text
references/main-thread-budget-policy.md
```

main agent 默认只处理 receipt，不做二次实现、不做二次 QA、不做长日志对账。

## Gate Token Telemetry

读取：

```text
references/gate-token-telemetry-policy.md
```

硬规则：每个 gate 完成后、进入下一个 gate 前，main agent 必须在对话中输出 `Gate Token Telemetry`。如果当前环境没有暴露精确 token 计数，必须标记 `counter_status: unavailable` 或 `estimated`，不得编造精确数字。
只输出 phase completed / in_progress 清单无效；必须包含 pre_gate_tokens、post_gate_tokens、gate_delta_tokens、main_cumulative_tokens、counter_source 和 delta_basis。

## 4. Phase 流程

```text
Phase 0: 硬门禁
Phase 1: 事实读取
Phase 1.5: BRV Minimal Fact Routing Gate
Phase 2: Agent Assignment + Subagent Reuse Gate
Phase 3: role_context_packets
Phase 4: Solution Discovery + Implementation Contract + Test Contract
Phase 4.45: Pre-Implementation Budget Fuse
Phase 4.5: Main Agent Quality Gates
Phase 5: Subagent 执行
Phase 6: QA 与证据
Phase 7: ClickUp 回写与 Git commit
```

任何 phase 未通过，不得进入下一 phase。
任何 gate 完成后，必须先输出 Gate Token Telemetry，才能进入下一 gate。

## 5. Phase 0：硬门禁

读取：

```text
references/phase-0-gates.md
```

必须先判断模式：

```text
Dispatch Mode:
- mode: clickup_ticket / prompt_only
- clickup_ticket_id:
- clickup_required:
- clickup_reason:
```

通用 gate 始终生效：

- Git Workspace Check
- task intent understood
- Agent Assignment
- role_context_packets
- Execution Gate

ClickUp 专属 gate 只在 `clickup_ticket` 模式启用。

## 6. Phase 1：事实读取

ClickUp 模式读取：

```text
references/clickup-ticket-read-policy.md
references/checklist-writeback-policy.md
references/task-facts-receipt-policy.md
```

prompt_only 模式只读取 prompt、显式文件、显式链接、用户给定约束和必要外部事实。

prompt_only 模式也必须生成 Task Facts Receipt；完整 prompt / 本地 JSON 只作为 source_ref 保留，后续 phase 默认只消费 receipt。

如果涉及 Figma / UI，按需显式使用：

```text
$figma-ui-implementation-policy
$ui-implementation-scope-policy
```

## Phase 1.5：BRV Recall Gate

读取：

```text
references/brv-recall-gate.md
```

在 task facts / prompt facts 读取完成后，main agent 必须生成最小 BRV query，召回当前仓库相关 fact_ref / source_ref / code_ref / test_ref，并压缩为 BRV Fact Routing Packet。

BRV 不可用时不得伪造召回结果；必须记录 miss / blocked / skipped 和 fallback。

BRV 输出只允许作为最精简事实路由 receipt / packet，不展开完整历史或完整 BRV context。

## 7. Phase 2：Agent Assignment + Subagent Reuse Gate

默认读取：

```text
references/agent-assignment-gate.md
references/agent-assignment-core.md
```

按需读取：

```text
references/implementer-routing-policy.md      # 需要代码改动、code_explorer 或 implementer 时
references/qa-docs-routing-policy.md          # 需要判断 QA / docs_keeper 时
references/test-ownership-policy.md           # 单测 / e2e / 端上测试职责边界
references/subagent-spawn-gate.md             # required named subagent 需要复用或 spawn 时
```

任何代码改动任务必须分配：

```text
implementer_fast
```

或：

```text
implementer_deep
```

main agent 绝对不得亲自写代码、修代码、改测试代码或改配置代码。缺少可用 implementer 时必须硬停止，不得用 main/default/fallback 线程代替。

## 8. Phase 3：role_context_packets

读取：

```text
references/role-context-packets.md
```

不得把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。

UI/Figma 任务中，必须通过 role_context_packet 显式触发对应 skill：

```text
required_skill: $implementer-ui-execution-policy
required_skill: $qa-ui-visual-baseline-policy
```

## 测试职责边界

读取：

```text
references/test-ownership-policy.md
```

硬规则：单测只归 implementer；QA 不得运行或重复运行单测。QA 只负责 e2e、端上测试、UI/Figma 验收和运行时链路取证。

Test Contract 必须拆成 Implementer Validation Contract 与 QA Validation Contract。unit tests 只能写入 implementer 段，不得写入 QA 段。

## 9. Phase 4：Solution Discovery、Implementation Contract、Test Contract

读取：

```text
references/solution-discovery-gate.md
references/implementation-test-contract.md
references/main-pre-implementation-gates.md
```

进入 Technical Direction Gate 前必须先完成 Solution Discovery Gate。  
派发 implementer 前必须通过 Implementation Contract Completeness Gate。  
如果选择 `implementer_deep`，main agent 必须额外通过 Contract-Locked Handoff Gate：架构方向、技术选型、实现方式、第三方插件策略、伪代码、目标锚点、停止条件和回传格式必须写死后再派发。

## 10. Phase 4.45：Pre-Implementation Budget Fuse

读取：

```text
references/pre-implementation-budget-fuse.md
```

正式进入 implementation 前必须估算 pre-implementation token 风险。  
风险为 high / extreme 时，必须压缩 facts、减少候选、推迟完整 Figma Drilldown，并使用 Gate Receipt。

## 11. Phase 5：Subagent 执行

读取：

```text
references/subagent-progress-policy.md
```

main agent 等待 implementer，尤其是 GLM-5.2 `implementer_deep` 时，必须使用更长等待阈值；不得为了查看进度而频繁打断，不得主动打断用户确认是否等待，除非触及危险操作、权限确认、费用/外部发布确认或 hard wait 后没有任何可观察进展。

implementer 完成后、QA 之前，main agent 只读取 post-implementation review 规则：

```text
references/main-post-implementation-review-gate.md
references/review-scope-policy.md
```

执行顺序：

```text
可选 code_explorer
→ implementer_fast / implementer_deep
→ main agent code review
→ qa_reviewer
→ docs_keeper（按需）
```

如果 code review 或 QA 不通过：

1. main agent 不得亲自改代码。
2. findings 必须转回同一 implementer 线程。
3. implementer 修复后重新 review / QA。

## 12. Phase 6：QA 与证据

读取：

```text
references/qa-evidence-policy.md
```

QA 不审代码 diff，不做 code review。  
QA 不运行单测、不重复 implementer 单测；QA 只执行 e2e、端上测试、UI/Figma 验收和运行时链路取证。  
QA 输出必须摘要化，禁止粘贴完整日志、完整 DevTools dump、完整截图 OCR。

## 13. Phase 7：ClickUp 回写与 Git commit

ClickUp 模式下，读取：

```text
references/checklist-writeback-policy.md
```

所有会修改文件的任务，读取：

```text
references/git-completion-policy.md
```

ClickUp 描述区 markdown checklist 通过项必须通过 ClickUp MCP 整体更新 markdown_description，将原始行 `[ ]` 改为 `[x]`；禁止用 emoji、图标、评论或新增文字替代。  
任务完成后必须 commit 本轮范围内变更，除非存在明确阻塞原因。

## 14. Figma Drilldown 与 UI 自测

Figma Drilldown 默认由 implementer 在 implementation 阶段按 request 读取。  
main agent pre-implementation 阶段默认只保留 Drilldown Request 和 QA Visual Baseline Slice。

如果 implementer packet 包含 `Figma Design Facts Lite`、`Figma Drilldown Request` 或 `UI implementation required`，implementer 必须做 UI / 交互自测；涉及微信小程序可见路径时必须尝试端上 `miniprogram-automator` / `9420`。
自测不替代 QA。

## 15. 输出模板

本 skill 不内联完整模板。使用以下模板文件：

```text
assets/templates/phase-gates.md
assets/templates/agent-assignment.md
assets/templates/role-context-packets.md
assets/templates/contracts.md
assets/templates/clickup-writeback.md
assets/templates/git-commit.md
assets/templates/ui-self-check.md
assets/templates/qa-evidence.md
```

## 16. 禁止事项

1. 禁止跳过 Phase 0。
2. 禁止把无 ClickUp ticket 的任务强行终止；应进入 prompt_only 模式。
3. 禁止未分配 implementer 就改代码。
4. 禁止 main agent 亲自写代码、修代码、改测试代码或改配置代码；没有“低风险小改”例外。
5. 禁止用 main/default/fallback 线程代替 implementer。
6. 禁止同一 dispatch_run_id / ticket / scope 下重复新开同角色 subagent；必须优先复用现成同角色线程。
7. 禁止未生成 role_context_packets 就进入实现。
8. 禁止 checklist 未映射 Test Case Base 就进入 QA 或回写（仅 clickup_ticket 模式）。
9. 禁止用 emoji / 图标 / 评论 / 描述替代真实 checklist 勾选。
10. 禁止把完整 Figma / ClickUp / 日志广播给所有 agent。
11. 禁止在本 skill 或 references 中追加版本号章节；补丁必须整合进既有章节结构。

## very_dirty 自动快照提交

如果任务开始前 Git 工作区为 very_dirty，main agent 必须先创建任务前 dirty snapshot commit。无需用户确认。

commit message 必须根据当前脏改动内容生成，精炼且不超过 50 个字符。任务完成后的最终 commit message 同样不超过 50 个字符。

## Completion Gate

任务停止 / Done / 完成前必须读取：

```text
references/completion-gate.md
```

只有 Completion Gate 通过，才允许停止。仅本地后端测试 PASS 或风险说明，不是完成条件。

如果验收要求小程序实际交互，QA 必须执行端上 `miniprogram-automator` / `9420` 自动化；不能只做连接能力验证。

## Subagent 进度观察

main agent 等待 subagent 时，读取：

```text
references/subagent-progress-policy.md
```

默认采用低成本观察，不得频繁中断 subagent。超过等待阈值后，只能请求简短 Progress Receipt。

## 小程序端上 automator 自动化职责

涉及小程序端上验证时，读取：

```text
references/wechat-devtools-automation-policy.md
```

main agent 默认不直接执行完整端上 automator 自动化。implementer 只做最小自测，QA 负责正式验收，禁止重复完整自动化。WeChat MCP 不是默认路径。

## Phase 0 Git baseline

Phase 0 只用 `git status --short` 判断是否 dirty。若 dirty，直接创建 snapshot commit。禁止在 Phase 0 使用 `git diff` 做提交前分析。
