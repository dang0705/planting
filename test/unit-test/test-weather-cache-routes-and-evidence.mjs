import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
let legacyWeatherWindowCallCount = 0
let timerForecastCallCount = 0

const fakeCloudbaseApp = {
  async uploadFile({ cloudPath, fileContent }) {
    if (fileContent && typeof fileContent.on === 'function') {
      await new Promise((resolve, reject) => {
        fileContent.on('data', () => {})
        fileContent.on('end', resolve)
        fileContent.on('error', reject)
      })
    }
    return { fileID: `cloud://${cloudPath}` }
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
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/weather-http/services/recent-weather-service.js'
    )
  ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchForecast10d({ locationId }) {
          timerForecastCallCount += 1
          assert.equal(locationId, 'TIMER_ACTIVE')
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
}

console.log('weather-cache-routes-and-evidence tests passed')
