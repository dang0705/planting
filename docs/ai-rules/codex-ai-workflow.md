# Codex / Subagent 工作流规则

## 1. 定位

本文件细化 `AGENTS.md` 的主代理调度协议，重点约束“按需摘要、少读原文、减少重复上下文”。

## 2. 核心原则

1. Main agent 先分类、再派发、再汇总。
2. Main agent 优先生成规则摘要，下游 subagent 优先读摘要，不重复读源文档。
3. Subagent 默认不读取完整 `AGENTS.md`。
4. Subagent 默认不自行扩展读取长文档。
5. 只在 Dispatch Plan 指定时读取规则原文；归档长文档必须指定章节、关键词或问题域。
6. 多个可写 agent 不得并行修改同一批文件。
7. 诊断 runtime / outcome / CloudBase / 前端展示类任务必须先写目标验收契约，再进入实现或发布验证。
8. 同一会话中同一角色的 subagent 必须复用同一线程；继续同角色任务时优先追加到已有线程。
9. 诊断 `fast path` / `warm path` / `early return` / 性能优化路径改动必须在 Dispatch Plan 中单列“快捷路径与主链守卫一致性”验收，不得只验证完整 happy path。

## 3. Dispatch Plan 格式

```text
Dispatch Plan:
- 任务类型:
- 目标验收契约:
  - bug 发生位置:
  - 观察入口:
  - 用户可见成功标准:
  - 必须验证字段 / 证据:
  - 快捷路径 / 主链守卫一致性:
  - 非目标:
- 选择的 subagent:
- 选择原因:
- 规则摘要:
- 需要读取的规则文件/章节:
- 规则文件数量是否超过 2 个: 否 / 是，原因：
- 是否需要读取 AGENTS.md: 默认否；仅在缺少派发上下文、规则冲突、线程恢复或角色边界不清时为是
- 预期输出:
- 写入权限:
- 首部规划闭环:
- 架构分析闭环:
- 实现闭环:
- QA 闭环:
- 文档同步计划:
- Subagent 线程复用:
```

## 4. 非简单实现最小闭环

非简单实现任务进入 workflow 后，至少必须具备以下闭环：

1. planning：由 main agent 在 Dispatch Plan 中完成；需求、非目标、验收标准或写入边界不清时派发 `task_planner`。
2. 架构分析：默认派发 `architect_reviewer`；只有纯只读、纯文档、已知单点低风险改动，且 Dispatch Plan 写明裁剪理由时才可由 main agent 直接承担。
3. 代码执行：由 `implementer_fast` / `implementer_deep` 或 main agent 在明确写入边界内完成；高风险实现默认 `implementer_deep`。
4. QA：实现后必须有 `qa_reviewer` 或 main agent 的明确复核；高风险、跨模块、用户可见路径或规则一致性任务默认派发 `qa_reviewer`。
5. 文档同步：涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index 时派发 `docs_keeper`。

涉及诊断 `fast path`、route、outcome、gate、runtime 或 `diagnose-http` 的实现，QA 闭环必须覆盖快捷路径与主链路径的差异；至少包含一个“应继续追问而非 final”的负向用例，并在需要发布时交给 `release_ops` 做真实 HTTP smoke 与 DB 证据复核。

纯只读分析、纯文档整理、纯配置检查等无法自然包含“代码执行”的任务，必须在 Dispatch Plan 中把实现闭环标记为“无代码实现”并说明原因。

## 5. 文档读取预算

1. 单个 subagent 默认读取的规则文件不超过 2 个。
2. 如果超过 2 个，main agent 必须说明原因。
3. `docs/ai-rules/` 中的短规则可按文件读。
4. `docs/ai-rules/archive/`、历史总结、长设计文档、完整避坑记录不得默认全量读。
5. 长文档只能按章节、关键词或问题域读取。
6. 上游 agent 已产出摘要时，下游 agent 应优先读摘要和 handoff。
7. 如果摘要不足，subagent 应请求 main agent 补充摘要或授权读取指定章节。

## 6. 推荐流程

复杂实现任务优先：

1. `task_planner`
2. `code_explorer`
3. `architect_reviewer`
4. `implementer_fast` 或 `implementer_deep`
5. `qa_reviewer`
6. `docs_keeper`
7. `release_ops`

## 7. 派发边界

1. 规划：`task_planner`
2. 代码探索与 `docs/code-logics/` 对照：`code_explorer`
3. 架构、模块边界、`docs/new-rules/` 一致性：`architect_reviewer`
4. 低风险局部实现：`implementer_fast`
5. 高风险、多文件、诊断流、route / outcome / gate / runtime、诊断快捷路径、CloudBase、数据结构实现：`implementer_deep`
6. QA、diff、模块化回归、规则一致性：`qa_reviewer`
7. 文档、术语、`docs/code-logics/`、`docs/new-rules/`、避坑索引：`docs_keeper`
8. 发布、部署、CloudBase、replay、回滚：`release_ops`

## 8. 并发限制

1. 允许多个只读 subagent 并行探索。
2. 不允许多个可写 subagent 同时修改同一批文件。
3. 高风险任务必须先只读分析，再进入实现。
4. 可写实现任务必须明确由 `implementer_fast` 或 `implementer_deep` 之一执行。
5. Main agent 若要接管某个可写 agent 正在处理的同一批文件，必须先中断或关闭该 agent，并在最终汇总中说明接管原因。
6. 不允许并行启动同一角色的多个 subagent 线程；同角色后续任务优先复用已有线程。
7. 如果旧线程失效或必须重开同角色线程，必须关闭或明确废弃旧线程，并在 handoff / 最终汇总中记录原因。
8. 线程复用细则见 `docs/ai-rules/subagent-thread-reuse.md`。


## 9. 大目录读取预算

`docs/code-logics/` 和 `docs/new-rules/` 不允许全量读取。

1. 涉及 `docs/code-logics/` 时，先读 `docs/code-logics/INDEX.md`。
2. 涉及 `docs/new-rules/` 时，先读 `docs/new-rules/planting_ai_diagnosis_source_index.json`，再按命中结果读 All-in-One 指定章节或 Sxx。
3. 默认最多读取 1～2 个命中的具体文档、All-in-One 章节或 Sxx。
4. 超过 2 个具体文档时，main agent 必须提供摘要或说明原因。
5. 下游 agent 优先读取上游摘要和 handoff，不重复读取源文档。
6. 索引无法定位时，subagent 必须请求 main agent 指定路径，不得自行扫描目录。



## 10. new-rules All-in-One 工作流

1. Main agent 先用 `planting_ai_diagnosis_source_index.json` 定位 source_id。
2. Main agent 再从 `planting_ai_diagnosis_all_in_one.md` 摘录相关章节规则。
3. Subagent 默认读取 main agent 摘要。
4. 只有 Dispatch Plan 明确指定时，subagent 才回查 All-in-One 附录 A 的指定 `Sxx` 原文。
5. 不得让多个 subagent 重复读取同一段 All-in-One 原文。
