<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-hardening-20260629-001:START>>>

You are the ZCode external implementer for dispatch run `zcode-hardening-20260629-001`.

This prompt was delivered by Codex main via clipboard paste into the current ZCode chat. Do not ask Codex main to implement code. Your final chat response is only a recovery clue; Codex main will verify real git diff, validators, tests and QA.

## Architecture Direction

本次目标是以最严要求优化 `planting` 仓库前后端业务源码，但用户已明确补充：测试文件先跳过。

必须按风险分批做，不允许全仓大重写。优先选择“明确可验证、拆分收益高、业务行为等价”的业务源码：

- 前端：UniApp 3.0 + Vue 3 + JavaScript + Pinia + Vite，微信小程序优先。
- 样式：Tailwind CSS 3 + weapp-tailwindcss；uni-ui 通过 `src/pages.json` easycom 使用。
- 后端：Tencent CloudBase Cloud Functions + MySQL/TDSQL-C。
- 当前已有大量业务源码超过 500 行；你必须先做审计，再选择高收益低风险目标。
- 禁止修改测试文件、根目录临时 QA 脚本和测试快照。
- 禁止新增依赖、修改 lockfile、变更 schema/API/鉴权/诊断业务口径。
- 若某项优化必须触碰 forbidden path 或高风险契约，立即输出 BLOCKED，不要改代码。

## Implementation Contract

Objective:

以最严要求优化前后端业务源码：跳过测试文件，优先拆分超过 500 行的业务源码文件，前端样式优先 TailwindCSS 并把复用的非预设值归纳到 `tailwind.config.js`，清理不合理 hardcode 和魔法值，将可配置项沉淀为安全配置或环境变量读取。

Acceptance:

1. 测试文件先跳过：不得新增、删除或修改 `test/**`、根目录 `qa-*.js`、临时 QA 脚本或测试快照来达成通过。
2. 所有本轮触达的业务源码文件必须低于 500 行；若确有无法合理拆分且硬拆破坏阅读的文件，必须在文件起始处写中文说明，且只能作为极少数阻断例外。
3. 对当前已超过 500 行且属于业务源码的文件，优先处理高收益、低风险目标；不得一次性重写诊断核心主链导致行为不可追踪。
4. 前端样式默认使用 TailwindCSS utility / design token / uni-ui props，不新增 SCSS；可复用的非预设颜色、间距、尺寸等沉淀到 `tailwind.config.js`。
5. 清理不合理 hardcode、魔法数字、魔法字符串；运行时配置必须来自集中常量、安全配置或环境变量读取，不得把 secret 写入仓库。
6. 不得新增依赖，不得修改 `package-lock.json`，不得开启 CloudBase 付费能力或预置并发。
7. 不得变更数据库 schema、线上云资源、公开 API 契约、鉴权语义或诊断业务约束；发现必须变更时立即 BLOCKED。
8. 保持现有用户可观察行为和业务约束不被削弱；不能通过删除有效业务逻辑、放宽校验或 fallback 适配来通过检查。
9. 完成后必须给出真实变更文件、拆分前后行数证据、Tailwind/配置化证据、hardcode 清理证据和验证命令结果。

## Allowed / Forbidden Paths

Allowed paths:

- `src/**`
- `cloudfunctions/**`
- `scripts/**`
- `tailwind.config.js`
- `postcss.config.js`
- `vite.config.js`
- `package.json`
- `.env.local.example`
- `docs/CURRENT.md`
- `docs/ACTIVE_CONTRACTS.md`
- `docs/RUNBOOK.md`
- `docs/_sync-map.yml`
- `docs/_doc-status.yml`

Forbidden paths:

- `test/**`
- `qa-*.js`
- `.tmp-diagnose-yellowing-fixed.mjs`
- `.tmp/**`
- `.codex/**`
- `.agents/**`
- `.brv/**`
- `dist/**`
- `node_modules/**`
- `package-lock.json`
- `.env.local`
- `.env*`
- `cloudbaserc.json`
- `project.config.json`
- `project.private.config.json`
- `.git/**`
- `.github/**`
- `tmp/**`
- `screenshots/**`
- `qa-artifacts/**`
- `AI-training/**`
- `knowledges/**`
- `SQL-cvs/**`

If you need to edit any forbidden path, stop and return `BLOCKED_FORBIDDEN_PATH_REQUIRED`.

## Project Constraints

Rule references to honor:

- `AGENTS.md#2 全局硬规则`
- `AGENTS.md#3 项目技术上下文`
- `AGENTS.md#5 读取边界`
- `.codex/skills/dispatch-task/SKILL.md#Gate B2`
- `.codex/skills/dispatch-task/references/high-risk-workflow.md#Strict Decision Lock`

Project stack:

- Frontend: UniApp 3.0, Vue 3, JavaScript, Tailwind CSS 3, uni-ui, Pinia, Vite.
- Platform priority: 微信小程序.
- Backend: Tencent CloudBase, Cloud Functions, MySQL/TDSQL-C.
- Lint: oxlint.
- Formatter: oxfmt.

Dependency policy:

- No new dependencies.
- Do not install plugins.
- Do not modify `package-lock.json`.
- `package.json` may only be changed for scripts or non-dependency config. Do not add or change dependency entries.

Strict decision lock:

- Do not modify tests.
- Do not change schema/API/auth/diagnosis product semantics.
- Do not weaken validation or delete valid business logic to pass checks.
- Do not write compatibility fallback/adapter code for logic that should be fully replaced.
- Do not write real secrets into the repo. Only update `.env.local.example`, central constants, safe config readers, or documentation.
- Stop if a hardcode appears to be an external contract, data key, schema field, route id, or persisted value and cannot be confidently moved.

## UI Scope Contract

For frontend edits:

- Use existing components and uni-ui where appropriate.
- Do not rebuild ordinary UI styling with `<style scoped>` or SCSS.
- Do not add new SCSS files.
- Keep text and product terminology Chinese-first.
- Keep WeChat mini-program compatibility.
- If splitting a Vue file, preserve page/component behavior and events.

## Style Stack Contract

Tailwind is the default styling system.

- Use Tailwind utility classes for layout, spacing, colors, typography and state styling.
- Reusable non-preset colors, spacing, shadows, radius, or dimensions should be added to `tailwind.config.js`.
- Existing CSS may remain only for cases Tailwind cannot reasonably cover, such as keyframes, platform-specific patches, complex selectors, or third-party overrides.
- If you leave a touched file above 500 lines due to a real readability tradeoff, add a concise Chinese file-start comment explaining why splitting would damage readability. Avoid this unless truly necessary.

## Validation Commands

After implementation, run and report:

```bash
npm run lint
npm run fmt:check
npm run test:ci
npm run build:mp-weixin:ci
```

Also report these audits:

```bash
git status --short
git diff --stat
git diff --name-only
```

Line-count evidence for touched business source files is required. Do not modify test files to fix failures.

## Result JSON Contract

When finished, output exactly this result envelope in the ZCode chat:

```text
<<<ZCODE_IMPLEMENTER_RESULT:zcode-hardening-20260629-001:START>>>
{
  "status": "completed | blocked",
  "agent_identity": {
    "agent_type": "zcode_external",
    "dispatch_run_id": "zcode-hardening-20260629-001"
  },
  "changed_files_claimed": [],
  "summary": "",
  "line_count_evidence": {
    "touched_business_source_files": [],
    "over_500_remaining_with_exception": []
  },
  "hardcode_audit_evidence": {
    "moved_to_config_or_env": [],
    "left_as_contract_with_reason": []
  },
  "style_stack_compliance": {
    "tailwind_used": true,
    "new_scss_added": false,
    "tailwind_config_updates": []
  },
  "component_reuse_evidence": {
    "existing_components_or_uni_ui_reused": [],
    "new_components_created": []
  },
  "validation_claims": {
    "npm run lint": "passed | failed | not_run",
    "npm run fmt:check": "passed | failed | not_run",
    "npm run test:ci": "passed | failed | not_run",
    "npm run build:mp-weixin:ci": "passed | failed | not_run"
  },
  "forbidden_path_check": {
    "test_files_modified": false,
    "forbidden_paths_modified": []
  },
  "dependency_diff_check": {
    "new_dependencies": false,
    "package_lock_modified": false
  },
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:zcode-hardening-20260629-001:END>>>
```

If blocked, do not edit further. Return the same envelope with `status: "blocked"` and a concrete blocker reason.

<<<ZCODE_IMPLEMENTER_HANDOFF:zcode-hardening-20260629-001:END>>>
