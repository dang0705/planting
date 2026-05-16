---
description: Codex AI Team Rules - token budget optimized lightweight entrypoint
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## 1. 定位

本文件是 Codex main agent 的仓库级轻量入口，只保留最高优先级规则、规则索引、最小调度协议和上下文预算。

本文件不是完整工作流手册，也不是知识库正文。详细流程、角色职责、长规则、避坑记录、诊断规则与代码逻辑，应放入对应的 `docs/ai-rules/`、`.codex/agents/`、`docs/code-logics/`、`docs/new-rules/`、`docs/ai-tasks/`、`docs/ai-runs/`。

核心原则：

1. Main agent 默认读取本文件，负责规则路由、任务分级、最终汇总和裁决。
2. Subagent 默认不读取完整 `AGENTS.md`；只读取 main agent 在任务说明 / Dispatch Plan 中指定的最小必要摘要、任务说明、handoff、diff、验证结果和少量规则文件。
3. 仓库文件优先于聊天上下文；聊天上下文只能作为辅助线索。
4. 优先让上游 agent 产出摘要，下游 agent 读取摘要，不重复读取源文档。
5. `dispatch` skill 是调度触发器；本文件只定义所有入口都必须遵守的调度底线。

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
10. 提示词中出现部署、sql、查诊断session等与CloudBase相关的关键词，大概率需操作CloudBase，优先使用 CloudBase MCP；但 MCP / 命令返回成功不等于发布验收通过，必须结合部署证据、smoke、DB 证据或日志证据闭环。
11. 文件路径、命令、模型名、agent 名、协议字段和代码标识符可以保留英文；产品表达、诊断概念和文档说明优先中文。
12. 诊断流、outcome、gate、runtime、replay、CloudBase 或前端最终展示类任务，必须先建立“目标验收契约”：区分 bug 发生位置、观察入口、用户可见成功标准、必须验证的 API / DB / UI 字段，以及明确非目标；不得用 review、replay、DB 中间态或命令成功替代用户可见路径验收。

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

Main agent 按任务类型读取。Subagent 只读取任务说明 / Dispatch Plan 指定文件、指定章节或 main agent 摘录。

| 规则类别 | 文件 | 读取时机 |
|---|---|---|
| 项目硬规则 | `docs/ai-rules/project-hard-rules.md` | 非简单任务、实现、QA、高风险改造 |
| 工作流细则 | `docs/ai-rules/codex-ai-workflow.md` | 需要派发、汇总、AI workflow 时 |
| 风险路由 | `docs/ai-rules/subagent-risk-routing.md` | 需要判断 fast/deep implementer 或升级条件时 |
| handoff | `docs/ai-rules/subagent-handoff.md` | 多步骤任务、线程恢复时 |
| 语言术语 | `docs/ai-rules/language-policy.md` | 中文术语、文档、用户可见表达、诊断概念 |
| 大目录索引读取策略 | `docs/ai-rules/large-doc-index-read-policy.md` | 涉及 `docs/code-logics/` 或 `docs/new-rules/` 时，先读索引，不得全量读目录 |
| code-logics 索引 | `docs/code-logics/INDEX.md` | 涉及代码逻辑文档时，先读索引再命中文档 |
| new-rules All-in-One 入口 | `docs/new-rules/planting_ai_diagnosis_source_index.json` + `docs/new-rules/planting_ai_diagnosis_all_in_one.md` | 涉及新规则文档时，先读 JSON 索引，再读 All-in-One 指定章节 / Sxx |
| replay | `docs/ai-rules/diagnosis-replay.md` | diagnose-http、replay、zero-model、route / outcome 验证 |
| CloudBase 部署 | `docs/ai-rules/cloudbase-deployment.md` | 云函数、部署、回滚、smoke、DB 证据 |
| CloudBase 路径解析 | `docs/ai-rules/cloudbase-rule-path-resolution.md` | 需要解析 `rules/*/rule.md` 时 |
| 认证数据库 | `docs/ai-rules/cloudbase-auth-database.md` | 登录、OPENID、鉴权、NoSQL、MySQL、TDSQL-C |
| 小程序 / uni-app | `docs/ai-rules/miniprogram-uniapp-platform.md` | 微信小程序、uni-app、Vue 3、Pinia、端能力、构建 |
| UI 设计路由 | `docs/ai-rules/ui-design-routing.md` | 页面、组件、样式、交互、视觉改动 |
| diagnose-http 云端调试避坑 | `docs/ai-rules/diagnose-http-cloud-debugging.md` | diagnose-http、CloudBase smoke、replay、网关、MCP、H5 代理、SQL schema、云端日志、部署验收 |

---

## 5. 上下文预算规则

Codex 消耗主要来自重复输入上下文。本项目必须优先控制大文档、大目录、重复规则和 subagent 多轮重复读取。

1. Main agent 必须优先生成“规则摘要”，不要让每个 subagent 重复读取完整规则文件。
2. Subagent 默认读取：任务说明 / Dispatch Plan、main agent 摘要、必要任务说明、必要 handoff、当前 diff 或指定代码文件。
3. 单个 subagent 默认读取的规则文件不超过 2 个。
4. 如果需要读取超过 2 个规则文件，任务说明 / Dispatch Plan 必须说明原因。
5. 归档长文档、历史总结、完整避坑记录默认不读；只允许在任务说明 / Dispatch Plan 中指定章节、关键词或问题域后读取。
6. 下游 agent 优先读取上游 agent 的摘要和 handoff，不重复读取源文档。
7. 如果摘要不足，subagent 应请求 main agent 补充摘要或授权读取指定章节，不得自行扩展到全量文档。
8. `AGENTS.md` 只由 main agent 默认读取；subagent 仅在例外条件下回读。
9. `docs/code-logics/` 不得全量读取；必须先读 `docs/code-logics/INDEX.md`，再读取命中的 1～2 个文档或摘要。
10. `docs/new-rules/` 不得全量读取；必须先读 `planting_ai_diagnosis_source_index.json`，再读取 All-in-One 的指定章节或指定 `Sxx`。
11. 不得默认读取 `planting_ai_diagnosis_all_in_one.md` 全文；附录 A 原文只允许在明确指定 `Sxx` 时回查。
12. release / ops 类任务默认不得直接读取 `docs/code-logics/`、`docs/new-rules/` 或 All-in-One；如需规则约束，由 main agent、architect 或 QA 摘录最小发布验收摘要后交给 release_ops。

---

## 6. 任务分级与最小调度规则

本节定义所有入口都必须遵守的调度底线。`$dispatch` skill 可触发更完整的调度流程，但即使未显式调用 `$dispatch`，main agent 也必须遵守本节规则。

### 6.1 简单任务的 main agent 必要动作

简单任务可以不派发 subagent，但 main agent 仍然必须完成最小闭环。简单任务不是“只改代码就结束”。

#### 6.1.1 简单任务定义

满足以下条件时，main agent 可以不派发 subagent：

1. 单文件或极少量文件的小改动。
2. 不涉及诊断流、outcome、gate、replay、CloudBase 发布、数据库结构、API 协议、复杂规则解释或源文档回溯；若只涉及索引定位、轻量 README / 注释 / 避坑索引补充，可仍视为简单任务。
3. 不需要跨文档推理。
4. 不需要架构裁决。
5. 风险边界清楚，且可以由 main agent 直接验证或明确说明未验证原因。

#### 6.1.2 简单任务仍必须检查的事项

main agent 在简单任务中必须检查：

1. 是否需要验证：lint、test、build、局部脚本或人工检查。
2. 是否需要同步文档：README、`docs/ai-rules/`、`docs/code-logics/`、`docs/new-rules/`、`docs/ai-tasks/`、`docs/ai-runs/`、避坑索引。这里的“检查”只指判断是否需要同步，不代表读取对应目录或长文档。
3. 是否影响用户可见中文文案或诊断术语。
4. 是否引入或改变项目约定、命令、路径、环境变量、数据字段、接口字段。
5. 是否只是局部代码实现，还是已经产生了新的规则、流程、踩坑或长期约束。

#### 6.1.3 简单任务下的文档处理规则

1. 如果只是小范围 README、注释、命令说明或局部说明补齐，main agent 可以直接完成。
2. 如果涉及 `docs/code-logics/`，main agent 必须先读 `docs/code-logics/INDEX.md`，不得全量读取目录。
3. 如果简单任务疑似涉及 `docs/new-rules/`，main agent 最多只读取 `docs/new-rules/planting_ai_diagnosis_source_index.json` 做定位；若需要读取 All-in-One 指定章节或 `Sxx` 原文核对，必须升级为非简单任务，重新输出任务分级 / Dispatch Plan。
4. 如果只是补充一条避坑索引，main agent 可以直接更新 `docs/ai-rules/diagnose-http-cloud-debugging.md`。
5. 如果需要整理完整历史细节、同步 All-in-One、更新 source_index，必须改派 `docs_keeper`。
6. 如果需要生成或重写超过 2000 字的完整文档，必须派发 `docs_keeper` 或生成可下载文档。
7. 如果简单代码改动导致规则、流程、接口或诊断语义变化，必须升级为非简单任务，重新输出任务分级 / Dispatch Plan。

#### 6.1.4 简单任务输出格式

简单任务完成时，main agent 最少输出以下字段：

1. 是否派发 subagent。
2. 修改范围。
3. 验证情况。
4. 文档同步检查。
5. 是否需要补充 handoff / task。
6. 风险。
7. 未完成项。

### 6.2 非简单任务 Dispatch Plan

非简单任务必须先输出 Dispatch Plan，再决定是否派发 subagent。

```text
Dispatch Plan:
- 任务类型:
- 目标验收契约:
  - bug 发生位置:
  - 观察入口:
  - 用户可见成功标准:
  - 必须验证字段 / 证据:
  - 非目标:
- 选择的 subagent:
- 选择原因:
- 规则摘要:
- 需要读取的规则文件/章节:
- 规则文件数量是否超过 2 个: 否 / 是，原因：
- 是否涉及 docs/code-logics: 否 / 是；若是，先读 docs/code-logics/INDEX.md，命中文档：
- 是否涉及 docs/new-rules: 否 / 是；若是，先读 planting_ai_diagnosis_source_index.json，命中 source_id / All-in-One 章节：
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
```

### 6.3 高风险任务默认流程

高风险任务不得以“用户未显式要求开启 subagent”为理由跳过 subagent workflow。
一旦任务被判定为高风险，main agent 必须主动派发至少一个只读 subagent：

1. 默认先派发 `code_explorer` 做只读定位。
2. 涉及诊断流、outcome、gate、route、runtime、规则边界或架构判断时，必须再派发 `architect_reviewer`。
3. 涉及实现时，默认派发 `implementer_deep`；只有 `architect_reviewer` 明确裁定为低风险局部展示 / 文案修复时，才允许降级为 `implementer_fast`。
4. 实现后必须派发 `qa_reviewer`。
5. 涉及文档、规则、索引或 All-in-One 时，必须派发 `docs_keeper`。
6. 涉及部署、CloudBase、smoke、DB 证据或回滚时，必须派发 `release_ops`。

高风险任务只有在以下情况下可以不派发 subagent：

1. 用户明确禁止派发 subagent。
2. 当前环境不支持 subagent。
3. 当前任务仅做只读解释，不做实现、不改文件。
4. main agent 明确将任务范围降级为普通或简单任务，并说明降级依据。

以下任务必须先只读分析：诊断流、outcome、ranking → route、outcome 瘦身、问题簇、gate、问诊路径、runtime、replay / zero-model、CloudBase 云函数部署、数据结构迁移、API 协议变更、多文件状态管理改造、`docs/new-rules/` 规则解释或落地、`docs/code-logics/` 与实际代码不一致的修正。

涉及客户端运行时、最终展示、review/list 暴露的历史会话、result/read、follow-up 或 diagnose 页面结果的任务，必须把“观察入口”和“业务修复位置”分开描述；review/list 和 replay 只能作为复现或观察证据，不能单独作为完成验收。

默认流程：

1. `code_explorer`
2. `architect_reviewer`
3. `implementer_deep`
4. `qa_reviewer`
5. `docs_keeper`，如果涉及文档
6. `release_ops`，如果涉及部署、CloudBase、replay 或线上验证

---

## 7. Subagent 路由摘要

| 任务意图 | 派发角色 |
|---|---|
| 需求不清、拆任务、计划、验收标准 | `task_planner` |
| 找文件、调用链、依赖来源、代码逻辑解释、`docs/code-logics/` 对照 | `code_explorer` |
| 架构、状态 / API / 数据边界、诊断流、outcome、gate、模块边界、`docs/new-rules/` 一致性 | `architect_reviewer` |
| 局部、低风险、边界明确的小改动 | `implementer_fast` |
| 多文件、诊断流、replay、CloudBase、数据结构、后端高风险实现 | `implementer_deep` |
| diff、测试、回归、边界、模块化回归、规则一致性 | `qa_reviewer` |
| 文档、术语、`docs/code-logics/`、`docs/new-rules/`、避坑索引同步 | `docs_keeper` |
| 发布、部署、CloudBase、replay、回滚、成本 | `release_ops` |

调度约束：

1. `task_planner` 只输出规划草案，不直接创建或修改正式 `docs/ai-tasks/` 文档；是否落文档由 main agent 确认，必要时派发 `docs_keeper`。
2. `code_explorer` 只读定位，不改代码。
3. `architect_reviewer` 只做架构和规则边界审查，不改代码。
4. `implementer_fast` 只处理低风险局部实现；一旦发现范围扩大，必须请求升级到 `implementer_deep`。
5. `implementer_deep` 处理高风险实现；涉及部署时必须交给 `release_ops` 复核。
6. `qa_reviewer` 只审查，不改代码。
7. `docs_keeper` 负责文档持久化、索引同步、术语一致性和完整文档交付。
8. `release_ops` 默认不读取大规则目录，只消费发布 / 验收相关摘要和部署证据。

---

## 8. Subagent 读取 AGENTS.md 的例外条件

Subagent 默认不读取完整 `AGENTS.md`。只有以下情况才允许回读：

1. Main agent 未提供任务说明 / Dispatch Plan。
2. 当前任务缺少明确角色边界或写入权限边界。
3. 需要重新确认 subagent 路由、风险路由或全局硬规则。
4. 线程中断恢复，且任务说明 / handoff 信息不足。
5. 发现分类规则冲突，需要回到根规则确认优先级。

即使回读，也只提取当前任务相关规则，不把完整 `AGENTS.md` 作为长期上下文。
