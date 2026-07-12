---
title: Weather Cache Governance
summary: Rules for locationKey usage (city:shanghai), fixed fact chain, and storage-only diagnosis requests.
tags: []
related: [architecture/weather/diagnosis_logic/weather_diagnosis_logic.md, architecture/weather/source_verified_weather_facts.md]
keywords: []
createdAt: '2026-06-19T09:26:18.133Z'
updatedAt: '2026-06-19T09:26:18.133Z'
---
## Reason
Document weather cache cost reduction and ingestion logic

## Raw Concept
**Task:**
Implement weather cache cost reduction and ingestion governance

**Changes:**
- Fixed locationKey for popular cities (e.g., city:shanghai)
- Established plant -> careLocationId -> locationKey -> weather-cache fact chain
- Implemented storage-only storage for /weather/environment-context
- Added QWeather Time Machine fallback for D-1 daily archive

**Flow:**
Ingestion -> Cache Storage -> Diagnosis Reader -> Evidence Validation

**Timestamp:** 2026-06-19

## Narrative
### Structure
Weather cache ingestion via /weather/ingestion/recent-10d (batch) and diagnosis retrieval via /weather/environment-context.

### Dependencies
QWeather v7 API, QWeather Time Machine for historical backfill, miniprogram-automator for E2E validation.

### Highlights
Forced coverage of 20 popular cities; diagnosis reader date window guards (diagnosisDate or diagnosisDate-1); Shanghai specific validation criteria.

### Rules
Rule 1: Popular cities must use city:ID locationKey, no coord:* degradation.
Rule 2: Diagnosis must use plant care location over current location if available.
Rule 3: /weather/environment-context must be storage-only (no sync API calls).
Rule 4: Payloads must match date window guards to be valid evidence.

## Facts
- **Shanghai weather cache**: Popular city Shanghai weather cache must use locationKey=city:shanghai and cannot degrade from specific city names or coordinates to coord:*.
- **Diagnosis weather fact chain**: The diagnosis weather fact chain is fixed as plant -> careLocationId -> locationKey -> weather-cache.
- **Diagnosis weather fact source**: User's current location must not be used as the diagnosis weather fact source if a plant care location already exists.
- **/weather/ingestion/recent-10d**: /weather/ingestion/recent-10d {batch:true} forcibly covers 20 popular cities and merges DB active rows.
- **Weather data ingestion**: If /v7/weather/10d does not contain the D-1 historical target day, the maintenance/ingestion path uses QWeather Time Machine /v7/historical/weather to supplement the D-1 daily archive.
- **/weather/environment-context**: /weather/environment-context diagnosis requests must be storage-only and are prohibited from synchronous QWeather/GeoAPI calls.
- **Diagnosis reader**: Diagnosis reader must retain date window guards where partial recent payloads are valid only if they match diagnosisDate or window.targetDate=diagnosisDate-1.
- **Diagnosis reader**: Expired payloads cannot pass as valid evidence even if weatherEvidenceInsufficient is false.
- **Acceptance criteria**: Acceptance criteria for strong evidence requires running npm run dev:mp-weixin:local-functions:lan with 9420/miniprogram-automator/wx.request.
- **Shanghai plant diagnosis**: Shanghai plant diagnosis must return weatherEvidenceInsufficient=false, locationKey=city:shanghai, weatherObjectPath=weather-cache/v1/locations/city:shanghai/recent-10d.json, historicalDaysLength=10, and nonMissingHistoricalDays=1.
- **Cache maintenance**: Old coord:* Shanghai cache keys are considered historical dirty keys and their cleaning is an independent maintenance action.
