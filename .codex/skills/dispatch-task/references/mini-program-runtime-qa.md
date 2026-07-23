# Mini Program Runtime QA

仅当 acceptance 明确要求小程序端上行为时读取。

端上验收由 main 执行。当 `validation.runtime_acceptance_mode` 为 `automator_required` | `batch_substitute_allowed` | `batch_only` 时，写入 `runtime-qa-evidence.json`（可判定证据，不是角色 receipt）。

证据文件应包含：

```text
dispatch_run_id
status: passed | failed | blocked
runtime_acceptance_mode
channel
catalog_id                  # automator_required 必填
execution_id                # automator_required 必填
script_sha256               # automator_required 必填
script | script_path         # automator_required 必填，必须等于 catalog leaf_script
qa_run_execution_record      # automator_required 必填，必须指向 qa-run 持久化记录
projectPath
pagePath
automator_port 或 wsEndpoint
evidence_paths[]
failures[]
not_verified[]
```

batch 模式额外：`user_approval_ref`、`end_side_status`。

禁止角色 receipt 字段：`owner`、`agent_identity`、`coverage`、`checks_and_evidence`、`unit_tests_run`、`next_action`、`blocker_classification`、`figma_baseline_evidence`。

规则：

1. handoff 必须显式设置 `validation.miniprogram_automator_required=true|false` 和 `validation.runtime_acceptance_mode`，不得再靠 acceptance 文案猜测。
2. `validation.runtime_acceptance_mode=automator_required` 时，`projectPath` 和运行通道来自项目规则/Contract；不得由 agent 自行切换到未声明的工作区或替代通道。
3. 若实现阶段来自 Web/云端 external implementer，且 `validation.miniprogram_automator_required=true`，则 `projectPath` 必须是 `external_contract.remote_sync.planned_worktree_path/dist/dev/mp-weixin`；不得回退到主工作区。
4. `validation.runtime_acceptance_mode=automator_required` 时，本地 LAN flow、DevTools 加载目录、automator、截图和小程序运行时 `wx.request` 证据必须来自同一个 `projectPath`；具体启动命令和连接顺序按 runtime skill 执行。
5. `channel` 必须为 `miniprogram_automator`（或 batch 模式下的 `batch`）；`evidence_paths` 指向真实截图/日志。
6. automator_required 的 evidence 必须证明会话已连接到 Contract 指定的项目，并在页面上下文可验证后执行 required assertions；仅端口可连不算通过。DevTools 复用、端口配置、会话连接和 selector 解析方法统一按 runtime skill 执行。
7. automator 脚本必须通过 `test/e2e/automator/catalog.json` 精确选择叶子，并由 dispatch gate 校验 automation id policy、脚本 hash、execution id 与 qa-run execution record；裸跑只能作为排障。
8. live `qa-run` 必须先持久化已通过的 preflight：target projectPath、完整 LAN flow、9420/WS、page data、截图与小程序运行时 `wx.request`。execution record 必须保存 frozen hash、preflight 和终态；同 hash 最多两次 live attempt，产品失败不得原地重试。
9. DevTools 当前项目不等于 target projectPath 时不得重启。截图 RPC 失效时，只有从 9420 listener 祖先进程链证明唯一 target projectPath、main DevTools PID 和真实 `--remote-port` 控制端口，才可一次执行 target-only `close -> open -> auto`；进程 `--project` / 已打开 config 缺失时，唯一允许的补充是同一 main `--app-session-id` 的近期 WeappLog：精确 `AUTO` port `9420` + target 路径，并有同 session `FileUtils` target 路径，须记录 source / file / timestamp，过期或 session / port / path 不符即拒绝。必须记录每次 CLI 调用、前后 main PID / 9420 listener PID / 控制端口 / projectPath，以及恢复后的截图和 `wx.request`。`--port` 是 IDE 控制端口，不能把 `9420` 或不存在的 `--auto-port` 当作控制端口；任一证明缺失以 `devtools_automator_blocker` 失败。
10. 工具/登录/IDE blocker 与产品 failure 分开记录，保留原始错误。
11. `validation.runtime_acceptance_mode=batch_substitute_allowed` 只在有 `validation.batch_substitute_user_approval_ref` 时成立；evidence 必须包含 batch 证据路径，并记录 `end_side_status=not_verified_by_user_approved_substitution`；不得填写 automator 的 `catalog_id`、`execution_id` 或 `script_sha256`。
12. `validation.runtime_acceptance_mode=batch_only` 只用于算法/服务层矩阵，不得覆盖 UI 或真实端上交互；不得填写 automator 的 `catalog_id`、`execution_id` 或 `script_sha256`。
13. fixture 必须匹配 acceptance 声明的数据来源和用户状态；缺少 required fixture 时输出 fixture blocker，不得用其他数据源冒充通过。
14. 手势、滚动、截图、入口点击、缓存二次进入等端上操作细节只由 runtime skill 定义；本文件只要求 evidence 能证明 Contract 中对应 required assertions 已执行。
15. implementer 只做最小 smoke；正式矩阵由 main 执行，禁止重复完整自动化。
16. 截图属于独立视觉证据。若 Contract 要求截图而截图不可用，必须在 evidence 的 `not_verified` 或 `failures` 中明确记录；截图不可用不得改变 required interaction 的验收要求。

## 具体实施方法

入口、滚动、selector 作用域、截图超时和 automator API 的实施细节统一以
`.codex/skills/miniprogram-automator-runtime/SKILL.md` 为准；本文件只定义 dispatch 合同、证据和 Completion Gate 要求。
