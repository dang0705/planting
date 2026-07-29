---
title: Weather Diagnosis Logic
summary: Weather diagnosis logic improvements including coord-based location keys, recent weather cache rebuilds from archives, and robust ingestion.
tags: []
related: [architecture/backend/source_verified_backend_facts/source_verified_backend_facts.md]
keywords: []
createdAt: '2026-06-15T01:22:28.795Z'
updatedAt: '2026-06-15T01:22:28.795Z'
---
## Reason
Documenting weather-http diagnosis mode fixes and recent weather cache logic

## Raw Concept
**Task:**
Document Weather-HTTP Diagnosis Logic

**Changes:**
- Added coord-based location key support (coord:lng_lat)
- Implemented recent cache rebuild logic from daily archives
- Added payload compatibility for multiple historical fields

**Files:**
- cloudfunctions/weather-http/services/recent-weather-service.js
- cloudfunctions/weather-http/services/weather-cache-paths.js

**Timestamp:** 2026-06-15

## Narrative
### Structure
Diagnosis logic centers on recent-weather-service.js, handling cache loading, archive rebuilds, and ingestion.

### Highlights
Supports coordinate-based keys to handle missing city names. Robust cache rebuild logic ensures recent data availability even if weather_locations metadata is missing.

### Rules
Rule: locationKey priority: explicitKey > qweatherId > coord(lng,lat) > cityName.

## Facts
- **location_key**: locationKey supports coordinate-based keys (coord:lng_lat) [project]
- **cache_rebuild**: Recent weather cache rebuilds from daily archives if metadata is missing [project]
