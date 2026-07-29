---
title: 浇水规划器V2.1逻辑
summary: 基于10天行为窗、盆型几何和way/freq的浇水策略重算
tags: []
related: []
keywords: []
createdAt: '2026-07-01T12:50:26.652Z'
updatedAt: '2026-07-01T12:50:26.652Z'
---
## Reason
记录浇水规划器v2.1核心升级

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
- pot-geometry.js 负责盆型几何因子（干透与排水风险）

### Highlights
算法输出改为量化指标与建议策略，强调“mist 不代表根区浇透，unknown 不归零”，并将盆型几何纳入过浇/欠浇判定。

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
