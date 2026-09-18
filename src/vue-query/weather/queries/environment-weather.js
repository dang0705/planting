import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'
import { normalizeWeatherCoordinates } from '@/utils/weather-coordinate.js'

export const ENVIRONMENT_WEATHER_STALE_TIME_MS = 5 * 60 * 1000

export function buildEnvironmentWeatherQueryOptions({
  lat,
  lng,
  diagnosisDate = '',
  city = '',
  province = '',
  mode = '',
  locationKey = '',
  careLocationId = '',
  source = '',
  plantId = ''
} = {}) {
  const normalizedCity = String(city || '').trim()
  const normalizedProvince = String(province || '').trim()
  const normalizedDiagnosisDate = String(diagnosisDate || '').trim()
  const normalizedMode = String(mode || '')
    .trim()
    .toLowerCase()
  const normalizedLocationKey = String(locationKey || '').trim()
  const location = normalizeWeatherCoordinates({ lat, lng }) || {}
  const normalizedLat = location.lat
  const normalizedLng = location.lng

  return {
    queryKey: [
      'http-function',
      'weather-http',
      'environment-context',
      normalizedLat,
      normalizedLng,
      normalizedDiagnosisDate,
      normalizedCity,
      normalizedProvince,
      normalizedMode,
      normalizedLocationKey,
      String(careLocationId || '').trim(),
      String(source || '').trim(),
      String(plantId || '').trim()
    ],
    queryFn: async () =>
      requestHttpFunction('weather-http/weather/environment-context', {
        method: 'POST',
        body: {
          lat: normalizedLat,
          lng: normalizedLng,
          diagnosisDate: normalizedDiagnosisDate,
          city: normalizedCity,
          province: normalizedProvince,
          mode: normalizedMode,
          locationKey: normalizedLocationKey,
          careLocationId,
          source,
          plantId
        },
        auth: true
      }),
    // 当天 D0 由缓存采样或实时天气注入，30 分钟旧快照会让日历显示过期天气；
    // 保留 Vue Query 去重/缓存能力，但把窗口的新鲜度与位置天气查询统一到 5 分钟。
    staleTime: ENVIRONMENT_WEATHER_STALE_TIME_MS
  }
}

export function fetchEnvironmentWeatherQuery(options = {}) {
  return runVueQueryQuery(buildEnvironmentWeatherQueryOptions(options))
}
