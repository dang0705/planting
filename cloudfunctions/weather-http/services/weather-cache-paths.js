'use strict'

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

function buildLocationKey({
  locationKey = '',
  qweatherLocationId = '',
  cityName = '',
  city = ''
} = {}) {
  const explicitKey = normalizeLocationKey(locationKey)
  if (explicitKey) {
    return explicitKey
  }

  const locationId = normalizePathSegment(qweatherLocationId, '')
  if (locationId) {
    return `qweather:${locationId}`
  }

  const normalizedCity = normalizePathSegment(cityName || city, '')
  if (normalizedCity) {
    return `city:${normalizedCity}`
  }

  return ''
}

function buildWeatherLocationBasePath(locationKey = '') {
  const safeLocationKey = normalizeLocationKey(locationKey)
  if (!safeLocationKey) {
    throw new Error('缺少天气地点 locationKey')
  }
  return `weather-cache/v1/locations/${safeLocationKey}`
}

function buildRecentWeatherObjectPath(locationKey = '') {
  return `${buildWeatherLocationBasePath(locationKey)}/recent-10d.json`
}

function buildWeatherManifestObjectPath(locationKey = '') {
  return `${buildWeatherLocationBasePath(locationKey)}/manifest.json`
}

function buildWeatherDailyObjectPath(locationKey = '', date = '') {
  const safeDate = String(date || '')
    .trim()
    .slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('天气 daily 对象路径缺少合法日期')
  }
  return `${buildWeatherLocationBasePath(locationKey)}/daily/${safeDate}.json`
}

function buildWeatherRawForecastObjectPath(locationKey = '', timestamp = Date.now()) {
  const safeTimestamp = String(timestamp || Date.now()).replace(/[^0-9T:Z.-]/g, '')
  return `${buildWeatherLocationBasePath(locationKey)}/raw/forecast-${safeTimestamp}.json`
}

module.exports = {
  buildLocationKey,
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherLocationBasePath,
  buildWeatherManifestObjectPath,
  buildWeatherRawForecastObjectPath,
  normalizeLocationKey,
  normalizePathSegment
}
