import { requestHttpFunction } from '@/api/http'
import { runVueQueryQuery } from '@/lib/vue-query-runtime.js'
import { normalizeWeatherCoordinates } from '@/utils/weather-coordinate.js'

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
    staleTime: 30 * 60 * 1000
  }
}

export function fetchEnvironmentWeatherQuery(options = {}) {
  return runVueQueryQuery(buildEnvironmentWeatherQueryOptions(options))
}
