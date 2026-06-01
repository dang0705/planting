---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件只保留仓库级全局约束、项目基础上下文和读取边界。


## 2. 全局硬规则

1. 不允许无关重构。
2. 除非任务明确要求，不允许新增生产依赖。
3. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
4. 不允许删除有效业务逻辑来让检查通过。
5. 不允许为了通过测试而削弱真实业务约束。
6. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
7. 用户要求完整交付文档时，不允许只输出补丁片段。
8. 外部事实必须通过对应 MCP / 工具读取；不得跳过链接内容直接假设。
9. 不得在 AGENTS、SKILL、references、assets、agent 配置或长期文档中追加版本号补丁章节；新增内容必须融入既有章节结构。
10. agent 配置中不得加入“运行时配置一致性校验”或“运行时配置校验”相关章节、字段或输出模板。

## 3. 项目技术上下文

- Frontend：UniApp 3.0，Vue 3。
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。

## 4. 当前可用 subagent

| 角色 | 全局边界 |
|---|---|
| `code_explorer` | 可选低成本代码定位器；只读定位入口、调用链、依赖来源或影响范围 |
| `implementer_fast` | 低风险局部契约执行；不做技术方向裁决 |
| `implementer_deep` | 高风险 / 多文件契约执行；不做技术方向裁决 |
| `qa_reviewer` | 测试执行、smoke、e2e、UI/Figma 验收、失败归因；不审 diff、不做 code review |
| `docs_keeper` | 文档落地、索引同步、术语一致性、完整文档交付 |

## 5. 读取边界

1. Subagent 默认不读取完整 `AGENTS.md`。
2. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
3. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。
4. 任务相关 skill 的专属规则只在该 skill 被调用后按需读取。
5. 不得把完整 ClickUp、完整 Figma、完整日志、完整规则广播给所有角色。
