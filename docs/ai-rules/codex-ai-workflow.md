# Codex / Subagent 工作流规则

## 1. 定位

本文件细化仓库内的 AI 工作流，重点约束：

1. ClickUp ticket 驱动的任务读取与计划。
2. subagent 职责边界。
3. 上下文预算与大文档读取。
4. main agent 在执行过程中的禁止事项。
5. QA、架构 review、文档同步、发布验收的职责拆分。

本文件不是 `AGENTS.md` 的替代品。`AGENTS.md` 只保存全局硬规则和规则索引；具体执行流程由 skill 和本文件承接。

---

## 2. 工作流入口

### 2.1 dispatch-task 统一入口

当前统一入口为：

```text
.codex/skills/dispatch-task/SKILL.md
```

`dispatch-task` 根据 prompt 自动区分：

1. ClickUp ticket / ClickUp comment deeplink。
2. 普通开发任务。
3. bug 修复 / 需求变更。
4. 只读分析。
5. 文档同步。

不再分别维护独立的 ClickUp 工单入口和普通 dispatch 入口。

### 2.2 ClickUp / 普通任务区分

如果 prompt 包含有效 ClickUp ticket id / URL / comment deeplink，进入 ClickUp 模式，并读取 ticket、子任务、指定评论、附件、链接和硬约束。

如果 prompt 不包含 ClickUp ticket，则进入普通任务模式。普通任务允许任意自然语言输入，不要求用户显式提供目标、任务类型、涉及文件/模块或验收标准；main agent 必须从自然语言中提取意图，只有缺少安全边界、写入权限、外部事实或验收标准等关键条件时，才提出最小澄清问题。

### 2.3 bug 修复 / 需求变更

如果任务类型是 bug 修复 / 需求变更，且输入中没有原始 ticket，上游必须询问用户是否能提供原始 ticket：

```text
A. 是，我会提供原始 ticket id / 链接。
B. 否，无法提供；仅基于当前描述继续，并标记缺少原始需求上下文风险。
```

拿到原始 ticket 后，必须读取原始开发要求并生成 `Requirement Gap Analysis`，本轮任务以填补 gap 为目标。

---

## 3. 核心原则

1. Main agent 是协调者，不是所有工作的直接执行者。
2. 已分配 implementer 后，main agent 不应越过 implementer 直接改代码；若架构 review 或 QA 不通过，应把结果转交给同一 implementer 继续修改。
3. Main agent 在执行 workflow 过程中不得直接更新文档；文档落地交给 `docs_keeper`。
4. Main agent 在执行 workflow 过程中不得代替 QA 做测试工作；单元测试由 main agent 设计 Test Contract、implementer 补测试并做 focused self-check、qa_reviewer 复核证据并按需补跑；smoke、e2e、前端自动化和最终验收证据由 `qa_reviewer` 负责。
5. 架构 / code review 与 QA 必须分离：main agent 默认以 architect capacity 负责代码逻辑、模块边界、契约和规则一致性；`architect_reviewer` 作为可选独立复核角色；`qa_reviewer` 负责测试、回归、验收证据和未验证项。
6. Subagent 默认不读取完整 `AGENTS.md`。
7. Subagent 默认不自行扩展读取长文档。
8. 上游 agent 产出摘要，下游 agent 优先读摘要和 handoff，不重复读源文档。
9. 多个可写 agent 不得并行修改同一批文件。
10. 同一会话中同一角色的 subagent 必须复用同一线程；继续同角色任务时优先追加到已有线程。

---

## 4. 非简单实现最小闭环

非简单实现任务进入 workflow 后，至少必须具备以下闭环：

1. 计划闭环：由 ClickUp skill、main agent 或已有 plan conclusion 给出目标、非目标、涉及文件、subagent 分配、MCP、token 估算和交付标准；不再使用独立 独立规划 subagent 角色。
2. 代码定位成本决策：main agent 以 architect capacity 先判断自行定位还是请求 code_explorer。
3. 可选代码探索：只有入口、调用链、依赖来源或影响范围不清时，才按 architect 的最小搜索目标派发 `code_explorer`。
4. 实现前架构分析：main agent 默认定义技术方向、模块边界、代码规模、契约边界、删减机会和实现边界；必要时调用 `architect_reviewer` 独立复核。
5. 代码执行：由 `implementer_fast` 或 `implementer_deep` 执行。高风险实现默认 `implementer_deep`。
6. 实现后代码 review：默认由 main agent 以 architect capacity 完成；高风险、争议或用户要求时调用同一 `architect_reviewer` 线程独立复核；`qa_reviewer` 不得替代。
7. QA：代码 review 之后由 `qa_reviewer` 复核 unit 证据，按需补跑 focused/full unit，并执行 smoke、e2e、前端自动化和验收证据检查。
8. 文档同步：涉及规则、流程、接口、字段、状态、问诊链路、展示契约、避坑记录、All-in-One 或 source_index 时，交给 `docs_keeper`。
9. 发布验收：涉及部署、CloudBase、smoke、DB 证据或回滚时，进入相应发布 / CloudBase 证据复核流程。

纯只读分析、纯文档整理、纯配置检查等无法自然包含“代码执行”的任务，必须在执行计划中把实现闭环标记为“无代码实现”并说明原因。

---

## 5. 高风险任务默认流程

以下任务必须先只读分析，不得直接实现：

1. 诊断流、outcome、ranking → route、outcome 瘦身。
2. 问题簇、gate、问诊路径、runtime。
3. 诊断 `fast path`、`warm path`、`early return`、缓存命中、性能优化路径。
4. replay / zero-model / diagnose-http。
5. CloudBase 云函数部署。
6. SQL schema / MySQL / TDSQL-C。
7. 数据结构迁移、API 协议变更、多文件状态管理改造。
8. `docs/new-rules/` 规则解释或落地。
9. `docs/code-logics/` 与实际代码不一致的修正。

默认流程：

```text
计划结论 / ticket plan
→ main agent 以 architect capacity 判断是否需要代码定位器
→ 如入口 / 调用链 / 影响范围不清，按最小搜索目标派发 code_explorer
→ main agent 输出实现前架构分析与 Implementation Contract
→ implementer_deep 实现
→ main agent 做实现后 code review；必要时调用 architect_reviewer 独立复核
→ qa_reviewer 测试、smoke、e2e、验收证据
→ docs_keeper 文档同步
→ 发布 / CloudBase / DB / 回滚证据复核流程
```

---

## 6. 角色边界

| 任务意图 | 推荐 subagent | 写入权限 |
|---|---|---|
| 找文件、调用链、依赖来源、代码逻辑解释、`docs/code-logics/` 对照 | `code_explorer` | 只读 |
| 独立架构复核、复杂/高风险技术方向二次裁决、实现后争议性 code review | `architect_reviewer` | 只读 |
| 局部、低风险、边界明确的小改动 | `implementer_fast` | workspace-write |
| 多文件、诊断流、route / outcome / gate / runtime、诊断快捷路径、replay、CloudBase、数据结构、后端高风险实现 | `implementer_deep` | workspace-write |
| unit 证据复核与按需补跑、smoke、e2e、前端自动化、回归、验收证据、未验证项、发布前质量缺口 | `qa_reviewer` | 只读，可调用测试/自动化 MCP |
| 文档、术语、`docs/code-logics/`、`docs/new-rules/`、避坑索引、All-in-One、source_index 同步 | `docs_keeper` | workspace-write |

### 6.1 QA 边界

`qa_reviewer` 只做质量验证，不做代码 review。

允许：

1. 复核 implementer 的 focused unit self-check 证据，并在必要时补跑 focused/full unit。
2. 执行或审查 smoke test。
3. 执行或审查 e2e test。
4. 视情况调用 `wechat-dev-tools` MCP 做小程序前端自动化。
5. 审查测试覆盖、回归风险、未验证项、发布前质量风险。

禁止：

1. 替代 main agent 的 architect review 或 architect_reviewer 独立复核做代码逻辑 review。
2. 替代 main agent 或 architect_reviewer 判断模块边界。
3. 替代 main agent 或 architect_reviewer 做 route / outcome / gate / runtime 契约裁决。
4. 把“QA 通过”写成“代码 review 通过”。

### 6.2 architect 边界

`architect_reviewer` 作为可选独立复核角色在被调用时负责：

1. 实现前架构分析。
2. 实现后代码 review。
3. 模块边界、API / 数据 / 状态边界。
4. 诊断流、route、outcome、gate、runtime 契约。
5. 单文件 500 行风险、模块拆分、删减冗余代码判断。
6. 代码规模控制与删除旧逻辑机会判断。

---

## 7. 文档读取预算

1. 单个 subagent 默认读取的规则文件不超过 2 个。
2. 如果超过 2 个，main agent 必须说明原因。
3. `docs/ai-rules/` 中的短规则可按文件读。
4. `docs/ai-rules/archive/`、历史总结、长设计文档、完整避坑记录不得默认全量读。
5. 长文档只能按章节、关键词或问题域读取。
6. 上游 agent 已产出摘要时，下游 agent 应优先读摘要和 handoff。
7. 如果摘要不足，subagent 应请求 main agent 补充摘要或授权读取指定章节。
8. `docs/code-logics/` 不允许全量读取；先读 `docs/code-logics/INDEX.md`。
9. `docs/new-rules/` 不允许全量读取；先读 `planting_ai_diagnosis_source_index.json`，再按命中结果读 All-in-One 指定章节或 Sxx。
10. 不得让多个 subagent 重复读取同一段 All-in-One 原文。

---

## 8. 专用角色可用性与 fallback

1. `.codex/agents/*.toml` 是本仓库角色规范，不自动等同于当前 runtime 已注册的 `spawn_agent.agent_type`。
2. 每个逻辑角色本轮首次使用时，main agent 必须以实际工具返回作为可用性事实源。
3. 专用角色不可用时，允许使用 `default` 作为逻辑角色替代线程，但必须显式记录 fallback。
5. 一个 `default` 替代线程绑定某个逻辑角色后，不得混用为另一个逻辑角色。
6. 若用户明确要求某专用职责不可跳过，而专用角色不可用，必须记录未完成项或请求用户裁决。

---

## 9. 并发限制

1. 允许多个只读 subagent 并行探索。
2. 不允许多个可写 subagent 同时修改同一批文件。
3. 高风险任务必须先只读分析，再进入实现。
4. 可写实现任务必须明确由 `implementer_fast` 或 `implementer_deep` 之一执行。
5. Main agent 若要接管某个可写 agent 正在处理的同一批文件，必须先中断或关闭该 agent，并在最终汇总中说明接管原因。
6. 不允许并行启动同一角色的多个 subagent 线程；同角色后续任务优先复用已有线程。
7. 如果旧线程失效或必须重开同角色线程，必须关闭或明确废弃旧线程，并在 handoff / 最终汇总中记录原因。
8. 线程复用细则见 `docs/ai-rules/subagent-thread-reuse.md`。


## 10. ClickUp 原文与设计约束

1. ClickUp ticket 与子任务内容可能已经被人工压缩，AI 不得再次进行会丢失约束的二次压缩。
2. Ticket 中的“优先考虑 / 必须 / 不得 / 验收 / 对齐 / 参考 / 复用”等约束词必须进入 plan conclusion。
3. ClickUp 内部链接优先视为 MCP 可读取内容；无法读取时必须记录失败原因。
4. Figma 已通过 MCP 读取时，UI 目标还原度为 100%。
5. implementer 必须按 Figma 摘要和计划中的 UI 约束实现；不能忽略设计约束。
6. qa_reviewer 必须增加 UI / Figma 对齐测试，必要时调用 wechat-dev-tools MCP。
7. 如果 UI 无法 100% 还原，必须列出差异、平台限制和待确认项，不得默认放行。


## 11. QA 测试类型平等细化

1. QA 的 UI / Figma 还原测试属于 `qa_reviewer` 的测试职责子项，不应作为独立于 QA 测试职责的顶层职责。
2. QA 对 unit-test、smoke-test、e2e-test、前端自动化、wechat-dev-tools、UI / Figma 还原测试必须以同等颗粒度记录：是否执行、执行方式、证据、结论、未执行原因。
3. 若任务包含 Figma 设计，UI 还原目标为 100%，并必须进入 QA 测试执行矩阵。
4. 若任务包含小程序端可见路径，QA 应评估是否调用 wechat-dev-tools MCP。
5. QA 不承担代码 review；测试发现的问题必须交还 main agent 转给 implementer。


## Figma 三层输出与角色切片

1. Figma 读取结果默认使用 `Figma Design Facts Lite`，不得默认展开完整嵌套树。
2. UI 实现任务按需生成 `Figma Implementation Slice`。
3. 复杂 component / symbol / instance 只允许局部 `Figma Node Drilldown`，并必须限定 target node、depth、样本数和原因。
4. `ui-implementation-scope-policy` 必须生成三类角色切片：
   - `Architecture Scope Slice` 默认给 main agent；如调用 architect_reviewer，则给 architect_reviewer 独立复核。
   - `Implementation Packet` 给 implementer。
   - `QA Acceptance Slice` 给 qa_reviewer。
5. QA 不读完整 Implementation Slice / Drilldown，但必须读 QA Acceptance Slice，避免只靠 Lite 做粗验。
6. 缓存不能作为工作流前提；结构化摘要和角色切片才是 token 优化依据。


## v20 架构师升级与 code_explorer 降级规则

本节优先于早期“默认先 code_explorer”的流程表述。

1. main agent 默认承担总架构师 / 总设计师职责，不限于前端架构。前端、后端、云函数、数据结构、API、状态管理、诊断 runtime、UI、发布链路的新功能或高风险改动，都需要 main agent 先裁决技术方向。
2. `code_explorer` 降级为可选低成本代码定位器，只在入口文件、调用链、依赖来源或影响范围不清时使用。
3. 如果 ClickUp plan、Figma/UI map、任务说明或已知文件已经足够，main agent 应直接以 architect capacity 做实现前技术方案裁决，不得机械地先派发 code_explorer 或 architect_reviewer。
4. main agent 可以在 read-only 范围内自行定位必要代码；缺少 code_explorer 摘要不是拒绝架构判断的理由。
5. main agent 默认裁决复用、wrapper、adapter、插件、平台原生能力、轻量新增、手搓或删除旧逻辑等技术方向；需要独立复核时才调用 architect_reviewer。
6. 当功能复杂、手搓成本高或存在成熟方案时，必须优先评估项目已有实现、uni-app 生态插件、微信小程序原生能力或其他成熟方案。
7. 直接手搓复杂功能必须说明为什么不复用、不使用 wrapper/adapter、不使用插件或平台原生能力。
8. 默认实现流程调整为：

```text
已知文件 / 已有 plan / Figma map 明确
→ architect_reviewer 实现前技术方向裁决
→ implementer
→ architect_reviewer 实现后 code review
→ qa_reviewer
→ docs_keeper / 发布 / CloudBase 证据复核流程 按需
```

9. 只有在入口不清、调用链不清、影响面不清时，才插入：

```text
code_explorer
→ main agent architect review
```


## v22 Implementation Contract 模式

为降低 implementer 的模型与推理成本，非简单实现任务采用：

```text
main agent = 默认技术方向裁决 + Implementation Contract；architect_reviewer = 可选独立复核
implementer = 中低推理严格执行 Contract
```

规则：

1. main agent 默认输出精简 `Implementation Contract`，包括文件级改动计划、数据流、模块拆分、复用/插件/手搓裁决、删除/收敛旧逻辑、关键伪代码和验证契约；必要时由 architect_reviewer 独立复核或补充。
2. `implementer_fast` / `implementer_deep` 默认不做架构裁决，不重新评估技术方向，不重新读取长规则，不重新读取完整 Figma。
3. Contract 缺失、冲突或不可实现时，implementer 必须停止并请求 main agent 补契约；若 main agent 无法裁决，再调用 architect_reviewer。
4. main agent 是协调者，不得越过 implementer 直接修改代码。
5. architect 输出要具体但精简；不得输出完整 patch，不得复制长规则或完整 Figma Drilldown。


## v23 Test Contract、Review Scope 与 QA 边界

本版新增四个确认概念：

### 1. Implementation Contract 继续保留

main agent 默认输出精简实现契约，implementer 严格执行；需要独立复核时调用 architect_reviewer。Contract 缺失、冲突或不可实现时回到 architect 补契约。

### 2. Test Contract / 测试契约

main agent 默认负责设计测试契约但不执行测试；必要时由 architect_reviewer 独立复核。Test Contract 必须定义 unit、smoke、e2e、UI/Figma、API/DB/runtime、负向用例、回归用例和不允许破坏的旧行为。

### 3. QA 不审 diff

qa_reviewer 不做代码 review，不审代码 diff。QA 以目标验收契约、architect Test Contract、architect review 摘要、implementer 变更摘要和测试证据为主轴。`implementer_changed_files` 只作为测试影响范围提示。

### 4. Review Scope = diff-first + dependency-context-limited

main agent 的 architect review 以本轮 diff 为主轴，但允许按最小依赖链读取上下文。扩展读取必须说明原因，不得默认 review 整个 dirty workspace。

### 5. Dirty Workspace 分类

工作区脏时，必须区分本轮 diff、pre_task_dirty_files、excluded_dirty_files。测试失败和 review findings 必须区分：本轮阻塞、既有问题、无关脏改动干扰、环境问题、无法判断。


## v24 code_explorer 成本路由

1. `code_explorer` 是可选低成本代码定位器，不是默认第一步。
2. 默认由 main agent 根据任务计划、已知文件、Figma/UI map、handoff 和成本估算，判断是否需要派发 code_explorer。
3. main agent / architect_reviewer 必须知道 code_explorer 的参考配置：`model=gpt-5.3-codex-spark`、`model_reasoning_effort=low`、`sandbox_mode=read-only`。
4. 判断时必须考虑：architect 自身 `gpt-5.5 xhigh` 大范围探索成本、main agent 协调成本、subagent 启动与 handoff 成本、缓存不确定性、搜索范围和依赖链复杂度。
5. 文件范围明确、只需少量目标文件或少量直接依赖时，architect 自行 read-only 定位。
6. 入口不清、调用链不清、影响范围不清、候选入口较多或跨多个模块时，才派发 code_explorer。
7. 派发 code_explorer 时必须给出最小搜索目标：关键词、目录、候选文件、需要回答的问题。

## v25 role_context_packets 与输出预算

1. 所有非简单 workflow 必须优先生成 `role_context_packets`，按角色分发上下文。
2. 不得把完整 ClickUp、完整 Figma、完整规则、完整日志、完整 Drilldown 广播给所有 agent。
3. ClickUp 只逐字保留硬约束句；非硬约束内容摘要化。
4. Figma 默认 Lite；Slice / Drilldown 必须限定 node、depth、样本数和原因。
5. architect 的 Implementation Contract / Test Contract 必须精简到可执行字段，不复制长规则、完整代码或完整 Drilldown。
6. QA 只记录命令、退出码、关键失败、证据路径和失败归因；不得粘贴完整日志。
7. handoff、、dirty workspace 记录采用最小字段，除异常外不展开长解释。
8. role_context_packets 推荐分配：
   - architect：硬约束句、技术方向约束、Architecture Scope Slice、需裁决问题。
   - implementer：核心 Implementation Contract、Implementation Packet、允许/禁止修改文件、必要局部 Drilldown。
   - QA：目标验收契约、Test Contract、QA Acceptance Slice、变更摘要、证据路径。
   - docs_keeper：文档同步触发依据、目标文档、索引/术语同步点。

## v27 Git 工作区与最终提交规则

1. 任何会修改文件的任务开始前，main agent 必须执行 Git 工作区检查，记录 branch、`git status --short`、pre_task_dirty_files、staged_files、untracked_files 和 dirty_level。
2. 工作区 `very_dirty` 时，必须先询问用户是否允许在当前脏工作区继续执行；未获得明确确认前不得进入实现。
3. very_dirty 的判断包括：大量未提交文件、大量 untracked、staged 来源不明、存在无关脏文件、冲突/删除/重命名、无法区分本轮改动和历史脏改动。
4. 任务确认完成后必须做一次 Git commit，除非用户禁止提交、无文件变更、无法隔离本轮变更或存在阻塞验证。
5. commit 只能包含本轮任务范围内变更；不得使用 `git add .`；不得混入 pre_task_dirty_files、excluded_dirty_files 或无关 untracked 文件。
6. 如果无法隔离本轮变更，必须停止并请求用户确认，不得强行提交。
7. 最终汇总必须包含 branch、commit_hash、commit_message、staged_files、excluded_dirty_files 和未提交原因。

## v28 ClickUp 评论 deeplink 规则

1. ClickUp URL 包含 `?comment=<comment_id>` 时，`dispatch-task` 必须读取并定位该评论。
2. 指定评论是一等事实源，优先级高于主任务描述和其他评论。
3. 未读取到指定评论时，不得继续生成开发计划；必须提示用户补充评论正文或确认忽略该评论。
4. 指定评论中的硬约束句、链接、文件路径、验收要求、测试证据要求必须进入计划。
5. 评论中的 Figma / GitHub / ClickUp / CloudBase / 微信开发者工具链接必须按 MCP 规则处理。
6. role_context_packets 只传递评论相关硬约束，不广播完整评论线程。

## v29 Figma 分层、需求覆盖与真实用户路径闭环

1. ClickUp 或 dispatch-task 中明确涉及 Figma UI 开发 / 还原 / QA 时，必须触发 `figma-layered-ui-contract`。
2. 人工压缩版 Figma 摘要不能替代 `Figma Design Facts`、`UI Implementation Scope Map`、`Implementation Packet`、`QA Acceptance Slice`。
3. dispatch-task 承接 dispatch-task 下发任务时，如果已包含完整 Figma Layered Contract，不得重复读取 Figma 或 Figma 分层文档；若缺失则必须退回补齐。
4. architect_reviewer 必须防止“Over-constrained Trigger Contract Causing Requirement Coverage Gap”，并输出 Requirement Coverage Matrix。
5. UI 替换 / 旧 options 接管类任务必须覆盖真实旧 question id / runtime object；不得只依赖新 uiVariant、新 source 或理想路径。
6. qa_reviewer 必须验证真实用户路径，确认旧 UI 不出现、新组件出现；不能只证明错误契约被正确实现。
7. WeChat DevTools connect 失败时必须尝试 launch + reconnect 兜底；全部失败才可标记不可用。


## v30 dispatch-task 合并入口

1. 原 ClickUp 工单入口与普通 dispatch 入口合并为 `dispatch-task`。
2. `dispatch-task` 根据 prompt 是否包含 ticket id / comment deeplink 自动区分 ClickUp 任务和普通任务。
3. bug 修复 / 需求变更如果缺少原始 ticket，必须先询问用户是否能提供；不能提供时才带风险继续。
4. 拿到原始 ticket 后必须生成 `Requirement Gap Analysis`，本轮目标是填补 original requirements 与当前 bug/change 的 gap。
5. Figma 分层仍由 `figma-layered-ui-contract` 处理；ClickUp 模式下如已提供完整 Figma Layered Contract，dispatch-task 不再重复读取 Figma。




## v32 Main-as-Architect 协议分层

1. `AGENTS.md` 只保留 Main-as-Architect 最小底线。
2. `dispatch-task/SKILL.md` 保存 Main-as-Architect 详细执行协议，包括自然语言意图提取、技术方向裁决、Requirement Coverage Matrix、Implementation Contract、Test Contract、Review Scope、role_context_packets、独立 architect_reviewer 升级条件和输出预算。
3. `architect-reviewer.toml` 保留为独立复核角色，不作为 main agent 默认规则来源。
4. main agent 不默认读取完整 `architect-reviewer.toml`，避免重复上下文和职责漂移。
5. 普通任务允许任意自然语言输入；main agent 应先提取意图，只有缺少安全边界、写入权限、外部事实或验收标准等关键条件时，才提出最小澄清问题。
6. 非简单实现必须有 Implementation Contract 和 Test Contract；不调用 `architect_reviewer` 时由 main agent 输出。
7. main agent 作为 architect 时仍不得越过 implementer 直接改代码。
8. 高风险、复杂、争议、main agent 不确定、Contract 与 QA 冲突、返工无法收敛或用户明确要求时，才调用 `architect_reviewer` 独立复核。

## v34 QA 通过后更新 ClickUp 状态

1. ClickUp 任务在 QA 通过且无 blocking issue 后，由 `qa_reviewer` 将任务状态更新为 `done`。
2. main agent 只传递 task_id、QA 结论和必要上下文，不替 QA 宣称通过。
3. 状态更新失败时必须记录原因，不得伪造完成。
4. QA 未通过、关键验证缺失、非 ClickUp 任务、只读分析或用户禁止状态更新时，不得更新为 done。
