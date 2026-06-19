import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const storageObjects = new Map()
const storageObjectsByFileId = new Map()
let weather24hCallCount = 0

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

function buildMissingStorageError() {
  const error = new Error('storage file not found')
  error.code = 'STORAGE_FILE_NONEXIST'
  return error
}

const fakeCloudbaseApp = {
  async downloadFile({ fileID }) {
    const payload = storageObjectsByFileId.get(fileID)
    if (!payload) {
      throw buildMissingStorageError()
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  },
  async uploadFile({ cloudPath, fileContent }) {
    const chunks = []
    await new Promise((resolve, reject) => {
      fileContent.on('data', chunk => chunks.push(Buffer.from(chunk)))
      fileContent.on('end', resolve)
      fileContent.on('error', reject)
    })
    const fileID = `cloud://${cloudPath}`
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    storageObjects.set(cloudPath, payload)
    storageObjectsByFileId.set(fileID, payload)
    return { fileID }
  },
  async downloadFileByCloudPath({ cloudPath }) {
    const payload = storageObjects.get(cloudPath)
    if (!payload) {
      throw buildMissingStorageError()
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  }
}

Module._load = function patchedWeatherD0TimerLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: {
        async $runSQL() {
          return { data: { executeResultList: [] } }
        }
      }
    }
  }

  if (request === '/opt/utils/http') {
    return {
      jsonResponse(statusCode, payload) {
        return { statusCode, body: JSON.stringify(payload) }
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
      }
    }
  }

  if (
    request === '../adapters/qweather-adapter' &&
    String(parent?.filename || '').endsWith(
      '/cloudfunctions/weather-http/services/d0-weather-24h-service.js'
    )
  ) {
    return {
      createQWeatherAdapter: () => ({
        async fetchWeather24h() {
          weather24hCallCount += 1
          return { raw: { code: '200' }, hourly: routeHourly24h }
        }
      })
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  const config = JSON.parse(readFileSync('cloudfunctions/weather-http/config.json', 'utf8'))
  const triggerNames = new Set(config.triggers.map(trigger => trigger.name))
  assert.equal(triggerNames.has('weather-d0-24h-0630'), true)
  assert.equal(triggerNames.has('weather-d0-24h-1130'), true)
  assert.equal(triggerNames.has('weather-d0-24h-1530'), true)
  assert.equal(triggerNames.has('weather-d0-24h-finalize-2130'), true)

  const {
    HOT_CITY_WEATHER_LOCATIONS
  } = require('../../cloudfunctions/weather-http/services/hot-city-locations.js')
  const weatherApp = require('../../cloudfunctions/weather-http/app.js')
  const workingResponse = await weatherApp.main(
    {
      Type: 'Timer',
      TriggerName: 'weather-d0-24h-0630',
      targetDate: '2026-06-18'
    },
    {}
  )
  assert.equal(workingResponse.code, 200)
  assert.equal(workingResponse.data.triggerName, 'weather-d0-24h-0630')
  assert.equal(workingResponse.data.finalized, false)
  assert.equal(workingResponse.data.attempted, 20)
  assert.equal(workingResponse.data.succeeded, 20)
  assert.equal(workingResponse.data.failed, 0)
  assert.equal(weather24hCallCount, 20)
  assert.equal(
    HOT_CITY_WEATHER_LOCATIONS.every(city =>
      storageObjects.has(`weather-cache/v1/locations/${city.key}/working/2026-06-18.json`)
    ),
    true
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/recent-10d.json'),
    false
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/daily/2026-06-18.json'),
    false
  )

  const finalizeResponse = await weatherApp.main(
    {
      Type: 'Timer',
      TriggerName: 'weather-d0-24h-finalize-2130',
      targetDate: '2026-06-18'
    },
    {}
  )
  assert.equal(finalizeResponse.code, 200)
  assert.equal(finalizeResponse.data.triggerName, 'weather-d0-24h-finalize-2130')
  assert.equal(finalizeResponse.data.finalized, true)
  assert.equal(finalizeResponse.data.attempted, 20)
  assert.equal(finalizeResponse.data.succeeded, 20)
  assert.equal(finalizeResponse.data.failed, 0)
  assert.equal(weather24hCallCount, 40)
  assert.equal(
    HOT_CITY_WEATHER_LOCATIONS.every(city =>
      storageObjects.has(`weather-cache/v1/locations/${city.key}/daily/2026-06-18.json`)
    ),
    true
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/recent-10d.json'),
    false
  )
  const shanghaiResult = finalizeResponse.data.cities.find(
    item => item.locationKey === 'city:shanghai'
  )
  assert.equal(
    shanghaiResult.workingObjectPath,
    'weather-cache/v1/locations/city:shanghai/working/2026-06-18.json'
  )
  assert.equal(
    shanghaiResult.dailyObjectPath,
    'weather-cache/v1/locations/city:shanghai/daily/2026-06-18.json'
  )
  assert.equal(shanghaiResult.error, '')
} finally {
  Module._load = originalLoad
}

console.log('weather-d0-24h-timers tests passed')
