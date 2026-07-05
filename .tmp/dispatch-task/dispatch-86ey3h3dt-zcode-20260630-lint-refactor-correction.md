<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:START>>>

这是同一 dispatch run 的返工 prompt，不是新任务。本 prompt 会由 Codex main 通过剪贴板一次性粘贴到当前 ZCode 会话，用于审计真实 ZCode bridge 流程。继续使用并更新：

`.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

收到后先写 `status=working`，`phase=editing`。完成后写 `status=completed`，阻塞写 `status=blocked`。

## Architecture Direction

前序 v2.1 算法和 Figma 对齐方向保持不变。本次返工只处理 Codex main 回收阶段发现的阻塞：

1. ZCode handoff manual 声称 lint 通过，但 Codex main 在 ZCode 改动文件上运行 focused lint 失败。
2. 实际新增了 `src/components/PotCanvas.vue`，但 handoff manual 的 `changed_files_claimed` 漏报。
3. 本次 UI 扩展后 `src/pages/index/components/WateringReminderSheet.vue` 达到 883 行，违反仓库“超过 500 行必须合理解耦拆分模块”的规则。必须拆分，不能只解释。

不要改 SQL lane 文件；SQL/backfill 已由内部 SQL subagent 完成。

## Implementation Contract

必须完成：

1. 修复以下 focused lint 命令在 ZCode 改动文件上的错误：

```bash
npx oxlint cloudfunctions/layer/utils/pot-geometry.js cloudfunctions/layer/utils/hydration-load.js cloudfunctions/layer/utils/watering-planner.js cloudfunctions/layer/utils/plant-knowledge.js cloudfunctions/plant-user-http/app.js cloudfunctions/diagnose-http/utils/environment-context-v7.js cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js src/pages/index/components/WateringReminderSheet.vue src/components/PotCanvas.vue src/pages/profile/diagnosis-review.vue test/unit-test/test-watering-planner-v21.mjs test/unit-test/test-environment-care-context.mjs test/unit-test/test-care-behavior-payload.mjs test/unit-test/test-care-behavior-answer-runner.mjs test/unit-test/test-route-planning.mjs --quiet
```

已知当前错误包括：

- `src/components/PotCanvas.vue`：`!= null`、单行 if/else 缺 `{}`。
- `src/pages/index/components/WateringReminderSheet.vue`：`!= null`、单行 if/else 缺 `{}`。
- `cloudfunctions/plant-user-http/app.js`：单行 if/continue/increment 缺 `{}`。
- `cloudfunctions/diagnose-http/utils/environment-context-v7.js`：未使用变量、单行 if/else 缺 `{}`。
- `cloudfunctions/layer/utils/watering-planner.js`：未使用变量。
- `cloudfunctions/layer/utils/plant-knowledge.js`：`prefer-const`。
- `test/unit-test/test-watering-planner-v21.mjs`：未使用变量。

2. 拆分 `WateringReminderSheet.vue`，目标是该文件低于 500 行。优先把盆型编辑、可视化/表单或水量选择拆成同目录子组件/局部 composable。保持现有功能和 UI，不新增依赖，不新增 SCSS。

3. `changed_files_claimed` 必须追加实际新增/修改文件，至少包括 `src/components/PotCanvas.vue` 以及你本轮新拆出的组件/composable。

4. 若仍有本轮触达的代码文件超过 500 行，必须在 handoff manual 的 `validation_claims.over_500_touched_files` 里逐个说明是否为既有大文件、为什么本轮无法安全拆分、以及后续建议。但 `WateringReminderSheet.vue` 不能留在这个例外里。

5. 不得改 `package.json`、`package-lock.json`、`dist/**`、`.git/**`、SQL 文件、Figma 文件。

## Allowed / Forbidden Paths

Allowed paths：

- `cloudfunctions/layer/utils/**`
- `cloudfunctions/diagnose-http/**`
- `cloudfunctions/plant-user-http/**`
- `src/**`
- `test/unit-test/**`
- `docs/ACTIVE_CONTRACTS.md`
- `.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

Forbidden paths：

- `scripts/sql/**`
- `scripts/ensure-cloudbase-sql-schema.mjs`
- `scripts/lib/cloudbase-sql-runner.mjs`
- `src/data-system/config/tables.js`
- `docs/genus_care_profiles.csv`
- `docs/genus_care_profile.csv`
- `docs/genus_care_profiles.md`
- `SQL-cvs/**`
- `package.json`
- `package-lock.json`
- `dist/**`
- `.git/**`

## Project Constraints

- Framework: UniApp 3.0 + Vue 3 + JavaScript。
- Styling: Tailwind CSS 3 + weapp-tailwindcss。
- Component library: uni-ui。
- SCSS policy: forbidden。不得新增 `.scss` 或 `<style lang="scss">`。
- 不得新增依赖。
- 中文优先。
- 不得 revert、reset、checkout 或覆盖无关变更。
- 代码文件超过 500 行必须合理解耦拆分模块。

## UI Scope Contract

UI 功能保持不变：

- 浇水提醒 sheet/modal。
- 水量选择：不知道 / 喷雾 / 少量 / 普通 / 浇透。
- 盆型补填：盆口直径、盆底直径、盆高可选、排水孔、盆器材质、基质类型。
- 盆型补填保存到用户植物养护扩展。
- 提醒结果：`amountClass`、`amountRangeMl`、`stopCondition`、`confidenceLevel`、`reasonCodes`、`nextCheckDate` / `reminderDate`。

拆分时不得改变这些行为。

## Style Stack Contract

- 使用 Tailwind utilities / design token / uni-ui props/slots。
- 优先复用已有组件与 uni-ui。
- 不新增 SCSS。
- 不新增依赖。

## Figma Direct Fetch

本轮不要求重新做视觉设计变更。若你在拆分过程中改变可见布局、层级或状态表现，需要重新读取已补充的 6 个 Figma 节点 metadata + design context；如运行时受 AGENTS.md 2.18 约束可跳过 `get_screenshot`，但需记录 `screenshot_policy_skip`。

Figma links / node ids 仍属于验收合同：

- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=317-331&t=MmQvExSfzEo0COdu-4` / `317:331`
- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=338-989&t=MmQvExSfzEo0COdu-4` / `338:989`
- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=362-989&m=dev` / `362:989`
- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=359-1782&m=dev` / `359:1782`
- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=375-989&m=dev` / `375:989`
- `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=277-55&m=dev` / `277:55`

## Figma Blocker Policy

如果本轮需要重新读取 Figma 但工具不可用，写 `BLOCKED_ZCODE_FIGMA_UNAVAILABLE`。如果只是等价拆分、不改变视觉和交互，可沿用前序 Figma fetch evidence，并在 handoff manual 说明本轮未改变视觉 contract。

## uni-ui Mapping Contract

如果拆分 UI 组件，必须保持前序 uni-ui 映射证据有效。新组件中继续复用 `uni-popup`、`uni-easyinput`、既有组件和 Tailwind。若新增自定义区域，写入 `uni_ui_mapping_evidence` 的 `custom_regions` 和理由。

## Handoff Manual Contract

完成后更新：

`.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

最小结构：

```json
{
  "dispatch_run_id": "dispatch-86ey3h3dt-zcode-20260630",
  "status": "completed",
  "updated_at": "ISO-8601",
  "phase": "final",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

`validation_claims` 必须包含真实命令结果：

- focused lint 命令。
- `npm run test:ci`
- `npm run build:mp-weixin:ci`
- focused v2.1 tests。
- `over_500_touched_files` 检查结果。

## Validation Commands

至少运行并记录：

```bash
npx oxlint cloudfunctions/layer/utils/pot-geometry.js cloudfunctions/layer/utils/hydration-load.js cloudfunctions/layer/utils/watering-planner.js cloudfunctions/layer/utils/plant-knowledge.js cloudfunctions/plant-user-http/app.js cloudfunctions/diagnose-http/utils/environment-context-v7.js cloudfunctions/diagnose-http/presenters/diagnosis-round-presenter.js src/pages/index/components/WateringReminderSheet.vue src/components/PotCanvas.vue src/pages/profile/diagnosis-review.vue test/unit-test/test-watering-planner-v21.mjs test/unit-test/test-environment-care-context.mjs test/unit-test/test-care-behavior-payload.mjs test/unit-test/test-care-behavior-answer-runner.mjs test/unit-test/test-route-planning.mjs --quiet
npm run test:ci
npm run build:mp-weixin:ci
node test/unit-test/test-watering-planner-v21.mjs
node test/unit-test/test-environment-care-context.mjs
node test/unit-test/test-care-behavior-payload.mjs
node test/unit-test/test-route-planning.mjs
```

## Result JSON Contract

最终在聊天里输出：

```text
<<<ZCODE_IMPLEMENTER_RESULT:dispatch-86ey3h3dt-zcode-20260630:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "lint_evidence": {},
  "split_evidence": {},
  "style_stack_compliance": {
    "tailwind_used": true,
    "new_scss_added": false,
    "new_dependencies": []
  },
  "validation_claims": {},
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:dispatch-86ey3h3dt-zcode-20260630:END>>>
```

记住：ZCode 声明完成不等于完成。Codex main 会回收真实 diff、lint/test/build、文件行数和 handoff manual 后再收口。

<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:END>>>
