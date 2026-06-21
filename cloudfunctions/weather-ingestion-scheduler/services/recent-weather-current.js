'use strict'

const {
  buildWeatherDayObjectPath,
  buildRecentWeatherObjectPath
} = require('./weather-cache-paths')
const { isPlainObject } = require('./recent-weather-payloads')
const {
  formatLocalDateInTimezone,
  normalizeDate,
  addDays
} = require('./recent-weather-features')

const DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 250
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
    setTimeout(resolve, timeoutMs, null)
  })
}

async function downloadJsonWithTimeout(storage, input = {}, timeoutMs) {
  return Promise.race([
    storage.downloadJson(input).catch(() => null),
    buildTimeoutResult(timeoutMs)
  ])
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

function createCurrentWeatherArchiveService({
  storage,
  now,
  resolveLocationInput
}) {
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
    const readTimeoutMs = normalizeTimeoutMs(
      input.readTimeoutMs ||
        input.timeoutMs ||
        process.env.WEATHER_CURRENT_STORAGE_READ_TIMEOUT_MS
    )

    if (shouldReadCache) {
      const dayObjectPath = buildWeatherDayObjectPath(locationInput.locationKey, targetDate)
      const todayDayPayload = await downloadJsonWithTimeout(
        storage,
        { cloudPath: dayObjectPath, fileId: '' },
        readTimeoutMs
      )

      if (isUsableLatestSample(todayDayPayload)) {
        return {
          weatherData: buildCurrentWeatherDataFromLatestSample({
            sample: todayDayPayload.latestSample,
            cacheSource: 'day_latest_sample'
          }),
          dailyWeatherCache: {
            cacheHit: true,
            refreshed: false,
            reason: 'day_latest_sample_present',
            locationKey: locationInput.locationKey,
            targetDate,
            quality: todayDayPayload.quality || 'partial',
            dayObjectPath
          }
        }
      }

      // 回退：并发读取最近 finalized 的 day file（D-1 到 D-7），避免缓存 miss 串行拖慢导航栏天气。
      const fallbackCandidates = await Promise.all(Array.from({ length: 7 }, (_, index) => {
        const offset = index + 1
        const searchDate = normalizeDate(addDays(targetDate, -offset))
        const searchPath = buildWeatherDayObjectPath(locationInput.locationKey, searchDate)
        return downloadJsonWithTimeout(
          storage,
          { cloudPath: searchPath, fileId: '' },
          readTimeoutMs
        ).then(dayPayload => ({ dayPayload, searchDate, searchPath }))
      }))
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
    }

    // 缓存缺失：返回 evidence insufficient，不调用 QWeather
    return {
      weatherData: null,
      dailyWeatherCache: {
        cacheHit: false,
        refreshed: false,
        reason: shouldReadCache ? 'day_latest_sample_missing' : 'day_cache_bypass',
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
