---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件是仓库级轻量入口。具体任务执行由 `dispatch-task` skill 承担。

本文件不定义独立架构角色、独立规划角色或发布角色。

## 2. 全局硬规则

1. 不允许无关重构。
2. 除非任务明确要求，不允许新增生产依赖。
3. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
4. 不允许删除有效业务逻辑来让检查通过。
5. 不允许为了通过测试而削弱真实业务约束。
6. 中文是一等公民。
7. 外部事实必须通过对应 MCP / 工具读取。
8. `dispatch-task` Phase 0 未通过时不得进入实现。
9. 任何代码改动必须分配 implementer，除非存在合法例外并明确记录。
10. main agent 默认不得亲自写代码。
11. ClickUp checklist 通过项必须真实勾选，禁止用图标或文字替代。
12. 任务完成后必须按规则提交 Git commit。

## 3. 项目技术上下文

- Frontend：UniApp 3.0，Vue 3。
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。

## 4. 当前 subagent

| 角色 | 边界 |
|---|---|
| `code_explorer` | 可选低成本代码定位器 |
| `implementer_fast` | 低风险局部契约执行 |
| `implementer_deep` | 高风险 / 多文件契约执行 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma 验收、失败归因 |
| `docs_keeper` | 文档落地、索引同步、术语一致性 |

main agent 负责技术方向、Implementation Contract、Test Contract、code review、ClickUp 回写和 Git commit。


## v44 ClickUp 可选

`dispatch-task` 不要求必须有 ClickUp ticket。无 ticket 时进入 prompt_only 模式，不得强制终止；但通用阶段门禁仍必须执行。



## v47 Main Agent Quality Gates

main agent 负责技术方向、Implementation Contract、Test Contract 和 code review，但必须通过硬门禁：

1. Technical Direction Gate。
2. Implementation Contract Completeness Gate。
3. Main Agent Code Review Gate。

三者未通过，不得进入后续实现或 QA。blocking findings 必须转回同一 implementer 线程，main agent 不得亲自修复。


## v48 Solution Discovery Gate

复杂实现或可能存在成熟方案时，main agent 在技术方向裁决前必须完成 Solution Discovery Gate。没有完成复用、插件、原生能力和手搓必要性评估，不得允许手搓复杂实现。Discovery 输出必须精简，不得生成长篇调研报告。


## v49 Pre-Implementation Budget Fuse

不得为了省 token 删除 gate。优化方式是：Gate Receipt、Solution Discovery Lite、role_context_packet 预算、Figma Drilldown 延迟、ClickUp 硬约束默认上下文和 evidence_ref。

## v50 Figma Drilldown Ownership

Figma Drilldown 默认由 implementer 在 implementation 阶段按需读取。main agent pre-implementation 阶段只保留 Drilldown Request 和 QA Visual Baseline Slice。QA 不读完整 Drilldown；缺少 QA Visual Baseline Slice 时不得判定 UI 对齐通过。


## v53 role-specific UI skills

UI/Figma 规则按角色拆分。implementer 必须通过自己的 UI execution skill 显式处理 Drilldown Request；QA 必须通过自己的 Visual Baseline skill 做 UI/Figma 验收。不得依赖 MCP 隐式继承或广播完整 UI 规则。


## v54 UI skill 显式触发

UI/Figma 专用 skill 不应长期固定挂载在 subagent 配置中。只有 dispatch-task 的 role_context_packet 明确要求时，implementer / QA 才读取对应 UI skill。


## v55 UI skill invocation policy

UI/Figma 专用 skill 的禁止隐式触发策略必须放在对应 skill 目录的 `agents/openai.yaml`，不得写在 `SKILL.md` frontmatter。`dispatch-task` 仍通过 role_context_packets 显式 `$skill` 触发。
