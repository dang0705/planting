---
description: Codex AI Team Rules - global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# Repository Agent Rules

## 1. 定位

本文件只保留仓库级全局约束、项目基础上下文和读取边界。

具体 skill 的 phase、gate、模板、MCP 读取、ClickUp 回写、Git 提交流程、Figma/UI 切片、QA 证据、role_context_packets 等细则，必须放在对应 skill 目录及其 `references/` / `assets/` 中，不得写入本全局文件。

## 2. 全局硬规则

1. 避免无关重构但必须删除用户明确说不需要或业务逻辑上已被替代或不再需要的代码，不得使用fallback、兜底等手段保留、兼容此类代码。
2. 不允许绕过oxlintrc/oxfmtrc、测试失败或构建失败。
3. 不允许删除有效业务逻辑来让检查通过。
4. 不允许为了通过测试而削弱真实业务约束。
5. 未经允许严禁开启 CloudBase 或任何可能导致付费的功能如云函数的预置并发。
6. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
7. 外部事实必须通过对应 MCP / 工具读取；不得跳过链接内容直接假设。
8. 项目内已经有完美适配小程序的 Tailwind Css 解决方案，前端的样式组织不允许以任何理由跳过、无视 Tailwind Css，必须首先考虑使用它组织样式。
9. 超过 500 行的代码必须合理解耦拆分模块。
10. 任何新增复杂功能和模块、交互复杂的前端组件等，实现前必须优先深度分析复用性、wrapper / adapter、插件 / 原生能力；手搓永远是最末位考虑。
11. 如需安装新插件，必须考证其兼容微信小程序、包体积、npm / GitHub 状态、周下载量、star 数和最近 3 年 release 记录，并提供简短介绍，征得用户同意。
12. 当前项目处于研发未上线阶段，除非用户明确要兼容旧逻辑或功能，否则默认新逻辑完整替代旧逻辑，旧逻辑代码、相关依赖树必须予以彻底地调整和删除。严禁写兜底、兼容的代码。

## 3. 项目技术上下文

- Frontend：UniApp 3.0，Vue 3，Tailwind CSS 3。
- Language：JavaScript。
- Lint: oxlint
- formatter: oxformat
- State：Pinia。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。

## 4. 当前可用 subagent

| 角色               | 全局边界                                                                       |
| ------------------ | ------------------------------------------------------------------------------ |
| `code_explorer`    | 可选低成本代码定位器；只读定位入口、调用链、依赖来源或影响范围                 |
| `implementer_fast` | 低风险局部契约执行；不做技术方向裁决                                           |
| `implementer_deep` | 高风险 / 多文件契约执行；不做技术方向裁决                                      |
| `qa_reviewer`      | 测试执行、smoke、e2e、UI / Figma 验收、失败归因；不审 diff、不做 code review   |
| `docs_keeper`      | 知识卫生、活文档维护、索引同步、术语一致性、旧文档归档；不维护旧蓝图为当前事实 |

## 5. 读取边界

1. Subagent 默认不读取完整 `AGENTS.md`。
2. `docs/code-logics/` 不得全量读取；先读 `INDEX.md`。
3. `docs/new-rules/` 不得全量读取；先读 source index，再按需读取指定章节 / Sxx。
4. 任务相关 skill 的专属规则只在该 skill 被调用后按需读取。
5. 不得把完整 ClickUp、完整 Figma、完整日志、完整规则广播给所有角色。

## 6. 知识治理边界

1. 代码、测试、schema、配置和 package scripts 是事实源。
2. Active docs 只解释当前契约和操作方式，不是第二事实源。
3. BRV 记忆只作为索引使用；不得覆盖代码事实。
4. archived / superseded / stale 文档不得作为当前实现依据。
5. 不得默认全量读取 `docs/`、`.brv/`、`.codex/skills/**/references/`、`docs/code-logics/`、`docs/new-rules/`、`docs/ai-runs/`、`docs/route规划及outcome瘦身计划/`。
6. 任务上下文必须优先通过 `.codex/context-packs.yml` 选择最小文件包。
7. `docs_keeper` 负责知识卫生、活文档维护、索引同步和旧文档归档；不得维护旧蓝图为当前事实。
