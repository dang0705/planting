---
title: 植物数据映射与同步
summary: user_plant_instances 读取与更新链路已对齐盆型画像与planner所需字段
tags: []
related: [architecture/backend/watering_reminder_v2_1_schema.md, architecture/watering_planner/watering_planner_v2_1_logic.md]
keywords: []
createdAt: '2026-07-01T12:50:26.654Z'
updatedAt: '2026-07-01T12:50:26.654Z'
---
## Reason
记录植入端到端的盆型画像与浇水字段映射

## Raw Concept
**Task:**
对齐前后端盆型画像和浇水规划数据结构

**Changes:**
- 从 user_plant_instances 映射 potProfile 到前端模型
- planner 输入补齐 potProfile，并通过 patch 接口保存盆型信息

**Files:**
- cloudfunctions/layer/utils/plant-knowledge.js
- src/pages/index/components/WateringReminderSheet.vue
- src/pages/index/components/PotProfileEditor.vue
- src/store/plants.js

**Timestamp:** 2026-07-01

## Narrative
### Structure
数据读取链路：数据库行 -> plant-knowledge map -> 前端 store -> WateringReminderSheet 输入 -> 规划器计算

### Highlights
主表缺字段也不会阻断核心流程，盆型保存与更新采用分段更新策略，兼容历史数据缺列场景。

## Facts
- **system_integration**: mapUserPlantInstanceRow 与 mapCareExtensionRow 把主表的盆型字段映射为前端 potProfile [项目]
- **system_integration**: WateringReminderSheet/PotProfileEditor 提供盆型补填，planner 入参带入 potProfile [项目]
- **system_integration**: store 层通过 savePotProfile/patchUserPlant 把 potProfile 字段透传给后端 [项目]
- **system_integration**: 后端 getUserPlantWateringStrategy 从主表读取 potProfile，减少多表 join [项目]
