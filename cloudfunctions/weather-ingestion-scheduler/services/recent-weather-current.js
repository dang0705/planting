'use strict'

const { buildWeatherDayObjectPath, buildRecentWeatherObjectPath } = require('./weather-cache-paths')
const { isPlainObject } = require('./recent-weather-payloads')
const { formatLocalDateInTimezone, normalizeDate, addDays } = require('./recent-weather-features')

// 主读 D0 day file 的初始默认读取预算：覆盖对象存储常规冷读（实测 D0 首次约 305ms、后续 184-198ms）。
// 旧 250ms 默认会在真实冷读上误判 timeout；显式 readTimeoutMs/timeoutMs/env 覆盖仍优先生效。
const DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 600
// fallback（D-1..D-7 finalized day file）默认读取预算保持更紧，避免整体 miss 路径无边界变慢。
const DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 250
// 默认路径（无显式覆盖）下主读 D0 的总保护预算（初始窗口 + 有界 grace）。
// 覆盖 QA 观测到的对象存储冷读尖峰（约 1181ms）并留 headroom，仍保持有界；grace 仅在初始窗口超时且无 fallback 命中时生效。
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

// 返回 { payload, timedOut }，让调用方区分“读取超时”与“对象/内容真实缺失”，
// 不再把 timeout 与 genuine miss 都折叠成 null。
async function downloadJsonWithTimeout(storage, input = {}, timeoutMs) {
  return Promise.race([
    storage
      .downloadJson(input)
      .catch(() => null)
      .then(payload => ({ payload, timedOut: false })),
    buildTimeoutResult(timeoutMs)
  ])
}

// 启动一次对象存储读取并返回可复用句柄；同一 in-flight promise 可跨初始窗口、fallback 阶段
// 与有界 grace 多次 raceWith，grace 阶段不会对同一 D0 对象重发下载（复用原始 in-flight 读取）。
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

/**
 * 从嵌套 dailyRollup 结构构造当前天气数据。
 * 读 tempFeatures.tempMean / moistureFeatures.humidityMean / lightFeatures.daylightCloudMean 等。
 */
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

function createCurrentWeatherArchiveService({ storage, now, resolveLocationInput }) {
  /**
   * 当前天气优先从 days/{today}.json.latestSample 读；
   * 无 latestSample 时读最近 finalized day file 的 dailyRollup；
   * 仍缺失则返回 weatherEvidenceInsufficient，不实时调用 QWeather。
   */
  async function getCurrentWeatherFromDailyArchive(input = {}) {
    const locationInput = resolveLocationInput(input)
    const generatedAtDate = now()
    const timezone = locationInput.timezone || 'Asia/Shanghai'
    const today = formatLocalDateInTimezone(generatedAtDate, timezone)
    const targetDate = normalizeDate(input.targetDate || today)
    const shouldReadCache = input.useCache !== false && input.useCache !== 'false'
    // 显式 readTimeoutMs/timeoutMs/env 覆盖优先生效，且同时作用于主读与 fallback；
    // 显式覆盖路径不暗中延长超过该显式值；grace 仅在默认（无显式覆盖）路径生效。
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
      // 主读 D0 启动一次；初始窗口内未拿到时进入 fallback，仍无命中且为默认路径时对同一 in-flight 读取做有界 grace。
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

      // 回退：并发读取最近 finalized 的 day file（D-1 到 D-7），避免缓存 miss 串行拖慢导航栏天气。
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

      // 默认路径下主读初始窗口超时且无 fallback 命中：对同一 in-flight 主读做有界 grace 等待（不重发下载），
      // 覆盖对象存储冷读尖峰；grace 命中仍走正常 hit 契约。显式覆盖路径不暗中延长超过该显式值。
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

    // 缓存缺失/超时：返回 evidence insufficient，不调用 QWeather。
    // 主读超时（含 grace 仍超时）返回 day_latest_sample_read_timeout；对象/内容真实缺失返回 day_latest_sample_missing。
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

module.exports = {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  downloadJsonWithTimeout,
  isUsableFinalizedDayFile,
  isUsableLatestSample
}
