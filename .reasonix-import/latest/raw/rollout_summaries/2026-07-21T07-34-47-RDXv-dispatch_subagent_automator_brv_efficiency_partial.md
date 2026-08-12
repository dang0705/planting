thread_id: 019f8399-4411-7b80-a5df-fe0c9ae4284d
updated_at: 2026-07-21T14:28:34+00:00
rollout_path: /Users/jay/.codex/sessions/2026/07/21/rollout-2026-07-21T15-34-47-019f8399-4411-7b80-a5df-fe0c9ae4284d.jsonl
cwd: /Users/jay/WebstormProjects/planting
git_branch: sprint-ai-workflow

# Dispatch/Automator/BRV 效率整改仅部分完成，不能宣称整体完成

Rollout context: 工作目录为 `/Users/jay/WebstormProjects/planting`。线程最初要求基于虫害模式聊天与当前仓库制定开发计划，但实际执行转向了既有 Dispatch、Subagent、Automator 与 BRV 治理整改；未完成虫害模式开发计划本身。

## Task 1: Dispatch、Subagent、Automator 与 BRV 效率整改

Outcome: partial

Preference signals:

- 用户明确质疑“你确定？……都执行完毕了？还是你又在耍我？”，随后要求先完成“Hook 原生生命周期真实集成探针”和“真实 subagent 的状态卡、低频监控验证” -> 后续必须严格区分“代码/合同回归通过”“实现阶段完成”和“Completion Gate 完成”，不能用部分验证结果暗示整体完成。
- 用户要求先完成真实探针和低频监控，而不是继续泛化说明 -> 类似任务应优先执行真实运行态验证，并保留失败/降级证据。

Key steps:

- 通过 ByteRover 查询并读取诊断题包契约；空间 `planting` 已确认，但部分查询需要沙箱外权限。BRV 结果必须回源码、测试和 `AGENTS.md` 核验，不能直接当当前事实。
- 识别任务为高风险 `deep_contract`，涉及跨模块状态、hook、QA、运行态和 BRV 责任边界。
- 修复 `qa-reconcile` 幂等性：重复 reconciliation 返回 `already_reconciled`，不重复追加审计 history；回归通过。
- 新增并验证 episode 生命周期、单次 consolidated rework 熔断、CLI lifecycle fallback、状态卡、低频检查和 trace audit。
- 对真实 `implementer_deep` noop agent 做探针：Desktop 没有产生 `SubagentStart`/`SubagentStop`，也没有可归属的 PostToolUse/Token telemetry。最终明确为 `cli_fallback`，没有伪称 native lifecycle 已接通。
- 真实 episode 验证了首次约 10 分钟后检查、后续约 5 分钟间隔检查；两次检查后 trace audit 通过。另修复了 `episode status` 可绕过检查间隔的问题，并要求提前检查提供 `reason` 与 `reason-evidence`。
- 合同回归、格式检查和 lint 通过；hook 冷启动实测 P95 约 41.9ms，lint 为 0 errors。

Failures and how to do differently:

- 整体 Completion Gate 明确 blocked：共享工作区存在大量未授权/重叠修改，postflight 检测到越界文件和 unsafe preexisting dirty overlap；不能擅自 restore、回滚或覆盖。
- Automator 真实 happy path 未完成：9420/DevTools 无法证明当前项目身份，预检返回 `project_identity_unverified`，因此没有运行或伪造端上通过证据。
- 最终仍未完成完整 LAN/9420/截图/`wx.request` 验收、干净 worktree postflight、BRV 最终记录/readback 和 Completion Gate。未来应把这些明确列为阻断项，不得只汇报代码回归通过。
- 临时 native lifecycle hook 已撤回；`.codex/hooks.json` 最终只保留 `PreToolUse` 与 `PostToolUse`，生命周期通过显式 `episode open/start/status/finish` 管理。

Reusable knowledge:

- 当前诊断固定题包契约是按模式独立配置：`yellow_leaf` 4 题、`wilting_droop` 5 题，不存在全局固定题数假设。
- 诊断视觉模型只产生可追溯证据和候选，最终模式/病因路由必须由后端确定性规则和正式证据控制；低可分析度可要求重拍。
- 题包入口为 `mode -> fixed question package`，需校验题数；题包提交不是所有诊断答案都必须一次性提交，非题包路径仍可逐题处理。
- Dispatch hook 在 native lifecycle 不可用时必须快速 CLI fallback；禁止挂载无效的 `SubagentStart`/`SubagentStop` 造成“已接通”假象。
- 状态查询也必须遵守监控节奏；提前查询需要合法原因和证据，否则返回 `early_check_reason_evidence_required`，并由 trace audit 拒绝无证据提前检查。

References:

- `/Users/jay/WebstormProjects/planting/.codex/hooks.json`
- `.codex/hooks/dispatch-gate-adapter.mjs`
- `.codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs`
- `.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-state.mjs`
- `.codex/skills/dispatch-task/scripts/dispatch-gate/lib/episode-reporting.mjs`
- `test/e2e/batch/workflow/dispatch-gate-contract.mjs`
- `test/e2e/batch/workflow/dispatch-gate-contract/episode-and-hook.mjs`
- `node test/e2e/batch/workflow/dispatch-gate-contract.mjs`
- `node .codex/skills/dispatch-task/scripts/dispatch-gate/cli.mjs hook-capability` -> `cli_fallback`
- Completion readiness 关键阻断：`postflight report must be passed, got blocked`、`unsafe preexisting dirty overlap`、`project_identity_unverified`
