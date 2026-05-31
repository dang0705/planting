---
name: dispatch
description: "执行协调 skill：接收已规划任务或直接任务；若已包含复杂度、subagent、MCP、文件与交付标准，则按计划执行，不重新分析；main agent 只做协调，不越权改代码、写文档或替代 QA。"
---

# Dispatch Skill

## 1. 定位

本 skill 是执行协调 skill，不是全局配置，也不影响 `AGENTS.md`。

它负责：

1. 接收 clickup-task-dispatch 生成的 plan conclusion。
2. 接收用户直接给出的结构化执行计划。
3. 在没有完整计划时，按最小必要信息补出执行计划。
4. 协调 subagent 执行，不代替 subagent 完成其职责。

---

## 2. 前置判断

### 2.1 已有完整计划时

如果提示词已经包含以下内容，视为“已有计划”：

1. 复杂度或风险等级。
2. 涉及文件或模块。
3. subagent 分配。
4. MCP / 工具调用计划。
5. 验收标准。
6. 文档同步计划或是否不需要同步。
7. token 消耗预估或上下文预算说明。

已有计划时：

1. 不重新分析任务复杂度。
2. 不重新扫描大目录。
3. 不重新定位全部文件。
4. 不重新读取 All-in-One 或规则长文档。
5. 只检查计划是否缺少必要安全字段，并按计划执行。
6. 已有计划中的 ClickUp 硬约束摘录、Figma Design Facts、UI Implementation Scope Map、UI QA 计划、MCP 调用计划不得丢失、压缩或忽略。

### 2.2 无完整计划时

如果提示词没有完整计划，可以生成最小执行计划，但必须遵守：

1. 简单任务只输出降级判断，不进入 subagent workflow。
2. 非简单 / 高风险任务必须明确 subagent、读取边界、写入权限、验证计划和文档同步计划。
3. 高风险任务不得以“用户未显式要求开启 subagent”为理由跳过 subagent workflow。

---

## 3. main agent 执行边界

1. 若计划已分配 implementer，main agent 不得越过 implementer 直接修改代码。
2. 若计划包含 `Figma Design Facts` 或 `UI Implementation Scope Map`，必须把 Figma 设计事实转交给 architect / implementer，并把 UI 实现范围和 QA 范围转交给对应角色。
3. 若实现不符合 architect review 或 QA 未通过，main agent 必须把 review / QA 结果转交给同一 implementer 继续修改；不得自己接管修改。
4. main agent 不得直接更新任何文档。所有文档落地必须交给 `docs_keeper`。
5. main agent 不得代替 QA 做测试工作。unit-test、smoke、e2e、前端自动化和验收证据检查必须交给 `qa_reviewer`。
6. main agent 不得让 `qa_reviewer` 替代 `architect_reviewer` 做代码 review。
7. main agent 可做协调、汇总、裁决、异常处理和用户沟通。

---

## 4. subagent 执行顺序

### 4.1 普通非简单实现

```text
architect_reviewer 判断是否需要代码定位器
→ 如入口 / 调用链 / 影响范围不清，按 architect 的最小搜索目标派发 code_explorer
→ architect_reviewer 实现前分析
→ implementer_fast / implementer_deep
→ architect_reviewer 实现后代码 review
→ qa_reviewer
→ docs_keeper（如需文档）
→ 发布 / CloudBase 证据复核流程（如需）
```

### 4.2 高风险实现

```text
architect_reviewer 判断是否需要代码定位器
→ 如入口 / 调用链 / 影响范围不清，按 architect 的最小搜索目标派发 code_explorer
→ architect_reviewer 实现前分析
→ implementer_deep
→ architect_reviewer 实现后代码 review
→ qa_reviewer
→ docs_keeper
→ 发布 / CloudBase 证据复核流程（如涉及部署 / CloudBase / DB / smoke / 回滚）
```

---

## 5. 角色硬边界

| 角色 | 必须做 | 禁止做 |
|---|---|---|
| `code_explorer` | 可选低成本代码定位；仅在入口、调用链、依赖来源或影响范围不清时使用 | 改代码、做架构裁决、默认前置 |
| `architect_reviewer` | 架构分析、代码 review、模块边界、契约边界、删减判断 | 改代码、跑 QA 测试 |
| `implementer_fast` | 低风险局部实现 | 高风险实现、直接写规则文档 |
| `implementer_deep` | 高风险实现 | 宣称发布通过、直接替代 docs_keeper |
| `qa_reviewer` | unit / smoke / e2e / 前端自动化 / 验收证据 | 代码 review、架构裁决、模块边界判断 |
| `docs_keeper` | 文档落地、索引同步、All-in-One/source_index 同步 | 改业务代码 |

---

## 6. QA 规则

1. `qa_reviewer` 根据任务需要调用 `wechat-dev-tools` MCP。
2. QA 范围包括 smoke、unit-test、e2e-test、前端自动化、验收证据、未验证项。
3. QA 不审代码 diff；`implementer_changed_files` 只作为测试影响范围提示，不得承担代码 review。
4. 若缺少 architect 实现后代码 review，QA 必须标记流程缺口。
5. QA 结论不得写成“代码 review 通过”。

---

## 7. 文档规则

1. main agent 不得直接更新文档。
2. implementer 默认不直接更新正式规则文档、All-in-One 或 source_index。
3. 文档同步必须交给 `docs_keeper`。
4. 涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index 时，必须派发 `docs_keeper`。
5. 如果判断无需文档同步，最终汇总必须说明理由。

---

## 8. 上下文预算

1. Subagent 默认不读取完整 `AGENTS.md`。
2. `docs/code-logics/` 必须先读 `INDEX.md`，不得全量读取。
3. `docs/new-rules/` 必须先读 `planting_ai_diagnosis_source_index.json`，不得全量读取。
4. `planting_ai_diagnosis_all_in_one.md` 只能按章节或指定 `Sxx` 读取。
5. 已有计划提供规则摘要时，优先使用摘要，不重复读源文档。

---


## role_context_packets 规则

dispatch 必须把计划拆成按角色消费的 `role_context_packets`，不得把完整 ClickUp、完整 Figma、完整规则摘要、完整日志或完整 Drilldown 广播给所有角色。

```text
role_context_packets:
- architect_reviewer:
  - 任务目标与非目标:
  - 技术方向相关约束:
  - Figma Design Facts Lite:
  - Architecture Scope Slice:
  - 需要裁决的问题:
  - 禁止事项:
- implementer_fast_or_deep:
  - Implementation Contract:
  - Implementation Packet:
  - 指定局部 Drilldown:
  - 允许修改文件:
  - 禁止修改文件:
  - Test Contract 中需要补测试代码的部分:
- qa_reviewer:
  - 目标验收契约:
  - Test Contract:
  - QA Acceptance Slice:
  - implementer 变更摘要:
  - changed_files 作为测试影响范围提示:
  - 已运行命令摘要:
  - 证据路径 / 截图引用 / 日志引用:
- docs_keeper:
  - 文档同步触发依据:
  - 需要同步的文档路径:
  - 术语 / 规则 / 索引同步点:
```

硬规则：

1. `architect_reviewer` 不接收完整 ClickUp 原文，只接收硬约束句和技术裁决相关摘要。
2. implementer 不接收完整规则长文，只接收 Implementation Contract、必要代码文件和指定局部 Drilldown。
3. `qa_reviewer` 不接收完整代码 diff、不接收完整 Implementation Slice / Drilldown，只接收 Test Contract、QA Acceptance Slice、变更摘要和证据引用。
4. `docs_keeper` 只接收文档同步相关切片，不接收实现细节全文。
5. 若某角色认为切片不足，只能请求 main agent 追加最小缺口，不得自行读取全量源材料。

## Figma 分层转交规则

如果 plan conclusion 包含 Figma 分层事实，必须按角色转交：

1. `Figma Design Facts Lite`：可给 dispatch、code_explorer、architect_reviewer、implementer、qa_reviewer。
2. `Architecture Scope Slice`：只给 architect_reviewer。
3. `Implementation Packet`：只给 implementer_fast / implementer_deep。
4. `Figma Node Drilldown`：默认只给 implementer；architect 或 QA 只有在明确缺口时读取相关片段。
5. `QA Acceptance Slice`：只给 qa_reviewer。

main agent 不得为省事把完整 Figma Implementation Slice / Node Drilldown 复制给所有 agent。

## 输出预算硬上限

1. ClickUp 内容只允许逐字保留“硬约束句”，不得复制完整长描述、完整评论或完整子任务正文。
2. Figma 默认只传 `Figma Design Facts Lite`；Slice / Drilldown 必须说明 node、depth、样本数和原因。
3. architect 的 Implementation Contract / Test Contract 必须可执行但精简，不复制长规则、完整 Figma Drilldown 或完整代码。
4. QA 输出只记录命令、退出码、关键失败、证据路径、截图/日志引用和失败归因；不得粘贴完整日志、完整截图 OCR、完整测试输出。
5. handoff、运行时配置校验、dirty workspace 记录采用最小字段；除异常外不展开长解释。
6. 若输出将超过必要长度，优先生成“摘要 + 证据路径/文件引用”，不要把大段内容放入对话上下文。

## 9. 输出格式

### 9.1 已有计划执行确认

```text
Dispatch Execution:
- 是否已有完整计划: 是
- 使用计划来源: clickup-task-dispatch / 用户提示词 / 其他
- 是否跳过复杂度重分析: 是
- 是否跳过重复文件定位: 是
- subagent 执行顺序:
- MCP / 工具调用:
- ClickUp 硬约束摘录是否已传递:
- Figma Design Facts 是否已传递:
- UI Implementation Scope Map 是否已传递:
- UI QA 计划是否已传递:
- role_context_packets 是否已生成:
- 输出预算是否遵守:
- main agent 禁止事项确认:
  - 不直接改代码:
  - 不直接写文档:
  - 不代替 QA:
```

### 9.2 新建执行计划

```text
Dispatch Plan:
- 任务类型:
- 风险等级:
- 是否已有计划: 否
- 目标验收契约:
- 涉及文件:
- 选择的 subagent:
- 选择原因:
- MCP / 工具调用:
- ClickUp 硬约束摘录是否已传递:
- Figma Design Facts 是否已传递:
- UI Implementation Scope Map 是否已传递:
- UI QA 计划是否已传递:
- 规则摘要:
- 读取边界:
- 写入权限:
- 验证计划:
- 文档同步计划:
- role_context_packets:
- 输出预算:
- 交付标准:
```

### 9.3 最终汇总

```text
Dispatch Summary:
- 已执行 subagent:
- 实现状态:
- architect review 状态:
- QA 状态:
- docs_keeper 状态:
- 发布 / CloudBase 证据状态:
- 验证证据摘要:
- 证据路径 / 工具引用:
- 阻塞问题:
- 非阻塞风险:
- 未完成项:
- 下一步:
```

## 架构师优先与 code_explorer 条件触发

1. 如果计划已给出明确文件、模块、Figma/UI map 或实现边界，应优先派发 `architect_reviewer` 做技术方向裁决，不得机械地先派发 code_explorer。
2. 只有入口文件、调用链、依赖来源或影响范围不清时，才派发 `code_explorer` 做只读定位。
3. `architect_reviewer` 是总架构师，负责前后端、云函数、API、数据结构、状态管理、UI 和诊断 runtime 的技术方向裁决。
4. 所有复杂功能必须先评估复用、wrapper/adapter、uni-app 生态插件、微信小程序原生能力或成熟方案，再决定是否手搓。


## Implementation Contract 执行规则

1. 对非简单实现任务，必须优先由 `architect_reviewer` 产出精简 `Implementation Contract`。
2. main agent 派发 implementer 时，必须传递 `Implementation Contract`，不得只传递笼统目标。
3. implementer 已被分配后，main agent 不得越过 implementer 直接改代码。
4. 如果 architect review 或 QA 未通过，main agent 必须把 findings 原样转给同一 implementer 线程返工。
5. 如果 implementer 发现 Contract 缺失、冲突或不可实现，必须回到 architect_reviewer 补契约，而不是自行裁决。
6. `Implementation Contract` 不得包含完整代码 patch、完整规则长文、完整 Figma Drilldown；只包含执行所需的最小契约。


## Review Scope 与 Dirty Workspace 规则

1. 派发 implementer 前，main agent 应记录当前 `git status --short` 作为 `pre_task_dirty_files`，或说明无法记录的原因。
2. 派发 architect review 前，必须传递：
   - `base_ref`
   - `task_allowed_paths`
   - `pre_task_dirty_files`
   - `implementer_changed_files`
   - `dependency_context_allowed`
   - `excluded_dirty_files`
3. architect review 使用 `diff-first + dependency-context-limited`：以本轮 diff 为主轴，允许读取最小依赖上下文，但不得默认 review 整个 dirty workspace。
4. 派发 QA 前，必须传递：
   - 目标验收契约
   - architect code review 摘要
   - architect Test Contract
   - implementer 变更摘要
   - `implementer_changed_files` 作为测试影响范围提示
   - `pre_task_dirty_files / excluded_dirty_files`
   - 已运行验证命令和结果
5. QA 不审查 diff；QA 只做测试、验收证据、用户路径、失败归因和未验证项。
6. 如果测试失败可能由无关脏改动引起，QA 必须标记为 dirty workspace 干扰，不得直接判定为本轮失败。


## code_explorer 条件触发与成本路由

1. dispatch 不得把 code_explorer 固定为第一步。
2. 默认先让 architect_reviewer 根据任务计划、已知文件、Figma/UI map、handoff 和上下文预算判断是否需要 code_explorer。
3. architect_reviewer 必须知道 code_explorer 的参考配置：`model=gpt-5.3-codex-spark`、`model_reasoning_effort=low`、`sandbox_mode=read-only`。
4. architect_reviewer 判断时必须同时考虑：自身 `gpt-5.5 xhigh` 大范围探索成本、main agent 协调成本、subagent 启动和 handoff 成本、缓存不确定性、搜索范围和依赖链复杂度。
5. 文件范围明确、只需少量目标文件或少量直接依赖时，architect_reviewer 应自行 read-only 定位，不派发 code_explorer。
6. 入口不清、调用链不清、影响范围不清、候选入口较多或跨多个模块时，architect_reviewer 才请求派发 code_explorer。
7. 派发 code_explorer 时必须给出最小搜索目标，不得要求全仓泛扫。
