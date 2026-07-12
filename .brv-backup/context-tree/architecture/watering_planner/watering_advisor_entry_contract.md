---
title: 独立浇水建议入口契约
summary: catalogPlantId 与临时 potProfile 驱动的无历史浇水建议链路，归属 watering_planner 域。
tags: [watering_planner, watering_advisor, adhoc_planner]
related: [architecture/watering_planner/watering_planner_v2_1_logic.md, architecture/watering_planner/watering_reminder_algorithm_v2_1.md]
keywords: [watering-advisor, watering-planner, catalogPlantId, wateringEvents, watering_advisor_sessions, PotProfileEditor, computeAdhocPlanner]
createdAt: '2026-07-09T07:35:00.000Z'
updatedAt: '2026-07-09T07:35:00.000Z'
---

## 事实

独立浇水建议入口归属 `architecture/watering_planner`，不是诊断域。它解决的是用户没有已绑定植物或没有浇水历史时，如何复用既有浇水规划器给出一次性建议。

## 入口契约

- 已有植物继续走 `/watering-planner`，输入 `plantId + openid`，复用现有 `WateringReminderSheet`。
- 搜索植物种类时走 `/watering-advisor`，输入 `catalogPlantId + potProfile`，不强行绑定 `plantId`。
- 路由判断中 `/watering-advisor` 必须先于 `/watering-planner` 匹配，避免 `includes` 顺序导致误命中。

## 算法复用

- 独立链路表示“无浇水历史”，传入 `wateringEvents: []`。
- 算法继续复用 `watering-planner.js`、`hydration-load.js`、`pot-geometry.js`，不新增独立数学模型。
- 当前不把朝向 `orientation` 纳入 planner 数学模型；如需加入，必须先有算法系数设计和回归验证。

## 数据与天气

- 属级浇水策略通过 `getPlantCatalogById(catalogPlantId)` 获取，不依赖 `openid`。
- 天气仍由 `getEnvironmentWeatherWindow` 自动获取，并由共享的 `watering-planner-service.js` 汇总。
- 独立建议落库到 `watering_advisor_sessions`，保存输入与输出快照；不复用 `user_watering_reminder_events`，因为该表强绑定 `plantId` 并会反写 `user_plant_instances`。

## 盆型输入

- `PotProfileEditor` 在无 `plantId` 时只 `emit` 临时 `payload`，不落库。
- 有 `plantId` 时仍走原有保存路径。
- 独立浇水建议入口也必须复用 `PotProfileEditor` 的 `PotCanvas` 盆型编辑器；不得在 `watering-advisor.vue` 里另写口径、底径、高度、排水孔、基质的平行输入控件。
- `PotProfileEditor` 回传的 `substrateComposition` 应原样进入独立建议 payload，避免独立页重复计算基质比例。

## 代码入口

- `cloudfunctions/plant-user-http/watering-planner-service.js`
- `cloudfunctions/plant-user-http/watering-advisor-service.js`
- `src/pages/watering-advisor/watering-advisor.vue`
- `src/pages/index/components/PotProfileEditor.vue`
- `src/components/PotCanvas.vue`
