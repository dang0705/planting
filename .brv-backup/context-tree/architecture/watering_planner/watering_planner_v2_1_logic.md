---
title: 浇水规划器V2.1逻辑
summary: 基于10天行为窗、盆型几何和way/freq的浇水策略重算，涵盖物理建模与水分荷载计算。
tags: [algorithm, watering_planner]
related: [architecture/backend/watering_reminder_v2_1_schema.md, architecture/system_logic/plant_knowledge_integration.md, architecture/watering_planner/watering_reminder_algorithm_v2_1.md, architecture/watering_planner/watering_volume_conversion_logic.md]
keywords: [effectiveHydrationLoad, rootZoneMoistureIndex, potGeometryDryDownFactor]
createdAt: '2026-07-01T12:50:26.652Z'
updatedAt: '2026-07-01T13:06:15.000Z'
consolidated_at: '2026-07-01T13:06:28.007Z'
consolidated_from: [{date: '2026-07-01T13:06:28.007Z', path: architecture/watering_planner/context.md, reason: The context.md is a thin placeholder for the watering_planner topic. watering_planner_v2_1_logic.md contains the full implementation details and facts for the current version. Merging ensures a single source of truth for the planner logic.}]
---
## Topic: watering_planner

## Overview
Advanced watering recommendation engine based on physical pot characteristics and historical hydration loads. Replaces simple watering counts with complex metrics like effectiveHydrationLoad and rootZoneMoistureIndex.

## Reason
记录浇水规划器v2.1核心升级，引入物理建模算法。

## Raw Concept
**Task:**
实现浇水规划器v2.1

**Files:**
- cloudfunctions/layer/utils/watering-planner.js
- cloudfunctions/layer/utils/hydration-load.js
- cloudfunctions/layer/utils/pot-geometry.js

**Flow:**
盆型几何计算 -> 行为时间线归一 -> 干湿门控判定 -> 下次浇水建议生成

**Timestamp:** 2026-07-01

## Narrative
### Structure
分层结构：
- watering-planner.js 负责入口编排（行为线归一、基线间隔、输出字段）
- hydration-load.js 负责干湿荷载与门控计算
- pot-geometry.js 负责盆型几何因子（干透与排水风险），使用圆台体积公式（frustum volume formula）计算。

### Highlights
算法输出改为量化指标与建议策略，强调“mist 不代表根区浇透，unknown 不归零”，并将盆型几何纳入过浇/欠浇判定。考虑材质特性，如红陶（terracotta）具有 1.35 的高蒸发因子。

### Rules
规则1：way/freq 取属级策略作为基线间隔和回看窗的核心输入  
规则2：unknown 浇水历史保留权重，不等于 0 次  
规则3：mist 不计入有效根区浇水，不能抵消干燥风险  
规则4：无排水孔或窄底盆提高 drainageRiskFactor，提升过浇风险权重

## Facts
- **algorithm**: 浇水规划器v2.1不再以 wateringCount10d 为核心判定，改用 effectiveHydrationLoad / wetPressureLoad / rootZoneMoistureIndex [项目]
- **algorithm**: 根区湿度与门控结合 way/freq 形成动态回看窗与 nextWater 建议 [项目]
- **algorithm_constant**: unknown 浇水事件、mist 和 thorough 在权重表中有独立贡献策略，mist 不能作为根区有效浇水 [项目]
- **algorithm_constant**: 无排水孔或窄底盆会提高过浇风险评分 [项目]
- **key_concept**: effectiveHydrationLoad (有效水分荷载)
- **key_concept**: rootZoneMoistureIndex (根区水分指数)
- **key_concept**: potGeometryDryDownFactor (盆型几何干透因子)