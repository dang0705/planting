import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const originalQWeatherApiKey = process.env.QWEATHER_API_KEY
process.env.QWEATHER_API_KEY = 'unit-weather-key'
const sqlCalls = []
let legacyWeatherWindowCallCount = 0
let timerForecastCallCount = 0
let currentForecastCallCount = 0
let weather24hCallCount = 0
const storageObjects = new Map()
const storageObjectsByFileId = new Map()
const currentArchiveDate = new Date().toISOString().slice(0, 10)
const routeHourly24h = [
  ['06:30', 20, 0.1, 30, 60, 24, 8, '晴'],
  ['08:30', 80, 0.3, 70, 70, 26, 12, '多云'],
  ['09:30', 40, 0, 20, 62, 27, 10, '多云'],
  ['12:30', 10, 0, 10, 50, 31, 16, '晴'],
  ['15:30', 30, 0.5, 65, 58, 30, 18, '阵雨']
].map(([time, cloud, precip, pop, humidity, temp, windSpeed, text]) => ({
  fxTime: `2026-06-18T${time}:00+08:00`,
  cloud,
  precip,
  pop,
  humidity,
  temp,
  windSpeed,
  text
}))
const weatherHttpRoutes = new Set(
  JSON.parse(
    readFileSync('cloudfunctions/weather-http/cloudbase-functions.json', 'utf8')
  ).routes.map(route => route.path)
)
for (const routePath of [
  '/weather/hot-cities',
  '/weather/hot-cities/resolve',
  '/weather/v7/weather/24h',
  '/v7/weather/24h'
]) {
  assert.equal(
    weatherHttpRoutes.has(routePath),
    true,
    `${routePath} 必须登记到 cloudbase-functions`
  )
}

const fakeCloudbaseApp = {
  async downloadFile({ fileID }) {
    const payload = storageObjectsByFileId.get(fileID)
    if (!payload) {
      const error = new Error('storage file not found')
      error.code = 'STORAGE_FILE_NONEXIST'
      throw error
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  },
  async uploadFile({ cloudPath, fileContent }) {
    const chunks = []
    if (fileContent && typeof fileContent.on === 'function') {
      await new Promise((resolve, reject) => {
        fileContent.on('data', chunk => chunks.push(Buffer.from(chunk)))
        fileContent.on('end', resolve)
        fileContent.on('error', reject)
      })
    }
    const fileID = `cloud://${cloudPath}`
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    storageObjects.set(cloudPath, payload)
    storageObjectsByFileId.set(fileID, payload)
    return { fileID }
  },
  async downloadFileByCloudPath({ cloudPath }) {
    const payload = storageObjects.get(cloudPath)
    if (!payload) {
      const error = new Error('storage file not found')
      error.code = 'STORAGE_FILE_NONEXIST'
      throw error
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  }
}

async function waitForCondition(predicate, { attempts = 20, delayMs = 10 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
}

Module._load = function patchedWeatherCacheLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: {
        async $runSQL(sql, params = {}) {
          sqlCalls.push({ sql, params })
          if (/FROM weather_locations/.test(sql) && /WHERE is_active = 1/.test(sql)) {
            return {
              data: {
                executeResultList: [
                  {
                    location_key: 'city:TimerActive',
                    qweather_location_id: 'TIMER_ACTIVE',
                    city_name: '定时地点',
                    timezone: 'Asia/Shanghai',
                    is_active: 1
                  }
                ]
              }
            }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }

  if (request === '/opt/utils/http') {
    return {
      jsonResponse(statusCode, payload) {
        return {
          statusCode,
          body: JSON.stringify(payload)
        }
      },
      notFound(path) {
        return { statusCode: 404, body: JSON.stringify({ code: 404, path }) }
      },
      methodNotAllowed(method) {
        return { statusCode: 405, body: JSON.stringify({ code: 405, method }) }
      },
      getHttpRequestData(event) {
        return event
      },
      resolveRequestAppEnv() {
        return 'production'
      },
      runWithRequestAppEnv(_appEnv, runner) {
        return runner()
      },
      async resolveHttpUserInfo() {
        return { openid: 'unit-openid' }
      }
    }
  }

  if (
    request === './services/weather-window-service' &&
    String(parent?.filename || '').endsWith('/cloudfunctions/weather-http/app.js')
  ) {
    return {
      async buildEnvironmentWeatherWindow() {
        legacyWeatherWindowCallCount += 1
        throw new Error('diagnosis miss 不应调用旧 QWeather environment window')
      }
    }
  }

  if (
    request === '../adapters/qweather-adapter' &&
    /\/cloudfunctions\/weather-http\/services\/(recent-weather-current|d0-weather-24h-service)\.js$/.test(
      String(parent?.filename || '')
    )
  ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchForecast10d({ locationId, lat, lng }) {
          if (locationId === 'TIMER_ACTIVE') {
            timerForecastCallCount += 1
            return {
              raw: { code: '200' },
              daily: [
                {
                  date: '2026-06-14',
                  tempMaxC: 30,
                  tempMinC: 20,
                  humidity: 60,
                  textDay: '晴',
                  source: 'fake_timer_forecast'
                }
              ]
            }
          }

          currentForecastCallCount += 1
          assert.equal(lat, 31.22)
          assert.equal(lng, 121.46)
          return {
            raw: { code: '200' },
            daily: [
              {
                date: currentArchiveDate,
                tempMaxC: 30,
                tempMinC: 20,
                humidity: 60,
                textDay: '晴',
                source: 'fake_current_entry_forecast'
              }
            ]
          }
        },
        async fetchWeather24h() {
          weather24hCallCount += 1
          return {
            raw: { code: '200' },
            hourly: routeHourly24h
          }
        }
      })
    }
  }

  if (
    request === './session-service' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return {
      upsertDiagnosisSession: async () => {},
      replaceObservedEvidenceSet: async () => {},
      replaceObservedSymptoms: async () => {},
      upsertVisualSupervisionRecords: async () => {},
      saveFinalDiagnosisSnapshot: async () => {}
    }
  }

  if (
    request === '../repositories/stop-state-repository' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return { upsertStopState: async () => {} }
  }

  if (
    request === './round-question-row-adapter' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js'
    )
  ) {
    return {
      shouldWriteSessionQuestionRows: () => false,
      writeSessionRoundQuestionRows: async () => {}
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  const weatherApp = require('../../cloudfunctions/weather-http/app.js')
  const missResponse = await weatherApp.main(
    {
      path: '/weather/environment-context',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        mode: 'diagnosis',
        locationKey: 'city:RouteMiss',
        diagnosisDate: '2026-06-14'
      }
    },
    {}
  )
  const missPayload = JSON.parse(missResponse.body)
  assert.equal(missResponse.statusCode, 200)
  assert.equal(missPayload.data.weatherEvidenceInsufficient, true)
  assert.equal(missPayload.data.historicalDays.length, 0)
  assert.equal(missPayload.data.meta.quality, 'missing')
  assert.equal(legacyWeatherWindowCallCount, 0)

  const currentResponse = await weatherApp.main(
    {
      path: '/weather/current',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        lat: 31.22,
        lng: 121.46,
        city: '上海市'
      }
    },
    {}
  )
  const currentPayload = JSON.parse(currentResponse.body)
  assert.equal(currentResponse.statusCode, 200)
  assert.equal(currentPayload.data.temperature, 30)
  assert.equal(currentPayload.data.weather, '晴')
  assert.equal(currentPayload.data.cached, false)
  assert.equal(currentPayload.data.dailyWeatherCache.refreshed, false)
  assert.equal(currentPayload.data.dailyWeatherCache.refreshScheduled, true)
  assert.equal(currentPayload.data.dailyWeatherCache.reason, 'daily_archive_missing')
  assert.equal(currentForecastCallCount, 1)
  assert.equal(
    await waitForCondition(() =>
      storageObjects.has(
        `weather-cache/v1/locations/coord:121_46_31_22/daily/${currentArchiveDate}.json`
      )
    ),
    true
  )
  assert.equal(
    storageObjects.has(
      `weather-cache/v1/locations/coord:121_46_31_22/daily/${currentArchiveDate}.json`
    ),
    true
  )
  assert.equal(
    sqlCalls.some(item => /weather_cache/.test(item.sql)),
    false
  )

  const d0WorkingResponse = await weatherApp.main(
    {
      path: '/weather/v7/weather/24h',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        locationKey: 'city:Route24h',
        cityName: '路由24h',
        latitude: 31.2304,
        longitude: 121.4737,
        targetDate: '2026-06-18'
      }
    },
    {}
  )
  const d0WorkingPayload = JSON.parse(d0WorkingResponse.body)
  assert.equal(d0WorkingResponse.statusCode, 200)
  assert.equal(d0WorkingPayload.data.workingPayload.sunWindow.solarNoon.includes('+08:00'), true)
  assert.equal(d0WorkingPayload.data.workingPayload.daylightSlots[0].cloudMean, 50)
  assert.equal(d0WorkingPayload.data.workingPayload.daylightSlots[0].name, 'morning')
  assert.equal(
    d0WorkingPayload.data.workingPayload.daylightSlots[0].sourceKind,
    'hourly_forecast_snapshot'
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/working/2026-06-18.json'),
    true
  )
  assert.equal(weather24hCallCount, 1)

  const d0FinalizeResponse = await weatherApp.main(
    {
      path: '/v7/weather/24h',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        locationKey: 'city:Route24h',
        cityName: '路由24h',
        latitude: 31.2304,
        longitude: 121.4737,
        targetDate: '2026-06-18',
        finalize: true
      }
    },
    {}
  )
  const d0FinalizePayload = JSON.parse(d0FinalizeResponse.body)
  assert.equal(d0FinalizeResponse.statusCode, 200)
  assert.equal(d0FinalizePayload.data.finalized, true)
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/daily/2026-06-18.json'),
    true
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/recent-10d.json'),
    false
  )

  const cachedCurrentResponse = await weatherApp.main(
    {
      path: '/weather/current',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        lat: 31.22,
        lng: 121.46,
        city: '上海市'
      }
    },
    {}
  )
  const cachedCurrentPayload = JSON.parse(cachedCurrentResponse.body)
  assert.equal(cachedCurrentResponse.statusCode, 200)
  assert.equal(cachedCurrentPayload.data.cached, true)
  assert.equal(cachedCurrentPayload.data.cacheScope, 'daily_archive')
  assert.equal(cachedCurrentPayload.data.dailyWeatherCache.reason, 'daily_archive_present')
  assert.equal(currentForecastCallCount, 1)

  sqlCalls.length = 0
  const timerResponse = await weatherApp.main(
    {
      Type: 'Timer',
      TriggerName: 'weather-ingestion-recent-10d'
    },
    {}
  )
  assert.equal(timerResponse.code, 200)
  assert.equal(timerResponse.data.sourceKind, 'weather_cache_recent_10d_timer')
  assert.equal(timerResponse.data.total, 1)
  assert.equal(timerResponse.data.successCount, 1)
  assert.equal(timerForecastCallCount, 1)
  assert.equal(
    sqlCalls.some(
      item => /FROM weather_locations/.test(item.sql) && /WHERE is_active = 1/.test(item.sql)
    ),
    true
  )

  const {
    saveDiagnosisWeatherEvidenceReference
  } = require('../../cloudfunctions/diagnose-http/repositories/weather-repository.js')
  sqlCalls.length = 0
  const savedReference = await saveDiagnosisWeatherEvidenceReference({
    sessionId: 'diag_weather_direct',
    response: {
      environmentCareContext: {
        environmentWeatherWindow: {
          location: { locationKey: 'city:Evidence' },
          weatherObjectPath: 'weather-cache/v1/locations/city:Evidence/recent-10d.json',
          sourceKind: 'weather_cache_recent_10d',
          quality: 'partial',
          generatedAt: '2026-06-14T00:30:00Z'
        }
      }
    }
  })
  assert.equal(savedReference.diagnosisSessionId, 'diag_weather_direct')
  assert.equal(sqlCalls.length, 1)
  assert.match(sqlCalls[0].sql, /diagnosis_weather_evidence/)
  assert.equal(
    sqlCalls[0].params.weatherObjectPath,
    'weather-cache/v1/locations/city:Evidence/recent-10d.json'
  )
  assert.equal(sqlCalls[0].params.quality, 'partial')

  const {
    persistRoundRuntime
  } = require('../../cloudfunctions/diagnose-http/services/round-runtime-persistence-service.js')
  sqlCalls.length = 0
  await persistRoundRuntime({
    sessionId: 'diag_weather_persist',
    openid: 'openid_weather_persist',
    plantContext: {},
    response: {
      environmentCareContext: {
        environmentWeatherWindow: {
          location: { locationKey: 'city:Evidence' },
          weatherObjectPath: 'weather-cache/v1/locations/city:Evidence/recent-10d.json',
          sourceKind: 'weather_cache_recent_10d',
          quality: 'complete',
          generatedAt: '2026-06-14T00:30:00Z'
        }
      }
    },
    round: 1
  })
  await new Promise(resolve => setImmediate(resolve))
  const evidenceWrite = sqlCalls.find(item => /diagnosis_weather_evidence/.test(item.sql))
  assert.equal(evidenceWrite.params.diagnosisSessionId, 'diag_weather_persist')
  assert.equal(evidenceWrite.params.sourceKind, 'weather_cache_recent_10d')
  assert.equal(evidenceWrite.params.quality, 'complete')
} finally {
  Module._load = originalLoad
  if (originalQWeatherApiKey === undefined) {
    delete process.env.QWEATHER_API_KEY
  } else {
    process.env.QWEATHER_API_KEY = originalQWeatherApiKey
  }
}

console.log('weather-cache-routes-and-evidence tests passed')
