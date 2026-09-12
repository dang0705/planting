import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// ===== mock 对象存储 =====
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
  },
  async getUploadMetadata({ cloudPath }) {
    if (storageObjects.has(cloudPath)) {
      return { data: { fileId: `cloud://${cloudPath}` } }
    }
    throw buildMissingStorageError()
  },
  async deleteFile({ fileList }) {
    for (const fileID of fileList) {
      const payload = storageObjectsByFileId.get(fileID)
      if (payload) {
        for (const [path, p] of storageObjects) {
          if (p === payload) {
            storageObjects.delete(path)
          }
        }
        storageObjectsByFileId.delete(fileID)
      }
    }
    return { fileList: [] }
  }
}

Module._load = function patchedRecentWeatherRoutesLoad(request, parent, isMain) {
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
  return originalLoad.call(this, request, parent, isMain)
}

function buildRecent10dPayload({ locationKey, diagnosisDate, historicalDays }) {
  return {
    schemaVersion: 'weather-cache/v1/recent-10d',
    locationKey,
    generatedAt: `${diagnosisDate}T12:00:00+08:00`,
    weatherObjectPath: `weather-cache/v1/locations/${locationKey}/recent-10d.json`,
    sourceKind: 'weather_cache_recent_10d',
    quality: 'partial',
    historicalDays,
    meta: {
      sourceKind: 'weather_cache_recent_10d',
      quality: 'partial',
      diagnosisDate,
      recordCounts: {
        historicalDays: historicalDays.length,
        forecastDays: 0,
        totalDailyRecords: historicalDays.length
      }
    }
  }
}

function buildHistoricalDay({ date, tempMaxC = 26, tempMinC = 18 }) {
  return {
    date,
    tempMaxC,
    tempMinC,
    humidity: 60,
    precipMm: 0,
    textDay: '多云',
    source: 'qweather_historical_weather',
    sourceKind: 'qweather_historical_weather',
    missing: false
  }
}

function buildDayFilePayload({ locationKey, date, temp = 25, humidity = 55 }) {
  return {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey,
    date,
    state: 'working',
    samples: [
      {
        slotName: 'morning',
        temp,
        humidity,
        text: '晴',
        sourceKind: 'weather_now_sample'
      }
    ],
    latestSample: {
      slotName: 'morning',
      temp,
      humidity,
      text: '晴',
      obsTime: `${date}T09:30:00+08:00`,
      sampledAt: `${date}T09:30:00+08:00`,
      sourceKind: 'weather_now_sample'
    },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: `weather-cache/v1/locations/${locationKey}/days/${date}.json`
  }
}

try {
  const {
    buildWeatherDayObjectPath,
    buildRecentWeatherObjectPath
  } = require('../../../../../cloudfunctions/weather-http/services/weather-cache-paths.js')
  const {
    createRecentWeatherService
  } = require('../../../../../cloudfunctions/weather-http/services/recent-weather-service.js')
  const {
    buildDiagnosisRecentWeatherWindow
  } = require('../../../../../cloudfunctions/weather-http/routes/recent-weather-routes.js')
  const {
    buildEnvironmentWeatherWindowByMode
  } = require('../../../../../cloudfunctions/weather-http/app.js')

  const fixedNow = new Date('2026-07-25T13:00:00+08:00')
  const locationKey = 'city:shanghai'
  const diagnosisDate = '2026-07-25'
  const recentPath = buildRecentWeatherObjectPath(locationKey)
  const dayPath = buildWeatherDayObjectPath(locationKey, diagnosisDate)

  // ===== 1. 诊断模式 + D0 latestSample 与 D-10..D-1 recent-10d 分层命中 =====
  storageObjects.clear()
  storageObjectsByFileId.clear()
  const historicalDays = Array.from({ length: 10 }, (_, index) => {
    const d = new Date(`${diagnosisDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() - (index + 1))
    return buildHistoricalDay({ date: d.toISOString().slice(0, 10) })
  })
  storageObjects.set(
    recentPath,
    buildRecent10dPayload({ locationKey, diagnosisDate, historicalDays })
  )
  storageObjects.set(
    dayPath,
    buildDayFilePayload({ locationKey, date: diagnosisDate, temp: 27, humidity: 58 })
  )

  const service = createRecentWeatherService({
    apiKey: 'test-key',
    baseUrl: 'https://test.qweatherapi.com',
    now: () => fixedNow
  })

  const hitResult = await buildDiagnosisRecentWeatherWindow({
    payload: { locationKey, diagnosisDate, timezone: 'Asia/Shanghai' },
    service
  })

  assert.ok(hitResult.currentWeather, 'day file 命中时 currentWeather 应非 null')
  assert.equal(typeof hitResult.currentWeather, 'object')
  assert.equal(
    hitResult.currentWeather.temperature,
    27,
    'currentWeather.temperature 应来自 latestSample.temp'
  )
  assert.equal(hitResult.currentWeather.weather, '晴')
  assert.equal(hitResult.currentWeather.source, 'weather_cache_day_latest_sample')
  assert.equal(hitResult.currentWeather.cacheSource, 'day_latest_sample')
  assert.equal(hitResult.todayWeatherSource, 'day_latest_sample')
  assert.equal(hitResult.todayWeatherReason, 'day_latest_sample_present')
  assert.ok(Array.isArray(hitResult.historicalDays), 'historicalDays 仍为数组')
  assert.equal(
    hitResult.historicalDays.length,
    10,
    'historicalDays 仍来自 recent-10d.json（10 项）'
  )
  assert.equal(
    hitResult.historicalDays.some(day => day.date === diagnosisDate),
    false,
    'D0 latestSample 不得进入 historicalDays'
  )
  assert.equal(hitResult.meta.mode, 'diagnosis')
  assert.equal(hitResult.meta.diagnosisDate, diagnosisDate)

  // ===== 2. 诊断模式 + day file 缺失 =====
  storageObjects.delete(dayPath)
  const missResult = await buildDiagnosisRecentWeatherWindow({
    payload: { locationKey, diagnosisDate, timezone: 'Asia/Shanghai' },
    service
  })

  assert.equal(missResult.currentWeather, null, 'day file 缺失时 currentWeather=null')
  assert.equal(missResult.todayWeatherSource, 'missing')
  assert.equal(missResult.todayWeatherReason, 'day_latest_sample_missing')
  assert.equal(missResult.historicalDays.length, 10, 'historicalDays 不受 day file 缺失影响')
  assert.ok(!missResult.forecastDays, '诊断模式不应返回 forecastDays')

  // ===== 3. 诊断模式 + day file finalized rollup fallback =====
  // D0 day file 无 latestSample，D-1 day file 为 finalized → 仅允许已有降级回退
  storageObjects.clear()
  storageObjectsByFileId.clear()
  storageObjects.set(
    recentPath,
    buildRecent10dPayload({ locationKey, diagnosisDate, historicalDays })
  )
  const d1Date = '2026-07-24'
  const d1Path = buildWeatherDayObjectPath(locationKey, d1Date)
  storageObjects.set(d1Path, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey,
    date: d1Date,
    state: 'finalized',
    samples: [{ slotName: 'morning', temp: 24, humidity: 62, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: 24 },
    dailyRollup: {
      date: d1Date,
      quality: 'partial',
      temp: 24,
      humidity: 62,
      text: '多云',
      tempMax: 26,
      tempMin: 20
    },
    sourceKind: 'observed_now_rollup',
    quality: 'partial',
    weatherObjectPath: d1Path
  })

  const fallbackResult = await buildDiagnosisRecentWeatherWindow({
    payload: { locationKey, diagnosisDate, timezone: 'Asia/Shanghai' },
    service
  })

  assert.equal(fallbackResult.currentWeather, null, '旧日期 finalized rollup 不得冒充今天')
  assert.equal(fallbackResult.todayWeatherSource, 'missing')
  assert.equal(fallbackResult.todayWeatherReason, 'day_latest_sample_missing')
  assert.equal(fallbackResult.todayWeatherFallbackDate, d1Date)

  // ===== 4. buildEnvironmentWeatherWindowByMode: 诊断模式保留 currentWeather、omit forecastDays =====
  const diagnosisWindow = {
    historicalDays,
    historical_days: historicalDays,
    currentWeather: { temperature: 25, weather: '晴' },
    todayWeatherSource: 'day_latest_sample',
    todayWeatherReason: 'day_latest_sample_present',
    forecastDays: [{ date: '2026-07-26', tempMaxC: 30 }],
    forecast_days: [{ date: '2026-07-26', tempMaxC: 30 }],
    daily: [{ date: '2026-07-26' }],
    dailyRecords: [{ date: '2026-07-26' }],
    meta: {
      sourceKind: 'weather_cache_recent_10d',
      recordCounts: { historicalDays: 10, forecastDays: 1, totalDailyRecords: 11 }
    }
  }

  const diagnosisResponse = buildEnvironmentWeatherWindowByMode(diagnosisWindow, 'diagnosis')
  assert.ok(diagnosisResponse.currentWeather, '诊断模式应保留 currentWeather')
  assert.equal(diagnosisResponse.currentWeather.temperature, 25)
  assert.equal(diagnosisResponse.todayWeatherSource, 'day_latest_sample')
  assert.equal(diagnosisResponse.todayWeatherReason, 'day_latest_sample_present')
  assert.ok(!('forecastDays' in diagnosisResponse), '诊断模式应 omit forecastDays')
  assert.ok(!('forecast_days' in diagnosisResponse), '诊断模式应 omit forecast_days')
  assert.ok(!('daily' in diagnosisResponse), '诊断模式应 omit daily')
  assert.ok(!('dailyRecords' in diagnosisResponse), '诊断模式应 omit dailyRecords')
  assert.ok(!('historical_days' in diagnosisResponse), '诊断模式应 omit historical_days（legacy）')
  assert.equal(diagnosisResponse.historicalDays.length, 10)
  assert.equal(
    diagnosisResponse.meta.recordCounts.forecastDays,
    0,
    'recordCounts.forecastDays 强制为 0'
  )
  assert.equal(diagnosisResponse.meta.recordCounts.historicalDays, 10)

  // ===== 5. 非诊断模式（mode=environment）行为不变：原样返回 =====
  const envWindow = {
    historicalDays,
    forecastDays: [{ date: '2026-07-26', tempMaxC: 30 }],
    currentWeather: { temperature: 25 },
    meta: { sourceKind: 'qweather', recordCounts: { historicalDays: 10, forecastDays: 15 } }
  }
  const envResponse = buildEnvironmentWeatherWindowByMode(envWindow, 'environment')
  assert.deepEqual(envResponse, envWindow, '非诊断模式应原样返回，不做 omit')

  // ===== 6. 非诊断模式空 mode 行为不变 =====
  const emptyModeResponse = buildEnvironmentWeatherWindowByMode(envWindow, '')
  assert.deepEqual(emptyModeResponse, envWindow, '空 mode 应原样返回')

  // ===== 7. locationKey 缺失时 currentWeather=null，todayWeatherSource=missing =====
  const noKeyResult = await buildDiagnosisRecentWeatherWindow({
    payload: { diagnosisDate, timezone: 'Asia/Shanghai' },
    service
  })
  assert.equal(noKeyResult.currentWeather, null, 'locationKey 缺失时 currentWeather=null')
  assert.equal(noKeyResult.todayWeatherSource, 'missing')

  // ===== 8. 独立诊断未传日期时，路由以地点时区的 D0 作为历史窗口校正锚点 =====
  let defaultDateReaderInput = null
  const defaultDateResult = await buildDiagnosisRecentWeatherWindow({
    payload: { locationKey, timezone: 'Asia/Shanghai' },
    service: {
      async readRecentWeatherForDiagnosis(input) {
        defaultDateReaderInput = input
        return {
          historicalDays: [],
          meta: { sourceKind: 'weather_cache_recent_10d' },
          weatherEvidenceInsufficient: true
        }
      },
      async getCurrentWeatherFromDailyArchive() {
        return { weatherData: null, dailyWeatherCache: { reason: 'day_latest_sample_missing' } }
      }
    },
    now: () => fixedNow
  })
  assert.equal(defaultDateReaderInput.diagnosisDate, diagnosisDate)
  assert.equal(defaultDateResult.meta.diagnosisDate, diagnosisDate)

  // ===== 9. recent-10d 与 D0 必须并行读取，且默认不在用户请求中同步重建 =====
  let recentReaderInput = null
  let currentReaderInput = null
  let recentStartedAt = 0
  let currentStartedAt = 0
  const timingMarks = []
  const parallelStartedAt = Date.now()
  const parallelResult = await buildDiagnosisRecentWeatherWindow({
    payload: { locationKey, diagnosisDate, timezone: 'Asia/Shanghai' },
    service: {
      async readRecentWeatherForDiagnosis(input) {
        recentReaderInput = input
        recentStartedAt = Date.now()
        await delay(180)
        return {
          historicalDays,
          meta: { sourceKind: 'weather_cache_recent_10d', quality: 'partial' },
          quality: 'partial'
        }
      },
      async getCurrentWeatherFromDailyArchive(input) {
        currentReaderInput = input
        currentStartedAt = Date.now()
        await delay(180)
        return {
          weatherData: {
            temperature: 28,
            weatherDate: diagnosisDate,
            source: 'weather_cache_day_latest_sample'
          },
          dailyWeatherCache: {
            reason: 'day_latest_sample_present',
            targetDate: diagnosisDate
          }
        }
      }
    },
    onTimingMark(stage, details) {
      timingMarks.push({ stage, details })
    }
  })
  assert.ok(
    Date.now() - parallelStartedAt < 320,
    'recent-10d 与 D0 读取应并行，而不是等待两条 180ms 链路之和'
  )
  assert.ok(Math.abs(recentStartedAt - currentStartedAt) < 80, '两条缓存读取应在同一请求阶段启动')
  assert.equal(recentReaderInput.allowArchiveRebuild, false)
  assert.equal(recentReaderInput.readTimeoutMs, 700)
  assert.equal(currentReaderInput.readTimeoutMs, 700)
  assert.equal(parallelResult.currentWeather.weatherDate, diagnosisDate)
  assert.deepEqual(
    timingMarks.map(item => item.stage),
    [
      'weather-cache-window-start',
      'weather-cache-recent-ready',
      'weather-cache-current-ready',
      'weather-cache-window-ready'
    ]
  )
} finally {
  Module._load = originalLoad
}

console.log('recent-weather-routes tests passed')
