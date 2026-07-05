<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:START>>>

这是同一 dispatch run 的追加合同，不是新任务。本 addendum 会通过剪贴板一次性粘贴到当前 ZCode 会话。请在当前已有 diff 基础上继续执行，并更新 handoff manual：

`.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

如果正在执行，保持 `status=working`，把 `phase` 更新为 `figma_alignment`。完成后仍按原合同写 `status=completed`；阻塞时写 `status=blocked`。

## Architecture Direction

用户补充了原 ClickUp 任务遗漏的 Figma 链接，这 6 个 Figma 节点必须计入本次 dispatch-task 验收标准。Codex main 只做 link/node Lite，不读取设计细节；你必须在 ZCode 环境内直接读取 Figma metadata + design context，再决定 UI 实现。

同时，之前 sentinel check 发现的 `wateringCount10d` 跨 `cloudfunctions/diagnose-http/**` 边界已经授权：本 addendum 将 `cloudfunctions/diagnose-http/**` 和 `cloudfunctions/layer/utils/**` 纳入 allowed paths，用于完整迁移 v2.1 逻辑。SQL/schema 仍由内部 SQL lane 负责，你不得改 SQL/schema 文件。

## Implementation Contract

追加验收对象：

1. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=317-331&t=MmQvExSfzEo0COdu-4`
   - node_id: `317:331`
2. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=338-989&t=MmQvExSfzEo0COdu-4`
   - node_id: `338:989`
3. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=362-989&m=dev`
   - node_id: `362:989`
4. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=359-1782&m=dev`
   - node_id: `359:1782`
5. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=375-989&m=dev`
   - node_id: `375:989`
6. `https://www.figma.com/design/r5afPtZu8fRMRenk8TJVjO/planting?node-id=277-55&m=dev`
   - node_id: `277:55`

你需要将这些节点作为浇水提醒 v2.1 UI/交互验收来源，尤其覆盖浇水提醒、盆型补填、水量选择、提醒结果展示、保存到用户植物档案等状态。

不得依赖 main 的视觉猜测。若任何 Figma 节点无权限、无效、工具不可用或信息不足，输出 `BLOCKED_ZCODE_FIGMA_UNAVAILABLE`，并写入 handoff manual 的 blockers。

## Allowed / Forbidden Paths

Allowed paths 追加/确认：

- `cloudfunctions/layer/utils/**`
- `cloudfunctions/diagnose-http/**`
- `cloudfunctions/plant-user-http/**`
- `src/**`
- `test/unit-test/**`
- `test/e2e/terminal-e2e/**`
- `tailwind.config.js`
- `docs/ACTIVE_CONTRACTS.md`
- `docs/CURRENT.md`

Forbidden paths 保持：

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
- SCSS policy: forbidden。不要新增 `.scss` 或 `<style lang="scss">`。
- 不得新增依赖，不得修改 `package.json` 或 lockfile。
- 中文优先。
- 工作树已有并行 SQL lane 和既有改动，不得 revert、reset、checkout 或覆盖无关变更。

## UI Scope Contract

以 Figma 节点为 UI 验收来源，补齐或调整：

- 浇水提醒入口和 sheet/modal 状态。
- 水量选择：不知道 / 喷雾 / 少量 / 普通 / 浇透。
- 盆型补填：盆口直径、盆底直径、盆高可选、排水孔、盆器材质、基质类型。
- 盆型补填保存目标为用户植物养护扩展。
- 提醒结果：`amountClass`、`amountRangeMl`、`stopCondition`、`confidenceLevel`、`reasonCodes`、`nextCheckDate` / `reminderDate`。
- Figma 节点里出现的空态、填写态、确认态、风险/提示态均纳入验收；不要只做单一理想状态。

## Style Stack Contract

- 使用 Tailwind utilities / design token / uni-ui props/slots。
- 优先复用现有组件与 uni-ui。
- 不新增 SCSS。
- 如 Figma 有特殊视觉但 Tailwind/uni-ui 无法完整表达，记录在 `uni_ui_mapping_evidence.risks`，不要手搓大段样式绕过项目规则。

## Figma Direct Fetch

你必须直接读取每个 Figma node 的 metadata + design context。

由于当前 ZCode 运行模型是 GLM，且仓库 AGENTS.md 有 “GLM 调用 Figma 读取类工具后禁止/跳过 get_screenshot，除非用户明确要求截图” 的约束：如果该策略在你的运行时适用，可以不调用 `get_screenshot`，但必须在 `figma_fetch_evidence` 中写：

```json
{
  "screenshot_policy_skip": true,
  "policy_ref": "AGENTS.md 2.18",
  "metadata_fetched": true,
  "design_context_fetched": true
}
```

如果你的工具/策略允许截图，也可以读取 screenshot。无论哪种，必须提交每个节点的 `figma_fetch_evidence`。

## Figma Blocker Policy

出现以下任一情况，不得猜 UI：

- 无法访问 Figma 文件或节点。
- 设计上下文读取失败。
- 节点不是本任务 UI 范围。
- Figma 与 ClickUp/任务合同出现无法自行裁决的冲突。

阻塞时写入 handoff manual；注意现有 recovery validator 要求 blocked 状态下 `phase` 必须是 `blocked`，不要写 `figma_blocked`：

```json
{
  "status": "blocked",
  "phase": "blocked",
  "blockers": ["BLOCKED_ZCODE_FIGMA_UNAVAILABLE: ..."]
}
```

## uni-ui Mapping Contract

首次继续 UI 编辑前，提交 `uni_ui_mapping_evidence`：

```json
{
  "nodes": [
    {
      "node_id": "317:331",
      "figma_region": "",
      "preferred_uni_ui_or_existing_component": "",
      "tailwind_mapping": "",
      "customization_needed": "",
      "risks": []
    }
  ]
}
```

必须覆盖 6 个 node_id。若某节点不属于本次 UI，需要说明原因和影响。

## Handoff Manual Contract

继续使用：

`.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

更新要求：

- 收到本 addendum 后，写 `phase=figma_alignment`。
- `changed_files_claimed` 追加你本轮实际改动文件。
- `validation_claims` 追加 Figma fetch、UI mapping、lint/test/build 结果。
- 完成时 `status=completed`；阻塞时 `status=blocked`。

## Validation Commands

继续尝试并记录真实结果：

```bash
npm run lint
npm run test:ci
npm run build:mp-weixin:ci
npm run ensure:cloudbase-sql-schema:verify
```

Figma/UI 变更完成后，尽量补充针对浇水提醒 UI/数据契约的 focused test；不要删除或削弱现有测试。

## Result JSON Contract

最终输出更新后的结构：

```text
<<<ZCODE_IMPLEMENTER_RESULT:dispatch-86ey3h3dt-zcode-20260630:START>>>
{
  "status": "completed | blocked",
  "changed_files_claimed": [],
  "summary": "",
  "ui_scope_map": [],
  "style_stack_compliance": {
    "tailwind_used": true,
    "new_scss_added": false,
    "uni_ui_or_existing_components_reused": true
  },
  "component_reuse_evidence": {},
  "figma_fetch_evidence": {
    "nodes": []
  },
  "uni_ui_mapping_evidence": {
    "nodes": []
  },
  "watering_algorithm_evidence": {},
  "schema_integration_evidence": {
    "sql_schema_modified_by_zcode": false,
    "expected_table": "user_plant_care_extensions"
  },
  "validation_claims": {},
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:dispatch-86ey3h3dt-zcode-20260630:END>>>
```

记住：这是同一 ZCode bridge run 的 Figma/验收补充，不是 sentinel check，也不是新任务。

<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:END>>>
