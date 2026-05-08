---
description: Codex AI Team Rules - token optimized lightweight entrypoint
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件是 Codex main agent 的轻量入口，只保留最高优先级规则、规则索引和最小调度协议。

核心原则：

1. Main agent 默认读取本文件，负责规则路由、任务派发、最终汇总和裁决。
2. Subagent 默认不读取完整 `AGENTS.md`；只读取 main agent 在 Dispatch Plan 中指定的最小必要规则、任务说明、handoff、代码 diff 和验证结果。
3. 仓库文件优先于聊天上下文；聊天上下文只能作为辅助线索。
4. 详细规则必须放入 `docs/ai-rules/`，不要继续膨胀本文件。

## 2. 全局硬规则

1. 不允许无关重构。
2. 除非任务明确要求，不允许新增生产依赖。
3. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
4. 不允许删除有效业务逻辑来让检查通过。
5. diff 必须小、可审查，并严格贴合已批准任务范围。
6. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
7. 用户要求完整交付文档时，不允许只输出补丁片段。
8. 生产方案优先选择国内服务或中国大陆可稳定访问的方案；若使用海外服务，必须说明稳定访问、成本和替代方案。

## 3. 项目技术上下文 -- 见 README.md

标准验证命令：

```bash
npm lint
npm test
npm build
```

当前项目未配置独立 `typecheck` script；需要类型检查时必须先确认可用脚本或工具，不得伪造 `pnpm typecheck` 结果。

## 4. 规则文件索引

Main agent 按任务类型读取。Subagent 只读取 Dispatch Plan 指定的文件。

| 规则类别                   | 文件 | 读取时机 |
|------------------------|---|---|
| 项目硬规则                  | `docs/ai-rules/project-hard-rules.md` | 非简单任务、实现、QA、高风险改造 |
| 工作流细则                  | `docs/ai-rules/codex-ai-workflow.md` | 需要派发、汇总、AI workflow 时 |
| 模型路由                   | `docs/ai-rules/subagent-risk-routing.md` | 需要选择模型或 fast/deep implementer 时 |
| handoff                | `docs/ai-rules/subagent-handoff.md` | 多步骤任务、线程恢复时 |
| 语言术语                   | `docs/ai-rules/language-policy.md` | 中文术语、文档、用户可见表达、诊断概念 |
| replay                 | `docs/ai-rules/diagnosis-replay.md` | diagnose-http、replay、zero-model、route/outcome 验证 |
| CloudBase 部署           | `docs/ai-rules/cloudbase-deployment.md` | 云函数、部署、回滚、smoke、DB 证据 |
| CloudBase 路径解析         | `docs/ai-rules/cloudbase-rule-path-resolution.md` | 需要解析 `rules/*/rule.md` 时 |
| 认证数据库                  | `docs/ai-rules/cloudbase-auth-database.md` | 登录、OPENID、鉴权、NoSQL、MySQL、TDSQL-C |
| 小程序 / uni-app          | `docs/ai-rules/miniprogram-uni-app-platform.md` | 微信小程序、uni-app、端能力、构建 |
| UI 设计路由                | `docs/ai-rules/ui-design-routing.md` | 页面、组件、样式、交互、视觉改动 |
| diagnose-http 云端调试部署避坑 |`docs/ai-rules/diagnose-http-cloud-debugging.md` | 涉及 diagnose-http、CloudBase smoke、replay、网关、MCP、H5 代理、SQL schema、云端日志、部署验收时 |

## 5. Dispatch Plan

非简单任务必须先输出：

```text
Dispatch Plan:
- 任务类型:
- 选择的 subagent:
- 选择原因:
- 需要读取的规则文件:
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
```

简单任务不派发时：

```text
Dispatch Plan:
- 选择的 subagent: none
- 原因: 简单单步任务，无需派发
```

## 6. Subagent 路由摘要

| 任务意图 | 派发角色 |
|---|---|
| 需求不清、拆任务、计划、验收标准 | `task_planner` |
| 找文件、调用链、依赖来源、代码逻辑解释、`docs/code-logics/` 对照 | `code_explorer` |
| 架构、状态/API/数据边界、诊断流、outcome、gate、模块边界、`docs/new-rules/` 一致性 | `architect_reviewer` |
| 局部、低风险、边界明确的小改动 | `implementer_fast` |
| 多文件、诊断流、replay、CloudBase、数据结构、后端高风险实现 | `implementer_deep` |
| diff、测试、回归、边界、模块化回归、规则一致性 | `qa_reviewer` |
| 文档、术语、`docs/code-logics/`、`docs/new-rules/` 同步 | `docs_keeper` |
| 发布、部署、CloudBase、replay、回滚、成本 | `release_ops` |

## 7. 高风险任务默认流程

以下任务必须先只读分析：诊断流、outcome、ranking → route、outcome 瘦身、问题簇、gate、问诊路径、runtime、replay / zero-model、CloudBase 云函数部署、数据结构迁移、API 协议变更、多文件状态管理改造、`docs/new-rules/` 规则解释或落地、`docs/code-logics/` 与实际代码不一致的修正。

默认流程：

1. `code_explorer`
2. `architect_reviewer`
3. `implementer_deep`
4. `qa_reviewer`
5. `docs_keeper`，如果涉及文档
6. `release_ops`，如果涉及部署、CloudBase、replay 或线上验证

## 8. Subagent 读取 AGENTS.md 的例外条件

Subagent 默认不读取完整 `AGENTS.md`。只有以下情况才允许回读：

1. Main agent 未提供 Dispatch Plan。
2. 当前任务缺少明确角色边界或写入权限边界。
3. 需要重新确认 subagent 路由、模型路由或全局硬规则。
4. 线程中断恢复，且任务说明 / handoff 信息不足。
5. 发现分类规则冲突，需要回到根规则确认优先级。
