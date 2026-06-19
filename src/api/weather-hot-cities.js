import { requestHttpFunction } from '@/api/http'
import { normalizePlantCareLocation } from '@/utils/plant-care-location.js'

export async function fetchHotCityWeatherLocations() {
  const response = await requestHttpFunction('weather-http/weather/hot-cities', {
    method: 'GET',
    auth: true
  })
  const list = Array.isArray(response?.data?.list) ? response.data.list : []
  return list.map(item => normalizePlantCareLocation(item)).filter(Boolean)
}

export async function resolveHotCityByGps({ latitude, longitude, lat, lng } = {}) {
  const response = await requestHttpFunction('weather-http/weather/hot-cities/resolve', {
    method: 'POST',
    body: {
      lat: lat ?? latitude,
      lng: lng ?? longitude
    },
    auth: true
  })
  const data = response?.data || {}
  return {
    ...data,
    city: normalizePlantCareLocation(data.city)
  }
}
