---
title: Watering Reminder Algorithm v2.1
summary: Watering reminder algorithm v2.1 uses hydration/wet pressure weights, gate states (WET/DRY/BASELINE), and various correction coefficients.
tags: []
related: [architecture/watering_planner/watering_planner_v2_1_logic.md, architecture/watering_planner/watering_volume_conversion_logic.md]
keywords: []
createdAt: '2026-07-08T07:02:20.359Z'
updatedAt: '2026-07-08T07:02:20.359Z'
---
## Reason
Documenting core factors and coefficients for the watering reminder algorithm

## Raw Concept
**Task:**
Watering reminder algorithm core factors and logic

**Files:**
- cloudfunctions/layer/utils/hydration-load.js

**Flow:**
Moisture index + load -> gate state evaluation -> coefficient adjustment -> suggestion

**Timestamp:** 2026-07-08

## Narrative
### Structure
Algorithm resides in cloudfunctions layer, evaluating dry/wet gates based on moisture and load.

### Highlights
Gate states: WET (over-watering risk), DRY (drought), BASELINE (normal).

### Rules
WET gate: rootZoneMoistureIndex > 0.6 and wetPressureLoad > 0.4
DRY gate: index < 0.3 and days since last watering >= baseline

### Examples
Weather correction: 0.8 for 1 wet item, 0.5 for >=2 items. Genus correction: Dry-loving 0.6, High-moisture 1.25.

## Facts
- **watering_gate**: WET gate is triggered if moisture index > 0.6 and wet pressure > 0.4 [other]
- **watering_gate**: DRY gate is triggered if moisture index < 0.3 [other]
- **pot_volume_threshold**: Oversized pot threshold is 50000ml [project]
