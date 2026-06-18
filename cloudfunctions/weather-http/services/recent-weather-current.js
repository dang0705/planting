'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const {
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherRawForecastObjectPath,
  normalizeWeatherCoordinates
} = require('./weather-cache-paths')
const { buildDailyArchivePayload, asArray, isPlainObject } = require('./recent-weather-payloads')
const {
  formatLocalDateInTimezone,
  normalizeDailyWeatherRecord,
  normalizeDate
} = require('./recent-weather-features')

function normalizeDailyArchivePayload(payload = {}, targetDate = '') {
  const hasPayloadDaily = isPlainObject(payload) && isPlainObject(payload.daily)
  const daily = normalizeDailyWeatherRecord(payload?.daily || {}, {
    date: targetDate || payload?.date || '',
    weatherObjectPath: payload?.weatherObjectPath || '',
    rawObjectPath: payload?.rawObjectPath || '',
    quality: payload?.quality || 'partial',
    sourceKind: payload?.sourceKind || 'weather_cache_daily_archive',
    missing: payload?.missing
  })
  return {
    payload,
    daily,
    usable:
      hasPayloadDaily &&
      daily.date === normalizeDate(targetDate || payload?.date) &&
      daily.missing !== true
  }
}

function buildCurrentWeatherDataFromDailyArchive({ daily, cacheSource = '' } = {}) {
  const temperature = daily.tempMaxC ?? daily.tempMinC ?? 0
  return {
    temperature,
    humidity: daily.humidity ?? 0,
    weather: daily.textDay || daily.textNight || '未知',
    feelsLike: temperature,
    windDir: daily.windDirDay || daily.windDirNight || '',
    windScale: daily.windScaleDay || daily.windScaleNight || '',
    windSpeed: daily.windSpeedDay ?? daily.windSpeedNight ?? '',
    pressure: daily.pressure ?? '',
    visibility: daily.visibilityKm ?? '',
    updateTime: daily.date,
    tempMaxC: daily.tempMaxC,
    tempMinC: daily.tempMinC,
    precipMm: daily.precipMm,
    cloud: daily.cloud,
    uvIndex: daily.uvIndex,
    iconDay: daily.iconDay || '',
    textDay: daily.textDay || '',
    iconNight: daily.iconNight || '',
    textNight: daily.textNight || '',
    source: 'weather_cache_daily',
    sourceKind: daily.sourceKind || 'weather_cache_daily_archive',
    cacheSource,
    raw: daily
  }
}

function buildRawForecastPayload({ location, generatedAt, forecast = {} }) {
  return {
    schemaVersion: 'weather-cache/v1/raw-forecast-10d',
    location,
    generatedAt,
    sourceKind: 'qweather_forecast_10d',
    raw: forecast.raw || {},
    daily: asArray(forecast.daily)
  }
}

function createCurrentWeatherArchiveService({
  storage,
  adapter = null,
  apiKey = '',
  baseUrl = '',
  now,
  resolveLocationInput,
  writeForecastArchive
}) {
  async function fetchForecast10d(input = {}, locationInput = resolveLocationInput(input)) {
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const normalizedCoordinates = normalizeWeatherCoordinates(input) || {}
    return qweatherAdapter.fetchForecast10d({
      locationId: locationInput.qweatherLocationId,
      lat: normalizedCoordinates.lat,
      lng: normalizedCoordinates.lng
    })
  }

  async function getCurrentWeatherFromDailyArchive(input = {}) {
    const locationInput = resolveLocationInput(input)
    const generatedAtDate = now()
    const localToday = formatLocalDateInTimezone(generatedAtDate, locationInput.timezone)
    const targetDate = normalizeDate(input.targetDate || localToday)
    const dailyObjectPath = buildWeatherDailyObjectPath(locationInput.locationKey, targetDate)
    const shouldReadCache = input.useCache !== false && input.useCache !== 'false'

    if (shouldReadCache) {
      const cachedDailyPayload = await storage
        .downloadJson({ cloudPath: dailyObjectPath, fileId: '' })
        .catch(() => null)
      const cachedDaily = normalizeDailyArchivePayload(cachedDailyPayload, targetDate)
      if (cachedDaily.usable) {
        return {
          weatherData: buildCurrentWeatherDataFromDailyArchive({
            daily: cachedDaily.daily,
            cacheSource: 'daily_archive'
          }),
          dailyWeatherCache: {
            cacheHit: true,
            refreshed: false,
            reason: 'daily_archive_present',
            locationKey: locationInput.locationKey,
            targetDate,
            quality: cachedDaily.payload.quality || cachedDaily.daily.quality || 'partial',
            dailyObjectPath
          }
        }
      }
    }

    const generatedAt = generatedAtDate.toISOString()
    const forecast = await fetchForecast10d(input, locationInput)
    const rawObjectPath = buildWeatherRawForecastObjectPath(
      locationInput.locationKey,
      generatedAt.replace(/\.\d{3}Z$/, 'Z')
    )
    const transientRawPayload = buildRawForecastPayload({
      location: locationInput,
      generatedAt,
      forecast
    })
    const refreshedDailyPayload = buildDailyArchivePayload({
      location: locationInput,
      targetDate,
      snapshot: transientRawPayload,
      rawObjectPath,
      dailyObjectPath,
      generatedAt
    })
    const refreshedDaily = normalizeDailyArchivePayload(refreshedDailyPayload, targetDate)
    if (!refreshedDaily.usable) {
      throw new Error(`当天预报归档不可用: ${dailyObjectPath}`)
    }
    const archiveWrite = writeForecastArchive({
      input,
      locationInput,
      forecast,
      targetDate,
      generatedAtDate,
      preferForecastSnapshot: true
    }).catch(() => null)
    if (input.waitForArchive === true) {
      await archiveWrite
    }

    return {
      weatherData: buildCurrentWeatherDataFromDailyArchive({
        daily: refreshedDaily.daily,
        cacheSource: 'daily_archive_refresh'
      }),
      dailyWeatherCache: {
        cacheHit: false,
        refreshed: input.waitForArchive === true,
        refreshScheduled: input.waitForArchive !== true,
        reason: shouldReadCache ? 'daily_archive_missing' : 'daily_archive_bypass',
        locationKey: locationInput.locationKey,
        targetDate,
        quality: refreshedDailyPayload.quality || refreshedDaily.daily.quality || 'partial',
        dailyObjectPath,
        recentObjectPath: buildRecentWeatherObjectPath(locationInput.locationKey)
      }
    }
  }

  return {
    fetchForecast10d,
    getCurrentWeatherFromDailyArchive
  }
}

module.exports = {
  buildCurrentWeatherDataFromDailyArchive,
  buildRawForecastPayload,
  createCurrentWeatherArchiveService
}
