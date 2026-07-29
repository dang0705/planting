const STORAGE_KEY = 'plant_care_location_selection'
export const CARE_LOCATION_SOURCE = {
  GPS_MATCHED: 'gps_matched',
  MANUAL_SELECTED: 'manual_selected',
  LEGACY_USER_LOCATION: 'legacy_user_location'
}
const ALLOWED_CARE_LOCATION_SOURCES = new Set(Object.values(CARE_LOCATION_SOURCE))

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeSource(value = '', fallback = CARE_LOCATION_SOURCE.MANUAL_SELECTED) {
  const normalized = normalizeText(value)
  return ALLOWED_CARE_LOCATION_SOURCES.has(normalized) ? normalized : fallback
}

function hasOwnPayloadField(payload, key) {
  return Object.prototype.hasOwnProperty.call(payload, key)
}

export function normalizePlantCareLocation(input = null, source = '') {
  if (!input || typeof input !== 'object') {
    return null
  }
  const locationKey = normalizeText(input.locationKey || input.location_key || input.key)
  const cityName = normalizeText(input.cityName || input.city_name || input.name || input.city)
  const latitude = normalizeNumber(input.latitude ?? input.lat)
  const longitude = normalizeNumber(input.longitude ?? input.lng)
  if (!locationKey || !cityName || latitude === null || longitude === null) {
    return null
  }
  return {
    careLocationId: normalizeText(input.careLocationId || input.care_location_id || locationKey),
    locationKey,
    cityName,
    latitude,
    longitude,
    weatherLocation:
      normalizeText(input.weatherLocation || input.weather_location) ||
      `${longitude.toFixed(4)},${latitude.toFixed(4)}`,
    source: normalizeSource(source || input.source)
  }
}

export function saveSelectedPlantCareLocation(careLocation = null) {
  const normalized = normalizePlantCareLocation(careLocation)
  if (!normalized) {
    return null
  }
  try {
    uni.setStorageSync(STORAGE_KEY, normalized)
  } catch {
    // 本地暂存失败不影响 v-model 数据继续向上提交。
  }
  return normalized
}

export function readSelectedPlantCareLocation() {
  try {
    return normalizePlantCareLocation(uni.getStorageSync(STORAGE_KEY))
  } catch {
    return null
  }
}

export function clearSelectedPlantCareLocation() {
  try {
    uni.removeStorageSync(STORAGE_KEY)
  } catch {
    // 清理旧表单暂存失败不影响当前表单继续定位或手动选择。
  }
}

export function resolvePayloadCareLocation(payload = {}, options = {}) {
  const { allowStorageFallback = true } = options
  if (hasOwnPayloadField(payload, 'careLocation')) {
    return normalizePlantCareLocation(payload.careLocation)
  }
  if (hasOwnPayloadField(payload, 'plantCareLocation')) {
    return normalizePlantCareLocation(payload.plantCareLocation)
  }
  return allowStorageFallback ? readSelectedPlantCareLocation() : null
}

export function buildLegacyUserCareLocation(location = null) {
  const normalized = normalizePlantCareLocation(location, CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION)
  return normalized ? { ...normalized, source: CARE_LOCATION_SOURCE.LEGACY_USER_LOCATION } : null
}
