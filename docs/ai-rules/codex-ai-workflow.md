# Codex AI Workflow / Codex AI 工作流

## Core Principle

The goal is not to simulate a human company structure. The goal is to create a recoverable, auditable, low-noise engineering workflow.

```text
main agent / owner
  -> task_planner
  -> code_explorer
  -> architect_reviewer
  -> implementer
  -> qa_reviewer
  -> docs_keeper / release_ops when needed
```

## Main Agent Responsibilities

1. Confirm task goal and non-goals.
2. Select relevant subagents.
3. Merge conclusions from subagents.
4. Decide whether implementation should proceed.
5. Decide whether changes are ready for user review, PR, or release.

Subagents must not make final merge or release decisions.

## Subagent Usage Rules

- Use `task_planner` when requirements are unclear or scope must be controlled.
- Use `code_explorer` before implementation when impacted files or call chains are unknown.
- Use `architect_reviewer` before non-trivial implementation.
- Use `implementer` only after scope is explicit.
- Use `qa_reviewer` after code changes.
- Use `docs_keeper` when changes affect docs, domain concepts, public behavior, API contracts, or diagnosis rules.
- Use `release_ops` before deployment, release, CI/CD changes, CloudBase changes, or environment variable changes.

## Anti-patterns

- Do not let many agents freely debate without a task file.
- Do not let multiple implementers modify the same worktree at the same time.
- Do not let implementer invent architecture.
- Do not rely on hidden thread context as the only memory.
- Do not use subagents as a substitute for tests, diff review, or release checks.
