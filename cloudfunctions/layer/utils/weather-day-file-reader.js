'use strict'

// 共享 day file 读取与 latestSample 转 dailyRecord 工具。从 weather-http/services/recent-weather-current.js 下沉到 layer。
// 本文件自包含路径构造器与日期工具，避免 layer → weather-http 循环依赖；
// weather-ingestion-scheduler 维持自身 services/recent-weather-current.js 副本，不依赖本文件。
//
// 本文件同时导出 latestSampleToDailyRecord：把 D0 day file 的 latestSample 转换为 dailyRecord，
// 用于浇水 planner 三个入口（diagnose-http / plant-user-http /watering-planner / /watering-advisor）
// 在 buildWeatherSummary 迭代前注入 D0。

// ===== 内联路径构造器（从 weather-http/services/weather-cache-paths.js 的最小子集） =====
const INVALID_LOCATION_KEY_CHARS = /[^a-zA-Z0-9:_-]/g

function normalizePathSegment(value = '', fallback = 'unknown') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '_')
    .replace(INVALID_LOCATION_KEY_CHARS, '')
    .slice(0, 96)
  return normalized || fallback
}

function normalizeLocationKey(value = '') {
  return normalizePathSegment(value, '')
}

function buildWeatherLocationBasePath(locationKey = '') {
  const safeLocationKey = normalizeLocationKey(locationKey)
  if (!safeLocationKey) {
    throw new Error('缺少天气地点 locationKey')
  }
  return `weather-cache/v1/locations/${safeLocationKey}`
}

function buildWeatherDayObjectPath(locationKey = '', date = '') {
  const safeDate = String(date || '')
    .trim()
    .slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('天气 day 对象路径缺少合法日期')
  }
  return `${buildWeatherLocationBasePath(locationKey)}/days/${safeDate}.json`
}

function buildRecentWeatherObjectPath(locationKey = '') {
  return `${buildWeatherLocationBasePath(locationKey)}/recent-10d.json`
}

// ===== 内联日期工具（从 weather-http/services/recent-weather-features.js 的最小子集） =====
function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return new Date().toISOString().slice(0, 10)
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) {
    return raw.slice(0, 10)
  }
  return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-')
}

function addDays(dateText = '', offset = 0) {
  const date = new Date(`${normalizeDate(dateText)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function formatLocalDateInTimezone(now = new Date(), timezone = 'Asia/Shanghai') {
  const date = now instanceof Date ? now : new Date(now)
  const resolvedTimezone = String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolvedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return `${partMap.year}-${partMap.month}-${partMap.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// ===== 通用工具 =====
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 主读 D0 day file 的初始默认读取预算：覆盖对象存储常规冷读（实测 D0 首次约 305ms、后续 184-198ms）。
const DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 600
const DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 250
const DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS = 1500
const MAX_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 2000

function normalizeTimeoutMs(value, fallback = DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }
  return Math.min(MAX_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS, Math.trunc(numeric))
}

function buildTimeoutResult(timeoutMs) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  })
}

async function downloadJsonWithTimeout(storage, input = {}, timeoutMs) {
  return Promise.race([
    storage
      .downloadJson(input)
      .catch(() => null)
      .then(payload => ({ payload, timedOut: false })),
    buildTimeoutResult(timeoutMs)
  ])
}

function startStorageRead(storage, input = {}) {
  const startedAt = Date.now()
  const settled = storage
    .downloadJson(input)
    .catch(() => null)
    .then(payload => ({ payload, timedOut: false }))

  function raceWith(deadlineMs) {
    const remaining = Math.max(0, Math.trunc(deadlineMs - (Date.now() - startedAt)))
    return Promise.race([
      settled,
      buildTimeoutResult(remaining).then(() => ({ payload: null, timedOut: true }))
    ])
  }

  return { raceWith }
}

function buildCurrentWeatherDataFromLatestSample({ sample = {}, cacheSource = '' } = {}) {
  const temperature = sample.temp ?? 0
  return {
    temperature,
    humidity: sample.humidity ?? 0,
    weather: sample.text || '未知',
    feelsLike: temperature,
    windDir: '',
    windScale: '',
    windSpeed: sample.windSpeed ?? '',
    pressure: '',
    visibility: '',
    updateTime: sample.obsTime || sample.sampledAt || '',
    tempMaxC: sample.temp,
    tempMinC: sample.temp,
    precipMm: sample.precipLastHour,
    cloud: sample.cloud,
    uvIndex: undefined,
    iconDay: '',
    textDay: sample.text || '',
    iconNight: '',
    textNight: '',
    source: 'weather_cache_day_latest_sample',
    sourceKind: 'weather_now_sample',
    cacheSource,
    raw: sample
  }
}

function buildCurrentWeatherDataFromDailyRollup({ rollup = {}, cacheSource = '' } = {}) {
  const tempFeatures = rollup.tempFeatures || {}
  const moistureFeatures = rollup.moistureFeatures || {}
  const lightFeatures = rollup.lightFeatures || {}

  const temperature = tempFeatures.tempMean ?? rollup.temp ?? 0
  return {
    temperature,
    humidity: moistureFeatures.humidityMean ?? rollup.humidity ?? 0,
    weather: rollup.dominantWeatherText || rollup.text || '未知',
    feelsLike: temperature,
    windDir: '',
    windScale: '',
    windSpeed: rollup.windSpeed ?? '',
    pressure: '',
    visibility: '',
    updateTime: rollup.date || '',
    tempMaxC: tempFeatures.tempMax ?? rollup.tempMax,
    tempMinC: rollup.tempMin ?? tempFeatures.tempMean,
    precipMm: moistureFeatures.precipLastHourSum ?? rollup.precipMm,
    cloud: lightFeatures.daylightCloudMean ?? rollup.cloud,
    uvIndex: undefined,
    iconDay: '',
    textDay: rollup.dominantWeatherText || rollup.text || '',
    iconNight: '',
    textNight: '',
    source: 'weather_cache_day_finalized_rollup',
    sourceKind: 'observed_now_rollup',
    cacheSource,
    raw: rollup
  }
}

function isUsableLatestSample(dayPayload = {}) {
  return Boolean(
    isPlainObject(dayPayload) &&
      dayPayload.latestSample &&
      dayPayload.latestSample.temp !== undefined
  )
}

function isUsableFinalizedDayFile(dayPayload = {}) {
  return Boolean(
    isPlainObject(dayPayload) &&
      String(dayPayload.state || '') === 'finalized' &&
      dayPayload.dailyRollup
  )
}

/**
 * 把 D0 day file 的 latestSample 转换为 dailyRecord，供浇水 planner 的 buildWeatherSummary 消费。
 * 字段映射不可变（architecture_invariants）：
 *   tempMax = tempMin = latestSample.temp
 *   humidity = latestSample.humidity
 *   precip = latestSample.precipLastHour
 *   textDay = latestSample.text
 *
 * @param {object} sample - day file 的 latestSample 对象
 * @param {string} date - YYYY-MM-DD 格式的 D0 日期
 * @returns {object} dailyRecord，含 date/tempMaxC/tempMinC/humidity/precipMm/textDay/sourceKind/missing
 */
function latestSampleToDailyRecord(sample = {}, date = '') {
  const safeSample = isPlainObject(sample) ? sample : {}
  return {
    date: String(date || ''),
    tempMaxC: safeSample.temp,
    tempMinC: safeSample.temp,
    humidity: safeSample.humidity,
    precipMm: safeSample.precipLastHour,
    textDay: safeSample.text || '',
    sourceKind: 'weather_now_sample',
    source: 'weather_cache_day_latest_sample',
    missing: false,
    cacheSource: 'day_latest_sample'
  }
}

/**
 * 创建 day file reader 工厂。自包含路径构造器与日期工具，无需外部注入。
 *
 * readDailyRecordFromDayFile：读取指定日期 day file 的 latestSample 并转换为 dailyRecord，
 * 只读 latestSample，不做 finalized fallback，用于浇水 planner D0 注入。
 * 与 getCurrentWeatherFromDailyArchive 不同：本函数只关心 latestSample 是否可用作 dailyRecord，
 * 不返回 current weather 字段。
 *
 * injectD0IntoForecast：读取 D0 day file latestSample，转换为 dailyRecord 并塞到 forecastDays 开头。
 * D0 缺失/超时返回 todayWeatherSource='missing'，forecastDays 不变（仍为 14 项），summary 按 14 天统计。
 */
function createWeatherDayFileReader({ storage, now = () => new Date() } = {}) {
  if (!storage || typeof storage.downloadJson !== 'function') {
    throw new Error('createWeatherDayFileReader: storage with downloadJson is required')
  }

  async function readDailyRecordFromDayFile({ locationKey, date, readTimeoutMs } = {}) {
    const targetDate = normalizeDate(date)
    if (!targetDate) {
      return { dailyRecord: null, dayFile: null, reason: 'date_missing', timedOut: false }
    }
    const dayObjectPath = buildWeatherDayObjectPath(locationKey, targetDate)
    const timeout = normalizeTimeoutMs(readTimeoutMs, DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS)
    const read = await downloadJsonWithTimeout(
      storage,
      { cloudPath: dayObjectPath, fileId: '' },
      timeout
    )
    if (read.timedOut) {
      return { dailyRecord: null, dayFile: null, reason: 'day_latest_sample_read_timeout', timedOut: true }
    }
    const dayFile = read.payload
    if (!isUsableLatestSample(dayFile)) {
      return { dailyRecord: null, dayFile, reason: 'day_latest_sample_missing', timedOut: false }
    }
    return {
      dailyRecord: latestSampleToDailyRecord(dayFile.latestSample, targetDate),
      dayFile,
      reason: 'day_latest_sample_present',
      timedOut: false
    }
  }

  /**
   * 读取 D0 latestSample 并注入 forecastDays 开头。
   * 返回 { forecastDays, todayWeatherSource, todayWeatherRecord, todayWeatherReason }
   * - todayWeatherSource: 'day_latest_sample' | 'missing'
   * - 命中时 forecastDays = [d0Record, ...originalForecastDays]（15 项）
   * - 缺失/超时时 forecastDays = originalForecastDays（不变，14 项），summary 按 14 天统计
   */
  async function injectD0IntoForecast({
    locationKey,
    date,
    forecastDays = [],
    timezone = 'Asia/Shanghai',
    readTimeoutMs
  } = {}) {
    const referenceDate = date || formatLocalDateInTimezone(now(), timezone)
    const result = await readDailyRecordFromDayFile({ locationKey, date: referenceDate, readTimeoutMs })
    if (result.dailyRecord) {
      return {
        forecastDays: [result.dailyRecord, ...forecastDays],
        todayWeatherSource: 'day_latest_sample',
        todayWeatherRecord: result.dailyRecord,
        todayWeatherReason: result.reason,
        referenceDate
      }
    }
    return {
      forecastDays,
      todayWeatherSource: 'missing',
      todayWeatherRecord: null,
      todayWeatherReason: result.reason,
      referenceDate
    }
  }

  return {
    readDailyRecordFromDayFile,
    injectD0IntoForecast,
    latestSampleToDailyRecord
  }
}

function createCurrentWeatherArchiveService({ storage, now, resolveLocationInput }) {
  if (typeof resolveLocationInput !== 'function') {
    throw new Error('createCurrentWeatherArchiveService: resolveLocationInput is required')
  }

  async function getCurrentWeatherFromDailyArchive(input = {}) {
    const locationInput = resolveLocationInput(input)
    const generatedAtDate = now()
    const timezone = locationInput.timezone || 'Asia/Shanghai'
    const today = formatLocalDateInTimezone(generatedAtDate, timezone)
    const targetDate = normalizeDate(input.targetDate || today)
    const shouldReadCache = input.useCache !== false && input.useCache !== 'false'
    const explicitReadTimeoutMs =
      input.readTimeoutMs || input.timeoutMs || process.env.WEATHER_CURRENT_STORAGE_READ_TIMEOUT_MS
    const hasExplicitOverride = Boolean(explicitReadTimeoutMs)
    const primaryReadTimeoutMs = normalizeTimeoutMs(
      explicitReadTimeoutMs,
      DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS
    )
    const fallbackReadTimeoutMs = normalizeTimeoutMs(
      explicitReadTimeoutMs,
      DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS
    )
    const primaryGraceTotalMs = normalizeTimeoutMs(
      explicitReadTimeoutMs,
      DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS
    )

    let primaryReadTimedOut = false
    const dayObjectPath = buildWeatherDayObjectPath(locationInput.locationKey, targetDate)

    if (shouldReadCache) {
      const primaryRead = startStorageRead(storage, { cloudPath: dayObjectPath, fileId: '' })
      const initialRead = await primaryRead.raceWith(primaryReadTimeoutMs)

      if (isUsableLatestSample(initialRead.payload)) {
        return {
          weatherData: buildCurrentWeatherDataFromLatestSample({
            sample: initialRead.payload.latestSample,
            cacheSource: 'day_latest_sample'
          }),
          dailyWeatherCache: {
            cacheHit: true,
            refreshed: false,
            reason: 'day_latest_sample_present',
            locationKey: locationInput.locationKey,
            targetDate,
            quality: initialRead.payload.quality || 'partial',
            dayObjectPath
          }
        }
      }
      primaryReadTimedOut = Boolean(initialRead.timedOut)

      const fallbackCandidates = await Promise.all(
        Array.from({ length: 7 }, (_, index) => {
          const offset = index + 1
          const searchDate = normalizeDate(addDays(targetDate, -offset))
          const searchPath = buildWeatherDayObjectPath(locationInput.locationKey, searchDate)
          return downloadJsonWithTimeout(
            storage,
            { cloudPath: searchPath, fileId: '' },
            fallbackReadTimeoutMs
          ).then(read => ({ dayPayload: read.payload, searchDate, searchPath }))
        })
      )
      for (const { dayPayload, searchDate, searchPath } of fallbackCandidates) {
        if (isUsableFinalizedDayFile(dayPayload)) {
          return {
            weatherData: buildCurrentWeatherDataFromDailyRollup({
              rollup: dayPayload.dailyRollup,
              cacheSource: 'day_finalized_rollup'
            }),
            dailyWeatherCache: {
              cacheHit: true,
              refreshed: false,
              reason: 'day_finalized_rollup_fallback',
              locationKey: locationInput.locationKey,
              targetDate: searchDate,
              quality: dayPayload.dailyRollup.quality || 'partial',
              dayObjectPath: searchPath
            }
          }
        }
      }

      if (primaryReadTimedOut && !hasExplicitOverride) {
        const graceRead = await primaryRead.raceWith(primaryGraceTotalMs)
        primaryReadTimedOut = Boolean(graceRead.timedOut)
        if (isUsableLatestSample(graceRead.payload)) {
          return {
            weatherData: buildCurrentWeatherDataFromLatestSample({
              sample: graceRead.payload.latestSample,
              cacheSource: 'day_latest_sample'
            }),
            dailyWeatherCache: {
              cacheHit: true,
              refreshed: false,
              reason: 'day_latest_sample_present',
              locationKey: locationInput.locationKey,
              targetDate,
              quality: graceRead.payload.quality || 'partial',
              dayObjectPath
            }
          }
        }
      }
    }

    const missReason = shouldReadCache
      ? primaryReadTimedOut
        ? 'day_latest_sample_read_timeout'
        : 'day_latest_sample_missing'
      : 'day_cache_bypass'
    return {
      weatherData: null,
      dailyWeatherCache: {
        cacheHit: false,
        refreshed: false,
        reason: missReason,
        weatherEvidenceInsufficient: true,
        locationKey: locationInput.locationKey,
        targetDate,
        dayObjectPath: buildWeatherDayObjectPath(locationInput.locationKey, targetDate),
        recentObjectPath: buildRecentWeatherObjectPath(locationInput.locationKey)
      }
    }
  }

  return {
    getCurrentWeatherFromDailyArchive
  }
}

// ===== D0 注入器（模块级懒单例）：供 plant-user-http / diagnose-http 共用 =====
// 延迟 require weather-object-storage 避免加载顺序依赖；模块级单例确保首次调用后复用 storage + reader。
let _sharedD0Storage = null
let _sharedD0Reader = null

function getSharedD0Reader() {
  if (!_sharedD0Reader) {
    // layer 部署后 /opt/utils/ 下文件平铺，相对路径指向同目录；本地测试时 cloudfunctions/layer/utils/ 同目录。
    const { createWeatherObjectStorage } = require('./weather-object-storage')
    _sharedD0Storage = createWeatherObjectStorage()
    _sharedD0Reader = createWeatherDayFileReader({ storage: _sharedD0Storage })
  }
  return _sharedD0Reader
}

/**
 * 把 D0 day file 的 latestSample 注入 forecastDays 开头，供 buildWeatherSummary 消费。
 * - 命中：forecastDays = [d0Record, ...originalForecastDays]（15 项），todayWeatherSource='day_latest_sample'
 * - 缺失/超时/无 locationKey：forecastDays 不变（14 项），todayWeatherSource='missing'，summary 按 14 天统计
 *
 * 三个浇水 planner 入口（diagnose-http buildEnvironmentCareContextV7 / plant-user-http /watering-planner / /watering-advisor）
 * 共用此函数，确保 D0 注入与时区修正逻辑一致。
 *
 * @param {object} params
 * @param {string} params.locationKey - 地点 key
 * @param {string} params.timezone - 时区，默认 Asia/Shanghai
 * @param {string} params.referenceDate - D0 日期 YYYY-MM-DD（空则按 timezone 解析当前日期）
 * @param {Array}  params.forecastDays - 前端传入的 D+1..D+14 预报数组（14 项，不含 D0）
 * @returns {Promise<{forecastDays: Array, todayWeatherSource: string, todayWeatherRecord: object|null, todayWeatherReason: string, referenceDate: string}>}
 */
async function injectD0IntoForecastDays({
  locationKey = '',
  timezone = 'Asia/Shanghai',
  referenceDate = '',
  forecastDays = []
} = {}) {
  const resolvedTimezone = String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  const resolvedReferenceDate =
    String(referenceDate || '').trim() ||
    formatLocalDateInTimezone(new Date(), resolvedTimezone)
  const trimmedLocationKey = String(locationKey || '').trim()
  if (!trimmedLocationKey) {
    return {
      forecastDays,
      todayWeatherSource: 'missing',
      todayWeatherRecord: null,
      todayWeatherReason: 'location_key_missing',
      referenceDate: resolvedReferenceDate
    }
  }
  const reader = getSharedD0Reader()
  return reader.injectD0IntoForecast({
    locationKey: trimmedLocationKey,
    date: resolvedReferenceDate,
    forecastDays,
    timezone: resolvedTimezone
  })
}

module.exports = {
  addDays,
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
  createCurrentWeatherArchiveService,
  createWeatherDayFileReader,
  downloadJsonWithTimeout,
  formatLocalDateInTimezone,
  injectD0IntoForecastDays,
  isUsableFinalizedDayFile,
  isUsableLatestSample,
  latestSampleToDailyRecord,
  normalizeDate,
  normalizeLocationKey
}
