---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件只保留仓库级全局约束、项目基础上下文和读取边界。

具体 skill 的 phase、gate、模板、MCP 读取、ClickUp 回写、Git 提交流程、Figma/UI 切片、QA 证据、role_context_packets 等细则，必须放在对应 skill 目录及其 `references/` / `assets/` 中，不得写入本全局文件。

## 2. 全局硬规则

1. 不允许无关重构。
2. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
3. 不允许删除有效业务逻辑来让检查通过。
4. 不允许为了通过测试而削弱真实业务约束。
5. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
6. 外部事实必须通过对应 MCP / 工具读取；不得跳过链接内容直接假设。
7. agent 配置中不得加入“运行时配置一致性校验”或“运行时配置校验”相关章节、字段或输出模板。
8. 前端样式组织必须优先使用tailwindcss。
9. 超过500行的代码必须合理解耦拆分模块。
10. 任何的新增复杂功能和模块，交互复杂的前端组件等实现前必须优先深度分析复用性、wrapper/adapter、插件/原生能力，手搓永远是最末位考虑。
11. 如需安装新插件须考证兼容微信小程序、包体积、npm、github验证此依赖的周下载、star数和最近3年的release记录，并提供简短的介绍，征得用户的同意。

## 3. 项目技术上下文

- Frontend：UniApp 3.0，Vue 3，tailwindcss 3。
- JavaScript
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。

## 4. 当前可用 subagent

| 角色               | 全局边界                                                                   |
| ------------------ | -------------------------------------------------------------------------- |
| `code_explorer`    | 可选低成本代码定位器；只读定位入口、调用链、依赖来源或影响范围             |
| `implementer_fast` | 低风险局部契约执行；不做技术方向裁决                                       |
| `implementer_deep` | 高风险 / 多文件契约执行；不做技术方向裁决                                  |
| `qa_reviewer`      | 测试执行、smoke、e2e、UI/Figma 验收、失败归因；不审 diff、不做 code review |
| `docs_keeper`      | 文档落地、索引同步、术语一致性、完整文档交付                               |

## 5. 读取边界

1. Subagent 默认不读取完整 `AGENTS.md`。
2. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
3. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。
4. 任务相关 skill 的专属规则只在该 skill 被调用后按需读取。
5. 不得把完整 ClickUp、完整 Figma、完整日志、完整规则广播给所有角色。
