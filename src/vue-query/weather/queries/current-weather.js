import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildCurrentWeatherQueryOptions({ lat, lng, useCache = true } = {}) {
  return {
    queryKey: ['http-function', 'weather-http', 'current', lat, lng, useCache],
    queryFn: async () =>
      requestHttpFunction('weather-http/weather/current', {
        method: 'POST',
        body: { lat, lng, useCache },
        auth: true
      })
  }
}

export function fetchCurrentWeatherQuery(options = {}) {
  return runVueQueryQuery(buildCurrentWeatherQueryOptions(options))
}
