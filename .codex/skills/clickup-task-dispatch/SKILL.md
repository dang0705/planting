---
name: clickup-task-dispatch
description: "ClickUp 工单驱动开发 skill：读取有效 ticket/子任务，逐字保留需求约束，优先通过 MCP 读取内部链接；仅当含 Figma URL 且明确 UI 开发时引用 figma-ui-implementation-policy。"
---

# ClickUp Task Dispatch Skill

## 1. 定位

本 skill 是 ClickUp ticket 驱动的任务入口。它负责把 ClickUp 主任务、子任务、评论、附件、链接和必要外部上下文转换为可执行开发计划，并把计划交给 `dispatch` skill 执行。

本 skill 不直接写代码，不直接测试，不直接改文档。

核心原则：

1. ClickUp 内容是任务事实源，不能再次压缩到丢失约束。
2. Ticket / 子任务 / 评论 / 附件 / 链接中的明确要求必须逐条保留到计划中。
3. 内部链接优先视为可由 MCP 获取的事实源；只有 MCP 不可用或权限不足时，才作为普通链接或待确认项处理。
4. 本 skill 负责判断 ClickUp 中的 Figma URL 是否应触发 Figma 读取；Figma skill 本身不判断 ClickUp 触发条件。只有当 ticket 包含 Figma URL 且明确针对该 Figma 做 UI 开发 / UI 还原 / UI QA 时，才先引用 `figma-ui-implementation-policy` 提取 Figma Design Facts，再引用 `ui-implementation-scope-policy` 生成 UI Implementation Scope Map。
5. 计划完成后，通过 `/goal dispatch <plan conclusion>` 进入执行。

---

## 2. 输入前置校验

### 2.1 必须包含有效 ClickUp ticket id

提示词必须包含有效 ClickUp ticket id 或 ClickUp ticket 链接。

可接受形式包括：

1. ClickUp task URL。
2. ClickUp task id。
3. ClickUp custom id，例如 `ABC-123` 形式。
4. 明确字段，例如 `clickup ticket: ...`、`ticket id: ...`。

如果没有有效 ClickUp ticket id：

```text
终止会话：
缺少有效 ClickUp ticket id。请提供 ClickUp task id 或 task 链接后重新调用 clickup-task-dispatch。
```

不得猜测 ticket，不得继续执行。

### 2.2 ClickUp MCP 必须可用

必须通过 ClickUp MCP 获取任务内容。如果 ClickUp MCP 不可用，必须终止并提示：

```text
ClickUp MCP 当前不可用，无法读取 ticket 和子任务描述。请先配置或启用 ClickUp MCP。
```

---

## 3. ClickUp 读取要求

必须读取：

1. 主任务标题。
2. 主任务完整描述。
3. 主任务状态、优先级、负责人、标签。
4. 子任务列表。
5. 每个子任务标题和完整描述。
6. 附件和链接。
7. checklist / acceptance criteria，如 MCP 可用。
8. 评论或 activity 中明确作为需求补充的内容，如 MCP 可用。

### 3.1 逐字保留要求

ClickUp 内容可能已经为了节省 Codex token 被人工精简过，因此不得再进行会丢失约束的二次压缩。

如果 ClickUp 中出现类似“优先考虑 / 必须 / 不得 / 禁止 / 需要 / 验收 / 对齐 / 参考 / 复用 / 不要”等约束词，必须原样进入计划的“硬约束摘录”部分，不得只做概括。

计划中必须包含：

```text
ClickUp 硬约束摘录:
- 原文:
  - 来源: 主任务 / 子任务 / 评论 / 附件
  - 处理方式:
```

## 3.2 ClickUp 输出预算硬规则

1. ClickUp 主任务、子任务、评论和附件不得整段复制给后续 agent。
2. 只逐字保留会影响实现或验收的“硬约束句”，例如包含：必须、不得、禁止、优先考虑、验收、对齐、复用、不要、仅、必须支持、兼容、非目标。
3. 非硬约束内容必须摘要化，且不得改变含义。
4. 如果 ClickUp 描述本身已经很精简，也仍需按“硬约束句 + 摘要”拆分，防止后续多 agent 反复输入全文。
5. 长评论、长 checklist、长附件说明只保留结论和证据链接，不复制全文。

---

## 4. 链接与 MCP 读取要求

ClickUp ticket 或子任务描述中若包含链接，必须先判断是否可由 MCP 获取内容，严禁跳过。

### 4.1 内部链接优先 MCP

所有内部链接、平台链接、协作链接、设计链接、代码链接、文档链接，优先视为 MCP 可读取对象。

处理顺序：

```text
发现链接
→ 判断是否有对应 MCP
→ 优先通过 MCP 获取内容
→ MCP 不可用 / 无权限 / 非支持链接时，记录失败原因
→ 仅在 MCP 不可用后才降级为普通链接或待确认项
```

不得直接把链接当成普通文本跳过。

### 4.2 Figma 条件读取

发现 Figma URL 后，本 skill 必须先做触发判断。该判断属于 `clickup-task-dispatch` 的职责，不属于 `figma-ui-implementation-policy` 的职责。

只有明确涉及以下事项之一时，才读取 Figma 和相关 UI policy：

1. UI 开发。
2. 页面实现。
3. 组件实现。
4. 视觉还原。
5. Figma 对齐。
6. UI QA。
7. 小程序端页面 / 组件 / 交互验收。

若明确涉及，必须：

1. 通过 Figma MCP 读取相关 node / frame / component。
2. 引用 `.codex/skills/figma-ui-implementation-policy/SKILL.md`，只提取 `Figma Design Facts`。
3. 引用 `.codex/skills/ui-implementation-scope-policy/SKILL.md`，基于 ClickUp 硬约束和 Figma Design Facts 生成 `UI Implementation Scope Map`。
4. 把 `Figma Design Facts` 和 `UI Implementation Scope Map` 放入 plan conclusion，作为后续 agent 默认事实源。

若存在 Figma URL 但不明确涉及 UI 开发 / 还原 / QA：

1. 不读取 `figma-ui-implementation-policy`，也不读取 `ui-implementation-scope-policy`。
2. 不默认读取 Figma 详情。
3. 在计划中记录：Figma 链接存在，但本轮未判定为 UI 开发范围。
4. 如不确定，标记 `needs_confirmation`，不得自行扩大范围。

### 4.3 Figma 结果复用与防重复读取

如果已读取 Figma MCP，必须把 Figma 内容整理为后续 agent 可复用的结构化设计事实摘要，并放入最终 `plan conclusion`。

防重复读取规则：

1. 如果 `plan conclusion` 已包含完整 `Figma Design Facts` 和 `UI Implementation Scope Map`，后续 `dispatch`、`implementer`、`qa_reviewer` 默认不得重新读取同一个 Figma link。
2. 后续 agent 必须优先使用 `Figma Design Facts` 和 `UI Implementation Scope Map` 作为事实源。
3. 只有摘要缺失、冲突、QA 缺少必要基准图/节点，或用户 / main agent 明确要求时，才允许回查 Figma MCP。
4. 回查时必须说明原因，并只读取相关 node / frame，不得重新读取整份 Figma 文件。
5. 不得把“可能有 MCP 缓存”当作默认重复读取的理由；缓存只能视为性能优化，不能作为工作流前提。

### 4.4 GitHub

如出现 GitHub issue、PR、commit、file、discussion 链接，必须通过 GitHub MCP 获取。

如果 GitHub MCP 不可用或权限不足，必须记录为阻塞项或待确认项。

### 4.5 微信开发者工具 / 小程序验收

如果 ticket 涉及小程序可见路径、页面渲染、前端自动化、选择器、截图、交互、UI 还原或端上 smoke，应在计划中标记可能由 `qa_reviewer` 调用 `wechat-dev-tools` MCP。

### 4.6 CloudBase

如果 ticket 涉及部署、SQL、诊断 session、云函数、网关、DB 证据、smoke、replay，应在计划中标记可能调用 CloudBase MCP，并进入相应发布 / CloudBase 证据复核流程。

---


### Figma 三层输出交接规则

当本 skill 触发 Figma 读取时，必须要求 `figma-ui-implementation-policy` 按三层输出：

1. `Figma Design Facts Lite`：默认输出，给所有相关 agent。
2. `Figma Implementation Slice`：仅在 UI 实现 / UI 还原 / UI QA 明确需要时输出。
3. `Figma Node Drilldown`：只在复杂 component / symbol / instance、重复结构、状态变体或 QA 对齐失败时局部输出。

随后必须要求 `ui-implementation-scope-policy` 生成角色切片：

1. `Architecture Scope Slice` → `architect_reviewer`。
2. `Implementation Packet` → `implementer_fast` / `implementer_deep`。
3. `QA Acceptance Slice` → `qa_reviewer`。

不得把完整 Implementation Slice / Drilldown 同时传给所有 agent。

## 5. 计划模式判断

读取完 ticket、子任务和必要外部链接后，判断复杂度。

如果满足任一条件，应进入 plan mode：

1. 涉及多个子任务且依赖关系复杂。
2. 涉及诊断流、outcome、gate、runtime、replay、CloudBase、SQL schema、API 协议。
3. 涉及 Figma + GitHub + 代码多源对齐。
4. 涉及 UI 100% 还原与小程序端验收。
5. 涉及多页面、多模块、多云函数或多数据结构。
6. 涉及发布、smoke、DB 证据或回滚。
7. 涉及 All-in-One、source_index 或长规则同步。
8. 预计需要多个 subagent 且存在顺序依赖。

如果任务边界清晰、子任务少、只涉及小范围改动，可不进入 plan mode，但仍必须输出计划总结。

---

## 6. 计划输出要求

无论是否进入 plan mode，最终计划必须包含：

```text
ClickUp Task Plan:
- ClickUp ticket:
- 子任务:
- 需求摘要:
- ClickUp 硬约束摘录:
  - 原文硬约束句:
  - 来源:
  - 处理方式:
- 非硬约束内容摘要:
- 非目标:
- 复杂度判断: 简单 / 非简单 / 高风险
- 是否进入 plan mode: 否 / 是
- 涉及文件 / 模块:
- 预计分配的 subagents:
- subagent 执行顺序:
- MCP / 工具调用计划:
  - ClickUp MCP:
  - Figma MCP:
  - GitHub MCP:
  - wechat-dev-tools MCP:
  - CloudBase MCP:
  - 其他:
- 外部链接读取记录:
  - 链接:
  - MCP:
  - 读取状态:
  - 失败原因:
- Figma UI 规则:
  - 是否检测到 Figma URL:
  - 是否明确涉及 UI 开发 / 还原 / QA:
  - 是否读取 figma-ui-implementation-policy:
  - 是否读取 ui-implementation-scope-policy:
  - Figma Design Facts:
  - UI Implementation Scope Map:
  - 未读取原因:
- 将使用的 skill:
  - dispatch:
  - figma-ui-implementation-policy:
  - ui-implementation-scope-policy:
  - 其他:
- token 消耗预估: 低 / 中 / 高 / 极高，并说明原因
- role_context_packets:
- 上下文预算控制:
- 验收标准:
- 最终交付标准:
- 风险:
- 阻塞项:
```

---

## role_context_packets 生成规则

计划成功后，必须生成 `role_context_packets`，作为 `/goal dispatch` 的主要输入，避免把完整 ClickUp / Figma / GitHub / CloudBase 内容广播给所有角色。

```text
role_context_packets:
- architect_reviewer:
  - ClickUp 硬约束句:
  - 技术方向约束:
  - Architecture Scope Slice:
  - 需要裁决的问题:
- implementer:
  - Implementation Contract 输入:
  - Implementation Packet:
  - 允许修改文件:
  - 禁止修改文件:
- qa_reviewer:
  - Test Contract 输入:
  - QA Acceptance Slice:
  - 验收路径:
  - 证据采集计划:
- docs_keeper:
  - 文档同步触发依据:
  - 需同步文档:
```

禁止把完整 ClickUp 描述、完整 Figma Drilldown、完整 GitHub diff、完整 CloudBase 日志放入所有 packet。

## 7. plan mode 退出要求

如果进入 plan mode，计划结束后必须先退出 plan mode，再进入执行。

不得在 plan mode 中直接修改代码、测试或改文档。

---

## 8. 调用 dispatch skill

计划成功后，将计划总结作为 `dispatch` skill 的提示词并进入 goal 模式。

调用形式：

```text
/goal dispatch <plan conclusion>
```

此时 `dispatch` skill 不需要再次重新分析任务复杂度，不需要重新定位涉及文件，也不需要重新扫描规则目录；按计划执行即可。

---

## 9. 禁止事项

1. 禁止无 ticket id 时继续执行。
2. 禁止不读取 ClickUp task / 子任务描述就规划。
3. 禁止跳过 ticket 中的内部链接、Figma、GitHub 或外部事实链接。
4. 禁止把链接内容读取失败当作已读取。
5. 禁止对 ClickUp 内容做丢失约束的二次压缩。
6. 禁止遗漏 ClickUp 原文中的“优先考虑”“必须”“不得”“验收”“对齐”等明确约束。
7. 禁止在没有明确 UI 开发 / UI 还原 / UI QA 需求时读取 Figma 读取规范或项目级 UI 实现规范。
8. 禁止把 Figma 读取规范与项目级 UI 实现决策混在同一个 skill 中。
9. 禁止把 Figma component 自动等同为必须手搓代码组件。
10. 禁止计划阶段直接改代码。
11. 禁止绕过 `dispatch` skill 直接进入实现。
12. 禁止让 main agent 在后续执行中直接替代 implementer、docs_keeper 或 qa_reviewer。

## 架构师优先与 code_explorer 条件触发

1. 如果计划已给出明确文件、模块、Figma/UI map 或实现边界，应优先派发 `architect_reviewer` 做技术方向裁决，不得机械地先派发 code_explorer。
2. code_explorer 是否派发由 architect_reviewer 做成本路由判断。
3. architect_reviewer 判断时必须知道 code_explorer 参考配置：gpt-5.3-codex-spark / low / read-only。
4. 只有入口文件、调用链、依赖来源或影响范围不清，且低成本定位比 architect 自行探索更划算时，才派发 `code_explorer`。
3. `architect_reviewer` 是总架构师，负责前后端、云函数、API、数据结构、状态管理、UI 和诊断 runtime 的技术方向裁决。
4. 所有复杂功能必须先评估复用、wrapper/adapter、uni-app 生态插件、微信小程序原生能力或成熟方案，再决定是否手搓。
