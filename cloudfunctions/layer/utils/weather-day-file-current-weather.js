'use strict'

// D0 current weather archive service，从 weather-day-file-reader.js 拆分。
// 负责：从 day file latestSample 或 finalized dailyRollup 构建 current weather，
// 并提供 7 天 finalized 回退查找。被 weather-http/services/recent-weather-current.js 复用。

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
 * 创建 current weather archive service。
 * 优先读 D0 day file latestSample；缺失时回退 7 天 finalized dailyRollup；
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

module.exports = {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  isUsableFinalizedDayFile,
  isUsableLatestSample
}
