---
title: 浇水提醒V2.1数据库契约
summary: user_plant_instances 增补盆型画像字段，genus_care_profiles 增加 way 量化字段
tags: []
related: [architecture/watering_planner/watering_planner_v2_1_logic.md, architecture/system_logic/plant_knowledge_integration.md]
keywords: []
createdAt: '2026-07-01T12:50:26.650Z'
updatedAt: '2026-07-01T12:50:26.650Z'
---
## Reason
记录浇水提醒V2.1数据库变更。

## Raw Concept
**Task:**
更新浇水提醒V2.1的数据库结构

**Changes:**
- user_plant_instances 主表新增：
  - pot_top_diameter_cm
  - pot_bottom_diameter_cm
  - pot_height_cm
  - has_drainage_hole
  - pot_material
  - substrate_type
  - pot_profile_version
  - pot_profile_source
  - pot_profile_confidence
- genus_care_profiles 新增：
  - watering_way_quantization_json（JSON，可从 watering_strategy_json 回填）
  - watering_strategy_version
  - watering_strategy_review_status
- 丢弃历史扩展表 user_plant_care_extensions（DROP TABLE IF EXISTS）

**Files:**
- scripts/sql/watering-reminder-v21-schema-20260630.sql

**Timestamp:** 2026-06-30

## Narrative
### Structure
以属级策略表和用户植物主表为中心：盆型数据不再拆扩展表，量化字段落在属级养护表。

### Highlights
盆型画像已折叠到 user_plant_instances，减少表依赖；watering_way_quantization_json 提供 way/freq 到算法字段的量化映射。

## Facts
- **database_schema**: user_plant_instances 直接承载盆型画像字段 [project]
- **database_schema**: user_plant_care_extensions 不再使用，历史表被废弃 [project]
- **database_schema**: genus_care_profiles 新增 watering_way_quantization_json 并支持 way/freq 量化回填 [project]
