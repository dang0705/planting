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

async function waitForCondition(predicate, { attempts = 30, delayMs = 5 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return true
    }
    await new Promise(resolve => setTimeout(resolve, delayMs))
  }
  return false
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
    /\/cloudfunctions\/weather-http\/services\/(recent-weather-current|d0-weather-24h-service)\.js$/.test(
      String(parent?.filename || '')
    )
  ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchForecast10d({ locationId, lat, lng }) {
          forecastCallsByLocation.push({ locationId, lat, lng })
          if (locationId === 'DB_ONLY') {
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
                  source: 'fake_db_only'
                }
              ]
            }
          }
          // 热门城市批量 / 单点 current 入口都必须真实带到坐标
          assert.equal(Number.isFinite(lat), true, `hot-city forecast 必须带 lat: ${lat}`)
          assert.equal(Number.isFinite(lng), true, `hot-city forecast 必须带 lng: ${lng}`)
          timerForecastCallCount += 1
          return {
            raw: { code: '200' },
            daily: [
              {
                date: new Date().toISOString().slice(0, 10),
                tempMaxC: 28,
                tempMinC: 18,
                humidity: 55,
                textDay: '多云',
                source: 'fake_hot_city_forecast'
              }
            ]
          }
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

  // 1) /weather/current 上海坐标必须落 city:shanghai daily 缓存，不再写 coord:*
  const currentArchiveDate = new Date().toISOString().slice(0, 10)
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
  assert.equal(currentResponse.statusCode, 200)
  assert.equal(
    await waitForCondition(() =>
      storageObjects.has(
        `weather-cache/v1/locations/city:shanghai/daily/${currentArchiveDate}.json`
      )
    ),
    true,
    '上海坐标 + city=上海市 必须落 city:shanghai daily 缓存'
  )
  assert.equal(
    Array.from(storageObjects.keys()).some(key =>
      key.startsWith('weather-cache/v1/locations/coord:')
    ),
    false,
    '热门城市坐标不再写入 coord:* 缓存'
  )

  // 2) 定时批量采集必须覆盖 20 热城 + 1 active DB 地点 = 21
  const timerResponse = await weatherApp.main(
    { Type: 'Timer', TriggerName: 'weather-ingestion-recent-10d' },
    {}
  )
  assert.equal(timerResponse.code, 200)
  assert.equal(timerResponse.data.total, 21)
  assert.equal(timerResponse.data.successCount, 21)
  assert.equal(
    timerResponse.data.results.some(item => item.locationKey === 'city:shanghai' && item.ok),
    true,
    'city:shanghai 必须出现在定时采集结果中'
  )
  assert.equal(
    timerResponse.data.results.some(item => item.locationKey === 'city:DBOnly' && item.ok),
    true,
    '数据库 active 地点必须保留在定时采集结果中'
  )

  // 3) 热门城市批量 forecast 调用必须真实拿到 lat/lng（非 NaN/undefined），否则 QWeather 会失败
  const hotCityForecastCalls = forecastCallsByLocation.filter(
    call => call.locationId !== 'DB_ONLY'
  )
  assert.equal(
    hotCityForecastCalls.every(
      call => Number.isFinite(call.lat) && Number.isFinite(call.lng)
    ),
    true,
    '所有热城 forecast 调用必须带有效 lat/lng'
  )
  assert.equal(
    hotCityForecastCalls.some(
      call => Math.abs(call.lat - 31.23) < 0.005 && Math.abs(call.lng - 121.47) < 0.005
    ),
    true,
    '上海坐标必须真实命中 forecast 调用（normalize 到两位精度）'
  )
} finally {
  Module._load = originalLoad
  if (originalQWeatherApiKey === undefined) {
    delete process.env.QWEATHER_API_KEY
  } else {
    process.env.QWEATHER_API_KEY = originalQWeatherApiKey
  }
}

console.log('weather-hot-city-app-routing tests passed')
