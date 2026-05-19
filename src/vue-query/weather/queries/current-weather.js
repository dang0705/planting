import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildCurrentWeatherQueryOptions({
  lat,
  lng,
  city = '',
  province = '',
  useCache = true
} = {}) {
  const normalizedCity = String(city || '').trim()
  const normalizedProvince = String(province || '').trim()

  const queryOptions = {
    queryKey: [
      'http-function',
      'weather-http',
      'current',
      lat,
      lng,
      normalizedCity,
      normalizedProvince,
      useCache
    ],
    queryFn: async () =>
      requestHttpFunction('weather-http/weather/current', {
        method: 'POST',
        body: { lat, lng, city: normalizedCity, province: normalizedProvince, useCache },
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
