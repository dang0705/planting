---
description: Codex AI Team Rules - lightweight global guardrails
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件是仓库级轻量入口，只保留全局硬规则、项目技术上下文、规则索引和上下文预算底线。

本文件不是完整工作流手册，不承载具体 skill 的执行流程。任务编排、ClickUp 读取、Figma 分层、实现契约、测试契约、QA、文档同步、Git 提交等流程细节，均由对应 skill 和 `docs/ai-rules/` 规则文件承担。

核心原则：

1. Main agent 默认读取本文件，只用于确认全局硬规则、项目上下文和规则入口。
2. Subagent 默认不读取完整 `AGENTS.md`；只读取 main agent 传递的任务边界、最小规则摘要、handoff、diff / 变更摘要、验证结果和少量被指定的规则文件。
3. 仓库文件优先于聊天上下文；聊天上下文只能作为辅助线索。
4. 上游 agent / skill 应产出结构化摘要，下游 agent 优先读取摘要，不重复读取源文档。
5. 具体执行流程不得写入本文件，避免全局上下文膨胀和配置漂移。

---

## 2. 全局硬规则

1. 不允许无关重构。
2. 除非任务明确要求，不允许新增生产依赖。
3. 不允许绕过类型错误、Lint 错误、测试失败或构建失败。
4. 不允许删除有效业务逻辑来让检查通过。
5. 不允许为了通过测试而削弱真实业务约束。
6. diff 必须小、可审查，并严格贴合已批准任务范围。
7. 中文是一等公民；文档、注释、产品术语和诊断领域概念必须中文优先。
8. 用户要求完整交付文档时，不允许只输出补丁片段。
9. 生产方案优先选择国内服务或中国大陆可稳定访问的方案；若使用海外服务，必须说明稳定访问、成本和替代方案。
10. 提示词中出现部署、SQL、查诊断 session、云函数、CloudBase、DB 证据、smoke、replay 等关键词时，大概率需要操作 CloudBase 或对应工具；工具返回成功不等于发布验收通过，必须结合部署证据、smoke、DB 证据或日志证据闭环。
11. 文件路径、命令、模型名、agent 名、协议字段和代码标识符可以保留英文；产品表达、诊断概念和文档说明优先中文。
12. 诊断流、outcome、gate、runtime、replay、CloudBase 或前端最终展示类任务，必须先建立目标验收契约：区分 bug 发生位置、观察入口、用户可见成功标准、必须验证的 API / DB / UI 字段，以及明确非目标。
13. 诊断 `fast path`、`warm path`、`early return`、缓存命中或性能优化路径不得绕过主链 follow-up / final / output eligibility guard；凡触及提前输出分支，必须验证负向样本和完整路径正向样本。
14. 任何需要 Figma、GitHub、ClickUp、微信开发者工具、CloudBase 等外部事实的任务，必须使用对应 MCP / 工具获取事实；不得跳过链接内容读取后直接假设。

---

## 3. 项目技术上下文

项目技术栈以 `README.md`、`package.json` 和仓库实际文件为准。

当前已知项目上下文：

- Frontend：UniApp 3.0，Vue 3 语法。
- State：Pinia。
- Styling：Tailwind CSS。
- Build：Vite。
- Platform：微信小程序优先。
- Backend / Cloud：Tencent CloudBase、Cloud Functions、MySQL / TDSQL-C 相关工作流。
- AI：视觉识别与诊断链路涉及 Qwen / 混元 Vision 等能力。

不得把本项目默认当作 Taro / React / Zustand 项目处理。若仓库实际文件与上述上下文冲突，必须先报告并请求 main agent 裁决。

标准验证命令以 `package.json` 为准。若无确认，不得伪造验证结果。常见候选命令：

```bash
npm run lint
npm run build
npm test
```

当前项目若未配置独立 `typecheck` script，不得伪造 `typecheck` 结果。

---

## 4. 规则文件索引

Main agent 按任务类型读取。Subagent 只读取任务说明中指定的文件、章节或 main agent 摘录。

| 规则类别 | 文件 | 读取时机 |
|---|---|---|
| 项目硬规则 | `docs/ai-rules/project-hard-rules.md` | 非简单任务、实现、QA、高风险改造 |
| 工作流细则 | `docs/ai-rules/codex-ai-workflow.md` | 需要理解角色分工、上下文预算、工单驱动流程时 |
| 风险路由 | `docs/ai-rules/subagent-risk-routing.md` | 需要判断实现风险、升级条件时 |
| handoff | `docs/ai-rules/subagent-handoff.md` | 多步骤任务、线程恢复时 |
| 线程复用 | `docs/ai-rules/subagent-thread-reuse.md` | 同一会话内复用 subagent 线程时 |
| 语言术语 | `docs/ai-rules/language-policy.md` | 中文术语、文档、用户可见表达、诊断概念 |
| 大目录索引读取策略 | `docs/ai-rules/large-doc-index-read-policy.md` | 涉及 `docs/code-logics/` 或 `docs/new-rules/` 时 |
| code-logics 索引 | `docs/code-logics/INDEX.md` | 涉及代码逻辑文档时，先读索引再命中文档 |
| new-rules All-in-One 入口 | `docs/new-rules/planting_ai_diagnosis_source_index.json` + `docs/new-rules/planting_ai_diagnosis_all_in_one.md` | 涉及新规则文档时，先读 JSON 索引，再读指定章节 / Sxx |
| replay | `docs/ai-rules/diagnosis-replay.md` | diagnose-http、replay、zero-model、route / outcome 验证 |
| CloudBase 部署 | `docs/ai-rules/cloudbase-deployment.md` | 云函数、部署、回滚、smoke、DB 证据 |
| CloudBase 路径解析 | `docs/ai-rules/cloudbase-rule-path-resolution.md` | 需要解析 `rules/*/rule.md` 时 |
| 认证数据库 | `docs/ai-rules/cloudbase-auth-database.md` | 登录、OPENID、鉴权、NoSQL、MySQL、TDSQL-C |
| 小程序 / uni-app | `docs/ai-rules/miniprogram-uniapp-platform.md` | 微信小程序、uni-app、Vue 3、Pinia、端能力、构建 |
| 前端自动化 id | `docs/ai-rules/frontend-automation-id-policy.md` | 小程序前端可见验收、稳定选择器、微信开发者工具自动化 |
| UI 设计路由 | `docs/ai-rules/ui-design-routing.md` | 页面、组件、样式、交互、视觉改动 |
| diagnose-http 云端调试避坑 | `docs/ai-rules/diagnose-http-cloud-debugging.md` | diagnose-http、CloudBase smoke、replay、网关、MCP、H5 代理、SQL schema、云端日志、部署验收 |

---

## 5. 上下文预算规则

1. Main agent 必须优先生成结构化摘要，不要让每个 subagent 重复读取完整规则文件。
2. Subagent 默认读取：任务说明、main agent 摘要、必要 handoff、当前变更摘要、验证结果或指定代码文件。
3. 单个 subagent 默认读取的规则文件不超过 2 个。
4. 如果需要读取超过 2 个规则文件，任务说明必须说明原因。
5. 归档长文档、历史总结、完整避坑记录默认不读；只允许在任务说明中指定章节、关键词或问题域后读取。
6. 下游 agent 优先读取上游 agent 的摘要和 handoff，不重复读取源文档。
7. 如果摘要不足，subagent 应请求 main agent 补充摘要或授权读取指定章节，不得自行扩展到全量文档。
8. `AGENTS.md` 只由 main agent 默认读取；subagent 仅在例外条件下回读。
9. `docs/code-logics/` 不得全量读取；必须先读 `docs/code-logics/INDEX.md`，再读取命中的 1～2 个文档或摘要。
10. `docs/new-rules/` 不得全量读取；必须先读 `planting_ai_diagnosis_source_index.json`，再读取 All-in-One 的指定章节或指定 `Sxx`。
11. 不得默认读取 `planting_ai_diagnosis_all_in_one.md` 全文；附录 A 原文只允许在明确指定 `Sxx` 时回查。
12. 发布 / 运维 / CloudBase 证据类任务默认不得直接读取大规则目录或 All-in-One；如需规则约束，由 main agent 或相关 reviewer 摘录最小发布验收摘要后再进入对应证据复核流程。
13. 同一会话中同一角色的 subagent 必须复用同一线程；继续同角色任务时优先复用，只有旧线程失效或职责边界改变时才允许重开，并记录原因。

---

## 6. Subagent 全局边界

| 角色 | 全局边界 |
|---|---|
| `code_explorer` | 可选低成本代码定位器；只在入口、调用链、依赖来源或影响范围不清时使用；不改代码，不做架构裁决 |
| `architect_reviewer` | 可选独立架构复核角色；只在高风险、复杂、争议、main agent 不确定、Contract 与 QA 冲突、返工无法收敛或用户明确要求时使用；不改代码 |
| `implementer_fast` | 低风险局部契约执行；发现范围扩大必须请求升级 |
| `implementer_deep` | 高风险、多文件、诊断流、CloudBase、数据结构等契约执行；不承担技术方向裁决 |
| `qa_reviewer` | 只做测试、回归、验收证据、前端自动化、未验证项和质量缺口；不得做代码 review |
| `docs_keeper` | 负责文档持久化、索引同步、术语一致性和完整文档交付 |

### 6.1 Subagent 读取 AGENTS.md 的例外条件

Subagent 默认不读取完整 `AGENTS.md`。只有以下情况才允许回读：

1. Main agent 未提供任务说明。
2. 当前任务缺少明确角色边界或写入权限边界。
3. 需要重新确认全局硬规则。
4. 线程中断恢复，且任务说明 / handoff 信息不足。
5. 发现分类规则冲突，需要回到根规则确认优先级。

即使回读，也只提取当前任务相关规则，不把完整 `AGENTS.md` 作为长期上下文。
