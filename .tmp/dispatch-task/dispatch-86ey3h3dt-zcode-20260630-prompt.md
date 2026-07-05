<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:START>>>

你是 ZCode 外部实现者，运行模型为 GLM/ZCode。这个 prompt 会通过剪贴板一次性粘贴到当前 ZCode 会话，不是人工逐字输入。你只负责应用代码实现；SQL/schema 由内部 Codex `implementer_deep` 并行处理。

## Architecture Direction

目标：落地 ClickUp 86ey3h3dt《浇水提醒算法 v2.1 完整设计与落地》的非 SQL/schema 部分。

必须遵守这些不变量：

- SQL/schema lane 正由内部 Codex subagent 并行处理。你不得修改 `scripts/sql/**`、`scripts/ensure-cloudbase-sql-schema.mjs`、`scripts/lib/cloudbase-sql-runner.mjs`、`src/data-system/config/tables.js`、`SQL-cvs/**`。
- 应用代码按 `user_plant_care_extensions` 表接入用户植物养护扩展。DB 字段按 snake_case：`user_plant_id`、`pot_top_diameter_cm`、`pot_bottom_diameter_cm`、`pot_height_cm`、`has_drainage_hole`、`pot_material`、`substrate_type`、`profile_version`、`source`、`confidence`。
- 盆型信息属于用户植物档案的养护扩展，不属于单次浇水事件。
- 单次 WateringEvent 只记录本次行为：`wateredAt`、`doseClass`、`amountMl`、`runoffObserved`、`saucerWaterCleared`、`potProfileVersion`、`derivedImpactSnapshot`。
- `hasDrainageHole` 是植物档案字段；`runoffObserved` 和 `saucerWaterCleared` 是本次浇水行为字段，不得混在一起。
- `genus_care_profiles.watering_strategy_json` 是属级养护事实源。解析 `freq` 与 `way`，不要重写 CSV 数据。
- 算法输出是“提醒策略”，不是实时盆土 `WET / DRY` 状态。
- 不得保留旧 `wateringCount10d` 为核心判断或 fallback 来绕过 v2.1。

## Implementation Contract

实现范围：

1. 扩展共享浇水规划器，使其从“10 天浇水次数”升级为：
   - `effectiveHydrationLoad`
   - `wetPressureLoad`
   - `lastEffectiveRootWateredDaysAgo`
   - `rootZoneMoistureIndex`
   - Dry/Wet Gate
   - reminder strategy
2. 实现盆型几何：
   - `potVolumeMl`
   - `topSurfaceAreaCm2`
   - `bottomSurfaceAreaCm2`
   - `effectiveDepthCm`
   - `surfaceToVolumeRatio`
   - `taperRatio`
   - `surfaceEvaporationFactor`
   - `depthRetentionFactor`
   - `potGeometryDryDownFactor`
   - `drainageRiskFactor`
   - `volumeConfidence`
3. `potHeightCm` 缺失时按 `averageDiameterCm * 0.85` 估算，并降低体积与 ml 区间置信度。
4. `watering_strategy_json.way/freq` 必须影响动态回看窗口、Dry/Wet Gate、下次水量建议和提醒时间。
5. `unknown` 浇水历史不能当成 0 次；喷雾不能抵消干燥风险。
6. 浇透 + 近日期 + 强偏湿，应触发过浇风险或查土策略。
7. 无排水孔 + 窄底盆，应提高 `wetPressureLoad` 与 `OVERWATERING_RISK_WARNING` 权重。
8. 前端浇水提醒页或相关入口必须能补填盆型信息并保存到用户植物档案；不要保存到单次 watering event。
9. 处理 ClickUp 提到的逐行核验结论：`Crassulaceae` 是科名不是属名，不应当作属级有效记录；`Platycerium`、`Lithops`、`Tillandsia`、`Caladium`、`Euphorbia`、`Lonicera`、`Nerium` 有 REVIEW_FLAG 时需要明确处理结论或可追踪 reason code。

现有入口提示：

- 共享规划器：`cloudfunctions/layer/utils/watering-planner.js`
- 用户植物 HTTP：`cloudfunctions/plant-user-http/app.js`
- 用户植物/属级知识工具：`cloudfunctions/layer/utils/plant-knowledge.js`
- 前端用户植物请求：`src/vue-query/plants/**`
- 现有浇水提醒契约见 `docs/ACTIVE_CONTRACTS.md` 和 `docs/CURRENT.md`，只在必要时同步小段当前事实。

## Allowed / Forbidden Paths

Allowed paths:

- `cloudfunctions/layer/utils/watering-planner.js`
- `cloudfunctions/layer/utils/plant-knowledge.js`
- `cloudfunctions/plant-user-http/**`
- `src/**`
- `test/unit-test/**`
- `test/e2e/terminal-e2e/**`
- `docs/ACTIVE_CONTRACTS.md`
- `docs/CURRENT.md`

Forbidden paths:

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

如果必须修改 forbidden paths 才能完成，写 handoff manual `status=blocked`，不要自行修改。

## Project Constraints

- Framework: UniApp 3.0 + Vue 3 + JavaScript。
- Styling: Tailwind CSS 3 + weapp-tailwindcss。
- Component library: uni-ui。
- SCSS policy: 禁止新增 `.scss` 或 `<style lang="scss">`；常规 UI 使用 Tailwind utilities / design token / uni-ui props/slots。
- Dependency policy: 不得新增依赖，不得修改 `package.json` 或 lockfile。
- 中文优先：产品术语、注释和测试说明优先中文。
- 当前工作树已有其他改动，不能 revert、reset、checkout 或覆盖无关变更。

## UI Scope Contract

只实现任务要求的浇水提醒/盆型补填相关交互，不重做全局页面。

UI 必须具备：

- 水量选择：不知道 / 喷雾 / 少量 / 普通 / 浇透。
- 盆型补填：盆口直径、盆底直径、盆高可选、排水孔、盆器材质、基质类型。
- 盆型补填保存目标是用户植物档案养护扩展。
- 提醒结果呈现 `amountClass`、`amountRangeMl`、`stopCondition`、`confidenceLevel`、`reasonCodes`、`nextCheckDate` / `reminderDate`。

不要在 UI 文案里解释内部算法实现或调试细节。

## Style Stack Contract

- 使用 Tailwind class 组织新增 UI 样式。
- 优先使用 uni-ui 现有控件、表单、弹层或选择器能力。
- 不新增 SCSS。
- 不用大面积自定义 scoped style 重建常规组件。
- 若必须添加少量 style，先确认无法用 Tailwind/uni-ui 表达，并在结果 JSON 里说明原因；默认不允许。

## Handoff Manual Contract

你必须写入本地状态手册：

`.tmp/dispatch-task/dispatch-86ey3h3dt-zcode-20260630-handoff-manual.json`

开始执行时立即写入：

```json
{
  "dispatch_run_id": "dispatch-86ey3h3dt-zcode-20260630",
  "status": "working",
  "updated_at": "ISO-8601 timestamp",
  "phase": "audit",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

完成时写 `status=completed`，阻塞时写 `status=blocked`。手册最小结构：

```json
{
  "dispatch_run_id": "dispatch-86ey3h3dt-zcode-20260630",
  "status": "working | completed | blocked",
  "updated_at": "ISO-8601 timestamp",
  "phase": "audit | editing | validation | final | blocked",
  "changed_files_claimed": [],
  "validation_claims": {},
  "blockers": []
}
```

## Validation Commands

请至少尝试并在 handoff manual / Result JSON 记录真实结果：

```bash
npm run lint
npm run test:ci
npm run build:mp-weixin:ci
```

如果 SQL/schema lane 尚未完成，`npm run ensure:cloudbase-sql-schema:verify` 可以标记为 blocked_by_parallel_sql_lane，不要自行修改 SQL 解决。

## Result JSON Contract

完成或阻塞后，在聊天里输出：

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
  "watering_algorithm_evidence": {},
  "schema_integration_evidence": {
    "sql_schema_modified_by_zcode": false,
    "expected_table": "user_plant_care_extensions",
    "expected_fields": [
      "user_plant_id",
      "pot_top_diameter_cm",
      "pot_bottom_diameter_cm",
      "pot_height_cm",
      "has_drainage_hole",
      "pot_material",
      "substrate_type",
      "profile_version",
      "source",
      "confidence"
    ]
  },
  "validation_claims": {},
  "blockers": []
}
<<<ZCODE_IMPLEMENTER_RESULT:dispatch-86ey3h3dt-zcode-20260630:END>>>
```

记住：ZCode 聊天里声明完成不等于任务完成。Codex main 会读取真实 git diff、handoff manual、运行 validator 和测试后再收口。

<<<ZCODE_IMPLEMENTER_HANDOFF:dispatch-86ey3h3dt-zcode-20260630:END>>>
