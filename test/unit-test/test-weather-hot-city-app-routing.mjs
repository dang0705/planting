import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const originalQWeatherApiKey = process.env.QWEATHER_API_KEY
process.env.QWEATHER_API_KEY = 'unit-weather-key'

const storageObjects = new Map()
const storageObjectsByFileId = new Map()
const forecastCallsByLocation = []
let timerForecastCallCount = 0

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

Module._load = function patched(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: {
        async $runSQL(sql) {
          if (/FROM weather_locations/.test(sql) && /WHERE is_active = 1/.test(sql)) {
            return {
              data: {
                executeResultList: [
                  {
                    location_key: 'city:DBOnly',
                    qweather_location_id: 'DB_ONLY',
                    city_name: '数据库自定义地点',
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
      jsonResponse: (statusCode, payload) => ({
        statusCode,
        body: JSON.stringify(payload)
      }),
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
        throw new Error('hot-city routing 不应回退旧 environment window')
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
        async fetchCurrentWeather({ lat, lng }) {
          forecastCallsByLocation.push({ locationId: '', lat, lng })
          assert.equal(Number.isFinite(lat), true, `now 采样必须带 lat: ${lat}`)
          assert.equal(Number.isFinite(lng), true, `now 采样必须带 lng: ${lng}`)
          return { tempC: 25, humidity: 60, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' }
        },
        async fetchForecast10d() {
          timerForecastCallCount += 1
          return { raw: { code: '200' }, daily: [] }
        },
        async fetchWeather24h() {
          return { raw: { code: '200' }, hourly: [] }
        }
      })
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  const weatherApp = require('../../cloudfunctions/weather-http/app.js')
  const schedulerApp = require('../../cloudfunctions/weather-ingestion-scheduler/app.js')

  // 1) /weather/current 上海坐标必须命中 city:shanghai，不再写 coord:*
  const currentArchiveDate = new Date().toISOString().slice(0, 10)
  // 预置 Shanghai day file（模拟 now 采样已产出 latestSample）
  storageObjects.set(
    `weather-cache/v1/locations/city:shanghai/days/${currentArchiveDate}.json`,
    {
      schemaVersion: 'weather-cache/v1/day-now-sample',
      locationKey: 'city:shanghai',
      date: currentArchiveDate,
      state: 'working',
      samples: [{ slotName: 'morning', temp: 25, humidity: 60, text: '晴', sourceKind: 'weather_now_sample' }],
      latestSample: { slotName: 'morning', temp: 25, humidity: 60, text: '晴', sourceKind: 'weather_now_sample' },
      sourceKind: 'observed_now_samples',
      quality: 'partial',
      weatherObjectPath: `weather-cache/v1/locations/city:shanghai/days/${currentArchiveDate}.json`
    }
  )
  const currentResponse = await weatherApp.main(
    {
      path: '/weather/current',
      method: 'POST',
      headers: {},
      query: {},
      body: { lat: 31.22, lng: 121.46, city: '上海市' }
    },
    {}
  )
  const currentPayload = JSON.parse(currentResponse.body)
  assert.equal(currentResponse.statusCode, 200)
  assert.equal(currentPayload.data.weatherEvidenceInsufficient, undefined, '应有天气数据')
  assert.equal(currentPayload.data.sourceKind, 'weather_now_sample')
  assert.equal(
    currentPayload.data.dailyWeatherCache.locationKey,
    'city:shanghai',
    '上海坐标必须命中 city:shanghai'
  )
  assert.equal(
    Array.from(storageObjects.keys()).some(key =>
      key.startsWith('weather-cache/v1/locations/coord:')
    ),
    false,
    '热门城市坐标不再写入 coord:* 缓存'
  )

  // 2) 定时批量采集从 day files 重建 recent-10d（scheduler 是唯一 timer owner）
  const timerResponse = await schedulerApp.main(
    { Type: 'Timer', TriggerName: 'weather-ingestion-recent-10d' },
    {}
  )
  assert.equal(timerResponse.code, 200)
  assert.equal(timerResponse.data.total, 20)
  assert.equal(timerResponse.data.successCount, 20)
  assert.equal(
    timerResponse.data.results.some(item => item.locationKey === 'city:shanghai' && item.ok),
    true,
    'city:shanghai 必须出现在定时采集结果中'
  )
  // hasCityFilter 会过滤掉非热城的 DB active 地点
  assert.equal(
    timerResponse.data.results.some(item => item.locationKey === 'city:DBOnly'),
    false,
    '非热城 DB active 地点被 hasCityFilter 过滤'
  )
  // 新架构：ingestRecentForecast 不调用 fetchForecast10d
  assert.equal(timerForecastCallCount, 0, 'timer 不得调用 fetchForecast10d')
} finally {
  Module._load = originalLoad
  if (originalQWeatherApiKey === undefined) {
    delete process.env.QWEATHER_API_KEY
  } else {
    process.env.QWEATHER_API_KEY = originalQWeatherApiKey
  }
}

console.log('weather-hot-city-app-routing tests passed')
