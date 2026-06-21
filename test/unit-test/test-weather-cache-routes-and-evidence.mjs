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
const currentForecastCallCount = 0
let weather24hCallCount = 0
const storageObjects = new Map()
const storageObjectsByFileId = new Map()
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
    /\/cloudfunctions\/weather-(http|ingestion-scheduler)\/services\/d0-now-sample-service\.js$/.test(
     String(parent?.filename || '')
   )
 ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchCurrentWeather() {
          weather24hCallCount += 1
          return {
            tempC: 25,
            humidity: 60,
            text: '晴',
            obsTime: '2026-06-18T09:30:00+08:00',
            source: 'qweather_weather_now'
          }
        },
        async fetchForecast10d() {
          timerForecastCallCount += 1
          return { raw: { code: '200' }, daily: [] }
        },
        async fetchWeather24h() {
          weather24hCallCount += 1
          return { raw: { code: '200' }, hourly: routeHourly24h }
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
  const schedulerApp = require('../../cloudfunctions/weather-ingestion-scheduler/app.js')
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
        lat: 35.22,
        lng: 105.46,
        city: '远离热城测试地'
      }
    },
    {}
  )
  const currentPayload = JSON.parse(currentResponse.body)
  assert.equal(currentResponse.statusCode, 200)
  // 新架构：缓存 miss 时返回 evidence insufficient，不调用 QWeather
  assert.equal(currentPayload.data.weatherEvidenceInsufficient, true)
  assert.equal(currentPayload.data.dailyWeatherCache.cacheHit, false)
  assert.equal(currentPayload.data.dailyWeatherCache.weatherEvidenceInsufficient, true)
  assert.equal(currentForecastCallCount, 0, 'current miss 不得调用 QWeather forecast')
  assert.equal(weather24hCallCount, 0, 'current miss 不得调用 QWeather now')

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
        targetDate: '2026-06-18',
        slotName: 'morning'
      }
    },
    {}
  )
  const d0WorkingPayload = JSON.parse(d0WorkingResponse.body)
  assert.equal(d0WorkingResponse.statusCode, 200)
  assert.equal(d0WorkingPayload.data.finalized, false)
  assert.equal(d0WorkingPayload.data.sourceKind, 'observed_now_samples')
  assert.ok(d0WorkingPayload.data.dayPayload, 'should have dayPayload')
  assert.equal(d0WorkingPayload.data.dayPayload.state, 'working')
  assert.ok(d0WorkingPayload.data.dayPayload.latestSample, 'should have latestSample')
  assert.equal(d0WorkingPayload.data.dayPayload.latestSample.sourceKind, 'weather_now_sample')
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/days/2026-06-18.json'),
    true,
    'now 采样应写 days/ 文件'
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/working/2026-06-18.json'),
    false,
    '不得写 working/ 文件'
  )
  assert.equal(weather24hCallCount, 1, '应调用 fetchCurrentWeather')

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
  assert.equal(d0FinalizePayload.data.sourceKind, 'observed_now_rollup')
  assert.ok(d0FinalizePayload.data.dailyRollup, 'finalize 应生成 dailyRollup')
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/days/2026-06-18.json'),
    true
  )
  const routeDayFile = storageObjects.get('weather-cache/v1/locations/city:Route24h/days/2026-06-18.json')
  assert.equal(routeDayFile.state, 'finalized')
  assert.equal(routeDayFile.sourceKind, 'observed_now_rollup')
  assert.ok(routeDayFile.finalizedAt, '应设置 finalizedAt')
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/daily/2026-06-18.json'),
    false,
    '不得写 daily/ 文件'
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:Route24h/recent-10d.json'),
    false
  )

  // 新架构：无 day file 时仍然 evidence insufficient（Route24h 有 day file 但不同 locationKey）
  const cachedCurrentResponse = await weatherApp.main(
    {
      path: '/weather/current',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        lat: 35.22,
        lng: 105.46,
        city: '远离热城测试地'
      }
    },
    {}
  )
  const cachedCurrentPayload = JSON.parse(cachedCurrentResponse.body)
  assert.equal(cachedCurrentResponse.statusCode, 200)
  assert.equal(cachedCurrentPayload.data.weatherEvidenceInsufficient, true)
  assert.equal(currentForecastCallCount, 0, '不得调用 QWeather')

  sqlCalls.length = 0
  const timerResponse = await schedulerApp.main(
    {
      Type: 'Timer',
      TriggerName: 'weather-ingestion-recent-10d'
    },
    {}
  )
  assert.equal(timerResponse.code, 200)
  assert.equal(timerResponse.data.sourceKind, 'weather_cache_recent_10d_timer')
  // scheduler 是唯一 timer owner：ingestRecentForecast 不再拉取 forecast 10d，从 day files 重建
  assert.equal(timerForecastCallCount, 0, 'timer 不得调用 fetchForecast10d')
  assert.equal(
    sqlCalls.some(
      item => /FROM weather_locations/.test(item.sql)
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
