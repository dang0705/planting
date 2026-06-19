'use strict'

const INVALID_LOCATION_KEY_CHARS = /[^a-zA-Z0-9:_-]/g
const WEATHER_COORDINATE_PRECISION = 2

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

function normalizeCoordinate(value) {
  const text = normalizeCoordinateText(value)
  return text ? text.replace('-', 'm').replace('.', '_') : ''
}

function normalizeCoordinateNumber(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }
  const rounded = Number(number.toFixed(WEATHER_COORDINATE_PRECISION))
  return Object.is(rounded, -0) ? 0 : rounded
}

function normalizeCoordinateText(value) {
  const normalized = normalizeCoordinateNumber(value)
  if (normalized === null) {
    return ''
  }
  return normalized.toFixed(WEATHER_COORDINATE_PRECISION)
}

function normalizeWeatherCoordinates(input = {}) {
  const { lat, lng, latitude, longitude } = input || {}
  const normalizedLat = normalizeCoordinateNumber(lat ?? latitude)
  const normalizedLng = normalizeCoordinateNumber(lng ?? longitude)
  if (normalizedLat === null || normalizedLng === null) {
    return null
  }
  return {
    lat: normalizedLat,
    lng: normalizedLng,
    latText: normalizedLat.toFixed(WEATHER_COORDINATE_PRECISION),
    lngText: normalizedLng.toFixed(WEATHER_COORDINATE_PRECISION)
  }
}

function normalizeQWeatherLocation(input = {}) {
  const coordinates = normalizeWeatherCoordinates(input)
  if (!coordinates) {
    throw new Error('缺少位置参数：lat 和 lng')
  }
  return `${coordinates.lngText},${coordinates.latText}`
}

function stripCityNameSuffix(value = '') {
  return String(value || '')
    .trim()
    .replace(/(市|区|县|盟|州|旗)$/u, '')
    .trim()
}

function resolveHotCityKey({ cityName = '', city = '', lat, lng } = {}) {
  let resolveHotCityByKeyOrName
  let resolveHotCityLocation
  try {
    ;({ resolveHotCityByKeyOrName, resolveHotCityLocation } = require('./hot-city-locations'))
  } catch {
    return ''
  }
  const candidates = [cityName, city, stripCityNameSuffix(cityName), stripCityNameSuffix(city)]
    .map(value => String(value || '').trim())
    .filter(Boolean)
  for (const candidate of candidates) {
    const direct = resolveHotCityByKeyOrName(candidate)
    if (direct?.key) {
      return direct.key
    }
  }
  const numericLat = Number(lat)
  const numericLng = Number(lng)
  if (Number.isFinite(numericLat) && Number.isFinite(numericLng)) {
    const matched = resolveHotCityLocation({ latitude: numericLat, longitude: numericLng })
    if (matched?.matched && matched.city?.locationKey) {
      return matched.city.locationKey
    }
  }
  return ''
}

function buildLocationKey({
  locationKey = '',
  qweatherLocationId = '',
  cityName = '',
  city = '',
  lat,
  lng
} = {}) {
  const explicitKey = normalizeLocationKey(locationKey)
  if (explicitKey) {
    return explicitKey
  }

  const locationId = normalizePathSegment(qweatherLocationId, '')
  if (locationId) {
    return `qweather:${locationId}`
  }

  const hotCityKey = resolveHotCityKey({ cityName, city, lat, lng })
  if (hotCityKey) {
    return hotCityKey
  }

  const normalizedLat = normalizeCoordinate(lat)
  const normalizedLng = normalizeCoordinate(lng)
  if (normalizedLat && normalizedLng) {
    return `coord:${normalizedLng}_${normalizedLat}`
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

function buildWeatherWorkingObjectPath(locationKey = '', date = '') {
  const safeDate = String(date || '')
    .trim()
    .slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('天气 working 对象路径缺少合法日期')
  }
  return `${buildWeatherLocationBasePath(locationKey)}/working/${safeDate}.json`
}

function buildWeatherRawForecastObjectPath(locationKey = '', timestamp = Date.now()) {
  const safeTimestamp = String(timestamp || Date.now()).replace(/[^0-9T:Z.-]/g, '')
  return `${buildWeatherLocationBasePath(locationKey)}/raw/forecast-${safeTimestamp}.json`
}

module.exports = {
  WEATHER_COORDINATE_PRECISION,
  buildLocationKey,
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherLocationBasePath,
  buildWeatherManifestObjectPath,
  buildWeatherRawForecastObjectPath,
  buildWeatherWorkingObjectPath,
  normalizeCoordinate,
  normalizeCoordinateNumber,
  normalizeCoordinateText,
  normalizeLocationKey,
  normalizePathSegment,
  normalizeQWeatherLocation,
  normalizeWeatherCoordinates
}
