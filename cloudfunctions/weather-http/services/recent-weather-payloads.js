'use strict'

const { buildRecentWeatherObjectPath } = require('./weather-cache-paths')
const {
  addDays,
  buildPlantWeatherFeatures,
  normalizeDailyWeatherRecord,
  normalizeDate,
  resolveRecentWeatherQuality
} = require('./recent-weather-features')

const RECENT_SCHEMA_VERSION = 'weather-cache/v1/recent-10d'
const MANIFEST_SCHEMA_VERSION = 'weather-cache/v1/manifest'

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value = []) {
  return Array.isArray(value) ? value : []
}

function normalizeManifest(value = {}, locationKey = '') {
  const manifest = isPlainObject(value) ? value : {}
  return {
    schemaVersion: manifest.schemaVersion || MANIFEST_SCHEMA_VERSION,
    locationKey: manifest.locationKey || locationKey,
    rawSnapshots: asArray(manifest.rawSnapshots).slice(-40),
    dailyArchives: isPlainObject(manifest.dailyArchives) ? manifest.dailyArchives : {},
    updatedAt: manifest.updatedAt || ''
  }
}

function buildMissingDailyRecord({
  date = '',
  dailyObjectPath = '',
  reason = 'daily_archive_missing'
} = {}) {
  return normalizeDailyWeatherRecord({
    date,
    source: 'weather_cache_daily_missing',
    sourceKind: 'weather_cache_daily_archive',
    quality: 'missing',
    weatherObjectPath: dailyObjectPath,
    missing: true,
    warning: reason
  })
}

function findForecastDailyForDate(snapshot = {}, date = '') {
  const targetDate = normalizeDate(date)
  const daily = asArray(snapshot.daily || snapshot.raw?.daily)
  return daily.find(item => normalizeDate(item.date || item.fxDate) === targetDate) || null
}

function snapshotHasDailyForDate(snapshot = {}, date = '') {
  return Boolean(findForecastDailyForDate(snapshot, date))
}

function buildDailyArchivePayload({
  location,
  targetDate,
  snapshot,
  rawObjectPath,
  dailyObjectPath,
  generatedAt
}) {
  const forecastDaily = findForecastDailyForDate(snapshot, targetDate)
  const normalizedDaily = forecastDaily
    ? normalizeDailyWeatherRecord(forecastDaily, {
        date: targetDate,
        source: 'qweather_forecast_10d_archive',
        sourceKind: 'qweather_forecast_10d_archive',
        weatherObjectPath: dailyObjectPath,
        rawObjectPath,
        quality: 'partial'
      })
    : buildMissingDailyRecord({
        date: targetDate,
        dailyObjectPath,
        reason: 'raw_snapshot_without_target_date'
      })

  return {
    schemaVersion: 'weather-cache/v1/daily',
    location,
    date: targetDate,
    generatedAt,
    sourceKind: normalizedDaily.missing
      ? 'weather_cache_daily_missing'
      : 'qweather_forecast_10d_archive',
    quality: normalizedDaily.missing ? 'missing' : 'partial',
    rawObjectPath,
    weatherObjectPath: dailyObjectPath,
    daily: normalizedDaily
  }
}

function buildRecentWeatherPayload({ location, targetDate, generatedAt, days, dailyObjectPaths }) {
  const quality = resolveRecentWeatherQuality(days)
  const weatherObjectPath = buildRecentWeatherObjectPath(location.locationKey)

  return {
    schemaVersion: RECENT_SCHEMA_VERSION,
    location,
    generatedAt,
    sourceKind: 'weather_cache_recent_10d',
    quality,
    weatherEvidenceInsufficient: quality === 'missing',
    weatherObjectPath,
    dailyObjectPaths,
    window: {
      timezone: location.timezone,
      targetDate,
      start: days[0]?.date || '',
      end: days[days.length - 1]?.date || '',
      days: 10
    },
    historicalDays: days,
    plantFeatures: buildPlantWeatherFeatures(days),
    meta: {
      diagnosisDate: addDays(targetDate, 1),
      sourceKind: 'weather_cache_recent_10d',
      quality,
      weatherObjectPath,
      weatherEvidenceInsufficient: quality === 'missing',
      recordCounts: {
        historicalDays: days.length,
        forecastDays: 0,
        totalDailyRecords: days.length
      },
      historicalWindow: {
        start: days[0]?.date || '',
        end: days[days.length - 1]?.date || ''
      }
    }
  }
}

module.exports = {
  MANIFEST_SCHEMA_VERSION,
  RECENT_SCHEMA_VERSION,
  asArray,
  buildDailyArchivePayload,
  buildMissingDailyRecord,
  buildRecentWeatherPayload,
  isPlainObject,
  normalizeManifest,
  snapshotHasDailyForDate
}
