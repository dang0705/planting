import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'

export function buildEnvironmentWeatherQueryOptions({
  lat,
  lng,
  diagnosisDate = '',
  city = '',
  province = ''
} = {}) {
  const normalizedCity = String(city || '').trim()
  const normalizedProvince = String(province || '').trim()
  const normalizedDiagnosisDate = String(diagnosisDate || '').trim()

  return {
    queryKey: [
      'http-function',
      'weather-http',
      'environment-context',
      lat,
      lng,
      normalizedDiagnosisDate,
      normalizedCity,
      normalizedProvince
    ],
    queryFn: async () =>
      requestHttpFunction('weather-http/weather/environment-context', {
        method: 'POST',
        body: {
          lat,
          lng,
          diagnosisDate: normalizedDiagnosisDate,
          city: normalizedCity,
          province: normalizedProvince
        },
        auth: true
      }),
    staleTime: 30 * 60 * 1000
  }
}

export function fetchEnvironmentWeatherQuery(options = {}) {
  return runVueQueryQuery(buildEnvironmentWeatherQueryOptions(options))
}
