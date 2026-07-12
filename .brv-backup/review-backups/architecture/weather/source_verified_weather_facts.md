# Source-Verified Weather Facts

Status: active  
Owner: architecture  
Verified: 2026-06-06  
Review after: 60d

## Facts

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
