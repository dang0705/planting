---
description: Codex AI Team Rules - project entrypoint, hard rules, and rule routing
globs: *
alwaysApply: true
inclusion: always
---

# AGENTS.md

## Must Read First / 必读入口

This file is the repository-level entrypoint for Codex and subagents.

Read the relevant rule files before work:

- Project private hard rules: `docs/ai-rules/project-hard-rules.md`
- Codex/subagent workflow: `docs/ai-rules/codex-ai-workflow.md`
- Subagent handoff and task persistence: `docs/ai-rules/subagent-handoff.md`
- Language policy: `docs/ai-rules/language-policy.md`
- CloudBase deployment: `docs/ai-rules/cloudbase-deployment.md`
- Diagnosis replay / zero-model diagnosis scripts: `docs/ai-rules/diagnosis-replay.md`
- Full CloudBase AI development guide: `docs/ai-rules/cloudbase-ai-development-rules.md`

## Global Hard Rules / 全局硬规则

- Treat this repository as the source of truth. Do not rely on hidden chat context for project-critical decisions.
- Do not perform unrelated refactors.
- Do not add production dependencies unless explicitly required.
- Do not bypass type errors, lint errors, tests, or build failures.
- Do not delete valid business logic merely to make checks pass.
- Prefer existing project wrappers and npm scripts over ad-hoc commands.
- Keep diffs small, reviewable, and aligned with the approved task scope.
- For Chinese-facing product, documentation, and diagnosis-domain concepts, Chinese must be treated as first-class language.
- Do not output patch-only documents when the user asks for complete deliverables.
- Domestic services and China-accessible solutions are preferred for production choices.

## Project Technical Context / 项目技术上下文

- Frontend: Taro, React, TypeScript
- State/data: Zustand, React Query
- Styling: Tailwind CSS
- Platform: WeChat Mini Program first
- Backend/cloud: Tencent CloudBase, Cloud Functions, MySQL / TDSQL-C related workflows
- Package manager: prefer `pnpm` when available

## Standard Verification Commands / 标准验证命令

Try focused verification first. If a script does not exist, say so explicitly.

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

## Subagent Routing / Subagent 调度

- `task_planner`: plan scope, goals, non-goals, and acceptance criteria. No code changes.
- `code_explorer`: read-only codebase exploration and call-chain mapping.
- `architect_reviewer`: architecture review and implementation boundaries. No code changes.
- `implementer`: minimal implementation within approved scope only.
- `qa_reviewer`: diff review, regression risk, boundary cases, and test gaps. No code changes.
- `docs_keeper`: complete documentation updates, terminology consistency, no patch-only docs.
- `release_ops`: build, CI/CD, CloudBase release, rollback, cost, and operational risk checks.

## Context Persistence / 上下文持久化

For non-trivial work, create or update:

- Task notes: `docs/ai-tasks/`
- Run handoff notes: `docs/ai-runs/`
- Architecture decisions when needed: `docs/adr/`

Every subagent result should include conclusion, evidence, relevant files, risks, verification status, and next-step recommendation.

## CloudBase Critical Reminders / CloudBase 关键提醒

- Do not use unreliable MCP deployment commands as the deployment source of truth.
- Use project deployment wrappers for existing CloudBase functions.
- For `diagnose-http`, deployment is not accepted until real deployment evidence and smoke/DB evidence are verified.
- For diagnosis replay, use the project wrapper or npm aliases. Do not run credential-dependent scripts bare.
