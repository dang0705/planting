---
name: dispatch-task
description: '低上下文任务调度：main 只做路由、合同、等待、回收、审计与 Completion Gate；代码修改只能由具名 implementer 或 ZCode external 执行。'
---

# Dispatch Task

## 1. 角色所有权

- **main**：任务归一化、项目约束、路径边界、风险路由、实现模式选择、handoff 校验、ZCode 桥接控制、Child Run Lock、diff-first review、返工协调与 Completion Gate；**原则上不得修改代码类文件**。
  - 代码类文件包括但不限于：`src/**`、`cloudfunctions/**`、测试代码、schema、配置、package/lockfile、构建脚本、迁移脚本。
  - main 只允许读取代码、生成/校验合同、查看 diff、运行 validator。除非是 `simple_patch`。
- **Codex implementer**：仅在 `implementation_mode=codex_subagent` 时修改代码；负责实现、单测/lint/typecheck/build/self-check 与结果 JSON。
- **ZCode external implementer**：仅在 `implementation_mode=zcode_external` 时替代实现阶段；按 main 生成的 ZCode prompt 修改代码和写 handoff manual；不替代 main 架构判断、QA 或验收。
- **QA**：独立验证 e2e、端上、UI/Figma 与运行时；不运行单测，不替代 main code review。
- **docs_keeper**：仅在公共契约或活文档确实受影响时使用。

普通任务默认只读本文件。不得先读完整历史、完整 ClickUp、完整 Figma、全仓规则、`.codex/skills/**/references/` 或旧 INDEX。

## 1.1 BRV / ByteRover 召回边界

### BRV 只用于业务知识、历史决策、真实业务契约或用户过往明确事实的 recall；不得用于查询通用工程规则、代码风格、行数拆分、lint/fmt、skill 调度、validator 用法、Figma 工具边界或 AGENTS.md 已明示的硬规则。

在调用 `brv-query` 前，main 必须先判断上下文需求类型：

```text
business_truth / historical_decision / user_project_fact -> 可查询 BRV
code_fact / procedural_rule / skill_policy / AGENTS_rule / mechanical_refactor_rule -> 禁止查询 BRV
```

BRV 召回结果只作为索引和线索，不得覆盖代码、schema、配置、package scripts、当前 Handoff Contract、AGENTS.md 或本 skill。

## 2. Gate A0 — Implementation Mode 简单触发路由

ZCode 路由优先于普通复杂度分级。用户不需要输入完整 `Dispatch Options`；main 必须先做轻量触发词识别，再进入 Gate A。

只要本轮任务需要代码修改，且用户输入中一旦包含关键词 `ZCode` (大小写不敏感)，就必须设置：

```text
implementation_mode = zcode_external
dispatch_tier = zcode_external
external_implementer = zcode_glm
zcode_target = current_open_chat
```

## 3. Gate A — Intake、分级与 baseline

main 只读取：用户输入/显式 source、`git status --short`、目标路径最近的 AGENTS.md。UI 任务再定向读取 package.json、Tailwind 配置和组件库入口。

形成短 Brief：

```text
objective / dispatch_tier / code_changes_required / ui_task / figma_link / risk / acceptance / likely_paths / implementation_mode
```

### 3.1 dispatch_tier

dispatch_tier

适用任务

默认处理

`simple_patch`

单文件/少量文件、低风险、无 Figma、无 schema/API/状态机、无需外部实现者和subagents，由 main 承担所有 subagent 角色的工作，包括 `Implementer`。

`standard_task`

多文件但在既有架构内，局部功能或普通 UI

`implementation_mode=codex_subagent`，通常派 `implementer_fast`

`deep_contract`

API/schema/迁移/安全/跨系统状态机/兼容性或不可逆风险

`implementation_mode=codex_subagent`，派 `implementer_deep`，读取 `references/high-risk-workflow.md`

`zcode_external`

用户或配置明确要求 ZCode/GLM 写代码

`implementation_mode=zcode_external`，读取 ZCode references

只验收或只改文档的任务可直接按对应角色执行，不得伪装成实现任务进入 Completion Gate。

存在 Figma link、UI 还原、API/schema、迁移、安全、CloudBase、跨端状态机、超过 1 个业务模块或用户指定 ZCode 时，不得走 `simple_patch`。

Figma/UI 或任何用户可观察行为改动必须设置 `task.qa_required=true`，除非用户当前会话明确批准跳过 QA；跳过原因必须写入 Contract，且不能用于视觉还原任务。

### 3.2 Worktree baseline

代码修改任务在派发前必须捕获 baseline：

```bash
node .codex/skills/dispatch-task/scripts/capture-worktree-baseline.mjs .tmp/dispatch-task/<dispatch_run_id>-worktree-baseline.json
```

规则：

1.  baseline 用于区分本轮变更与用户/其他线程已有变更；不得用它自动 restore 或覆盖用户改动。
2.  若 baseline 已经存在 dirty files，handoff 必须记录 `validation.worktree_baseline_path`，main review 必须特别检查是否与本轮 `changed_files` 重叠。
3.  如果本轮声明修改的文件在 baseline 中已 dirty，且用户未明确授权覆盖/协作，Completion Gate 必须 blocked，不能擅自回滚。

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

除 `simple_patch` 外，需要代码修改的 `standard_task`、`deep_contract`、`zcode_external` 必须生成 JSON Handoff Contract。

```text
dispatch_run_id
dispatch_tier: simple_patch / standard_task / deep_contract / zcode_external
implementation_mode: codex_subagent / zcode_external
task: {objective, code_changes_required, ui_task, risk, qa_required}
target_role
spawn_contract
zcode_contract                      # implementation_mode=zcode_external 时必填
handoff_manual                      # implementation_mode=zcode_external 时必填
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
  qa_baseline_fetch_required
required_skills / required_prompt_sections
validation:
  worktree_baseline_path
  worktree_scope_report_path
  no_new_deps_report_path
  style_stack_report_path
  implementer / external / qa
output_evidence_required
```

`standard` 只锁目标、工程规则和不可破坏的不变量；组件拆分、命名、复用落点等局部决策归实现者。只有 API/schema、迁移、安全、跨系统或不可逆任务读取 `references/high-risk-workflow.md` 并使用 `strict`，不为普通任务生成架构长文或逐文件伪代码。

派发前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
```

失败不得进入实现阶段。

## 6. Gate B1 — Codex Named Spawn

仅适用于 `implementation_mode=codex_subagent` 和需要 QA 的阶段，`simple_patch` 跳过此gate。

`target_role` 必须是 `.codex/agents/*.toml` 中 `name` 的精确值。main 必须显式使用该值调用 `spawn_agent`，不得让运行时自行挑选角色。

```text
若工具 schema 支持 fork_turns：
  spawn_agent(agent_type=<exact name>, fork_turns="none", message=<minimal handoff>)
否则若支持 fork_context：
  spawn_agent(agent_type=<exact name>, fork_context=false, message=<minimal handoff>)
否则：
  blocked: named_agent_selector_unavailable
```

硬规则：

1.  Codex implementer 必须传 `agent_type=spawn_contract.implementer_agent_type`；QA 必须传 `agent_type=spawn_contract.qa_agent_type`。
2.  不传 `model`、`reasoning_effort` 或 sandbox override；由具名 agent TOML 决定。
3.  禁止 full-history fork。
4.  角色不可用、spawn 被拒绝、runtime metadata 显示未加载目标配置时，立即阻断。
5.  禁止回退到 `default`、`worker`、generic agent，也禁止让 generic agent“扮演”目标角色。
6.  child 最终 JSON 必须带 `agent_identity={agent_type, dispatch_run_id}`；不一致时 validator 阻断。
7.  review/QA 返工发送到原 agent thread，不重新 spawn generic child。

## 7. Gate B1.5 — Child Run Lock / 等待与工作区所有权

一旦 `implementer_fast`、`implementer_deep`、`qa_reviewer` 或 ZCode external implementer 被派发，main 进入 Child Run Lock。

硬规则：

1.  main 必须等待 child 返回最终 JSON、handoff manual 终态，或用户明确中止；不得用 20 秒/40 秒等短轮询判定“无产出”。
2.  child 正在运行时，main 不得修改、撤回、格式化、restore、checkout、apply_patch、sed 重写或自动修补任何代码类文件。
3.  child 正在运行时，main 不得用 `git status` / `git diff` 的“暂时没有可见 diff”推断 child 失败。
4.  Codex subagent 首次状态检查不得早于 5 分钟；之后低频检查间隔不得短于 5 分钟。检查只允许确认是否已有最终消息/结果文件，不得读取半成品 diff 后继续实现。
5.  `deep_contract`、UI/Figma、跨模块、状态机或大文件拆分任务，首次状态检查建议不早于 10 分钟；没有最终 JSON 时默认仍在执行。
6.  如果 main 误写了代码类文件，必须立即停止并返回 `blocked: main_workspace_contamination`，说明触碰文件、原因和建议处理方式；不得在 child 仍可能写入时自行撤回或继续加工。
7.  只有在 child 返回 `completed|blocked` 终态后，main 才能进入 Gate C 做 diff-first review。返工必须回到原 child thread 或原外部实现者；main 不得亲自修复。

违反本节视为 Hard stop。

## 8. Gate B2 — ZCode External Implementer Bridge

仅适用于 `implementation_mode=zcode_external`。读取：

```text
references/zcode-routing.md
references/zcode-computer-use-policy.md
assets/templates/zcode-prompt-template.md
```

该模式下：

1.  main 不 spawn Codex implementer。
2.  main 生成 ZCode 专用 prompt；不得把完整 dispatch、完整 references 或完整历史塞进 prompt。
3.  Codex main 必须真实发起 `@ZCode` 或 `@Computer` 操作 ZCode；若工具目标不可用，必须 `blocked: computer_use_unavailable`。
4.  prompt 必须通过剪贴板一次性粘贴，不得逐字输入。
5.  不得用 shell、AppleScript、osascript、cliclick、xdotool 或类似脚本伪装完成 UI 操作，除非用户在当前会话明确授权替代方案。
6.  发送前必须验证 ZCode 当前会话、输入框、prompt sentinel、粘贴完整性。
7.  send receipt 必须包含真实 computer-use tool event / transcript step；没有工具事件时不得填写 `tool_invoked=true`。
8.  ZCode prompt 成功发送并确认 ZCode 已收到且开始运行后，main 必须断开 Computer Use 监视/监听流程；不得继续盯屏、保活 UI 观察、连续 `get_app_state` 或把 Computer Use 当进度直播。
9.  发送后 30 分钟内只允许每 5 分钟读取一次 `handoff_manual.path`，并检查 scope 中规定文件的 diff：`git status --short`、`git diff --name-only -- <allowed_paths>`、`git diff --stat -- <allowed_paths>`。30 分钟后才允许回到 Computer Use 查看 ZCode UI，但只能低频排障/取最终结果，间隔不得短于 10 分钟。
10. ZCode 失败、无 diff、越权修改、无法读取 Figma、prompt 未完整发送或 computer-use 不可用时，不得 fallback 成 main 自己写代码，也不得自动切到 Codex implementer，除非用户明确批准。

相关校验：

```bash
node .codex/skills/dispatch-task/scripts/validate-zcode-prompt.mjs <handoff.json> <zcode-prompt.md>
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
# 若 handoff manual 文件存在且可解析，先校验；若缺失/损坏，recovery result 必须记录 status=missing|invalid 并 blocked。
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
```

## 9. Gate C — Implementation Review

Codex subagent 返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
```

ZCode recovery 返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
```

`completed` 结果进入 main review；`blocked` 结果是合法阻断结果，但不得进入 Completion Gate。

所有代码修改任务都必须做 diff-first review：身份/来源、实际变更文件、路径边界、项目约束、decision lock、依赖、验证证据。UI 重点检查 Tailwind/SCSS、组件复用与 uni-ui 映射证据；Figma 任务必须存在实现者直接读取证据。失败退回原实现路径，main 不亲自修复。

Completion Gate 前必须执行真实工作区校验；校验必须确认 git root 与 HEAD 未相对 baseline 变化，防止 checkout/commit 隐藏 diff：

```bash
node .codex/skills/dispatch-task/scripts/validate-worktree-scope.mjs <handoff.json> <implementer-or-external-result.json> <worktree-baseline.json> > .tmp/dispatch-task/<dispatch_run_id>-worktree-scope-report.json
node .codex/skills/dispatch-task/scripts/validate-no-new-deps.mjs <handoff.json> <worktree-baseline.json> <implementer-or-external-result.json> > .tmp/dispatch-task/<dispatch_run_id>-no-new-deps-report.json
node .codex/skills/dispatch-task/scripts/validate-style-stack.mjs <handoff.json> <worktree-baseline.json> <implementer-or-external-result.json> > .tmp/dispatch-task/<dispatch_run_id>-style-stack-report.json
```

缺少 baseline、worktree scope report、no-new-deps report 或 style-stack report 时，不得进入 Completion Gate。worktree / no-new-deps / style-stack validators 在 passed 和 blocked 时都必须产出 JSON report；blocked report 不授权 main 修复，必须回到原实现路径或请用户决策。

## 10. Gate D — QA & Completion

Figma、UI、用户可观察行为、API/schema/数据链路、端上运行、高风险或用户明确要求时需要 QA；对应 handoff 必须设置 `task.qa_required=true`。纯文档、注释或不影响行为的机械改动可跳过，但要记录理由。

QA 必须按 Gate B1 具名 spawn 为 `qa_reviewer`。返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs qa <handoff.json> <qa-result.json>
```

`passed` 可进入 Completion Gate；`failed|blocked` 是合法 QA 结果格式，但不能完成。

Completion Gate：

```bash
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> <worktree-scope-report.json> <no-new-deps-report.json> <style-stack-report.json> [qa-result.json]
```

完成条件：实现结果 `completed`；worktree scope、no-new-deps、style-stack reports 均为 `passed`；main review 通过；所需 QA `passed`；blocker 与未验证项为空；只输出一份 Completion Receipt，不输出逐 gate telemetry。

### 10.1 Gate D1 — docs_keeper / 知识卫生

`docs_keeper` 不是默认角色。只有满足以下任一条件，main 才能在实现结果完成并通过 main review 后派发 docs_keeper：

1.  本轮修改改变公共契约、对外 API、schema、数据语义、诊断链路规则、自动化 ID 约定或用户可复用的 active docs。
2.  AGENTS.md、acceptance 或 Handoff Contract 明确要求同步某个 active doc / index / context pack。
3.  实现者结果明确声明 `docs_impact=true`，且 main review 确认该影响不是普通代码内部重构。

硬边界：

1.  不得因为 500 行拆分、普通组件拆分、lint/fmt、Tailwind/SCSS、依赖策略、validator 用法或代码结构搜索而派发 docs_keeper。
2.  docs_keeper 不写代码、不改测试、不补实现、不替代 QA，也不得把 archived / superseded / stale 文档维护成当前事实。
3.  若需要 docs_keeper，必须在 Completion Receipt 前完成文档影响处理；若文档影响未处理，只能 blocked 或记录为用户批准的 follow-up，不能声称文档已同步。

## 11. Figma 硬边界

存在 `figma_link` 时，按角色分离取证；不要用表格压缩这些规则。

**main**

- 必须/允许：使用 `$figma-ui-implementation-policy`；只解析 link/node，或最多一次 `get_metadata` 形成 Lite。
- 禁止：`get_design_context`、`get_screenshot`、variables、assets、视觉摘要、实现切片、Drilldown。

**Codex implementer**

- 必须/允许：使用 `$implementer-ui-execution-policy`；在首次 UI 编辑前直接取得 metadata + design context + screenshot；Scope 规则在其 `references/ui-scope-policy.md` 内。
- 禁止：依赖 main Lite 猜实现、整文件读取。

**ZCode external implementer**

- 必须/允许：ZCode prompt 必须强制要求外部实现者直接读取 Figma metadata + design context；`get_screenshot` 仅在当前 ZCode/GLM 能力允许且不违反 AGENTS 规则时调用。
- 禁止：依赖 main Lite 猜实现、让 main 补读完整 Figma。
- 若跳过截图：必须记录 `screenshot_policy_skip` 与对应 `policy_ref`。

**QA**

- 必须/允许：使用 `$qa-ui-visual-baseline-policy`；独立取得 metadata + reference screenshot，并取得实际运行截图。
- 禁止：只凭 main/实现者转述判通过、整文件读取。

`codex_subagent` Figma 模式必须满足：

```text
required_skills.implementer:
  - $implementer-ui-execution-policy
required_skills.qa:
  - $qa-ui-visual-baseline-policy
```

若 `project_constraints.component_library` 包含 `uni-ui`：

- `codex_subagent`：handoff 必须追加 `$uni-ui-figma-component-mapper` 与 `uni_ui_mapping_evidence`。
- `zcode_external`：ZCode prompt 必须追加 `uni_ui_mapping_contract`，并要求外部实现者在首次 UI 编辑前输出最小 `Figma 区域/节点 → uni-ui 组件/备选/风险` 映射证据。

main 不得读取或转述 uni-ui 组件索引、映射表、组件规则；只负责把 skill 名、prompt section 或 evidence 名写入 Contract。Lite 不是实现事实或视觉基准，Lite 不可用不授权猜测。

## 12. 条件引用

仅触发时读取：

- `$figma-ui-implementation-policy`：main 需要 Figma Lite 路由时。
- `references/zcode-routing.md`：`implementation_mode=zcode_external`。
- `references/zcode-computer-use-policy.md`：`implementation_mode=zcode_external`，定义 Codex main 操作 ZCode 的 computer-use 协议。
- `references/high-risk-workflow.md`：高风险 contract lock。
- `references/clickup-workflow.md`：输入含有效 ClickUp ticket。
- `references/mini-program-runtime-qa.md`：acceptance 明确要求小程序端上验证。

## 13. Hard stops

1.  main 把 `simple_patch` 当作 main 直接写代码的授权。
2.  child 已派发但未返回终态时，main 继续实现、撤回草稿、格式化、restore、checkout、apply_patch、sed 重写或自动修补代码类文件。
3.  main 用 20 秒/40 秒等短轮询、临时 `git status` 或“暂无可见 diff”判定 child 无产出、失败或可由 main 接管。
4.  代码修改任务缺少 worktree baseline，baseline 与本轮变更重叠未处理，或未通过 worktree scope / no-new-deps / style-stack reports 仍完成。
5.  `codex_subagent` 模式未显式传精确 `agent_type`，使用 full-history fork，或发生 generic/default/worker fallback。
6.  `zcode_external` 模式 spawn 了 Codex implementer、没有 ZCode prompt sentinel、没有 computer-use 工具调用、没有剪贴板粘贴、没有 send receipt，或发送动作不是 `enter/send_button/blocked`。
7.  ZCode 当前会话/输入框/prompt 完整性未通过 computer-use 验证，或 prompt 发送失败仍继续。
8.  仅用 shell/脚本/自然语言声明替代 computer-use 操作 ZCode，或用“dispatch 预授权”替代用户当前明确授权。
9.  ZCode 失败后 main 自己写代码，或自动 fallback 到 Codex implementer 而未获得用户明确批准。
10. ZCode handoff 缺少 handoff manual，或 main 未先读取 handoff manual 就用 UI 状态判定外部实现者已结束。
11. ZCode 已收到 prompt 并开始运行后，main 仍持续盯屏或 30 分钟内读取 ZCode UI 进度。
12. child `agent_identity` 与 Contract 不一致。
13. UI handoff 缺少 styling system、SCSS policy、component library 或 rule refs。
14. main 在 Figma 任务使用 `get_design_context/get_screenshot/variables/assets`，或把视觉细节塞进 handoff。
15. figma_link 存在，但实现者没有直接读取 Figma 证据，或 QA 没有独立 baseline。
16. `component_library` 包含 `uni-ui` 且存在 figma_link，但缺 uni-ui 映射合同或实现者缺 `uni_ui_mapping_evidence`。
17. Tailwind 项目新增未授权 `.scss`、`<style lang="scss">` 或用 scoped style 重建常规 UI。
18. 变更越过 allowed/forbidden paths，未声明真实 changed files，或引入未授权依赖/API/schema。
19. QA 重跑单测；main/QA 用“看起来正确”替代运行证据。
20. 为 500 行拆分、lint/fmt、Tailwind/SCSS、依赖策略、subagent 等待、validator 用法、代码结构搜索等工程规则调用 BRV；BRV 只允许召回业务知识和真相。
