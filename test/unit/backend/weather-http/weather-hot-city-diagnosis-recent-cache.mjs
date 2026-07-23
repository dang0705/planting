import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const originalQWeatherApiKey = process.env.QWEATHER_API_KEY
process.env.QWEATHER_API_KEY = 'unit-weather-key'

const storageObjects = new Map()
const storageObjectsByFileId = new Map()
let forecast10dCalls = 0
let historicalCalls = 0

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

function addDays(dateText, offset) {
  const date = new Date(`${dateText}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

Module._load = function patched(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: {
        async $runSQL(sql) {
          if (/FROM weather_locations/.test(sql) && /WHERE is_active = 1/.test(sql)) {
            return { data: { executeResultList: [] } }
          }
          return { data: { executeResultList: [] } }
        }
      }
    }
  }

  if (request === '/opt/utils/http') {
    return {
      jsonResponse: (statusCode, payload) => ({ statusCode, body: JSON.stringify(payload) }),
      notFound: path => ({ statusCode: 404, body: JSON.stringify({ code: 404, path }) }),
      methodNotAllowed: method => ({
        statusCode: 405,
        body: JSON.stringify({ code: 405, method })
      }),
      getHttpRequestData: event => event,
      resolveRequestAppEnv: () => 'production',
      runWithRequestAppEnv: (_appEnv, runner) => runner(),
      resolveHttpUserInfo: async () => ({ openid: 'unit-openid' })
    }
  }

  if (
    request === './services/weather-window-service' &&
    String(parent?.filename || '').endsWith('/cloudfunctions/weather-http/app.js')
  ) {
    return {
      async buildEnvironmentWeatherWindow() {
        throw new Error('诊断模式不应回退旧 environment window')
      }
    }
  }

  if (
    request === '../adapters/qweather-adapter' &&
    String(parent?.filename || '').includes('/cloudfunctions/weather-http/services/')
  ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchForecast10d() {
          forecast10dCalls += 1
          return {
            raw: { code: '200' },
            daily: [
              {
                date: new Date().toISOString().slice(0, 10),
                tempMaxC: 30,
                tempMinC: 22,
                humidity: 65,
                textDay: '多云',
                source: 'fake_forecast_today'
              }
            ]
          }
        },
        async fetchHistoricalWeather({ date }) {
          historicalCalls += 1
          return {
            date,
            tempMaxC: 29,
            tempMinC: 21,
            humidity: 68,
            precipMm: 0,
            textDay: '晴',
            source: 'fake_time_machine'
          }
        },
        async fetchWeather24h() {
          throw new Error('本测试不应调用 24h 天气')
        }
      })
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  const weatherApp = require('../../../../cloudfunctions/weather-http/app.js')
  const {
    clearRecentWeatherMemoryCache
  } = require('../../../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')
  const { buildWeatherDayObjectPath } = require('../../../../cloudfunctions/weather-http/services/weather-cache-paths.js')

  // 新架构：批量采集前需预置 finalized day file
  const today = new Date().toISOString().slice(0, 10)
  const d1 = addDays(today, -1)
  const shanghaiD1Path = buildWeatherDayObjectPath('city:shanghai', d1)
  storageObjects.set(shanghaiD1Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: d1,
    state: 'finalized',
    samples: [{ slotName: 'morning', temp: 24, humidity: 65, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 24 },
    dailyRollup: {
      date: d1,
      quality: 'partial',
      sampleSummary: { sampleCount: 1, daylightSampleCount: 1, missingSlots: ['forenoon', 'noon', 'afternoon'] },
      lightFeatures: { daylightCloudMean: null, lowLightProxy: 'none' },
      moistureFeatures: { humidityMean: 65, precipLastHourSum: null, wetSoilRiskFromWeather: 'low' },
      tempFeatures: { tempMean: 24, tempMax: 24, heatStressLevel: 'low', coldStressLevel: 'low' },
      tempMin: 24,
      dominantWeatherText: ''
    },
    sourceKind: 'observed_now_rollup',
    quality: 'partial',
    weatherObjectPath: shanghaiD1Path
  })

  const ingestionResponse = await weatherApp.main(
    {
      path: '/weather/ingestion/recent-10d',
      method: 'POST',
      headers: {},
      query: {},
      body: { batch: true }
    },
    {}
  )
  const ingestionPayload = JSON.parse(ingestionResponse.body)
  assert.equal(ingestionResponse.statusCode, 200)
  const shanghaiResult = ingestionPayload.data.results.find(
    item => item.locationKey === 'city:shanghai'
  )
  assert.equal(Boolean(shanghaiResult?.ok), true)
  assert.equal(
    shanghaiResult.recentObjectPath,
    'weather-cache/v1/locations/city:shanghai/recent-10d.json'
  )

  const recentPayload = storageObjects.get(shanghaiResult.recentObjectPath)
  assert.ok(recentPayload, 'recent-10d.json 应被写入')
  assert.equal(recentPayload.quality, 'partial')
  assert.equal(recentPayload.weatherEvidenceInsufficient, false)
  assert.equal(
    recentPayload.historicalDays.some(day => !day.missing),
    true,
    'batch 应从 finalized day file 聚合至少一天可用历史日'
  )
  assert.equal(
    Array.from(storageObjects.keys()).some(key =>
      key.startsWith('weather-cache/v1/locations/coord:')
    ),
    false
  )

  const historicalCallsAfterBatch = historicalCalls
  clearRecentWeatherMemoryCache()
  const diagnosisResponse = await weatherApp.main(
    {
      path: '/weather/environment-context',
      method: 'POST',
      headers: {},
      query: {},
      body: {
        mode: 'diagnosis',
        locationKey: 'city:shanghai',
        diagnosisDate: addDays(shanghaiResult.targetDate, 1),
        plantId: 'plant-shanghai',
        careLocationId: '7'
      }
    },
    {}
  )
  const diagnosisPayload = JSON.parse(diagnosisResponse.body)
  assert.equal(diagnosisResponse.statusCode, 200)
  assert.equal(diagnosisPayload.data.locationKey, 'city:shanghai')
  assert.equal(diagnosisPayload.data.weatherEvidenceInsufficient, false)
  assert.equal(diagnosisPayload.data.historicalDays.length > 0, true)
  assert.equal(
    diagnosisPayload.data.meta.weatherObjectPath,
    'weather-cache/v1/locations/city:shanghai/recent-10d.json'
  )
  assert.equal(historicalCalls, historicalCallsAfterBatch, '诊断请求不得调用 QWeather')
  assert.equal(forecast10dCalls, 0, '新架构不得调用 fetchForecast10d')
} finally {
  Module._load = originalLoad
  if (originalQWeatherApiKey === undefined) {
    delete process.env.QWEATHER_API_KEY
  } else {
    process.env.QWEATHER_API_KEY = originalQWeatherApiKey
  }
}

console.log('weather-hot-city-diagnosis-recent-cache tests passed')
