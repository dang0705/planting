---
title: 浇水水量单位换算逻辑（2026-07-08 职责分离版）
summary: 后端只返回 amountRangeMl（ml数组），文案全部由前端负责。油桶门槛2500ml，瓶桶混排，完整文案+换行。amountBottleText 已废弃。
tags: [watering_planner, water_volume_format, unit_conversion]
related: [architecture/watering_planner/watering_planner_v2_1_logic.md, architecture/watering_planner/watering_reminder_algorithm_v2_1.md]
keywords: [BUCKET_TEXT_MIN_ML, RANGE_MIN_SPAN_ML, formatMlRangeToBottleText, formatMlToDoseLabel, amountRangeMl]
createdAt: '2026-07-08T07:02:20.353Z'
updatedAt: '2026-07-08T18:00:00.000Z'
---

## Reason
记录浇水水量单位换算逻辑，2026-07-08 职责分离重构后口径

## Raw Concept
**Task:**
后端只返回 ml，前端负责所有文案换算

**Files:**
- 前端：src/utils/water-volume-format.js（文案换算 + 录入侧档位）
- 后端：cloudfunctions/layer/utils/water-volume-format.js（仅剂量落档算法）

**Flow:**
后端 amountRangeMl（ml数组） -> 前端 formatMlRangeToBottleText -> 格式化文案

**Timestamp:** 2026-07-08

## Narrative
### Structure
前后端职责分离：后端只算 ml 不做文案，前端负责所有展示换算。amountBottleText 字段已从后端响应中彻底废弃。

### Highlights
油桶门槛 BUCKET_TEXT_MIN_ML=2500ml。录入侧每档独立判断单位（瓶桶混排）。档位 label 使用换行格式（约N瓶\n矿泉水瓶 / 约N桶\n5L油桶）。建议侧文案带完整单位后缀。

### Rules
规则1：后端只返回 amountRangeMl，不返回 amountBottleText（已废弃）
规则2：前端 BOTTLE_ML=550ml，BUCKET_ML=5000ml，BUCKET_TEXT_MIN_ML=2500ml
规则3：≥2500ml 用桶，<2500ml 用瓶，桶数统一 Math.round
规则4：录入侧每档独立判断单位，瓶桶可混排（formatMlToDoseLabel）
规则5：档位 label 换行格式：约N瓶\n矿泉水瓶 / 约N桶\n5L油桶
规则6：建议侧文案带完整单位：约N瓶（矿泉水瓶）/ 约N桶（5L油桶）
规则7：区间跨度≤RANGE_MIN_SPAN_ML(275ml)时退回单值文案
规则8：后端 water-volume-format.js 只保留 DOSE_CLASS / classifyDoseByVolumeRatio / resolveMlToDoseClass，无 BOTTLE_ML / BUCKET_ML
规则9：算法层 DOSE_CLASS.MIST 和 MIST_TEXT_MAX_ML_FOR_CONFLICT(=50) 保留不动

### Examples
- [5000, 7500] -> "约1~2桶（5L油桶）"
- [3000, 6000] -> "约1桶（5L油桶）"
- [460, 690] -> "约1.5瓶（矿泉水瓶）"
- 录入侧档位：约0.5瓶\n矿泉水瓶 / 约1瓶\n矿泉水瓶 / 约1桶\n5L油桶

## Facts
- **architecture**: 后端只返回 amountRangeMl，文案全部前端负责，amountBottleText 已废弃 [项目]
- **unit_threshold**: BUCKET_TEXT_MIN_ML=2500ml，≥此值用桶，<此值用瓶 [约定]
- **bucket_rounding**: 桶数统一 Math.round [约定]
- **dose_mix**: 录入侧每档独立判断单位，瓶桶可混排 [项目]
- **label_format**: 档位 label 换行格式：约N瓶\n矿泉水瓶 / 约N桶\n5L油桶 [项目]
- **backend_stripped**: 后端 water-volume-format.js 移除了 BOTTLE_ML/BUCKET_ML/formatMlToBottleText/formatMlRangeToBottleText [项目]
- **algorithm_mist_retained**: 算法层 DOSE_CLASS.MIST 和 MIST_TEXT_MAX_ML_FOR_CONFLICT(=50) 保留不动 [项目]
