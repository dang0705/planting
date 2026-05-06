# Project Hard Rules / 项目硬规则

## Highest Priority / 最高优先级

- Treat repository files as the source of truth.
- Do not rely on hidden chat context for project-critical decisions.
- Do not perform unrelated refactors.
- Do not add production dependencies unless explicitly required.
- Do not bypass type errors, lint errors, tests, or build failures.
- Do not delete valid business logic merely to make checks pass.
- Prefer existing project wrappers and npm scripts over ad-hoc commands.
- Keep diffs small and reviewable.
- For Chinese-facing product, documentation, and diagnosis-domain concepts, Chinese must be treated as first-class language.
- Do not output patch-only documents when the user asks for complete deliverables.
- Domestic services and China-accessible solutions are preferred for production choices.

## Project Context / 项目上下文

- Frontend: Taro, React, TypeScript
- State/data: Zustand, React Query
- Styling: Tailwind CSS
- Platform: WeChat Mini Program first
- Backend/cloud: Tencent CloudBase, Cloud Functions, MySQL / TDSQL-C related workflows
- Package manager: prefer `pnpm` when available

## Verification / 验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

If a script is unavailable, state that explicitly instead of pretending it ran.
