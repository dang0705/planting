---
consolidated_at: '2026-06-20T04:39:53.772Z'
consolidated_from: [{date: '2026-06-20T04:39:53.772Z', path: architecture/weather/weather_cache_governance.md, reason: 'The newly curated ''weather_cache_governance.md'' contains specific, updated facts about the weather fact chain and cache rules that directly extend and refine the ''source_verified_weather_facts.md''. Merging them ensures a single source of truth for weather-related facts across frontend and backend.'}]
---
# Source-Verified Weather Facts

Status: active  
Owner: architecture  
Verified: 2026-06-19  
Review after: 60d

## Governance & Cache Strategy

### Reason
Document weather cache cost reduction and ingestion logic.

### Raw Concept
**Task:** Implement weather cache cost reduction and ingestion governance

**Changes:**
- Fixed locationKey for popular cities (e.g., city:shanghai)
- Established plant -> careLocationId -> locationKey -> weather-cache fact chain
- Implemented storage-only storage for /weather/environment-context
- Added QWeather Time Machine fallback for D-1 daily archive

**Flow:** Ingestion -> Cache Storage -> Diagnosis Reader -> Evidence Validation

### Narrative
#### Structure
Weather cache ingestion via /weather/ingestion/recent-10d (batch) and diagnosis retrieval via /weather/environment-context.

#### Dependencies
QWeather v7 API, QWeather Time Machine for historical backfill, miniprogram-automator for E2E validation.

#### Highlights
Forced coverage of 20 popular cities; diagnosis reader date window guards (diagnosisDate or diagnosisDate-1); Shanghai specific validation criteria.

#### Rules
- **Rule 1**: Popular cities must use city:ID locationKey, no coord:* degradation.
- **Rule 2**: Diagnosis must use plant care location over current location if available.
- **Rule 3**: /weather/environment-context must be storage-only (no sync API calls).
- **Rule 4**: Payloads must match date window guards to be valid evidence.

## Facts

### Cache & Ingestion Governance (Verified 2026-06-19)

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

### Technical Implementation Facts (Verified 2026-06-06)

- id: F-WEATHER-FRONTEND-CITY-DEDUPE-001
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: src/api/weather.js
      lines: 10-25
      symbol: CITY_LOOKUP_CACHE_TTL_MS / buildCityLookupKey
    - file: src/api/weather.js
      lines: 238-287
      symbol: getCityNameByLocation
  statement: Frontend city lookup rounds coordinates to 5 decimals, caches lookup results for 5 minutes, and deduplicates in-flight geocoder requests through `cityLookupInflight`.

- id: F-WEATHER-FRONTEND-PERMISSION-002
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: src/api/weather.js
      lines: 58-75
      symbol: checkLocationPermission
    - file: src/api/weather.js
      lines: 78-165
      symbol: requestLocationPermission
    - file: src/api/weather.js
      lines: 185-235
      symbol: getCurrentLocation
  statement: Frontend weather location flow checks `scope.userLocation`, requests or opens settings when needed, and uses `uni.getLocation({ type: 'gcj02' })` before resolving city information.

- id: F-WEATHER-FRONTEND-QUERY-003
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: src/vue-query/weather/queries/current-weather.js
      lines: 4-42
      symbol: buildCurrentWeatherQueryOptions / fetchCurrentWeatherQuery
    - file: src/vue-query/weather/queries/environment-weather.js
      lines: 4-44
      symbol: buildEnvironmentWeatherQueryOptions / fetchEnvironmentWeatherQuery
  statement: Frontend weather data is requested through Vue Query query option builders for current weather and environment weather context; query keys include coordinates and city/province inputs.

- id: F-WEATHER-FRONTEND-HTTP-ENDPOINTS-004
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: src/vue-query/weather/queries/current-weather.js
      lines: 25-30
      symbol: current weather HTTP function request
    - file: src/vue-query/weather/queries/environment-weather.js
      lines: 26-38
      symbol: environment weather HTTP function request
  statement: Frontend current weather calls `weather-http/weather/current` with auth, and environment weather calls `weather-http/weather/environment-context` with auth and a 30-minute stale time.

- id: F-WEATHER-FRONTEND-CACHE-CONFIG-005
  type: fact
  status: verified
  confidence: high
  source_kind: config
  source:
    - file: src/config/weather.js
      lines: 4-18
      symbol: WEATHER_CONFIG
    - file: src/api/weather.js
      lines: 289-315
      symbol: getWeatherInfo
  statement: `WEATHER_CONFIG.USE_CACHE` is currently `true`, and `getWeatherInfo()` uses it as the default `useCache` value when calling the current weather query.

- id: F-WEATHER-ENV-WINDOW-FRONTEND-006
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: src/api/weather.js
      lines: 338-366
      symbol: getEnvironmentWeatherWindow
    - file: src/utils/care-behavior-weather-window.js
      lines: 37-84
      symbol: buildWeatherByDateFromEnvironmentWeatherWindow
    - file: src/utils/care-behavior-weather-window.js
      lines: 90-109
      symbol: mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline
  statement: Frontend environment weather requests normalize lat/lng before querying; question-flow and diagnose popup pass `mode: 'diagnosis'` for care-behavior timeline requests, and timeline merging still reads date-mapped entries from `environmentWeatherWindow`.

- id: F-WEATHER-ENV-WINDOW-BACKEND-007
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/weather-http/app.js
      lines: 156-196
      symbol: buildEnvironmentWeatherWindowByMode
    - file: cloudfunctions/weather-http/app.js
      lines: 371-399
      symbol: environment-context branch in main
  statement: `weather-http/weather/environment-context` now accepts `mode` and only returns historical window data for `mode = 'diagnosis'` (retains `historicalDays/historical_days`, keeps `meta.recordCounts` consistent, and excludes forecast/current payload fields in that mode).

- id: F-WEATHER-DIAG-USER-CACHE-007
  type: fact
  status: verified
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/diagnose-http/repositories/weather-repository.js
      lines: 16-57
      symbol: getFreshCachedWeatherContext
    - file: cloudfunctions/diagnose-http/domain/diagnosis-engine.js
      lines: 24-25
      symbol: getFreshCachedWeatherContext import
  statement: `diagnose-http` provides `getFreshCachedWeatherContext(openid)` to read non-expired user/null-scope rows from `weather_cache` by `_openid`, parse `weather_data`, and return temperature/humidity/weather/update/expires fields.

## Observations

- id: O-WEATHER-BACKEND-SOURCE-SCOPE-001
  type: observation
  status: observation
  confidence: high
  source_kind: code
  source:
    - file: cloudfunctions/weather-http/app.js
      lines: 371-401
      symbol: environment-context route entry
  statement: `cloudfunctions/weather-http` is present in the checked-in source and currently exposes the `/weather/environment-context` path with mode-aware trimming logic.