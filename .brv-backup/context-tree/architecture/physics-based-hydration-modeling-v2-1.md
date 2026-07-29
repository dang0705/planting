---
confidence: 0.9
sources: [architecture/_index.md, system_logic/_index.md]
synthesized_at: '2026-07-08T07:17:47.569Z'
type: synthesis
title: Physics-Based Hydration Modeling (V2.1)
summary: The watering system has transitioned from frequency-based counts to quantitative physical modeling using pot geometry and material factors.
tags: [watering-planner, physics-modeling, database-schema]
related: []
keywords: [hydration, pot-geometry, dry-down, v2.1, schema, watering-logic]
createdAt: '2026-07-08T07:17:47.569Z'
updatedAt: '2026-07-08T07:17:47.569Z'
---

# Physics-Based Hydration Modeling (V2.1)

Watering logic now utilizes effectiveHydrationLoad and potGeometryDryDownFactor, integrating physical pot attributes from the database into centralized utility functions.

## Evidence

- **architecture**: V2.1 schema consolidated physical pot attributes (diameter, drainage) into user_plant_instances; planner uses physics-based hydration modeling.
- **system_logic**: user_plant_instances pot profiles are aligned across DB, utility, and UI; nextWaterDate returns null if WET (overwatering) is detected.
