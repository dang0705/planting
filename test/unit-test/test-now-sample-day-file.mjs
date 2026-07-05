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
  async deleteFile({ fileList }) {
    for (const fileID of fileList) {
      const payload = storageObjectsByFileId.get(fileID)
      if (payload) {
        for (const [path, p] of storageObjects) {
          if (p === payload) { storageObjects.delete(path) }
        }
        storageObjectsByFileId.delete(fileID)
      }
    }
    return { fileList: [] }
  }
}

// 模拟 QWeather /v7/weather/now 响应
let nowResponseIndex = 0
const nowResponses = [
  { temp: '24', humidity: '65', text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' },
  { temp: '28', humidity: '55', text: '多云', obsTime: '2026-06-18T12:30:00+08:00', source: 'qweather_weather_now' },
  { temp: '31', humidity: '50', text: '晴', obsTime: '2026-06-18T14:30:00+08:00', source: 'qweather_weather_now' },
  { temp: '26', humidity: '60', text: '多云', obsTime: '2026-06-18T18:30:00+08:00', source: 'qweather_weather_now' }
]

Module._load = function patchedNowSampleLoad(request, parent, isMain) {
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
  // 拦截 qweather-adapter，模拟 /v7/weather/now
  if (request === '../adapters/qweather-adapter' || request === './adapters/qweather-adapter') {
    return {
      createQWeatherAdapter: () => ({
        async fetchCurrentWeather() {
          const data = nowResponses[nowResponseIndex % nowResponses.length]
          nowResponseIndex += 1
          return {
            tempC: Number(data.temp),
            humidity: Number(data.humidity),
            text: data.text,
            obsTime: data.obsTime,
            source: data.source
          }
        },
        async fetchForecast10d() { return { raw: {}, daily: [] } },
        async fetchWeather24h() { return { raw: {}, hourly: [] } }
      })
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const { buildWeatherDayObjectPath } = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
  const {
    buildDailyRollup,
    buildWeatherNowSample,
    resolveDayFileQuality
  } = require('../../cloudfunctions/weather-http/services/d0-now-sample-service.js')
  const { createRecentWeatherService } = require('../../cloudfunctions/weather-http/services/recent-weather-service.js')
  const { convertDayFileToDailyRecord } = require('../../cloudfunctions/weather-http/services/recent-weather-archive.js')

  const fixedNow = new Date('2026-06-18T13:00:00+08:00')
  const service = createRecentWeatherService({
    apiKey: 'test-key',
    baseUrl: 'https://test.qweatherapi.com',
    now: () => fixedNow
  })

  // === 1. buildWeatherNowSample: 字段缺失不造假 ===
  const minimalSample = buildWeatherNowSample({
    slotName: 'morning',
    sampledAt: '2026-06-18T09:30:00+08:00',
    nowData: { temp: '24', humidity: '65' }
  })
  assert.equal(minimalSample.slotName, 'morning')
  assert.equal(minimalSample.temp, 24)
  assert.equal(minimalSample.humidity, 65)
  assert.equal(minimalSample.sourceKind, 'weather_now_sample')
  assert.equal(minimalSample.precipLastHour, undefined, '缺失字段不造假')
  assert.equal(minimalSample.cloud, undefined)
  assert.equal(minimalSample.windSpeed, undefined)
  assert.equal(minimalSample.text, undefined, '空 text 被 pruneUndefined 移除')

  // === 2. resolveDayFileQuality ===
  assert.equal(resolveDayFileQuality([]), 'missing')
  assert.equal(resolveDayFileQuality([{}]), 'partial')
  assert.equal(resolveDayFileQuality([{}, {}, {}]), 'complete')

  // === 3. D0 working: 采样追加 + latestSample 更新 ===
  const dayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')

  const sample1 = await service.sampleNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18',
    slotName: 'morning'
  })
  assert.equal(sample1.finalized, false)
  assert.equal(sample1.slotName, 'morning')
  assert.equal(sample1.dayObjectPath, dayPath)
  assert.equal(storageObjects.has(dayPath), true)

  let dayFile = storageObjects.get(dayPath)
  assert.equal(dayFile.state, 'working')
  assert.equal(dayFile.samples.length, 1)
  assert.equal(dayFile.latestSample.slotName, 'morning')
  assert.equal(dayFile.latestSample.temp, 24)
  assert.equal(dayFile.sourceKind, 'observed_now_samples')

  // 第二次采样：追加 sample，更新 latestSample
  await service.sampleNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18',
    slotName: 'forenoon'
  })
  dayFile = storageObjects.get(dayPath)
  assert.equal(dayFile.samples.length, 2)
  assert.equal(dayFile.samples[0].slotName, 'morning')
  assert.equal(dayFile.samples[1].slotName, 'forenoon')
  assert.equal(dayFile.latestSample.slotName, 'forenoon')
  assert.equal(dayFile.latestSample.temp, 28)
  assert.equal(dayFile.state, 'working')

  // 第三次采样
  await service.sampleNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18',
    slotName: 'noon'
  })
  dayFile = storageObjects.get(dayPath)
  assert.equal(dayFile.samples.length, 3)
  assert.equal(dayFile.quality, 'complete', '3 samples → complete')

  // === 4. D0 finalize: dailyRollup + state=finalized ===
  const finalizeResult = await service.finalizeNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18'
  })
  assert.equal(finalizeResult.finalized, true)
  assert.equal(finalizeResult.dailyRollup.date, '2026-06-18')
  assert.equal(finalizeResult.dailyRollup.sampleSummary.sampleCount, 3)
  assert.ok(finalizeResult.dailyRollup.lightFeatures, 'lightFeatures should exist')
  assert.ok(finalizeResult.dailyRollup.moistureFeatures, 'moistureFeatures should exist')
  assert.ok(finalizeResult.dailyRollup.tempFeatures, 'tempFeatures should exist')
  assert.ok(finalizeResult.dailyRollup.tempFeatures.tempMax !== null, 'tempMax should exist')
  assert.ok(finalizeResult.dailyRollup.moistureFeatures.humidityMean !== null, 'humidityMean should exist')

  dayFile = storageObjects.get(dayPath)
  assert.equal(dayFile.state, 'finalized')
  assert.equal(dayFile.sourceKind, 'observed_now_rollup')
  assert.equal(dayFile.dailyRollup.date, '2026-06-18')
  assert.ok(dayFile.finalizedAt, 'finalizedAt should be set')
  assert.ok(dayFile.dailyRollup.tempFeatures.tempMean !== null, 'rollup tempMean should exist')
  assert.ok(dayFile.dailyRollup.moistureFeatures.humidityMean !== null)

  // === 5. convertDayFileToDailyRecord: finalized day → historicalDay ===
  const dailyRecord = convertDayFileToDailyRecord(dayFile, '2026-06-18')
  assert.equal(dailyRecord.date, '2026-06-18')
  assert.equal(dailyRecord.sourceKind, 'observed_now_rollup')
  assert.equal(dailyRecord.missing, false)
  assert.ok(dailyRecord.tempMaxC !== null)

  // 未 finalize 的 day file 不应转换
  const workingDayFile = { ...dayFile, state: 'working', dailyRollup: null }
  assert.equal(convertDayFileToDailyRecord(workingDayFile, '2026-06-18'), null)

  // === 6. recent-10d 排除 D0 今日 ===
  // 写入一个 D-1 finalized day file
  const d1Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-17')
  storageObjects.set(d1Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-17',
    state: 'finalized',
    samples: [{ slotName: 'morning', temp: 22, humidity: 60, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 22 },
    dailyRollup: {
      date: '2026-06-17',
      quality: 'partial',
      sampleCount: 1,
      temp: 22,
      humidity: 60,
      text: '晴'
    },
    sourceKind: 'observed_now_rollup',
    quality: 'partial',
    weatherObjectPath: d1Path
  })

  // 用 ingestRecentForecast 重建 recent-10d
  const ingestResult = await service.ingestRecentForecast({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai'
  })
  const recentPayload = ingestResult.recentPayload
  assert.ok(recentPayload, 'recentPayload should exist')
  assert.ok(recentPayload.historicalDays.length > 0, 'should have historical days from finalized D-1')

  // D0 今日 (2026-06-18) 的 day file 是 finalized，但 targetDate = D-1 = 2026-06-17
  // buildDateRangeEndingAt(2026-06-17, 10) = 2026-06-08..2026-06-17
  // 所以 D0 (06-18) 不在范围内
  const recentDates = recentPayload.historicalDays.map(d => d.date)
  assert.equal(recentDates.includes('2026-06-18'), false, 'D0 today must not be in recent-10d')
  assert.equal(recentDates.includes('2026-06-17'), true, 'D-1 finalized should be in recent-10d')

  // === 7. 当前天气从 latestSample 读，不触发 QWeather ===
  nowResponseIndex = 0 // 重置计数
  const currentResult = await service.getCurrentWeatherFromDailyArchive({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    useCache: true
  })
  assert.ok(currentResult.weatherData, 'should have weatherData from latestSample')
  assert.equal(currentResult.dailyWeatherCache.cacheHit, true)
  assert.equal(currentResult.dailyWeatherCache.reason, 'day_latest_sample_present')
  assert.equal(currentResult.weatherData.sourceKind, 'weather_now_sample')
  // nowResponseIndex 不应增加（不调用 QWeather）
  assert.equal(nowResponseIndex, 0, 'current weather must not call QWeather')

  // === 8. 缓存 miss: 无 day file 时返回 evidence insufficient ===
  storageObjects.clear()
  storageObjectsByFileId.clear()
  const missResult = await service.getCurrentWeatherFromDailyArchive({
    locationKey: 'city:nonexistent',
    cityName: '未知',
    latitude: 0,
    longitude: 0,
    timezone: 'Asia/Shanghai',
    useCache: true
  })
  assert.equal(missResult.weatherData, null)
  assert.equal(missResult.dailyWeatherCache.cacheHit, false)
  assert.equal(missResult.dailyWeatherCache.weatherEvidenceInsufficient, true)
  assert.equal(nowResponseIndex, 0, 'cache miss must not call QWeather')

  // === 9. buildDailyRollup: 空 samples ===
  const emptyRollup = buildDailyRollup({ samples: [], sunWindow: {}, date: '2026-06-18', generatedAt: 'now' })
  assert.equal(emptyRollup.quality, 'missing')
  assert.equal(emptyRollup.sampleSummary.sampleCount, 0)

  // === 10. D0 day file 真实存在且 latestSample 存在，对象存储冷读 >250ms 但 <600ms 默认预算时仍应命中 ===
  const {
    createCurrentWeatherArchiveService
  } = require('../../cloudfunctions/weather-http/services/recent-weather-current.js')
  const coldReadD0Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  const coldReadD0Payload = {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-18',
    state: 'working',
    samples: [{ slotName: 'morning', temp: 26, humidity: 60, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 26, humidity: 60, sourceKind: 'weather_now_sample' },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: coldReadD0Path
  }
  const coldReadArchiveService = createCurrentWeatherArchiveService({
    storage: {
      async downloadJson({ cloudPath } = {}) {
        if (cloudPath === coldReadD0Path) {
          // 真实冷读耗时：超过旧 250ms 默认预算，但落在新 600ms 主读默认预算内
          await new Promise(resolve => setTimeout(resolve, 320))
          return coldReadD0Payload
        }
        return null
      }
    },
    now: () => fixedNow,
    resolveLocationInput: (input = {}) => ({
      locationKey: input.locationKey,
      timezone: input.timezone || 'Asia/Shanghai'
    })
  })
  const coldReadStartedAt = Date.now()
  const coldReadResult = await coldReadArchiveService.getCurrentWeatherFromDailyArchive({
    locationKey: 'city:shanghai',
    timezone: 'Asia/Shanghai',
    useCache: true
  })
  const coldReadElapsed = Date.now() - coldReadStartedAt
  assert.ok(
    coldReadResult.weatherData,
    '冷读 320ms（<600ms 默认预算）应命中 latestSample，不得误判为 miss'
  )
  assert.equal(coldReadResult.dailyWeatherCache.cacheHit, true)
  assert.equal(coldReadResult.dailyWeatherCache.reason, 'day_latest_sample_present')
  assert.equal(coldReadResult.weatherData.temperature, 26)
  assert.ok(coldReadElapsed >= 300, '应真实等待冷读完成，而非在旧 250ms 默认预算上提前超时')
  assert.ok(coldReadElapsed < 600, '应在新的主读默认预算内完成，不应触发超时')

  // === 11. D0 冷读慢于初始 600ms 主读窗口但快于默认有界 grace 总预算（1500ms），无 fallback 命中时应经 grace 命中 ===
  const graceHitD0Payload = {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-18',
    state: 'working',
    samples: [{ slotName: 'morning', temp: 27, humidity: 58, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 27, humidity: 58, sourceKind: 'weather_now_sample' },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: coldReadD0Path
  }
  const graceHitArchiveService = createCurrentWeatherArchiveService({
    storage: {
      async downloadJson({ cloudPath } = {}) {
        if (cloudPath === coldReadD0Path) {
          // 冷读尖峰：超过初始 600ms 主读窗口，但落在默认有界 grace 总预算（1500ms）内（复用同一 in-flight 读取，不重发下载）
          await new Promise(resolve => setTimeout(resolve, 900))
          return graceHitD0Payload
        }
        // D-1..D-7 finalized day file 均不存在，无 fallback 命中
        return null
      }
    },
    now: () => fixedNow,
    resolveLocationInput: (input = {}) => ({
      locationKey: input.locationKey,
      timezone: input.timezone || 'Asia/Shanghai'
    })
  })
  const graceHitStartedAt = Date.now()
  const graceHitResult = await graceHitArchiveService.getCurrentWeatherFromDailyArchive({
    locationKey: 'city:shanghai',
    timezone: 'Asia/Shanghai',
    useCache: true
  })
  const graceHitElapsed = Date.now() - graceHitStartedAt
  assert.ok(
    graceHitResult.weatherData,
    '冷读尖峰 900ms（>600ms 初始窗口、<1500ms grace 总预算）应经 grace 命中 latestSample'
  )
  assert.equal(graceHitResult.dailyWeatherCache.cacheHit, true)
  assert.equal(graceHitResult.dailyWeatherCache.reason, 'day_latest_sample_present')
  assert.equal(graceHitResult.weatherData.temperature, 27)
  assert.ok(graceHitElapsed >= 800, '应真实等待冷读尖峰完成，不得在初始 600ms 窗口提前误判 miss')
  assert.ok(graceHitElapsed < 1500, '应在默认有界 grace 总预算内完成，不得无界等待')

  // === 12. D0 冷读慢于默认有界 grace 总预算（1500ms），无 fallback 命中时应返回有界超时 miss reason ===
  const graceTimeoutArchiveService = createCurrentWeatherArchiveService({
    storage: {
      async downloadJson({ cloudPath } = {}) {
        if (cloudPath === coldReadD0Path) {
          // 冷读远超默认有界 grace 总预算：grace 也应超时，不得无界等待
          await new Promise(resolve => setTimeout(resolve, 1600))
          return graceHitD0Payload
        }
        return null
      }
    },
    now: () => fixedNow,
    resolveLocationInput: (input = {}) => ({
      locationKey: input.locationKey,
      timezone: input.timezone || 'Asia/Shanghai'
    })
  })
  const graceTimeoutStartedAt = Date.now()
  const graceTimeoutResult = await graceTimeoutArchiveService.getCurrentWeatherFromDailyArchive({
    locationKey: 'city:shanghai',
    timezone: 'Asia/Shanghai',
    useCache: true
  })
  const graceTimeoutElapsed = Date.now() - graceTimeoutStartedAt
  assert.equal(graceTimeoutResult.weatherData, null, '冷读超过 grace 总预算应返回 weatherData=null')
  assert.equal(graceTimeoutResult.dailyWeatherCache.cacheHit, false)
  assert.equal(graceTimeoutResult.dailyWeatherCache.weatherEvidenceInsufficient, true)
  assert.equal(
    graceTimeoutResult.dailyWeatherCache.reason,
    'day_latest_sample_read_timeout',
    '冷读超过 grace 总预算且无 fallback 命中时应返回有界超时 miss reason'
  )
  assert.ok(graceTimeoutElapsed >= 1400, '应等待到默认有界 grace 总预算再判超时')
  assert.ok(graceTimeoutElapsed < 1850, 'grace 超时应有界，不得无界等待慢存储完成')
} finally {
  Module._load = originalLoad
}

console.log('now-sample-day-file tests passed')

// === Blocker 5 追加测试 ===

// 5a. dailyRollup 嵌套结构完整性
const {
  buildDailyRollup: _bdr
} = require('../../cloudfunctions/weather-http/services/d0-now-sample-service.js')

const nestedSamples = [
  { slotName: 'morning', temp: 24, humidity: 65, precipLastHour: 0, cloud: 20, windSpeed: 8, text: '晴', sourceKind: 'weather_now_sample' },
  { slotName: 'forenoon', temp: 28, humidity: 55, precipLastHour: 0.2, cloud: 40, windSpeed: 12, text: '多云', sourceKind: 'weather_now_sample' },
  { slotName: 'noon', temp: 31, humidity: 50, precipLastHour: 0, cloud: 10, windSpeed: 16, text: '晴', sourceKind: 'weather_now_sample' },
  { slotName: 'afternoon', temp: 26, humidity: 60, precipLastHour: 0.5, cloud: 30, windSpeed: 18, text: '多云', sourceKind: 'weather_now_sample' }
]
const nestedRollup = _bdr({ samples: nestedSamples, sunWindow: { sunrise: '2026-06-18T06:00:00+08:00', sunset: '2026-06-18T18:00:00+08:00' }, date: '2026-06-18', generatedAt: 'now' })

assert.equal(nestedRollup.quality, 'complete')
assert.ok(nestedRollup.sampleSummary, 'sampleSummary must exist')
assert.equal(nestedRollup.sampleSummary.sampleCount, 4)
assert.equal(nestedRollup.sampleSummary.daylightSampleCount, 4)
assert.deepEqual(nestedRollup.sampleSummary.missingSlots, ['sunrise', 'sunset'])

assert.ok(nestedRollup.lightFeatures, 'lightFeatures must exist')
assert.ok(nestedRollup.lightFeatures.daylightCloudMean !== null)
assert.ok(nestedRollup.lightFeatures.daylightCloudP75 !== null)
assert.ok(nestedRollup.lightFeatures.daylightCloudMax !== null)
assert.ok(['none', 'low', 'medium', 'high'].includes(nestedRollup.lightFeatures.lowLightProxy))

assert.ok(nestedRollup.moistureFeatures, 'moistureFeatures must exist')
assert.ok(nestedRollup.moistureFeatures.humidityMean !== null)
assert.ok(nestedRollup.moistureFeatures.precipLastHourSum !== null)
assert.ok(['none', 'low', 'medium', 'high'].includes(nestedRollup.moistureFeatures.wetSoilRiskFromWeather))

assert.ok(nestedRollup.tempFeatures, 'tempFeatures must exist')
assert.ok(nestedRollup.tempFeatures.tempMean !== null)
assert.equal(nestedRollup.tempFeatures.tempMax, 31)
assert.ok(['none', 'low', 'medium', 'high'].includes(nestedRollup.tempFeatures.heatStressLevel))
assert.ok(['none', 'low', 'medium', 'high'].includes(nestedRollup.tempFeatures.coldStressLevel))

// 5b. 缺失 slot 时 missingSlots 正确
const partialSamples = [
  { slotName: 'morning', temp: 24, humidity: 65, sourceKind: 'weather_now_sample' },
  { slotName: 'noon', temp: 31, humidity: 50, sourceKind: 'weather_now_sample' }
]
const partialRollup = _bdr({ samples: partialSamples, sunWindow: {}, date: '2026-06-18', generatedAt: 'now' })
assert.equal(partialRollup.sampleSummary.sampleCount, 2)
assert.equal(partialRollup.sampleSummary.daylightSampleCount, 2)
assert.deepEqual(partialRollup.sampleSummary.missingSlots, ['sunrise', 'forenoon', 'afternoon', 'sunset'])

console.log('now-sample-day-file tests passed (with nested rollup coverage)')
