# Review, QA and Completion Gates

## Gate C — Implementation Review

Codex subagent 返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs implementer <handoff.json> <result.json>
```

ZCode recovery 返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs external <handoff.json> <zcode-recovery-result.json>
```

`completed` 结果进入 main review；`blocked` 结果是合法阻断结果，但不得进入 Completion Gate。

两种实现模式都必须做 diff-first review：身份/来源、实际变更文件、路径边界、项目约束、decision lock、依赖、验证证据。UI 重点检查 Tailwind/SCSS、组件复用与 uni-ui 映射证据；Figma 任务必须存在实现者直接读取证据。失败退回原实现路径，main 不亲自修复。

建议补充真实工作区校验：

```bash
node .codex/skills/dispatch-task/scripts/validate-worktree-scope.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-no-new-deps.mjs <handoff.json>
node .codex/skills/dispatch-task/scripts/validate-style-stack.mjs <handoff.json>
```

## Gate D — QA

Figma/UI、用户可观察行为、API/schema/数据链路、端上运行、高风险或用户明确要求时需要 QA。纯文档、注释或不影响行为的机械改动可跳过，但要记录理由。

QA 必须按 Gate B1 具名 spawn 为 `qa_reviewer`。返回 JSON 后执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-result.mjs qa <handoff.json> <result.json>
```

QA 不运行 unit tests。小程序端上验收读取 `references/mini-program-runtime-qa.md` 与 `$miniprogram-automator-runtime`。

## Completion Gate

完成前执行：

```bash
node .codex/skills/dispatch-task/scripts/validate-completion-readiness.mjs <handoff.json> <implementer-or-external-result.json> [qa-result.json]
```

完成条件：实现模式校验通过；main review 通过；所需 QA 通过；blocker 与未验证项已明确；真实 git diff/status 与结果声明一致；只输出一份 Completion Receipt，不输出逐 gate telemetry。
