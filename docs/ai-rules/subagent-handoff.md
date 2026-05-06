# Subagent Handoff and Context Persistence / Subagent 交接与上下文持久化

## Core Principle

Agent threads may stop. Task state must survive.

Store durable context in repository files, not only in chat.

## Task Notes

Use `docs/ai-tasks/` for non-trivial tasks.

```text
docs/ai-tasks/TASK-YYYY-MM-DD-short-name.md
```

```md
# TASK: <task name>

## Goal / 目标
## Non-goals / 非目标
## Current Decisions / 当前已确认决策
## Constraints / 约束
## Relevant Files / 涉及文件
## Acceptance Criteria / 验收标准
## Verification Plan / 验证计划
```

## Run Handoff Notes

Use `docs/ai-runs/` for multi-agent or multi-step work.

```text
docs/ai-runs/YYYY-MM-DD-short-name/
  task-planner.md
  code-explorer.md
  architect-reviewer.md
  implementer.md
  qa-reviewer.md
  docs-keeper.md
  release-ops.md
  final-summary.md
```

Every handoff must include conclusion, evidence, relevant/changed files, decisions, risks, verification status, open questions, and next-step recommendation.

## Resume Rule

When resuming interrupted work, read in this order:

1. `AGENTS.md`
2. Relevant files in `docs/ai-rules/`
3. Current `docs/ai-tasks/TASK-*.md`
4. Latest `docs/ai-runs/.../*.md`
5. Current git diff
6. Relevant source files
