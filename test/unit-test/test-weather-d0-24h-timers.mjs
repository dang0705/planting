import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const storageObjects = new Map()
const storageObjectsByFileId = new Map()
let nowCallCount = 0

function buildMissingStorageError() {
  const error = new Error('storage file not found')
  error.code = 'STORAGE_FILE_NONEXIST'
  return error
}

const fakeCloudbaseApp = {
  async downloadFile({ fileID }) {
    const payload = storageObjectsByFileId.get(fileID)
    if (!payload) { throw buildMissingStorageError() }
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
    if (!payload) { throw buildMissingStorageError() }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  },
  async getUploadMetadata({ cloudPath }) {
    if (storageObjects.has(cloudPath)) { return { data: { fileId: `cloud://${cloudPath}` } } }
    throw buildMissingStorageError()
  },
  async deleteFile({ fileList }) {
    for (const fileID of fileList) {
      storageObjectsByFileId.delete(fileID)
      for (const [path, p] of storageObjects) {
        if (p === storageObjectsByFileId.get(fileID)) { storageObjects.delete(path) }
      }
    }
    return { fileList: [] }
  }
}

Module._load = function patchedWeatherD0TimerLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: { async $runSQL() { return { data: { executeResultList: [] } } } }
    }
  }

  if (request === '/opt/utils/http') {
    return {
      jsonResponse(statusCode, payload) { return { statusCode, body: JSON.stringify(payload) } },
      notFound(path) { return { statusCode: 404, body: JSON.stringify({ code: 404, path }) } },
      methodNotAllowed(method) { return { statusCode: 405, body: JSON.stringify({ code: 405, method }) } },
      getHttpRequestData(event) { return event },
      resolveRequestAppEnv() { return 'production' },
      runWithRequestAppEnv(_appEnv, runner) { return runner() }
    }
  }

  // 拦截 qweather-adapter，模拟 /v7/weather/now（不再用 24h）
  if (request === '../adapters/qweather-adapter' || request === './adapters/qweather-adapter') {
    return {
      createQWeatherAdapter: () => ({
        async fetchCurrentWeather() {
          nowCallCount += 1
          return { tempC: 25, humidity: 60, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' }
        },
        async fetchForecast10d() { return { raw: {}, daily: [] } },
        async fetchWeather24h() { return { raw: {}, hourly: [] } }
      })
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  const config = JSON.parse(readFileSync('cloudfunctions/weather-http/config.json', 'utf8'))
  const triggersByName = new Map(config.triggers.map(trigger => [trigger.name, trigger]))
  assert.equal(triggersByName.has('weather-d0-now-morning-0920'), true)
  assert.equal(triggersByName.get('weather-d0-now-morning-0920').config, '0 20 9 * * * *')
  assert.equal(triggersByName.has('weather-d0-now-forenoon-1220'), true)
  assert.equal(triggersByName.get('weather-d0-now-forenoon-1220').config, '0 20 12 * * * *')
  assert.equal(triggersByName.has('weather-d0-now-noon-1420'), true)
  assert.equal(triggersByName.get('weather-d0-now-noon-1420').config, '0 20 14 * * * *')
  assert.equal(triggersByName.has('weather-d0-now-afternoon-1820'), true)
  assert.equal(triggersByName.get('weather-d0-now-afternoon-1820').config, '0 20 18 * * * *')
  assert.equal(triggersByName.has('weather-d0-now-finalize-2130'), true)
  assert.equal(triggersByName.get('weather-d0-now-finalize-2130').config, '0 30 21 * * * *')
  assert.equal(triggersByName.has('weather-d0-24h-0630'), false)

  const { HOT_CITY_WEATHER_LOCATIONS } = require('../../cloudfunctions/weather-http/services/hot-city-locations.js')
  const { buildWeatherDayObjectPath } = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
  const weatherApp = require('../../cloudfunctions/weather-http/app.js')

  // working 定时器：now 采样，写入 days/{date}.json
  const workingResponse = await weatherApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-noon-1420', targetDate: '2026-06-18' },
    {}
  )
  assert.equal(workingResponse.code, 200)
  assert.equal(workingResponse.data.triggerName, 'weather-d0-now-noon-1420')
  assert.equal(workingResponse.data.finalized, false)
  assert.equal(workingResponse.data.attempted, 20)
  assert.equal(workingResponse.data.succeeded, 20)
  assert.equal(workingResponse.data.failed, 0)
  assert.equal(nowCallCount, 20, 'should call fetchCurrentWeather 20 times')
  assert.equal(
    HOT_CITY_WEATHER_LOCATIONS.every(city =>
      storageObjects.has(buildWeatherDayObjectPath(city.key, '2026-06-18'))
    ),
    true,
    'all cities should have days/{date}.json'
  )
  // 不应写入 working/ 或 daily/
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/working/2026-06-18.json'),
    false,
    'old working/ path should not be written'
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/daily/2026-06-18.json'),
    false,
    'old daily/ path should not be written'
  )

  // 验证 day file 结构
  const shanghaiDayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  const shanghaiDayFile = storageObjects.get(shanghaiDayPath)
  assert.equal(shanghaiDayFile.state, 'working')
  assert.equal(shanghaiDayFile.sourceKind, 'observed_now_samples')
  assert.ok(shanghaiDayFile.samples.length > 0, 'should have samples')
  assert.equal(shanghaiDayFile.samples[0].slotName, 'noon')
  assert.ok(shanghaiDayFile.latestSample, 'should have latestSample')
  assert.equal(shanghaiDayFile.latestSample.sourceKind, 'weather_now_sample')

  // finalize 定时器：生成 dailyRollup，state=finalized
  const finalizeResponse = await weatherApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-finalize-2130', targetDate: '2026-06-18' },
    {}
  )
  assert.equal(finalizeResponse.code, 200)
  assert.equal(finalizeResponse.data.triggerName, 'weather-d0-now-finalize-2130')
  assert.equal(finalizeResponse.data.finalized, true)
  assert.equal(finalizeResponse.data.attempted, 20)
  assert.equal(finalizeResponse.data.succeeded, 20)
  assert.equal(finalizeResponse.data.failed, 0)

  // 验证 finalize 后的 day file
  const finalizedDayFile = storageObjects.get(shanghaiDayPath)
  assert.equal(finalizedDayFile.state, 'finalized')
  assert.equal(finalizedDayFile.sourceKind, 'observed_now_rollup')
  assert.ok(finalizedDayFile.dailyRollup, 'should have dailyRollup')
  assert.ok(finalizedDayFile.finalizedAt, 'should have finalizedAt')

  // 不应写入 recent-10d（finalize 只处理 day file，不重建 recent-10d）
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/recent-10d.json'),
    false,
    'finalize should not write recent-10d'
  )

  const shanghaiResult = finalizeResponse.data.cities.find(item => item.locationKey === 'city:shanghai')
  assert.equal(shanghaiResult.dayObjectPath, shanghaiDayPath)
  assert.equal(shanghaiResult.error, '')
} finally {
  Module._load = originalLoad
}

console.log('weather-d0-24h-timers tests passed')
