---
name: dispatch-task
description: 'main 只做路由、合同、等待、回收、审计与 Completion Gate；复杂代码修改由具名 implementer 或 external implementer 执行，simple_patch 与终态后的受限 maintenance patch 可由 main 直接完成。'
---

# Dispatch Task

## 1. 角色所有权

### 1.0 Product necessity rule — JSON / validators 仅在这些边界强制

强制 JSON 或 validator 的场景只有两类：

1. **跨 agent 边界**：handoff、implementer|external result、send receipt、handoff manual。
2. **机器证据**：**一个** `validate-implementation-postflight.mjs` report；且当 `runtime_acceptance_mode` 为 `automator_required` | `batch_substitute_allowed` | `batch_only` 时，额外要求 `runtime-qa-evidence.json`。

其余环节（main QA、docs、BRV）由 main 按行为规则执行，**不**产出 `main-*-receipt`，**不**调用 `validate-result.mjs main_qa`。

- **main**：任务归一化、项目约束、路径边界、风险路由、实现模式选择、handoff 校验、codex subagent spawn、external implementer 桥接控制、Codex Subagent Run Lock、diff-first review、返工协调、QA、docs/BRV 影响处理与 Completion Gate；
  - 除非任务在后续 `dispatch_tier` 被定位为 `simple_patch`，或 codex subagent / external 已返回终态后命中受限 `maintenance_patch`，否则 main 只允许读取代码、生成/校验合同、查看 diff、运行 validator。
  - **分配了 `Implementer` 时不运行单测/lint/typecheck。当处理 Figma 任务时，只允许按 `$figma-ui-implementation-policy` 进行 Lite 路由；最多使用 `get_metadata`，不得读取 design context、screenshot、variables 或 assets。**。
  - **QA、端上 `miniprogram automator`、UI/Figma 运行态验收、docs 同步和 ByteRover 影响处理均由 main 执行；main 执行 QA/docs 不授权其修改业务代码。**
  - 代码类文件包括但不限于：`src/**`、`cloudfunctions/**`、测试代码、schema、配置、package/lockfile、构建脚本、迁移脚本。
- **Codex implementer**：仅在 `implementation_mode=codex_subagent` 时修改代码；负责实现、单测/lint/typecheck/build/self-check 与结果 JSON。
- **External implementer**：仅在 `implementation_mode=external_implementer`（兼容旧值 `zcode_external`）时替代实现阶段；按 main 生成的最小 handoff prompt 修改代码并写 handoff manual；不替代 main 架构判断、QA 或验收。ZCode、Trae、Chrome 插件驱动的云端 agent 都只是 provider/adapter。
- **Main QA**：由 main 独立验证 e2e、端上、UI/Figma 与运行时；不运行单测，不替代 main code review，不修复业务代码。仅在 automator/batch 模式产出 `runtime-qa-evidence.json`。
- **Main docs / BRV**：由 main 在 Completion Gate 前判断并处理 active docs 与 ByteRover 影响；不得把文档或记忆治理伪装成实现修复。

### 1.2 三种实现流

| 流 | 合同 / 证据 | 实现后校验 |
|---|---|---|
| `simple_patch` | 无 handoff / 无 receipt | diff review + scoped lint/fmt |
| `codex_subagent` | handoff + impl result + 一个 postflight report | `validate-implementation-postflight.mjs` |
| `external_implementer` | 既有 external artifacts（prompt、send receipt、handoff manual、recovery result）+ 同一 postflight report | `validate-implementation-postflight.mjs` |

普通任务默认只读本文件。不得先读完整历史、完整 ClickUp、完整 Figma、全仓规则、`.codex/skills/**/references/` 或旧 INDEX。

### 1.1 BRV / ByteRover

`AGENTS.md` 的 `BRV / ByteRover 内容边界` 是本项目 ByteRover 内容资格的唯一裁决来源。本 skill、其 references、模板和 handoff 不得重新定义、扩大或缩小该边界。

本 skill 只负责编排：

- 任务开始阶段是否需要执行 ByteRover recall；
- Query、Read、当前事实源核验与最小上下文下发；
- 任务过程中的 `brv_memory_impact`、`record_plan`、执行所有权与验收；
- Space、权限、冲突、部分失败及破坏性操作的流程状态。

BRV 记录时机必须按候选事实是否依赖实现结果区分：

- 已由用户明确确认，且已由当前事实源核验、独立于本次代码修改结果的稳定业务事实，可以在任务中途立即完成 `record_plan`、写入和 readback/Query 验证；不得为了等待实现、QA 或 Completion Gate 而延迟。
- 只有依赖最终实现、评审或端上验收才能确认的业务行为，才延后到对应证据齐备后记录。
- 无论时机如何，均不得记录当前代码位置、一次性 bug 修复过程、dispatch/provider 过程、临时环境状态或未经验证的实现方案。任务结束时仍须复核已写入的记录，或明确说明 `brv_memory_impact=false`。

ByteRover 的具体命令、Topic Schema、Vocabulary 和引擎行为以当前安装的 ByteRover V4 Skill 为准。当前实现事实及冲突优先级按 `AGENTS.md` 的知识治理边界执行，dispatch-task 不另建一套事实优先级。

常规任务需要 recall 时读取 `references/brv-recall-gate.md`；需要 Record 或治理时读取 `references/brv-record-governance.md`。

## 2. Gate A0 — Implementation Mode 简单触发路由

外部实现者路由优先于普通复杂度分级。用户无需手动提供 `dispatch_tier`、`implementation_mode`、`external_implementer` 或 provider target 等内部路由字段；main 必须先根据用户输入识别外部实现意图，再进入 Gate A 完成任务分级。

只要本轮任务需要代码修改，且用户输入明确要求交给外部实现者（例如 ZCode、Trae、外部 implementer、Chrome/云端 agent 等），且该要求不是出现在否定、比较、复盘、禁止使用语境中，就必须设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode | trae | chrome_cloud_agent | other
external_contract.target_session = current_open_chat | browser_session | remote_session | manual_handoff
```

兼容旧任务：`implementation_mode=zcode_external`、`dispatch_tier=zcode_external`、`zcode_contract` 仍可被 validator 接受，但新 handoff 优先使用 `external_implementer` / `external_contract`。

## 3. Gate A — Intake、分级与 baseline

main 只读取：用户输入/显式 source、`git status --short`、目标路径最近的 AGENTS.md。UI 任务再定向读取 Tailwind 配置和组件库入口。

形成短 Brief：

```text
objective / dispatch_tier / code_changes_required / ui_task / figma_link / risk / acceptance / likely_paths / implementation_mode
```

完成 Brief 后，main 按 `AGENTS.md` 的 `BRV / ByteRover 内容边界` 判断本任务是否具有常规召回资格。需要召回时，在 Agent Assignment / Handoff 前读取并执行 `references/brv-recall-gate.md`；不需要时记录 `brv_relevance.status=not_required`，不得为流程完整性调用 ByteRover。

### 3.1 dispatch_tier

| `dispatch_tier`        | 适用任务                                                                                                | 默认处理                                                                                             | 实现所有者           |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------- |
| `simple_patch`         | 单文件/少量文件、低风险、无 Figma、无 schema/API/状态机、无 CloudBase、无外部实现者、无 subagent 必要性 | `implementation_mode=main_direct`；main 承担最小实现、最小验证、diff review 和 Completion Gate       | main                 |
| `standard_task`        | 多文件但在既有架构内，局部功能或普通 UI                                                                 | `implementation_mode=codex_subagent`，通常派 `implementer_fast`                                      | implementer_fast     |
| `deep_contract`        | API/schema/迁移/安全/跨系统状态机/兼容性或不可逆风险                                                    | `implementation_mode=codex_subagent`，派 `implementer_deep`，读取 `references/high-risk-workflow.md` | implementer_deep     |
| `external_implementer` | 用户或配置明确要求外部 agent 写代码（ZCode、Trae、Chrome 插件驱动的云端 agent 等）                      | `implementation_mode=external_implementer`，读取 external implementer bridge references              | external implementer |

### 1.3 Main 直接小修复与终态后维护补丁

`simple_patch` 是 main 在 intake 阶段直接实现的正式路由；不生成 implementer handoff、send receipt 或角色 receipt。`main_direct` 只允许以下范围：格式化、lint/build 触发的机械修复、拼写/文案/注释、稳定自动化 ID typo，以及不改变 API、schema、权限、数据结构、状态机、架构边界或用户业务行为的单点修复。

这里的“实现者终态”只表示 implementer/provider 已返回合同要求的最终结果：`completed` 或 `blocked`。它表示实现交付阶段结束并进入 main review，不表示整个 dispatch-task 已完成。只有 `completed` 结果且 recovery evidence 已齐备时，main 才可以在 Gate C Main Review（Web external 为 PR recovery review 子阶段）中执行一次受限 `maintenance_patch`；`blocked` 只能进入阻断处理，不授权 main 接管实现。

1. 不得在 Codex Subagent / provider 仍运行时修改任何代码类文件；
2. 变更默认不超过 3 个文件、80 行语义变更；纯格式化可扩大文件数，但必须证明无语义 diff；
3. 只能修复已被验证的 typo、格式、lint/build 阻断或合同内的机械冲突，不得借机改变产品方向；
4. external Web 任务只能在合同指定的 PR worktree 修改，并提交、推送到同一 PR head；不得把 PR worktree 的修复带回主工作区直接提交；
5. 若需要新增业务判断、跨模块重构、API/schema/状态机变化，立即升级回原 implementer 或请求用户决策；不得把“大修”伪装成 maintenance patch。

`maintenance_patch` 的有效窗口只在 Gate C Main Review 内：从 completed 结果和 recovery evidence 可审查时开始，到 PR merge / local base sync / Completion Gate 之前结束。它不是任务完成后的补丁入口；一旦已通过 Completion Gate，后续问题必须回到原 implementer 或新建任务，不得重新打开已完成任务直接修改。

maintenance patch 完成后必须重新执行 scoped diff review、oxfmt/lint/build 或合同指定验证；external Web 任务还必须重新执行 postflight，并以新的 head SHA 进入 PR merge gate。

只验收或只改文档的任务由 main 直接执行，不进入 Implementation Completion Gate；不得伪装成实现任务。

存在 Figma link、UI 还原、API/schema、迁移、安全、CloudBase、跨端状态机、超过 1 个业务模块或用户指定外部实现者时，不得走 `simple_patch`。

`simple_patch` 一旦发现影响范围扩大，必须升级为 `standard_task` 或 `deep_contract`；升级后 main 不得继续实现。严禁 main 把非 `simple_patch` 伪装成 `simple_patch` 直接写代码。

### 3.2 Worktree baseline

代码修改任务在派发前必须捕获 baseline：

```bash
node .codex/skills/dispatch-task/scripts/capture-worktree-baseline.mjs .tmp/dispatch-task/<dispatch_run_id>-worktree-baseline.json
```

规则：

1.  baseline 用于区分本轮变更与用户/其他线程已有变更；不得用它自动 restore 或覆盖用户改动。
2.  若 baseline 已经存在 dirty files，handoff 必须记录 `validation.worktree_baseline_path`，main review 必须特别检查是否与本轮 `changed_files` 重叠。
3.  如果本轮声明修改的文件在 baseline 中已 dirty，且用户未明确授权覆盖/协作，Completion Gate 必须 blocked，不能擅自回滚。
4.  当用户明确要求在脏共享工作区直接协作时，implementer result 可声明 `preexisting_dirty_overlap_acknowledged=true`；postflight 只允许 overlap 全部落在 `allowed_paths` 且未命中 `forbidden_paths`，否则仍 blocked。

## 4. Project Constraints

代码任务必须形成 `Project Constraints`：

```text
rule_refs              # 路径 + 相关章节，不复制整份 AGENTS.md
framework
component_library      # UI 必填；若为 uni-ui 且存在 figma_link，必须触发 uni-ui 映射合同
dependency_policy
test_commands
```

## 5. Gate B — Handoff Contract

除 `simple_patch` 外，需要代码修改的 `standard_task`、`deep_contract`、`external_implementer` 必须生成 JSON Handoff Contract。

```text
dispatch_run_id
dispatch_tier: standard_task / deep_contract / external_implementer
implementation_mode: codex_subagent / external_implementer
task: {objective, code_changes_required, ui_task, risk, qa_required}
target_role
spawn_contract
external_contract                   # implementation_mode=external_implementer 时必填；旧 zcode_contract 兼容
handoff_manual                      # implementation_mode=external_implementer 时必填
allowed_paths / forbidden_paths
acceptance
project_constraints
decision_lock:
  level: standard / strict
  architecture_invariants
  local_decisions_allowed
figma:
  link / node_id
  lite_status
  main_access: lite_only
  main_tools_used
  lite_receipt                       # 可选，仅身份/尺寸/顶层分区
  implementer_fetch_required
  qa_baseline_fetch_required          # 行为标志：main QA 须独立获取视觉基准
required_skills / required_prompt_sections
validation:
  miniprogram_automator_required
  runtime_acceptance_mode: automator_required / batch_substitute_allowed / batch_only
  batch_substitute_user_approval_ref
  worktree_baseline_path
  postflight_report_path
  implementer / external
output_evidence_required
```

`standard` 只锁目标、工程规则和不可破坏的不变量；组件拆分、命名、复用落点等局部决策归实现者。只有 API/schema、迁移、安全、跨系统或不可逆任务读取 `references/high-risk-workflow.md` 并使用 `strict`，不为普通任务生成架构长文或逐文件伪代码。

派发前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
```

失败不得进入实现阶段。

## 6. Gate B1 — Spawn Capability Gate

仅 `implementation_mode=codex_subagent`。Handoff 通过即授权派发 `spawn_contract.implementer_agent_type`（`implementer_fast` / `implementer_deep`）；不得再为复杂度二次征求 spawn 许可（除非 runtime 明确要求一次确认）。

硬边界：

1. 必须显式 `agent_type`；禁止 full-history fork、generic/default/worker fallback。
2. spawn 只传 `agent_type` + `fork_turns=none`/`fork_context=false` + minimal handoff message。
3. 运行时 `effective_agent_type` 与 Codex Subagent `agent_identity` 必须等于 `target_role` 与本轮 `dispatch_run_id`；不可观察或不一致则 blocked。
4. 返工回原 implementer thread，不重新 spawn generic Codex Subagent。

展开步骤与 blocked code 见 `references/handoff-and-spawn-gates.md`。

## 7. Gate B1.5 — Codex Subagent Run Lock / 等待与工作区所有权

一旦 `implementer_fast`、`implementer_deep` 或 external implementer 被派发，main 进入 Codex Subagent Run Lock。

本仓库启用本地 dispatch hook gate：

```text
.codex/hooks.json -> .codex/hooks/dispatch-gate-adapter.mjs -> .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs
```

hook gate 的职责是记录、注入和恢复，不替代本 skill 的人工判断。`SubagentStart` 注入任务卡，`PostToolUse` 记录 telemetry，`SubagentStop` 只允许在原 implementer thread 生成一次汇总返工提示。普通遗漏（缺 Figma、缺 feature unit test、未完成 BRV recall、未运行 QA）不得阻断普通对话或写入；只能进入 postflight、review 或原线程返工。

`PreToolUse` 只允许对以下硬风险返回 deny：

1. 写入或格式化 `forbidden_paths`、疑似覆盖用户/其他线程工作区改动；
2. 伪造 QA evidence、伪造 runtime/catolog/hash/execution id；
3. 未经 catalog gate 裸跑 automator 并试图作为验收。

缺失 Figma 读取、缺 unit test、`required_skills` 未执行或 BRV recall degraded 不得作为 `PreToolUse` deny 理由。

硬规则：

1.  main 必须等待 Codex Subagent 返回最终 JSON、handoff manual 终态，或用户明确中止；不得用 20 秒/40 秒等短轮询判定“无产出”。
2.  Codex Subagent 正在运行时，main 不得修改、撤回、格式化、restore、checkout、apply_patch、sed 重写或自动修补任何代码类文件。
3.  Codex Subagent 正在运行时，main 不得用 `git status` / `git diff` 的“暂时没有可见 diff”推断 Codex Subagent 失败。
4.  Codex subagent 首次状态检查不得早于 5 分钟；之后低频检查间隔不得短于 5 分钟。检查只允许确认是否已有最终消息/结果文件，不得读取半成品 diff 后继续实现。
5.  `deep_contract`、UI/Figma、跨模块、状态机或大文件拆分任务，首次状态检查建议不早于 10 分钟；没有最终 JSON 时默认仍在执行。
6.  如果 main 在 Codex Subagent 仍可能写入时误写了代码类文件，必须立即停止并返回 `blocked: main_workspace_contamination`，说明触碰文件、原因和建议处理方式；不得自行撤回或继续加工。
7.  只有在 Codex Subagent 返回 `completed|blocked` 终态后，main 才能进入 Gate C 做 diff-first review；其中只有 `completed` 且证据齐备时，才允许按 §1.3 执行受限 maintenance patch。`blocked` 不授权 main 修复；超出范围的返工必须回到原 Codex Subagent thread 或原外部实现者，main 不得亲自修复。

违反本节视为 Hard stop。

## 8. Gate B2 — External Implementer Bridge

仅 `implementation_mode=external_implementer`（兼容旧 `zcode_external`）。**细节不得写进本文件正文**；命中后按条件读取：

```text
references/external-implementer-routing.md          # 必读：公共合同、remote sync、PR recovery、校验命令
references/zcode-routing.md                         # provider=zcode
references/zcode-computer-use-policy.md             # ZCode 且需操作 UI
assets/templates/external-implementer-prompt-template.md
assets/templates/zcode-prompt-template.md           # ZCode 兼容 alias
```

本文件只锁这几条硬边界：

1. main 不 spawn Codex implementer，不自写业务代码；不因 external 失败自动 fallback。
2. 统一 external prompt + send receipt +（本地 manual 或 Web PR/worktree recovery）；聊天“完成”不算完成。
3. Codex Desktop 运行 Web/云端 provider 时，必须用 Codex 内置浏览器打开和发送 prompt；普通 Chrome、shell 或 ambient browser 状态不能替代受控发送证据。
4. Web/云端 external implementer 即使远端自称 main/root，也必须按 implementer 身份执行：只改合同范围代码，完成后提供 unit tests 等实现者自检；有 `figma_link` 时直接用可用 Figma 插件 / MCP / 工具取设计证据。
5. Codex 内置浏览器发送成功后，必须显式保留 provider tab 为 `handoff`，send receipt 记录 `tab_retention`；不得依赖 Browser Use 默认生命周期保留外部会话。
6. Web/云端 external implementer 的完成等待必须继承 Codex Subagent Run Lock：首次正式状态检查不得早于 5 分钟，之后每 5 分钟低频检查。不得用 60 秒、90 秒等短等待作为“完成/失败/无产出”判断；短等待只允许用于一次性发送成功、页面已开始运行、身份探针这类非实现 completion 检查。
7. prompt 送达并开始运行后进入 Codex Subagent Run Lock（见 §7）；adapter 细则与 DOM/Computer 步骤只在 references。
8. 结果回收后走同一套 Gate C/D（`validate-result.mjs external` → postflight → completion）。

## 9. Gate C — Implementation Review

Codex subagent / external recovery 返回 JSON 后先校验结果合同，再做 diff-first review，并执行**一个** postflight：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
# 或：validate-result.mjs external <handoff.json> <external-recovery-result.json>
node .codex/skills/dispatch-task/scripts/validate-implementation-postflight.mjs <handoff.json> <impl-result.json> <worktree-baseline.json> > .tmp/dispatch-task/<dispatch_run_id>-postflight-report.json
```

`completed` 结果进入 Gate C Main Review；`blocked` 结果是合法阻断结果，但不得进入 Completion Gate，也不得触发 `maintenance_patch`。因此，implementer/provider 的“完成”是 review 的起点，Completion Gate 通过才是 dispatch-task 的完成。

所有代码修改任务都必须做 diff-first review：身份/来源、实际变更文件、路径边界、项目约束、decision lock、依赖、验证证据。UI 重点检查 Tailwind/SCSS、组件复用与 uni-ui 映射证据；Figma 任务必须存在实现者直接读取证据。失败退回原实现路径，main 不亲自修复。

postflight report 必须确认 git root 与 HEAD 未相对 baseline 变化，并覆盖 worktree scope、no-new-deps、style-stack 等实现后机器证据。`no_new_deps` 对 `package.json` 只以依赖字段相对 HEAD 的变化作为新增依赖风险；仅 scripts/config 调整可通过并记录 warning，lockfile 或依赖字段变化仍 blocked。

postflight 通过后应由 dispatch gate 创建 `.tmp/dispatch-task/<dispatch_run_id>/qa-skeleton.json`，供 main QA 继续补 runtime/batch evidence。该 skeleton 只表示 QA 计划已建立，不表示端上验收已通过。

`simple_patch` / `main_direct` 跳过 validate-handoff / validate-implementation-postflight / validate-completion-readiness，只执行 git diff review + scoped lint/fmt/build；若 main 在 Codex Subagent 终态后执行了 `maintenance_patch`，必须把补丁纳入原实现结果的 changed files、postflight 和最终 PR recovery evidence。

缺少 baseline 或 postflight report 时，不得进入 Completion Gate。postflight report 在 `passed` 和 `blocked` 时都必须产出 JSON；`blocked` 不授权 main 修复，必须回到原实现路径或请用户决策。

## 10. Gate D — QA & Completion

Figma、UI、用户可观察行为、API/schema/数据链路、端上运行、高风险或用户明确要求时需要 QA；对应 handoff 可设置 `task.qa_required=true`。**`qa_required=true` 本身不强制任何 QA JSON**——QA 由 main 按需要执行；失败则退回原 implementer 或 external implementer。纯文档、注释或不影响行为的机械改动可跳过，但要记录理由。

main QA 不运行 unit tests，不修改业务代码。

automator QA 必须先通过 catalog gate：

```bash
node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs validate-e2e-catalog
node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs qa-run --catalog-id=<leaf-id> --execution-id=<run-id> --dry-run
```

只有 catalog 精确叶子、`docs/ai-rules/frontend-automation-id-policy.md` 引用、脚本 hash 和 execution id 全部通过后，才允许进入 LAN/DevTools/automator。裸跑 automator 脚本只能作为排障，不能作为 `runtime-qa-evidence.json` 的验收来源。

运行态验收模式由 `validation.runtime_acceptance_mode` 显式声明；仅当模式为 `automator_required` | `batch_substitute_allowed` | `batch_only` 时，必须产出 `runtime-qa-evidence.json`：

- `automator_required`：必须完整 LAN flow、合同指定 `dist/dev/mp-weixin`、9420、miniprogram-automator、page / `wx.request` evidence。
- `batch_substitute_allowed`：必须有 `validation.batch_substitute_user_approval_ref`；跑批可以替代本轮端上验收，但 evidence 可记录 `end_side_status=not_verified_by_user_approved_substitution`。
- `batch_only`：只用于算法或服务层矩阵，不得覆盖真实 UI 或端上交互验收。

`runtime-qa-evidence.json` 必填字段：

```text
dispatch_run_id
status: passed | failed | blocked
runtime_acceptance_mode
channel
catalog_id                  # automator_required 必填
execution_id                # automator_required 必填
script_sha256               # automator_required 必填
projectPath
pagePath
automator_port | wsEndpoint
evidence_paths[]
failures[]
not_verified[]
```

可选：`user_approval_ref`、`end_side_status`（batch 模式）。

**禁止**出现在该文件中的字段：`owner`、`agent_identity`、`coverage`、`checks_and_evidence`、`unit_tests_run`、`next_action`、`blocker_classification`、`figma_baseline_evidence`。

Completion Gate：

```bash
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <impl-result.json> <postflight-report.json> [runtime-qa-evidence.json]
```

完成条件：实现结果 `completed`；postflight report 为 `passed`；main review 通过；所需 QA 已通过或明确不需要；docs/BRV impact 已由 main 处理或明确不需要；blocker 与未验证项为空。`batch_substitute_allowed` 可保留端上未验证事实，但必须有用户批准记录和跑批证据。completion note 可简要说明 `docs_impact` / `brv_memory_impact`。

### 10.1 Gate D1 — Active docs / ByteRover V4 知识治理

main 在任务过程中持续判断 `docs_impact` / `brv_memory_impact`，二者独立；不得把 BRV 影响判断机械地推迟到实现完成后。

- **docs**：仅当公共契约 / API / schema / 诊断规则 / 自动化 ID / 明确要求的 active doc 变化时维护。
- **BRV**：仅按 `AGENTS.md` 内容边界裁决。若稳定业务事实已独立于实现结果完成用户确认与当前事实源核验，`brv_memory_impact=true` 可在实现或 QA 完成前处理；此时读 `references/brv-record-governance.md` 并执行批准的 `record_plan`（含 readback / Query）。若候选事实依赖最终实现、评审或端上验收，则等证据齐备后处理。破坏性 Prune/Delete/Merge 须用户明确批准。
- 不写业务代码、不补实现、不替代 QA；不做角色 receipt。completion note 可简要写 `docs_impact` / `brv_memory_impact`。

### 10.2 Gate D2 — Web external PR 合并与本地同步

Web/云端 external implementer 的“实现完成”不等于任务完成。完成顺序固定为：

1. 低频唤醒发现 provider 已返回最终结果后，先回收 PR/worktree、执行 diff review、postflight 和必要 QA；
2. 使用 GitHub 插件读取最新 PR 元数据，核对 base branch、head branch、head SHA、冲突状态和 required checks；不得用浏览器页面文案或旧聊天摘要代替；
3. 若 PR 有冲突，优先在合同指定 PR worktree 解决。只有 §1.3 的 maintenance patch 才能由 main 处理；语义冲突超出范围时阻断或退回原 external implementer；
4. 使用 GitHub 插件的 merge 操作，传入最新 `expected_head_sha`。merge 返回成功前不得报告完成；
5. merge 成功后，main 切回 PR base branch，执行 `git fetch origin` 与 `git pull --ff-only`（或等价 fast-forward），确认本地 HEAD 与远端 base 一致、工作区干净，再关闭监控自动化并通过 Completion Gate；
6. 若主工作区有未授权 dirty files、base branch 不能 fast-forward、PR head 在 review 期间变化或 GitHub merge 失败，状态必须保持 blocked，不得擅自 reset、force-push 或覆盖用户改动。

Completion evidence 必须区分 `provider_completed`、`pr_merged` 和 `local_base_synced` 三个状态；只有三者全部为真，Web external 任务才可标记 `completed`。

## 11. Figma 硬边界

存在 `figma_link` 时，按阶段分离取证；不要用表格压缩这些规则。

**main**

- 必须/允许：使用 `$figma-ui-implementation-policy`；只解析 link/node，或最多一次 `get_metadata` 形成 Lite。
- 禁止：`get_design_context`、`get_screenshot`、variables、assets、视觉摘要、实现切片、Drilldown。

**Codex implementer**

- 必须/允许：使用 `$implementer-ui-execution-policy`；在首次 UI 编辑前直接取得 metadata + design context + screenshot；Scope 规则在其 `references/ui-scope-policy.md` 内。
- 禁止：依赖 main Lite 猜实现、整文件读取。

**External implementer**

- 必须/允许：external handoff prompt 必须强制要求外部实现者直接读取 Figma metadata + design context；`get_screenshot` 仅在当前 provider 能力允许且不违反 AGENTS 规则时调用。
- 禁止：依赖 main Lite 猜实现、让 main 补读完整 Figma。
- 若跳过截图：必须记录 `screenshot_policy_skip` 与对应 `policy_ref`。

**main（QA 行为）**

- 必须/允许：使用 `$qa-ui-visual-baseline-policy`；独立取得 metadata + reference screenshot，并取得实际运行截图。
- 禁止：只凭 main/实现者转述判通过、整文件读取。

`codex_subagent` Figma 模式必须满足：

```text
required_skills.implementer:
  - $implementer-ui-execution-policy
required_skills.main:
  - $qa-ui-visual-baseline-policy
```

若 `project_constraints.component_library` 包含 `uni-ui`：

- `codex_subagent`：handoff 必须追加 `$uni-ui-figma-component-mapper` 与 `uni_ui_mapping_evidence`。
- `external_implementer`：external handoff prompt 必须追加 `uni_ui_mapping_contract`，并要求外部实现者在首次 UI 编辑前输出最小 `Figma 区域/节点 → uni-ui 组件/备选/风险` 映射证据。

main 不得读取或转述 uni-ui 组件索引、映射表、组件规则；只负责把 skill 名、prompt section 或 evidence 名写入 Contract。Lite 不是实现事实或视觉基准，Lite 不可用不授权猜测。

## 12. 条件引用

仅触发时读取：

- `$figma-ui-implementation-policy`：main 需要 Figma Lite 路由时。
- `references/external-implementer-routing.md`：`implementation_mode=external_implementer`。
- `references/zcode-routing.md`：`external_contract.provider=zcode` 或旧 `implementation_mode=zcode_external`。
- `references/zcode-computer-use-policy.md`：provider 为 ZCode 且需要 Codex main 操作 ZCode UI。
- `references/high-risk-workflow.md`：高风险 contract lock。
- `references/brv-recall-gate.md`：任务具有常规 ByteRover 召回资格时，定义 Query、Read、来源核验与最小上下文下发。
- `references/brv-record-governance.md`：`brv_memory_impact=true` 时，定义 Record plan、执行所有权、治理操作与验收；不得重新定义 AGENTS 内容边界。
- `references/brv-curate-governance.md`：旧文件名兼容入口，不得作为正式规范。
- `references/clickup-workflow.md`：输入含有效 ClickUp ticket。
- `references/mini-program-runtime-qa.md`：acceptance 明确要求小程序端上验证。

## 13. Hard stops

1. Codex Subagent 已派发但未返回终态时，main 继续实现、撤回草稿、格式化、restore、checkout、apply_patch、sed 重写或自动修补代码类文件。
2. main 用 20 秒/40 秒等短轮询、临时 `git status` 或“暂无可见 diff”判定 Codex Subagent 无产出、失败或可由 main 接管。
3. 代码修改任务缺少 worktree baseline，baseline 与本轮变更重叠未处理，或未通过 postflight report 仍完成。
4. `codex_subagent` 模式未显式传精确 `agent_type`，使用 full-history fork，或发生 generic/default/worker fallback。
5. `external_implementer` 模式 spawn 了 Codex implementer、缺少 send receipt、缺少 handoff manual，或 provider 交付证据与 `external_contract.prompt_transport` 不一致。
6. provider UI/会话/prompt 完整性未通过 adapter 要求，或 prompt 发送失败仍继续。
7. 仅用 shell/脚本/自然语言声明替代声明为 required 的 UI/Computer/Chrome adapter 操作，或用“dispatch 预授权”替代用户当前明确授权。
8. external implementer 失败后 main 自己写代码，或自动 fallback 到 Codex implementer 而未获得用户明确批准。
9. external handoff 缺少 handoff manual，或 main 未先读取 handoff manual 就用 UI/聊天状态判定外部实现者已结束。
10. external implementer 已收到 prompt 并开始运行后，main 仍持续盯屏、使用短轮询或在 30 分钟内读取 provider UI 进度；正式等待必须使用 5 分钟下限的 recurring wakeup。
11. Codex Subagent `agent_identity` 与 Contract 不一致。
12. UI handoff 缺少 styling system、SCSS policy、component library 或 rule refs。
13. main 在 Figma 任务使用 `get_design_context/get_screenshot/variables/assets`，或把视觉细节塞进 handoff。
14. figma_link 存在，但实现者没有直接读取 Figma 证据，或 main QA 没有独立 baseline。
15. `component_library` 包含 `uni-ui` 且存在 figma_link，但缺 uni-ui 映射合同或实现者缺 `uni_ui_mapping_evidence`。
16. Tailwind 项目新增未授权 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
17. 变更越过 allowed/forbidden paths，未声明真实 changed files，或引入未授权依赖/API/schema。
18. main QA 重跑单测，或用“看起来正确”替代运行证据。
19. 在 `AGENTS.md` 判定无常规召回或记录资格时仍调用或写入 ByteRover，或用本 skill/reference 的示例绕过、扩大或缩小 AGENTS 的内容边界。
