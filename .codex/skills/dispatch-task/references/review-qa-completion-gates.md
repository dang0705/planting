# Review, QA and Completion Gates

## Gate C — Implementation Review

实现者返回 JSON 后，先校验结果合同，再做 diff-first review，并执行**一个** postflight：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
# 或：validate-result.mjs external <handoff.json> <external-recovery-result.json>
node .codex/skills/dispatch-task/scripts/validate-implementation-postflight.mjs <handoff.json> <impl-result.json> <worktree-baseline.json> > .tmp/dispatch-task/<dispatch_run_id>-postflight-report.json
```

`completed` 结果进入 main review；`blocked` 结果是合法阻断结果，但不得进入 Completion Gate。

两种实现模式都必须做 diff-first review：身份/来源、实际变更文件、路径边界、项目约束、decision lock、依赖、验证证据。UI 重点检查 Tailwind/SCSS、组件复用与 uni-ui 映射证据；Figma 任务必须存在实现者直接读取证据。失败退回原实现路径，main 不亲自修复。

## Gate D — QA

Figma/UI、用户可观察行为、API/schema/数据链路、端上运行、高风险或用户明确要求时需要 QA。纯文档、注释或不影响行为的机械改动可跳过，但要记录理由。

QA 由 main 执行；`task.qa_required=true` 本身不强制任何 QA JSON。main QA 不运行 unit tests，不修改业务代码；发现产品问题时退回原 implementer 或 external implementer。

仅当 `validation.runtime_acceptance_mode` 为 `automator_required` | `batch_substitute_allowed` | `batch_only` 时，必须产出 `runtime-qa-evidence.json`（字段见 `SKILL.md` §10）。小程序端上验收读取 `references/mini-program-runtime-qa.md` 与 `$miniprogram-automator-runtime`。

## Completion Gate

完成前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <impl-result.json> <postflight-report.json> [runtime-qa-evidence.json]
```

完成条件：实现模式校验通过；postflight report 为 `passed`；main review 通过；所需 QA 已通过或明确不需要；docs/BRV impact 已由 main 处理或明确不需要；blocker 与未验证项已明确；真实 git diff/status 与结果声明一致。

若 handoff 显式设置 `validation.runtime_acceptance_mode` 为 automator/batch 模式，Completion Gate 还会复核 `runtime-qa-evidence.json`：

1. `projectPath` 必须匹配本轮合同允许的工作区：
   - 普通本地任务：主工作区 `dist/dev/mp-weixin`
   - Web/云端 external implementer：`external_contract.remote_sync.planned_worktree_path/dist/dev/mp-weixin`
2. Web agent 自称完成本地 QA 不能替代 Codex worktree recovery evidence。
3. `automator_required` 必须提供 catalog leaf id、leaf script path、script hash、execution id、qa-run execution record 和真实 E2E evidence；Completion Gate 会比对 catalog 与 qa-run 记录。
4. `batch_substitute_allowed` 与 `batch_only` 只能使用 batch channel，不得携带 automator catalog/hash/execution 字段来伪装端上验收。
