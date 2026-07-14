# Mini Program Runtime QA

仅当 acceptance 明确要求小程序端上行为时读取。

端上验收由 main 执行。当 `validation.runtime_acceptance_mode` 为 `automator_required` | `batch_substitute_allowed` | `batch_only` 时，写入 `runtime-qa-evidence.json`（可判定证据，不是角色 receipt）。

证据文件应包含：

```text
dispatch_run_id
status: passed | failed | blocked
runtime_acceptance_mode
channel
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
2. `validation.runtime_acceptance_mode=automator_required` 时，projectPath、端口和 selector 来自项目规则/Contract，不得硬编码在 agent 配置。
3. 若实现阶段来自 Web/云端 external implementer，且 `validation.miniprogram_automator_required=true`，则 `projectPath` 必须是 `external_contract.remote_sync.planned_worktree_path/dist/dev/mp-weixin`；不得回退到主工作区。
4. `validation.runtime_acceptance_mode=automator_required` 时，`npm run dev:mp-weixin:local-functions:lan`、DevTools 加载目录、`9420`、automator、截图和小程序运行时 `wx.request` 证据必须来自同一个 projectPath。
5. `channel` 必须为 `miniprogram_automator`（或 batch 模式下的 `batch`）；`evidence_paths` 指向真实截图/日志。
6. 先验证 automator 会话与页面上下文，再执行真实交互；仅端口可连不算通过。
7. 优先稳定 test id；不得把坐标或中文文案作为首选 selector。UniApp 编译后的 `xxxx--stable-id` 必须按 stable id 匹配，动态 ID 必须先提取 stable id 再做 prefix/suffix 断言。
8. 工具/登录/IDE blocker 与产品 failure 分开记录，保留原始错误。
9. `validation.runtime_acceptance_mode=batch_substitute_allowed` 只在有 `validation.batch_substitute_user_approval_ref` 时成立；evidence 必须包含 batch 证据路径，并记录 `end_side_status=not_verified_by_user_approved_substitution`。
10. `validation.runtime_acceptance_mode=batch_only` 只用于算法/服务层矩阵，不得覆盖 UI 或真实端上交互。
11. 用户植物 fixture 与目录植物 fixture 必须分开；缺用户植物时输出 fixture blocker，不能用目录植物冒充用户植物入口。
12. PotCanvas touch/drag 不作为算法跑批 blocker；盆型尺寸可用人工矩阵跑批。只有 acceptance 明确要求端上拖拽调盆时，touch/drag 缺失才阻塞。
13. implementer 只做最小 smoke；正式矩阵由 main 执行，禁止重复完整自动化。
14. unit tests 不属于 QA。

## 具体实施方法参考 `.codex/skills/miniprogram-automator-runtime` 此 skill
