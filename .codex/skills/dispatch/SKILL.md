---
name: dispatch
description: "调度决策 skill：按 AGENTS.md 判断任务是否进入 subagent workflow；简单任务只输出降级判断并退出调度，交由 main agent 按 AGENTS.md 6.1 完成闭环；非简单/高风险任务输出 Dispatch Plan、规则摘要、读取边界、subagent 选择与写入权限。"
---

# Dispatch Skill

## 1. 定位

本 skill 是 **调度决策 skill**，不是普通执行 skill。

它的职责是：

1. 判断当前任务是否需要进入 subagent workflow。
2. 简单任务：只输出降级判断，退出 subagent 调度。
3. 非简单任务：输出完整 Dispatch Plan，并按需派发 subagent。
4. 高风险任务：强制先只读分析，再进入实现、审查、文档或发布流程。
5. 控制上下文读取预算，避免 subagent 重复读取 `AGENTS.md`、大目录、All-in-One 或归档长文档。

本 skill 不直接完成简单任务实现。简单任务由 main agent 按 `AGENTS.md` 的 6.1 独立完成闭环。

---

## 2. 使用方式

当用户输入以下意图时，应使用本 skill：

- “按调度处理”
- “先判断是否需要派发”
- “先派发”
- “自动选择 subagent”
- “复杂任务先规划”
- “根据 AGENTS.md 调度”
- “先输出 Dispatch Plan”
- “先判断任务复杂度”
- “先只读分析”
- 涉及架构、诊断流、outcome、gate、replay、CloudBase、部署、测试、文档、多文件改造、规则落地、代码逻辑比对
- 涉及诊断 `fast path`、`warm path`、`early return`、缓存命中、性能优化路径，或任何可能提前输出 follow-up / final / outcome 的分支

如果用户没有显式调用 `$dispatch`，但任务明显属于非简单或高风险任务，main agent 也应按 `AGENTS.md` 的任务分级与最小调度规则处理。

---

## 3. 前置读取规则

1. 先读取根目录 `AGENTS.md` 中与当前任务相关的最小调度规则，包括任务分级、简单任务闭环、上下文预算、subagent 路由和高风险任务边界。
2. 只提取当前 Dispatch Decision / Dispatch Plan 所需内容，不把完整 `AGENTS.md` 作为长期工作上下文，也不得把 `AGENTS.md` 转交给 subagent 全量读取。
3. 不把完整 `AGENTS.md` 作为长期工作上下文。
4. 不主动读取 `docs/code-logics/`、`docs/new-rules/`、All-in-One 或归档长文档。
5. 如任务需要读取大目录，必须先走索引：
   - `docs/code-logics/INDEX.md`
   - `docs/new-rules/planting_ai_diagnosis_source_index.json`
6. 如任务需要读取 `planting_ai_diagnosis_all_in_one.md`，必须指定章节或 `Sxx`，不得默认全量读取全文。
7. 如果本轮开启或继续 subagent，必须遵守 `docs/ai-rules/subagent-thread-reuse.md` 的同角色线程复用规则。

---

## 4. 任务分级规则

### 4.1 简单任务

满足以下条件时，可降级为简单任务：

1. 单文件或极少量文件的小改动。
2. 不涉及诊断流、outcome、gate、replay、CloudBase 发布、数据库结构、API 协议、复杂规则解释、源文档回溯、诊断 `fast path` / `early return` / 性能优化路径。
3. 不需要跨文档推理。
4. 不需要架构裁决。
5. 风险边界清楚，且 main agent 可以直接验证或明确说明未验证原因。

简单任务不进入 subagent workflow。

### 4.2 非简单任务

满足以下任一条件，应进入 Dispatch Plan：

1. 需要代码定位、调用链、依赖来源或逻辑比对。
2. 涉及多个文件或多个模块。
3. 涉及文档同步、规则同步、避坑索引、All-in-One、source_index。
4. 涉及 API、数据字段、状态管理、页面流程、组件边界。
5. 需要 QA、回归、边界条件、diff 审查。
6. 需要明确读取规则文件、索引、章节或摘要。

### 4.3 高风险任务

以下任务必须先只读分析，不得直接实现：

1. 诊断流。
2. outcome。
3. ranking → route。
4. outcome 瘦身。
5. 问题簇。
6. gate 守卫。
7. 问诊路径。
8. runtime。
9. replay / zero-model。
10. diagnose-http。
11. CloudBase 云函数部署。
12. SQL schema / MySQL / TDSQL-C。
13. 数据结构迁移。
14. API 协议变更。
15. 多文件状态管理改造。
16. `docs/new-rules/` 规则解释或落地。
17. `docs/code-logics/` 与实际代码不一致的修正。
18. 诊断 `fast path`、`warm path`、`early return`、缓存命中、性能优化路径，或任何可能提前输出 follow-up / final / outcome 的分支。

---

## 5. 执行规则

1. 先判断任务类型：简单任务 / 非简单任务 / 高风险任务。
2. 如果判断为简单任务，只输出“简单任务降级判断”，不派发 subagent。
3. 如果判断为非简单任务或高风险任务，输出完整 Dispatch Plan。

非简单实现任务最小闭环：

- planning：由 main agent 在 Dispatch Plan 中完成；如果需求、非目标、验收标准或写入边界不清，必须派发 `task_planner` 输出规划草案。
- 架构分析：默认派发 `architect_reviewer`；只有纯只读、纯文档、已知单点低风险改动，且 Dispatch Plan 写明裁剪理由时才可由 main agent 直接承担。
- 代码执行：由 `implementer_fast` / `implementer_deep` 或 main agent 在明确写入边界内完成；高风险实现默认 `implementer_deep`。
- QA：实现后必须有 `qa_reviewer` 或 main agent 的明确复核；高风险、跨模块、用户可见路径或规则一致性任务默认派发 `qa_reviewer`。
- 文档同步：若涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index，必须派发 `docs_keeper`；若不需要同步，最终汇总必须说明理由。

纯只读分析、纯文档整理、纯配置检查等无法自然包含“代码执行”的任务，必须在 Dispatch Plan 中把实现闭环标记为“无代码实现”并说明原因，不能默默跳过。

高风险硬约束：

- 一旦任务被判定为高风险，不得以“用户未显式要求开启 subagent”为理由跳过 subagent workflow。
- 高风险任务必须至少派发 `code_explorer` 做只读定位。
- 涉及架构、规则边界、诊断流、outcome、gate、route 或 runtime 时，必须派发 `architect_reviewer`。
- 涉及诊断快捷路径时，`code_explorer` 必须单列主链与快捷路径，`architect_reviewer` 必须审查共享 guard 和负向回归。
- 高风险任务若需要实现，默认派发 `implementer_deep`；只有 `architect_reviewer` 明确裁定为低风险局部展示 / 文案修复时，才允许降级为 `implementer_fast`。
- 高风险任务若不派发 subagent，必须说明合法例外：用户明确禁止派发、当前环境不支持 subagent、任务仅做只读解释且不改文件，或 main agent 已明确将任务范围降级为普通 / 简单任务并说明依据。

高风险首尾闭环：

- 高风险任务必须具备首部规划闭环和尾部文档闭环，但不要求无条件派发所有角色。
- 首部规划闭环：如果用户需求、非目标、验收标准、写入边界已经清楚，main agent 可以直接在 Dispatch Plan 中完成规划说明；如果任一项不清楚，必须派发 `task_planner` 输出规划草案。
- `task_planner` 只输出规划草案，不直接创建或修改正式 `docs/ai-tasks/` 文档；是否落文档由 main agent 确认，必要时派发 `docs_keeper`。
- 尾部文档闭环：所有高风险任务完成实现或 QA 后，main agent 必须判断是否需要文档同步。
- 若高风险任务涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index，必须派发 `docs_keeper`。
- 若判断不需要文档同步，main agent 必须在最终汇总中说明“不需要同步”的理由。

4. 非简单任务必须明确选择哪些 subagent；简单任务不选择 subagent。
5. 非简单任务必须明确每个 subagent 需要读取哪些规则文件、索引、章节或摘要。
6. 默认要求 subagent 不读取完整 `AGENTS.md`。
7. 优先只读探索，再进入实现。
8. 高风险实现默认使用 `implementer_deep`。
9. 低风险、小范围实现使用 `implementer_fast`。
10. subagent 返回后，main agent 必须汇总结论、证据、冲突点、风险点和下一步建议。
11. 如果判断为简单任务，main agent 后续按 `AGENTS.md` 的 6.1“简单任务的 main agent 必要动作”完成简单任务闭环。
12. 如果任务从简单任务升级为非简单任务，必须重新输出 Dispatch Plan。
13. 如果任务从非简单任务升级为高风险任务，必须暂停实现，补充分级说明和只读分析步骤。

---

## 6. 上下文预算规则

1. Dispatch Plan 必须优先提供规则摘要。
2. 单个 subagent 默认读取的规则文件不超过 2 个。
3. 超过 2 个规则文件时，必须说明原因。
4. 下游 subagent 优先读取上游摘要和 handoff，不重复读取源文档。
5. `docs/code-logics/` 不得全量读取；必须先读 `docs/code-logics/INDEX.md`。
6. `docs/new-rules/` 不得全量读取；必须先读 `docs/new-rules/planting_ai_diagnosis_source_index.json`。
7. `planting_ai_diagnosis_all_in_one.md` 不得默认全量读取；只允许读取指定章节或指定 `Sxx`。
8. release / ops 类任务默认不得直接读取 `docs/code-logics/`、`docs/new-rules/` 或 All-in-One；如需规则约束，由 main agent、architect 或 QA 摘录最小发布验收摘要后交给 `release_ops`。
9. 如果 subagent 认为摘要不足，应请求 main agent 补充摘要或授权读取指定章节，不得自行扩展到全量目录。
10. 同一会话中同一角色的 subagent 必须复用同一线程；继续同角色任务时优先 `send_input` 复用，只有旧线程失效或职责边界改变时才允许重开，并记录原因。

---

## 7. subagent 路由规则

| 任务意图 | 推荐 subagent | 写入权限 |
|---|---|---|
| 需求不清、拆任务、计划、验收标准 | `task_planner` | 只读，不落正式文档 |
| 找文件、调用链、依赖来源、代码逻辑解释、`docs/code-logics/` 对照 | `code_explorer` | 只读 |
| 架构、状态/API/数据边界、诊断流、outcome、gate、模块边界、`docs/new-rules/` 一致性 | `architect_reviewer` | 只读 |
| 局部、低风险、边界明确的小改动 | `implementer_fast` | workspace-write |
| 多文件、诊断流、route / outcome / gate / runtime、诊断快捷路径、replay、CloudBase、数据结构、后端高风险实现 | `implementer_deep` | workspace-write |
| diff、测试、回归、边界、模块化回归、规则一致性 | `qa_reviewer` | 只读 |
| 文档、术语、`docs/code-logics/`、`docs/new-rules/`、避坑索引、All-in-One、source_index 同步 | `docs_keeper` | workspace-write |
| 发布、部署、CloudBase、replay、回滚、成本 | `release_ops` | 默认只读；执行发布需 main agent 明确授权 |

---

## 8. 关键角色交付物底线

本节定义关键角色在任务完成后必须交付的最小产物。具体输出模板可以由各自 `.codex/agents/*.toml` 细化，但不得低于本节要求。

### 8.1 task_planner

`task_planner` 只输出规划草案，不直接创建或修改正式 `docs/ai-tasks/` 文档。是否落正式任务文档，由 main agent 确认；需要持久化时，由 main agent 派发 `docs_keeper` 或亲自执行。

规划草案必须至少包含：

1. 目标。
2. 非目标。
3. 涉及文件 / 模块。
4. 写入边界。
5. 需要读取的规则、索引、章节或摘要建议。
6. 风险。
7. 验收标准。
8. 建议派发角色。
9. 是否建议落入 `docs/ai-tasks/`。
10. 是否需要创建或更新 `docs/ai-runs/` handoff。

### 8.2 implementer_fast / implementer_deep

实现类 subagent 完成后必须输出实现交付物。`implementer_fast` 和 `implementer_deep` 默认不直接更新 `docs/new-rules/`、All-in-One、source_index 或正式规则文档；除非 Dispatch Plan 明确授权。若实现变更影响规则、流程、接口、字段、状态、问诊链路、展示契约或避坑记录，必须在文档同步建议中说明。

实现交付物必须至少包含：

1. 修改文件清单。
2. 核心改动。
3. 未改动内容。
4. 验证结果。
5. 风险。
6. 文档同步建议。
7. 是否需要 `qa_reviewer`。
8. 是否需要 `docs_keeper`。
9. 是否需要 `release_ops`。
10. 给后续 agent 的 handoff 摘要。

`implementer_deep` 还必须额外说明：

1. 是否触及高风险边界。
2. 是否改变诊断语义、route / outcome / gate / runtime 行为。
3. 是否需要 replay、smoke、DB 证据或发布审查。
4. 是否触及 `fast path` / `warm path` / `early return` / 缓存命中；若触及，必须列出共享 guard、负向回归和正向闭合样本。

### 8.3 docs_keeper

`docs_keeper` 被派发后必须交付文档维护产物。若 Dispatch Plan 明确要求文档同步，或上游 agent 标记需要文档同步，`docs_keeper` 不得只输出“建议更新”；若不实际更新，必须说明权限、范围、证据或裁决原因。

文档维护产物必须至少包含：

1. 已读取文档。
2. 已更新文档。
3. 未更新原因。
4. 是否同步 `docs/code-logics/INDEX.md`。
5. 是否同步 `docs/new-rules/planting_ai_diagnosis_source_index.json`。
6. 是否同步 `docs/new-rules/planting_ai_diagnosis_all_in_one.md`。
7. 是否同步 `docs/ai-rules/diagnose-http-cloud-debugging.md` 避坑索引。
8. 术语一致性检查。
9. 文档变更风险。
10. 后续建议。

当文档更新涉及 All-in-One 或 source_index 时，`docs_keeper` 必须显式说明：

1. 命中的 `source_id`。
2. 更新的是摘要区、索引、附录 `Sxx`，还是归档源文档。
3. 是否需要同步 README、AGENTS、SKILL 或 subagent 配置。

---

## 9. 典型流程

### 9.1 简单任务

```text
用户任务
→ skill 判断为简单任务
→ 输出 Dispatch Decision
→ 退出 subagent workflow
→ main agent 按 AGENTS.md 6.1 完成验证、文档同步检查、风险说明
```

### 9.2 普通非简单任务

```text
用户任务
→ 输出 Dispatch Plan
→ planning 闭环：main agent 已完成；若需求 / 非目标 / 验收标准 / 写入边界不清，先派发 task_planner
→ code_explorer 只读定位
→ architect_reviewer 审查架构、边界和规则一致性
→ implementer_fast 或 implementer_deep 实现
→ qa_reviewer 审查
→ main agent 判断是否需要文档同步
→ 如涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index，派发 docs_keeper
```

### 9.3 高风险任务

```text
用户任务
→ 输出 Dispatch Plan，并完成首部规划闭环
→ 若目标 / 非目标 / 验收标准 / 写入边界不清，先派发 task_planner 输出规划草案
→ code_explorer 只读定位
→ architect_reviewer 审查边界
→ implementer_deep 实现
→ qa_reviewer 审查
→ main agent 判断是否需要文档同步
→ 如涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index，派发 docs_keeper
→ 如涉及部署 / CloudBase / smoke / DB / 回滚，派发 release_ops
```

---

## 10. 输出格式

### 10.1 简单任务降级格式

```text
Dispatch Decision:
- 任务类型: 简单任务
- 是否进入 subagent workflow: 否
- 原因:
- 后续处理: main agent 按 AGENTS.md 6.1 完成简单任务闭环
- 简单任务闭环提醒:
  - 验证情况:
  - 文档同步检查:
  - 风险:
  - 未完成项:
```

### 10.2 非简单任务 Dispatch Plan 格式

```text
Dispatch Plan:
- 任务类型:
- 风险等级: 普通 / 高风险
- 是否高风险: 否 / 是
- 高风险是否派发 subagent: 否 / 是
- 如高风险但不派发，合法例外: 用户明确禁止 / 环境不支持 / 只读解释且不改文件 / 已降级任务范围
- 目标验收契约:
  - bug 发生位置:
  - 观察入口:
  - 用户可见成功标准:
  - 必须验证字段 / 证据:
  - 快捷路径 / 主链守卫一致性:
  - 非目标:
- 选择的 subagent:
- 选择原因:
- 是否降级为简单任务: 否
- 规则摘要:
- 需要读取的规则文件/索引/章节/摘要:
- 规则文件数量是否超过 2 个: 否 / 是，原因：
- 是否涉及 docs/code-logics: 否 / 是；如果是，先读 docs/code-logics/INDEX.md，命中文档：
- 是否涉及 docs/new-rules: 否 / 是；如果是，先读 docs/new-rules/planting_ai_diagnosis_source_index.json，命中 source_id / All-in-One 章节：
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
- 首部规划闭环: 需求 / 非目标 / 验收标准 / 写入边界是否已清楚；是否需要 task_planner
- 架构分析闭环: 是否需要 architect_reviewer；若不需要，裁剪理由：
- 实现闭环: implementer_fast / implementer_deep / main agent 直接执行 / 无代码实现，原因：
- QA 闭环: qa_reviewer / main agent 直接复核 / 合法裁剪，原因：
- 尾部文档闭环: 是否需要文档同步判断；是否可能需要 docs_keeper
- Subagent 线程复用: 本轮是否已有同角色线程；复用 / 新开 / 未开启：
- 验证计划:
- 文档同步计划:
```

### 10.3 subagent 返回汇总格式

```text
Subagent Summary:
- 已调用 subagent:
- Subagent 线程复用: 复用 / 新开 / 未开启；如新开同角色线程，原因：
- 关键结论:
- 证据:
- 冲突点:
- 风险:
- 是否需要继续实现:
- 是否需要 QA:
- 是否需要 docs_keeper: 是 / 否；若否，说明不需要文档同步的理由
- 是否需要 release_ops:
- 下一步:
```

---

## 11. 禁止事项

1. 禁止把简单任务强行推进 subagent workflow。
2. 禁止未分类就直接实现非简单任务。
3. 禁止高风险任务跳过只读分析。
4. 禁止让多个可写 subagent 同时修改同一批文件。
5. 禁止 subagent 默认读取完整 `AGENTS.md`。
6. 禁止 subagent 默认全量读取 `docs/code-logics/`、`docs/new-rules/` 或 All-in-One。
7. 禁止 release_ops 直接读取诊断规则大目录或 All-in-One 原文。
8. 禁止 task_planner 直接创建或修改正式 `docs/ai-tasks/` 文档；它只输出规划草案。
9. 禁止把工具命令成功等同于业务验收通过。
10. 禁止在同一会话中并行启动同一角色的多个 subagent 线程；同角色后续任务必须优先复用已有线程。
11. 禁止诊断快捷路径只验证完整 happy path；涉及提前输出分支时必须有“应继续追问而非 final”的负向回归。
