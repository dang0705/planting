export const WEATHER_COORDINATE_PRECISION = 2

export function normalizeWeatherCoordinate(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }
  const rounded = Number(number.toFixed(WEATHER_COORDINATE_PRECISION))
  return Object.is(rounded, -0) ? 0 : rounded
}

export function normalizeWeatherCoordinateText(value) {
  const normalized = normalizeWeatherCoordinate(value)
  if (normalized === null) {
    return ''
  }
  return normalized.toFixed(WEATHER_COORDINATE_PRECISION)
}

export function normalizeWeatherCoordinates(location = {}) {
  const latitude = normalizeWeatherCoordinate(location.latitude ?? location.lat)
  const longitude = normalizeWeatherCoordinate(location.longitude ?? location.lng)
  if (latitude === null || longitude === null) {
    return null
  }
  return {
    latitude,
    longitude,
    lat: latitude,
    lng: longitude
  }
}
