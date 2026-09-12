'use strict'

let geolib = null
try {
  geolib = require('geolib')
} catch {
  geolib = null
}

const HOT_CITY_SOURCE = {
  GPS_MATCHED: 'gps_matched',
  MANUAL_SELECTED: 'manual_selected',
  LEGACY_USER_LOCATION: 'legacy_user_location'
}

const HOT_CITY_INGESTION_KEYS_ENV = 'WEATHER_HOT_CITY_INGESTION_KEYS'
const ALLOWED_HOT_CITY_SOURCES = new Set(Object.values(HOT_CITY_SOURCE))
const HOT_CITY_WEATHER_LOCATIONS = [
  { key: 'city:beijing', name: '北京', latitude: 39.9042, longitude: 116.4074, radiusM: 70000 },
  { key: 'city:shanghai', name: '上海', latitude: 31.2304, longitude: 121.4737, radiusM: 60000 },
  { key: 'city:guangzhou', name: '广州', latitude: 23.1291, longitude: 113.2644, radiusM: 40000 },
  { key: 'city:shenzhen', name: '深圳', latitude: 22.5431, longitude: 114.0579, radiusM: 35000 },
  { key: 'city:chengdu', name: '成都', latitude: 30.5728, longitude: 104.0668, radiusM: 70000 },
  { key: 'city:hangzhou', name: '杭州', latitude: 30.2741, longitude: 120.1551, radiusM: 50000 },
  { key: 'city:wuhan', name: '武汉', latitude: 30.5928, longitude: 114.3055, radiusM: 65000 },
  {
    key: 'city:chongqing',
    name: '重庆',
    latitude: Number('29.5630'),
    longitude: 106.5516,
    radiusM: 80000
  },
  { key: 'city:nanjing', name: '南京', latitude: 32.0603, longitude: 118.7969, radiusM: 50000 },
  { key: 'city:suzhou', name: '苏州', latitude: 31.2989, longitude: 120.5853, radiusM: 45000 },
  { key: 'city:xian', name: '西安', latitude: 34.3416, longitude: 108.9398, radiusM: 60000 },
  { key: 'city:zhengzhou', name: '郑州', latitude: 34.7466, longitude: 113.6254, radiusM: 60000 },
  { key: 'city:tianjin', name: '天津', latitude: 39.3434, longitude: 117.3616, radiusM: 60000 },
  { key: 'city:changsha', name: '长沙', latitude: 28.2282, longitude: 112.9388, radiusM: 55000 },
  { key: 'city:qingdao', name: '青岛', latitude: 36.0671, longitude: 120.3826, radiusM: 55000 },
  {
    key: 'city:ningbo',
    name: '宁波',
    latitude: 29.8683,
    longitude: Number('121.5440'),
    radiusM: 50000
  },
  { key: 'city:dongguan', name: '东莞', latitude: 23.0207, longitude: 113.7518, radiusM: 30000 },
  { key: 'city:foshan', name: '佛山', latitude: 23.0215, longitude: 113.1214, radiusM: 35000 },
  { key: 'city:hefei', name: '合肥', latitude: 31.8206, longitude: 117.2272, radiusM: 55000 },
  { key: 'city:xiamen', name: '厦门', latitude: 24.4798, longitude: 118.0894, radiusM: 35000 }
]

function splitCityList(value = '') {
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function parseHotCityKeys(value = '') {
  const seen = new Set()
  const keys = []
  for (const item of splitCityList(value)) {
    const normalized = String(item).trim()
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    keys.push(normalized)
  }
  return keys
}

function getConfiguredHotCityKeys({ env = process.env } = {}) {
  const keySource = String((env && env[HOT_CITY_INGESTION_KEYS_ENV]) || '').trim()
  if (!keySource) {
    return []
  }
  return parseHotCityKeys(keySource)
}

function listConfiguredHotCitiesForIngestion({ env = process.env } = {}) {
  const requested = getConfiguredHotCityKeys({ env })
  if (!requested.length) {
    return HOT_CITY_WEATHER_LOCATIONS
  }

  const seen = new Set()
  const results = []
  for (const item of requested) {
    const normalized = String(item).trim()
    const city =
      resolveHotCityByKeyOrName(normalized) || resolveHotCityByKeyOrName(`city:${normalized}`)
    if (!city || !city.key || seen.has(city.key)) {
      continue
    }
    seen.add(city.key)
    results.push(city)
  }
  return results.length ? results : HOT_CITY_WEATHER_LOCATIONS
}

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundCoordinatesForHotCity({ lat, lng, latitude, longitude } = {}) {
  const normalizedLat = normalizeNumber(lat ?? latitude)
  const normalizedLng = normalizeNumber(lng ?? longitude)
  if (normalizedLat === null || normalizedLng === null) {
    return null
  }
  return {
    latitude: Number(normalizedLat.toFixed(2)),
    longitude: Number(normalizedLng.toFixed(2))
  }
}

function fallbackDistanceMeters(from, to) {
  const earthRadius = 6371000
  const toRad = degree => (degree * Math.PI) / 180
  const dLat = toRad(to.latitude - from.latitude)
  const dLng = toRad(to.longitude - from.longitude)
  const lat1 = toRad(from.latitude)
  const lat2 = toRad(to.latitude)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

function getDistanceMeters(from, to) {
  if (geolib?.getDistance) {
    return geolib.getDistance(from, to)
  }
  return fallbackDistanceMeters(from, to)
}

function findNearestCity(coordinates) {
  if (geolib?.findNearest) {
    return geolib.findNearest(coordinates, HOT_CITY_WEATHER_LOCATIONS)
  }
  return HOT_CITY_WEATHER_LOCATIONS.reduce((nearest, city) => {
    const distanceM = getDistanceMeters(coordinates, city)
    return !nearest || distanceM < nearest.distanceM ? { ...city, distanceM } : nearest
  }, null)
}

function normalizeSource(value = '', fallback = HOT_CITY_SOURCE.MANUAL_SELECTED) {
  const normalized = String(value || '').trim()
  return ALLOWED_HOT_CITY_SOURCES.has(normalized) ? normalized : fallback
}

function toSelectedHotCity(
  city = {},
  { source = HOT_CITY_SOURCE.MANUAL_SELECTED, distanceM = null } = {}
) {
  if (!city?.key) {
    return null
  }
  return {
    careLocationId: city.key,
    locationKey: city.key,
    cityName: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone || 'Asia/Shanghai',
    isActive: city.isActive !== false,
    weatherLocation: `${city.longitude.toFixed(4)},${city.latitude.toFixed(4)}`,
    source: normalizeSource(source),
    ...(distanceM !== null ? { distanceM } : {})
  }
}

function resolveHotCityByKeyOrName(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {
    return null
  }
  return (
    HOT_CITY_WEATHER_LOCATIONS.find(city => city.key === normalized || city.name === normalized) ||
    null
  )
}

function resolveHotCityLocation(input = {}) {
  const coordinates = roundCoordinatesForHotCity(input)
  if (!coordinates) {
    return { matched: false, reason: 'coordinates_missing', coordinates: null, city: null }
  }

  const nearest = findNearestCity(coordinates)
  if (!nearest) {
    return { matched: false, reason: 'hot_city_empty', coordinates, city: null }
  }
  const distanceM =
    nearest.distanceM !== undefined ? nearest.distanceM : getDistanceMeters(coordinates, nearest)
  const matched = distanceM <= Number(nearest.radiusM || 0)
  return {
    matched,
    reason: matched ? 'nearest_city_matched' : 'nearest_city_outside_radius',
    distanceM,
    coordinates,
    city: toSelectedHotCity(nearest, { source: HOT_CITY_SOURCE.GPS_MATCHED, distanceM }),
    nearestCity: {
      key: nearest.key,
      name: nearest.name,
      radiusM: nearest.radiusM,
      distanceM
    }
  }
}

function listHotCitiesForClient() {
  return HOT_CITY_WEATHER_LOCATIONS.map(city => ({
    key: city.key,
    name: city.name,
    cityName: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    radiusM: city.radiusM,
    weatherLocation: `${city.longitude.toFixed(4)},${city.latitude.toFixed(4)}`
  }))
}

function toSeasonTriggerCity(city = {}) {
  if (!city?.key) {
    return null
  }
  return {
    locationKey: city.key,
    key: city.key,
    cityName: city.name,
    name: city.name,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: city.timezone || 'Asia/Shanghai',
    isActive: city.isActive !== false
  }
}

function resolveHotCityForSeasonTrigger(locationKey = '') {
  const city =
    resolveHotCityByKeyOrName(locationKey) ||
    resolveHotCityByKeyOrName(`city:${String(locationKey || '').trim()}`)
  return toSeasonTriggerCity(city)
}

module.exports = {
  ALLOWED_HOT_CITY_SOURCES,
  HOT_CITY_INGESTION_KEYS_ENV,
  HOT_CITY_WEATHER_LOCATIONS,
  HOT_CITY_SOURCE,
  listHotCitiesForClient,
  normalizeSource,
  parseHotCityKeys,
  resolveHotCityForSeasonTrigger,
  resolveHotCityByKeyOrName,
  resolveHotCityLocation,
  getConfiguredHotCityKeys,
  listConfiguredHotCitiesForIngestion,
  roundCoordinatesForHotCity,
  splitCityList,
  toSelectedHotCity
}
