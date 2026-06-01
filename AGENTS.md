---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件是仓库级轻量入口，只保留长期稳定的全局硬规则、项目上下文、规则索引和上下文预算。

具体任务执行由 `$dispatch-task` skill 承担。  
不得在本文件中追加版本号补丁章节。

---

## 2. 全局硬规则

1. 不允许无关重构。
2. 除非任务明确要求，不允许新增生产依赖。
3. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
4. 不允许删除有效业务逻辑来让检查通过。
5. 不允许为了通过测试而削弱真实业务约束。
6. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
7. 用户要求完整交付文档时，不允许只输出补丁片段。
8. 外部事实必须通过对应 MCP / 工具读取；不得跳过链接内容直接假设。
9. `$dispatch-task` Phase 0 未通过时不得进入实现。
10. 任何代码改动必须分配 implementer，除非存在合法例外并明确记录。
11. main agent 默认不得亲自写代码。
12. ClickUp 描述区 markdown checklist 通过项必须通过 ClickUp MCP 更新 `markdown_description`，将原始行 `[ ]` 改为 `[x]`。
13. 任务完成后必须按 Git 规则提交本轮范围内变更。
14. 工作区 very_dirty 时必须先征求用户确认。
15. 禁止在 AGENTS、skill、references、assets 中追加版本号补丁章节；补丁内容必须整合进既有章节结构。

---

## 3. 项目技术上下文

- Frontend：UniApp 3.0，Vue 3。
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。

---

## 4. 当前 subagent

| 角色 | 边界 |
|---|---|
| `code_explorer` | 可选低成本代码定位器；只在入口、调用链、依赖来源或影响范围不清时使用 |
| `implementer_fast` | 低风险局部契约执行 |
| `implementer_deep` | 高风险 / 多文件契约执行 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma 验收、失败归因；不审 diff、不做 code review |
| `docs_keeper` | 文档落地、索引同步、术语一致性、完整文档交付 |

main agent 负责技术方向、Implementation Contract、Test Contract、code review、ClickUp 回写和 Git commit。

---

## 5. dispatch-task 规则入口

`$dispatch-task` 是通用任务入口，不是 ClickUp 专用入口。

- 有 ClickUp ticket：进入 `clickup_ticket` 模式。
- 无 ClickUp ticket：进入 `prompt_only` 模式。
- prompt_only 跳过 ClickUp 专属 gate，但不跳过 Git Workspace Check、Agent Assignment、role_context_packets、Execution Gate、Implementation Contract、Test Contract、QA、docs 和 Git commit。

`dispatch-task` 专属规则位置：

```text
.codex/skills/dispatch-task/references/
```

模板位置：

```text
.codex/skills/dispatch-task/assets/templates/
```

skill 内部引用 references/assets 时使用相对路径；skill 外部引用时使用仓库相对路径。

---

## 6. 上下文预算

1. Main agent 必须优先生成 role_context_packets，不得把完整 ClickUp、完整 Figma、完整规则、完整日志广播给所有角色。
2. Subagent 默认不读取完整 `AGENTS.md`。
3. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
4. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。
5. Figma 默认 Lite；Slice 和 Drilldown 必须按 node、depth、样本数限制。
6. Figma Drilldown 默认由 implementer 在 implementation 阶段按需读取。
7. QA 不读完整 Drilldown；涉及 UI/Figma 验收时必须读取 QA Visual Baseline Slice。
8. QA 只读 Test Contract、QA Acceptance Slice 和证据路径，不读完整实现细节。
9. handoff 默认只读轻量恢复摘要，审计附录仅在失败、复盘、争议或用户要求时读取。
10. Gate 默认输出 receipt；长证据使用 evidence_ref / appendix_ref。

---

## 7. UI / Figma 触发规则

UI/Figma 规则按角色拆分：

- main agent 使用 `ui-implementation-scope-policy` 生成 Technical Scope Slice、Implementation Packet、Figma Drilldown Request、QA Visual Baseline Slice。
- implementer 只有在 role_context_packet 显式要求 `$implementer-ui-execution-policy` 时读取该 skill。
- QA 只有在 role_context_packet 显式要求 `$qa-ui-visual-baseline-policy` 时读取该 skill。
- 非 UI / 非 Figma 任务不得触发 UI skill。
- `drilldown_required=yes` 时 implementer 必须显式调用 Figma MCP；不可用则停止，不得猜测。

存在 Figma Design Facts Lite 或 UI implementation required 时，implementer 必须自检 UI 和交互。涉及微信小程序可见路径时，必须尝试使用 WeChat DevTools MCP。自测不替代 QA。

---

## 8. ClickUp markdown checklist 回写

Markdown checklist 没有 ClickUp 原生 item id。

使用：

```text
checklist_order_no
checklist_ref = md-checklist:<source_ticket_id>:NO<checklist_order_no>
```

其中 `checklist_order_no` 表示该 ticket 描述区内第几个 markdown checklist 项，从 1 开始。

回写方式：

1. 读取最新 `markdown_description`。
2. 定位原始 checklist 行。
3. 只把通过项同一行 `[ ]` 改为 `[x]`。
4. 不改 checklist 文案。
5. 不改未通过、未验证、阻塞、不适用项。
6. 更新后重新读取确认。
7. 不使用非 MCP 回写方式。
