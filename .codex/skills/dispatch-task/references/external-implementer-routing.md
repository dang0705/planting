# External Implementer Routing

硬约束：所有 external implementer 共享同一套 handoff prompt 生成 schema，不得为不同 provider 定义不同的 prompt 内容格式。
provider 差异只允许存在于发送 adapter（会话入口、DOM 校验、host/tab 校验、发送动作）与 send receipt 字段，不得改变 prompt 的 section 集合、顺序、sentinel 或结构化合同字段。

仅当 `implementation_mode=external_implementer`（兼容旧值 `zcode_external`）时读取。本文定义外部实现者的公共 handoff 生成协议；provider 只作为 adapter 差异层，不得改变 prompt 的主协议。

## 路由

命中“外部实现者 / external implementer / 交给 ZCode / 用 Trae / 让 Chrome 插件里的云端 agent 实现”等正向触发词，且任务需要代码修改时，设置：

```text
implementation_mode = external_implementer
dispatch_tier = external_implementer
external_contract.provider = zcode | trae | chrome_cloud_agent | other
external_contract.target_session = current_open_chat | browser_session | remote_session | manual_handoff
```

旧字段兼容：`implementation_mode=zcode_external`、`dispatch_tier=zcode_external`、`zcode_contract` 仅表示 provider 为 ZCode 的旧合同格式。新任务优先使用 `external_contract`。

明确出现“不用外部实现者 / 不用 ZCode / 不用 Trae / disable external implementer”等否定语境，或任务只是询问流程、配置、故障时，不触发。

## 公共边界（统一约束）

1. main 不 spawn Codex implementer，不自己写代码。
2. external implementer 只负责按 prompt 修改代码并写 handoff manual。
3. main 负责合同、路径边界、provider 发送 adapter、Child Run Lock、diff review、main QA 与 Completion Gate。
4. provider 聊天或 UI 中的“完成”不是完成依据；main 必须重新读取真实 git diff、测试证据和 handoff manual。
5. provider 失败、无 diff、越权修改、prompt 未完整发送、无法读取必要 Figma 或 adapter 不可用时，不得 silent fallback 到 main 或 Codex subagent；需要用户明确批准后才能改派。
6. Web/云端 external implementer（TRAE Web、Chrome 插件驱动云端 agent，或 `prompt_transport=browser_plugin`）启动前必须完成 remote sync gate，确保本地要交给云端的代码已经提交并推送到同一个远端分支。
7. 当 Codex 运行环境是 Codex Desktop，Web/云端 provider 页面必须通过 Codex 内置浏览器打开和发送 prompt；不得改用用户普通 Chrome 窗口、shell 脚本或仅凭 ambient browser 状态冒充受控发送。
8. Web/云端 external implementer 即使远端运行时自称 main/root，也必须按 implementer 角色工作：只改合同内代码，执行 unit tests / lint / build / self-check；有 `figma_link` 时必须直接使用可用 Figma 插件 / MCP / 工具读取设计并输出 `figma_fetch_evidence`。
9. Provider 能力必须显式区分。Trae Web 默认使用 GLM 文本模型，不承担真实图片视觉诊断；图片上传、视觉模型调用、raw visual response、标准化视觉候选和真实图片回放由 main QA 负责。Trae 报告本地图片不可访问时，不得单独据此阻断代码实现，除非 handoff 明确声明该 provider 具备视觉能力且视觉验证属于 external implementer 的必需交付。

## Web remote sync gate

适用于 `provider=trae`、`provider=chrome_cloud_agent` 或 `prompt_transport=browser_plugin` 的代码实现任务。该 gate 在打开 provider 页面并发送 prompt 之前执行。

硬规则：

1. main 必须先读取 `git status --short`、当前分支、当前 HEAD、upstream 或目标 remote branch，并确认要交给 Web agent 的基线 commit。
2. main 必须在发送 prompt 前确定本轮 Web agent 唯一远端分支和本地临时 worktree 路径。TRAE Web 默认分支命名为 `trae-test-{dispatch_run_id}`；禁止使用 `trae/` 前缀。若用户或任务平台已经给出分支，必须写入合同，不得等 Web agent 完成后再从聊天里复制分支名。
3. 若本地存在未提交改动，必须先执行 `git add`、`git commit`、`git push`，使远端分支包含本轮启动前的完整基线；commit message 必须能识别为 dispatch/web-agent baseline。
4. 如果工作区包含不属于本轮任务、来源不明或用户未授权打包的脏改动，main 不得静默 commit/push；必须阻断并让用户决定是纳入 baseline、拆分到其他分支，还是先清理。
5. 发送 prompt 前的 handoff 必须记录 `external_contract.remote_sync`：

```text
required: true
status: pushed
remote
branch              # 任务开始时确定；TRAE Web 默认 trae-test-{dispatch_run_id}，禁止 trae/ 前缀
base_commit
push_ref
planned_worktree_path
pr_url              # 已有 PR 时必填；尚未创建时填 not_available 并在 recovery 时补齐
dirty_policy: blocked_if_unowned_dirty
```

6. 因 remote sync 会改变 HEAD，handoff 必须显式设置 `validation.allow_head_change=true`，并记录 `validation.head_change_reason=web_external_remote_sync`。该授权只允许“启动 Web agent 前的 baseline commit/push”和“回收 PR/worktree 时切换到独立测试工作区”，不得用来掩盖实现阶段的未知 checkout、reset 或本地主工作区改写。
7. send receipt 必须包含同一份 remote sync 证据；缺失或 `status` 不是 `pushed` 时，不得进入 Child Run Lock。
8. 发送前必须在受控 Trae Web 页面重新读取分支选择器，并确认合同中的 `remote_sync.branch` 可见且已选中。分支不可见时必须记录 `blocked: trae_branch_unavailable`，不得发送到 `master`、当前默认分支或任何替代分支。
9. 当 handoff 写明 `external_contract.codex_runtime_surface=codex_desktop` 时，必须写明 `external_contract.web_provider_open_surface=builtin_in_app_browser`。send receipt 必须记录同样字段，并包含真实内置浏览器发送证据。

## Web PR recovery and QA

Web/云端 external implementer 返回后，不再要求外部 agent 在本地主工作区写 handoff manual 才能开始 review；main 以最新 PR / 远端分支作为回收入口。若 provider 同时写了 handoff manual，可以作为辅助证据，但不能替代 PR diff 和本地 worktree 验收。Web provider 的 `completed` 依据是 PR/worktree 证据，不是本地 handoff manual；provider 的终态只代表实现交付阶段结束，随后进入 Gate C Main Review，不代表 dispatch-task 已完成。

硬规则：

1. main 必须使用 handoff 中的 `external_contract.remote_sync.branch` 和 `planned_worktree_path` 回收；provider 聊天声明不能覆盖合同分支。若 Web agent 实际推到其他分支，必须阻断并让用户决定是否更新合同。
2. main review 必须通过独立 worktree，不切换主工作区。优先使用脚本，避免自然语言步骤漂移：

```bash
node .codex/skills/dispatch-task/scripts/manage-web-pr-worktree.mjs prepare <handoff.json>
```

等价手动命令只允许作为脚本不可用时的 fallback：

```bash
git fetch origin trae-test-task-123
git worktree add ../project-pr-123 origin/trae-test-task-123
cd ../project-pr-123
```

3. 在独立 worktree 内执行项目声明的安装、构建和测试命令。具体命令以 `package.json` 和 Handoff Contract 为准；示例：

```bash
npm install
npm run build:mp-weixin
npm run test:e2e
```

4. 需要本地运行态 QA 时，main 先准备 worktree runtime env。runtime worktree 必须复用主工作区的 `.env.local` 和 `node_modules`：`.env.local` 使用下面的脚本复制，`node_modules` 优先从主工作区建立软链接；不得因为 provider worktree 自身没有凭据或依赖目录就把项目环境判为缺失。脚本只输出脱敏 key 列表，结束后必须 cleanup：

```bash
node .codex/skills/dispatch-task/scripts/prepare-runtime-worktree-env.mjs <handoff.json> prepare
node .codex/skills/dispatch-task/scripts/prepare-runtime-worktree-env.mjs <handoff.json> cleanup
```

5. 小程序端上验收仍按 `AGENTS.md` 和 `references/mini-program-runtime-qa.md` 执行。若本轮代码未部署到云端，必须在独立 worktree 内跑通完整 LAN local-functions flow，并让小程序运行时命中新代码；只跑 PR diff、Node/curl、scoped gateway 或 health route 不算端上验收完成。
6. 如果 acceptance 包含 `miniprogram-automator` 端上测试，则 `projectPath` 必须直接绑定到 handoff 中 `external_contract.remote_sync.planned_worktree_path` 派生出的 `dist/dev/mp-weixin`。不得继续使用主工作区 `/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin` 冒充验收。main QA 必须先运行预检：

```bash
node .codex/skills/dispatch-task/scripts/check-miniprogram-qa-env.mjs <handoff.json> <projectPath>
```

7. 上述 automator 场景中，`npm run dev:mp-weixin:local-functions:lan`、微信开发者工具加载目录、`9420`、`miniprogram-automator`、截图和小程序运行时 `wx.request` 必须全部来自同一个 worktree。只要其中任何一环回到主工作区或其他目录，本轮 QA 必须判为 `devtools_configuration_blocker`。
8. 端上 automator 验收任务完成后，先停止 `npm run dev:mp-weixin:local-functions:lan` 等长跑进程，再回到主工作区并清理临时 worktree：

```bash
node .codex/skills/dispatch-task/scripts/manage-web-pr-worktree.mjs cleanup <handoff.json>
```

9. recovery result 必须记录 `external_recovery_evidence.pr_review`，至少包含 `pr_url` 或 `remote_branch`、`worktree_path`、`fetch_ref`、`worktree_head`、`commands_run`、`main_workspace_untouched=true`。若执行了端上 automator 验收，还必须记录实际 `projectPath`，并与 handoff 中的 `planned_worktree_path` 匹配。缺失或不匹配时不得进入 Completion Gate。

### Web external monitoring automation

TRAE Web / Chrome cloud agent 的等待以一次性发送确认 + 低频 recurring wakeup 为主，不使用持续浏览器盯屏：

1. 发送动作只允许做短时 UI 确认：host、Code tab、输入框、发送按钮可用、消息已送达、provider 已开始运行；这些不是 completion 检查；
2. provider 开始运行后，main 必须立即创建或复用一个与 `dispatch_run_id` 绑定的 heartbeat/监控自动化；heartbeat 首次唤醒延迟必须为 5 分钟，后续唤醒间隔必须不短于 5 分钟。必须记录 `automation_id`、provider session URL、`initial_delay_minutes=5`、`poll_interval_minutes=5`、`mode=recurring_wakeup`。未创建 heartbeat 或未取得产品提供的等价 wakeup 凭证前，不得结束本轮 dispatch 协调并声称已进入等待态；首次正式检查不早于 5 分钟，后续不短于 5 分钟；
3. 每次唤醒只检查是否出现最终结果、PR URL、handoff/manual 终态或明确阻断。仍在执行时不得读取流式中间过程、半成品 diff、临时 status，也不得把“暂无结果”报告给用户；
4. provider 终态出现后，先停用/删除该自动化，再进入 PR recovery、QA、merge 和 local sync；`completed` 才能进入维护补丁和后续合并，`blocked` 只能进入阻断处理；任务完成、阻断、用户中止或会话失效时都必须清理自动化，避免 stale wakeup；
5. 若产品无法创建 recurring automation，必须退化为产品提供的 heartbeat/wakeup，并在 send receipt 中记录 `monitoring_automation.status="unavailable"`、原因和 heartbeat/wakeup 凭证；仍遵守同样的 5 分钟下限。不得退化为 20 秒/40 秒/60 秒循环或持续 UI 轮询。

send receipt 的 `external_wait_policy` 应扩展为：

```json
{
  "mode": "child_run_lock",
  "initial_check_min_minutes": 5,
  "poll_interval_min_minutes": 5,
  "short_timeout_completion_forbidden": true,
  "monitoring_automation": {
    "mode": "recurring_wakeup",
    "automation_id": "dispatch-task-{dispatch_run_id}",
    "status": "active | unavailable | stopped",
    "initial_delay_minutes": 5,
    "poll_interval_minutes": 5,
    "session_url": "https://work.enterprise.trae.cn/session/..."
  }
}
```

`status=unavailable` 只能表示产品没有自动化能力，不得放宽等待下限；终态回收后必须记录 `status=stopped` 或等价的删除证据。

## 统一 Prompt 生成规范

统一模板：

```text
assets/templates/external-implementer-prompt-template.md
```

所有 external implementer 的 prompt 必须使用同一模板和同一 sentinel：

- `<<<EXTERNAL_IMPLEMENTER_HANDOFF:{dispatch_run_id}:START|END>>>`
- `<<<EXTERNAL_IMPLEMENTER_RESULT:{dispatch_run_id}:START|END>>>`

prompt 必须完整包含以下 section，且顺序不得变化：

- `## Architecture Direction`
- `## Implementation Contract`
- `## Allowed / Forbidden Paths`
- `## Project Constraints`
- `## Handoff Manual Contract`
- `## Validation Commands`
- `## UI Scope Contract`
- `## Style Stack Contract`
- `## Figma Direct Fetch`
- `## Figma Blocker Policy`
- `## uni-ui Mapping Contract`
- `## Result JSON Contract`

若某 section 对当前任务不适用，仍必须保留标题，并填入 `not_applicable` 或等价占位内容，不得删节 section。

禁止根据 provider 在 prompt 中增加额外结构字段（例如 zcode/trae 专有字段）或改写标题/section/sentinel；任何 provider 差异必须放在 `external-implementer-routing` 的 adapter 小节或各 provider 参考文件中。

## external_contract

最小字段：

```text
provider
target_session
prompt_transport
codex_runtime_surface            # Web/云端 provider 必填：codex_desktop | other
web_provider_open_surface        # codex_desktop 时必须 builtin_in_app_browser
send_receipt_required: true
handoff_manual_required: true
handoff_completion_status_source: handoff_manual
completion_claim_not_authoritative: true
codex_self_implementation_forbidden: true
generic_fallback_forbidden: true
recovery_required: true
required_prompt_sections
remote_sync           # Web/云端 provider 必填
pr_policy: required   # Web/云端代码任务必须产出 PR；合并由 main 使用 GitHub 插件完成
```

`prompt_transport` 示例：

- `clipboard_paste`：本地 UI 聊天窗口，如 ZCode。
- `browser_plugin`：Chrome 插件或浏览器会话中的云端 agent。
- `manual_handoff`：用户明确要求人工外部转交时，只生成 prompt 和 receipt，不伪造工具调用。
- `api_or_mcp`：未来若有专用 provider connector，可记录真实 connector event。

## TRAE Web provider

当 `external_contract.provider=trae` 且通过 Web TRAE / Chrome 受控页面发送 prompt 时，TRAE 必须被当作浏览器 provider adapter，而不是泛化的聊天窗口。

硬规则：

1. TRAE Web 受控页面的目标 host 固定为 `work.enterprise.trae.cn`。adapter 打开页面后必须先校验 `location.origin`/`location.host`；若不是该 host，返回 `blocked: trae_wrong_origin`，不得在其他 TRAE 域名或未知镜像页面发送实现 prompt。
2. Trae Web 分支选择器过滤所有 `trae/` 开头的分支。handoff 生成器和 validator 必须拒绝 `remote_sync.branch` 以 `trae/` 开头；推荐使用 `trae-test-{dispatch_run_id}` 或用户已确认可见的等价非斜杠分支名。
3. Web TRAE 默认可能处于 `Work` 模式；作为 external implementer 执行代码任务前必须切到 `Code` 模式。
4. Code 模式验证路径固定为页面左上角 `div[role="tablist"]` 下文本为 `Code` 的 `button`。只有该按钮同时满足 `aria-selected="true"` 且 `class` 包含 `tabActive-` 前缀，才算已选中 Code 模式。
5. 如果 Code tab 未选中，adapter 必须点击该 `Code` button 并重新读取两个条件；仍不满足时返回 `blocked: trae_code_mode_unavailable`，不得继续发送实现 prompt。
6. TRAE Web 的输入框通常是 Lexical/contenteditable。adapter 必须通过真实焦点与浏览器输入事件触发前端状态更新；发送前必须确认发送按钮存在且 `disabled=false`。仅设置 DOM 文本后点击禁用按钮不算 send receipt。
7. send receipt 至少记录：目标 URL、受控 profile 或 remote-debug 端口、Code tab 的 `aria-selected` 和 `class`、已选分支及分支可见性证据、输入框 selector、发送按钮 `disabled=false` 的证据、真实点击/发送动作，以及 prompt sentinel 或摘要。
8. Codex 内置浏览器发送成功后，adapter 必须显式保留 TRAE tab，避免 Browser Use 默认清理导致用户看不到会话。推荐在所有发送和状态确认动作完成后调用 `browser.tabs.finalize({ keep: [{ tab, status: "handoff" }] })`；send receipt 必须记录 `tab_retention.status="handoff"`、`tab_retention.method="browser.tabs.finalize.keep"`、`tab_retention.session_url`。如果 finalization API 不可用，必须记录 `tab_retention.status="blocked"` 与原因，不得声称内置浏览器会话已保留。
9. prompt 发送并确认 TRAE 已开始运行后，main 进入 Child Run Lock，并按上方 Web external monitoring automation 创建 recurring wakeup。正式实现任务首次状态检查不得早于 5 分钟，之后检查间隔不得短于 5 分钟；不得把 60 秒、90 秒等短等待作为完成、失败、无产出或人工接管依据。短等待只允许用于发送动作本身的 UI 确认或一次性身份探针。
10. Web provider send receipt 必须记录 `external_wait_policy.mode="child_run_lock"`、`external_wait_policy.initial_check_min_minutes>=5`、`external_wait_policy.poll_interval_min_minutes>=5`、`external_wait_policy.short_timeout_completion_forbidden=true` 及 `monitoring_automation`。如果本轮只是身份探针或非代码任务，不走 external implementer completion validator，但不得把探针脚本的短等待写进正式实现规则。
11. TRAE 聊天输出不能替代 `handoff_manual.path` 或 PR/worktree evidence，只能作为排障或 recovery 辅助证据。
12. Web external PR recovery 必须在 Gate C Main Review 中完成 diff review、必要的受限 `maintenance_patch` 和验证，然后在 merge 后记录 `pr_merge` 与 `local_base_sync`：包括 PR URL/number、merge 前 head SHA、merge commit SHA、base branch、GitHub merge 成功证据，以及本地 `fetch + pull --ff-only` 后的 branch/head/clean status。缺少任一项不得标记 dispatch-task `completed`。

## handoff_manual

`handoff_manual.path` 必须位于：

```text
.tmp/dispatch-task/{dispatch_run_id}-handoff-manual.json
```

非 Web provider 的 external implementer 开始任务后置 `status=working`，完成或阻塞时更新为 `completed|blocked`。main 低频回收时必须先读该 JSON，再判断是否进入 recovery。若文件缺失或 JSON 损坏，不得用聊天状态补判完成；recovery result 必须记录 `handoff_manual.status=missing|invalid` 并返回 `blocked`。

Web/云端 provider 若不能写入本地主工作区的 `handoff_manual.path`，recovery result 记录 `external_handoff_manual.status=not_required_remote_pr`，并必须提供 PR/worktree recovery evidence。不能用聊天状态补判完成。

## Validators（external 模式）

```bash
node .codex/skills/dispatch-task/scripts/validate-handoff.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-external-prompt.mjs <handoff.json> <external-prompt.md>
node .codex/skills/dispatch-task/scripts/validate-zcode-prompt.mjs <handoff.json> <zcode-prompt.md>
node .codex/skills/dispatch-task/scripts/validate-zcode-send-receipt.mjs <handoff.json> <send-receipt.json>
node .codex/skills/dispatch-task/scripts/validate-zcode-handoff-manual.mjs <handoff.json> <handoff-manual.json>
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <recovery-result.json>
node .codex/skills/dispatch-task/scripts/validate-implementation-postflight.mjs <handoff.json> <recovery-result.json> <worktree-baseline.json>
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <recovery-result.json> <postflight-report.json> [runtime-qa-evidence.json]
```

`validate-completion-readiness` 只能在 GitHub 插件完成 PR merge、main 已 `fetch + pull --ff-only` 且 recovery result 已补齐 `pr_merge` / `local_base_sync` 后执行。
