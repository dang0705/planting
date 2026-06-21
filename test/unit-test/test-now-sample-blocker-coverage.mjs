import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

const storageObjects = new Map()
const storageObjectsByFileId = new Map()

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
  async deleteFile() { return { fileList: [] } }
}

Module._load = function patchedBlockerLoad(request, parent, isMain) {
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
  if (request === '../adapters/qweather-adapter' || request === './adapters/qweather-adapter') {
    return {
      createQWeatherAdapter: () => ({
        async fetchCurrentWeather() { return { tempC: 25, humidity: 60, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' } },
        async fetchForecast10d() { return { raw: {}, daily: [] } },
        async fetchWeather24h() { return { raw: {}, hourly: [] } }
      })
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const originalQWeatherApiKey = process.env.QWEATHER_API_KEY
process.env.QWEATHER_API_KEY = 'test-key'

try {
  const { buildWeatherDayObjectPath } = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
  const { createRecentWeatherService } = require('../../cloudfunctions/weather-http/services/recent-weather-service.js')
  const { convertDayFileToDailyRecord } = require('../../cloudfunctions/weather-http/services/recent-weather-archive.js')

  const service = createRecentWeatherService({
    apiKey: 'test-key',
    baseUrl: 'test',
    now: () => new Date('2026-06-18T03:00:00Z'),
    adapter: {
      async fetchCurrentWeather() { return { tempC: 25, humidity: 60, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' } },
      async fetchForecast10d() { return { raw: {}, daily: [] } }
    }
  })

  // === Blocker 2: recent-10d 不读 working/D0/旧 dailyArchives ===

  // 写一个 working (非 finalized) 的 D-1 day file
  const workingD1Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-17')
  storageObjects.set(workingD1Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-17',
    state: 'working',
    samples: [{ slotName: 'morning', temp: 22, humidity: 60, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 22 },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: workingD1Path
  })

  // 写一个 finalized 的 D-1 day file 但用旧 dailyArchives manifest 指向旧 daily/ 路径
  // manifest 只用 dayArchives，不用 dailyArchives
  const finalizedD1Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-17')
  // 覆盖为 finalized
  storageObjects.set(finalizedD1Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-17',
    state: 'finalized',
    samples: [{ slotName: 'morning', temp: 22, humidity: 60, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 22 },
    dailyRollup: {
      date: '2026-06-17',
      quality: 'partial',
      sampleSummary: { sampleCount: 1, daylightSampleCount: 1, missingSlots: ['forenoon', 'noon', 'afternoon'] },
      lightFeatures: { daylightCloudMean: null, lowLightProxy: 'none' },
      moistureFeatures: { humidityMean: 60, precipLastHourSum: null, wetSoilRiskFromWeather: 'low' },
      tempFeatures: { tempMean: 22, tempMax: 22, heatStressLevel: 'low', coldStressLevel: 'low' },
      tempMin: 22,
      dominantWeatherText: ''
    },
    sourceKind: 'observed_now_rollup',
    quality: 'partial',
    weatherObjectPath: finalizedD1Path
  })

  // convertDayFileToDailyRecord: working 状态应返回 null
  const workingRecord = convertDayFileToDailyRecord(
    { state: 'working', dailyRollup: { date: '2026-06-17' } },
    '2026-06-17'
  )
  assert.equal(workingRecord, null, 'working 状态的 day file 不应被 convert 为 daily record')

  // convertDayFileToDailyRecord: finalized 状态应返回 record
  const finalizedPayload = storageObjects.get(finalizedD1Path)
  const finalizedRecord = convertDayFileToDailyRecord(finalizedPayload, '2026-06-17')
  assert.ok(finalizedRecord, 'finalized day file 应被 convert 为 daily record')
  assert.equal(finalizedRecord.date, '2026-06-17')
  assert.equal(finalizedRecord.sourceKind, 'observed_now_rollup')
  assert.equal(finalizedRecord.missing, false)
  assert.equal(finalizedRecord.tempMaxC, 22, '应从 tempFeatures.tempMax 提取')
  assert.equal(finalizedRecord.humidity, 60, '应从 moistureFeatures.humidityMean 提取')

  // 写 D0 今日 day file (working)，确保不进入 recent-10d
  const d0Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  storageObjects.set(d0Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-18',
    state: 'working',
    samples: [{ slotName: 'morning', temp: 25, humidity: 60, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 25 },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: d0Path
  })

  // 重建 recent-10d，targetDate = D-1 = 2026-06-17
  const ingestResult = await service.ingestRecentForecast({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai'
  })
  const recentPayload = ingestResult.recentPayload
  assert.ok(recentPayload, 'recentPayload should exist')

  const recentDates = recentPayload.historicalDays.map(d => d.date)
  assert.equal(recentDates.includes('2026-06-18'), false, 'D0 今日不得进入 recent-10d')
  assert.equal(recentDates.includes('2026-06-17'), true, 'D-1 finalized 应在 recent-10d 中')

  // recent-10d 中的 D-1 应来自 finalized day file，sourceKind=observed_now_rollup
  const d1Day = recentPayload.historicalDays.find(d => d.date === '2026-06-17')
  assert.equal(d1Day.sourceKind, 'observed_now_rollup')
  assert.equal(d1Day.missing, false)

  // === Blocker 4: /weather/current 缓存 miss 返回 200，不调用 QWeather ===
  storageObjects.clear()
  storageObjectsByFileId.clear()

  const weatherApp = require('../../cloudfunctions/weather-http/app.js')
  const missResponse = await weatherApp.main(
    {
      path: '/weather/current',
      method: 'POST',
      headers: {},
      query: {},
      body: { lat: 35.22, lng: 105.46, city: '无缓存地区' }
    },
    {}
  )
  assert.equal(missResponse.statusCode, 200, '缓存 miss 必须返回 200，不得 500')
  const missPayload = JSON.parse(missResponse.body)
  assert.equal(missPayload.data.weatherEvidenceInsufficient, true, 'miss 时应返回 weatherEvidenceInsufficient')
  assert.equal(missPayload.data.dailyWeatherCache.weatherEvidenceInsufficient, true)
  assert.equal(missPayload.data.dailyWeatherCache.cacheHit, false)

  // === Blocker 3: ingestRecentForecast 无 finalized day archives 时不崩溃 ===
  storageObjects.clear()
  storageObjectsByFileId.clear()

  const emptyIngest = await service.ingestRecentForecast({
    locationKey: 'city:nonexistent',
    cityName: '未知',
    latitude: 0,
    longitude: 0,
    timezone: 'Asia/Shanghai'
  })
  assert.ok(emptyIngest, 'ingestRecentForecast 应返回可控结果而非崩溃')
  assert.equal(emptyIngest.quality, 'missing')
  assert.equal(emptyIngest.recentFileId, '', '无 finalized archives 时 recentFileId 应为空')
  assert.ok(emptyIngest.recentPayload, 'recentPayload 仍应存在')

  // === 补充：只有旧 dailyArchives、无 dayArchives 时，ingest 不上传 recent ===
  storageObjects.clear()
  storageObjectsByFileId.clear()
  const legacyManifestPath = 'weather-cache/v1/locations/city:LegacyOnly/manifest.json'
  const legacyDailyPath = 'weather-cache/v1/locations/city:LegacyOnly/daily/2026-06-17.json'
  storageObjects.set(legacyManifestPath, {
    schemaVersion: 'weather-cache/v1/manifest',
    locationKey: 'city:LegacyOnly',
    rawSnapshots: [],
    dailyArchives: {
      '2026-06-17': { cloudPath: legacyDailyPath, fileId: '', generatedAt: 'now', quality: 'partial' }
    },
    updatedAt: 'now'
  })
  storageObjects.set(legacyDailyPath, {
    schemaVersion: 'weather-cache/v1/daily',
    date: '2026-06-17',
    sourceKind: 'qweather_forecast_10d_archive',
    quality: 'partial',
    daily: { date: '2026-06-17', tempMaxC: 28, humidity: 60, sourceKind: 'qweather_forecast_10d_archive' }
  })

  const legacyIngest = await service.ingestRecentForecast({
    locationKey: 'city:LegacyOnly',
    cityName: '旧数据',
    latitude: 31.23,
    longitude: 121.47,
    timezone: 'Asia/Shanghai'
  })
  assert.ok(legacyIngest, 'ingestRecentForecast 应返回可控结果')
  assert.equal(legacyIngest.quality, 'missing', '只有旧 dailyArchives 时 quality 应为 missing')
  assert.equal(legacyIngest.recentFileId, '', '只有旧 dailyArchives 时不得上传 recent 文件')
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:LegacyOnly/recent-10d.json'),
    false,
    '只有旧 dailyArchives 时不得写 recent-10d.json'
  )
  // recentPayload 中的 historicalDays 应全 missing，不得从旧 daily 读取数据
  const legacyDays = legacyIngest.recentPayload.historicalDays || []
  if (legacyDays.length) {
    const d1 = legacyDays.find(d => d.date === '2026-06-17')
    if (d1) {
      assert.equal(d1.missing, true, '旧 dailyArchives 不得作为 recent 聚合输入')
    }
  }
} finally {
  Module._load = originalLoad
  if (originalQWeatherApiKey === undefined) {
    delete process.env.QWEATHER_API_KEY
  } else {
    process.env.QWEATHER_API_KEY = originalQWeatherApiKey
  }
}

console.log('now-sample-blocker-coverage tests passed')
