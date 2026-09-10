'use strict'

// D0 当天最新天气缓存读取服务，从 weather-day-file-reader.js 拆分。
// 定时采样链路先调用 QWeather /v7/weather/now 写入 day file.latestSample，
// 诊断和浇水规划再读取这个 D0 最新缓存；它与 recent-10d 历史缓存是两个独立层。
// D0 latestSample 缺失时保留现有 finalized dailyRollup 有界降级，并由来源字段明确标识。

const {
  addDays,
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
  formatLocalDateInTimezone,
  isPlainObject,
  normalizeDate
} = require('./weather-day-file-paths')
const {
  DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS,
  DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  downloadJsonWithTimeout,
  normalizeTimeoutMs,
  startStorageRead
} = require('./weather-day-file-timeout')

const CURRENT_WEATHER_MEMORY_CACHE_TTL_MS = 30 * 1000

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
 * 创建 D0 current weather cache reader。
 * 优先读当天 day file.latestSample（定时 QWeather now 采样形成的 D0 最新缓存）；
 * 缺失时回退 7 天 finalized dailyRollup 作为降级展示，不将其冒充为 D0 最新样本；
 * 主读超时且无显式 override 时，在 grace 总预算内继续等同一主读。
 *
 * @param {object}   params
 * @param {object}   params.storage - 必须实现 downloadJson(input)
 * @param {function} params.now - 返回当前时间的函数
 * @param {function} params.resolveLocationInput - 把 input 解析为 { locationKey, timezone, ... }
 */
function createCurrentWeatherArchiveService({ storage, now, resolveLocationInput }) {
  if (typeof resolveLocationInput !== 'function') {
    throw new Error('createCurrentWeatherArchiveService: resolveLocationInput is required')
  }

  const currentWeatherReadInFlight = new Map()
  const currentWeatherMemoryCache = new Map()

  function buildCurrentWeatherCacheKey(locationKey = '', targetDate = '') {
    return `${String(locationKey || '').trim()}:${normalizeDate(targetDate)}`
  }

  function clearCurrentWeatherCache({ locationKey = '', targetDate = '' } = {}) {
    const key = String(locationKey || '').trim()
    if (!key) {
      currentWeatherMemoryCache.clear()
      return
    }
    if (!targetDate) {
      for (const cacheKey of currentWeatherMemoryCache.keys()) {
        if (cacheKey.startsWith(`${key}:`)) {
          currentWeatherMemoryCache.delete(cacheKey)
        }
      }
      return
    }
    currentWeatherMemoryCache.delete(buildCurrentWeatherCacheKey(key, targetDate))
  }

  async function readCurrentWeatherFromDailyArchive(input = {}) {
    const locationInput = resolveLocationInput(input)
    const generatedAtDate = now()
    const timezone = locationInput.timezone || 'Asia/Shanghai'
    const today = formatLocalDateInTimezone(generatedAtDate, timezone)
    const targetDate = normalizeDate(input.targetDate || today)
    const shouldReadCache = input.useCache !== false && input.useCache !== 'false'
    const skipFinalizedFallback =
      input.skipFinalizedFallback === true || input.skipFinalizedFallback === 'true'
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

      if (skipFinalizedFallback) {
        return {
          weatherData: null,
          dailyWeatherCache: {
            cacheHit: false,
            refreshed: false,
            reason: primaryReadTimedOut
              ? 'day_latest_sample_read_timeout'
              : 'day_latest_sample_missing',
            weatherEvidenceInsufficient: true,
            locationKey: locationInput.locationKey,
            targetDate,
            dayObjectPath
          }
        }
      }

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

  async function getCurrentWeatherFromDailyArchive(input = {}) {
    const locationInput = resolveLocationInput(input)
    const targetDate = normalizeDate(
      input.targetDate ||
        formatLocalDateInTimezone(now(), locationInput.timezone || 'Asia/Shanghai')
    )
    const shouldReadCache = input.useCache !== false && input.useCache !== 'false'
    const useMemoryCache = input.useMemoryCache === true || input.useMemoryCache === 'true'
    if (!shouldReadCache) {
      return readCurrentWeatherFromDailyArchive(input)
    }

    const inFlightKey = `${locationInput.locationKey}:${targetDate}`
    if (useMemoryCache) {
      const cached = currentWeatherMemoryCache.get(inFlightKey)
      if (cached && Date.now() - cached.cachedAt <= CURRENT_WEATHER_MEMORY_CACHE_TTL_MS) {
        return cached.value
      }
      if (cached) {
        currentWeatherMemoryCache.delete(inFlightKey)
      }
    }
    const inFlight = currentWeatherReadInFlight.get(inFlightKey)
    if (inFlight) {
      return inFlight
    }
    const readPromise = readCurrentWeatherFromDailyArchive(input)
    currentWeatherReadInFlight.set(inFlightKey, readPromise)
    readPromise.then(
      value => {
        if (useMemoryCache && value?.weatherData && value?.dailyWeatherCache?.cacheHit) {
          currentWeatherMemoryCache.set(inFlightKey, {
            cachedAt: Date.now(),
            value
          })
        }
      },
      () => null
    )
    readPromise.then(
      () => currentWeatherReadInFlight.delete(inFlightKey),
      () => currentWeatherReadInFlight.delete(inFlightKey)
    )
    return readPromise
  }

  return {
    clearCurrentWeatherCache,
    getCurrentWeatherFromDailyArchive
  }
}

module.exports = {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  CURRENT_WEATHER_MEMORY_CACHE_TTL_MS,
  createCurrentWeatherArchiveService,
  isUsableFinalizedDayFile,
  isUsableLatestSample
}
