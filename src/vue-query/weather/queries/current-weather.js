import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'
import { normalizeWeatherCoordinates } from '@/utils/weather-coordinate.js'

export function buildCurrentWeatherQueryOptions({
  lat,
  lng,
  city = '',
  province = '',
  useCache = true
} = {}) {
  const normalizedCity = String(city || '').trim()
  const normalizedProvince = String(province || '').trim()
  const location = normalizeWeatherCoordinates({ lat, lng }) || {}
  const normalizedLat = location.lat
  const normalizedLng = location.lng

  const queryOptions = {
    queryKey: [
      'http-function',
      'weather-http',
      'current',
      normalizedLat,
      normalizedLng,
      normalizedCity,
      normalizedProvince,
      useCache
    ],
    queryFn: async () =>
      requestHttpFunction('weather-http/weather/current', {
        method: 'POST',
        body: {
          lat: normalizedLat,
          lng: normalizedLng,
          city: normalizedCity,
          province: normalizedProvince,
          useCache
        },
        auth: true
      })
  }

  if (!useCache) {
    queryOptions.staleTime = 0
  }

  return queryOptions
}

export function fetchCurrentWeatherQuery(options = {}) {
  return runVueQueryQuery(buildCurrentWeatherQueryOptions(options))
}
