import { onMounted, onUnmounted, ref } from 'vue'
import {
  getCurrentLocation,
  getWeatherInfo,
  formatWeatherDisplay,
  checkLocationPermission,
  requestLocationPermission
} from '@/api/weather.js'
import { WEATHER_CONFIG } from '@/config/weather'
import { useUserStore } from '@/store/user.js'

const WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000
const TOAST_DURATION_MS = 1500
const DEFAULT_WEATHER_TEXT = '🌤️ --°C'

function hasValidCoordinates(location = {}) {
  const latitude = location.latitude
  const longitude = location.longitude
  return (
    latitude !== undefined &&
    latitude !== null &&
    latitude !== '' &&
    longitude !== undefined &&
    longitude !== null &&
    longitude !== '' &&
    Number.isFinite(Number(latitude)) &&
    Number.isFinite(Number(longitude))
  )
}

function resolveCityText(city = '') {
  if (typeof city === 'string') {
    return city.trim()
  }
  if (!city || typeof city !== 'object') {
    return ''
  }
  const candidates = [
    city.cityName,
    city.city,
    city.name,
    city.displayName,
    city.cityNameCn,
    city.locationName,
    city.label,
    city.value
  ]
  for (const candidate of candidates) {
    const normalized = resolveCityText(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function resolveProvinceText(province = '') {
  if (typeof province === 'string') {
    return province.trim()
  }
  if (!province || typeof province !== 'object') {
    return ''
  }
  const candidates = [
    province.provinceName,
    province.province,
    province.name,
    province.displayName,
    province.label,
    province.value
  ]
  for (const candidate of candidates) {
    const normalized = resolveCityText(candidate)
    if (normalized) {
      return normalized
    }
  }
  return ''
}

function normalizeCityPayload(cityData = {}) {
  const latitude = cityData.latitude ?? cityData.lat
  const longitude = cityData.longitude ?? cityData.lng
  const resolvedCity = resolveCityText(
    cityData.cityName || cityData.city || cityData.name || cityData.locationName
  )
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude)) || !resolvedCity) {
    return null
  }
  return {
    city: resolvedCity,
    province: resolveProvinceText(cityData.province),
    latitude: Number(latitude),
    longitude: Number(longitude)
  }
}

export function useHeaderWeather() {
  const userStore = useUserStore()
  const location = ref('获取位置...')
  const gpsLocation = ref('')
  const weather = ref(DEFAULT_WEATHER_TEXT)
  const cacheEnabled = ref(WEATHER_CONFIG.USE_CACHE)
  let refreshTimer = null

  async function refreshWeather() {
    try {
      weather.value = '🌤️ 加载中...'
      const currentLocation = userStore.location || {}
      if (!hasValidCoordinates(currentLocation)) {
        weather.value = DEFAULT_WEATHER_TEXT
        return
      }

      const weatherData = await getWeatherInfo({
        lat: currentLocation.latitude,
        lng: currentLocation.longitude,
        city: currentLocation.city,
        province: currentLocation.province,
        useCache: cacheEnabled.value
      })
      weather.value = formatWeatherDisplay(weatherData)
    } catch {
      weather.value = DEFAULT_WEATHER_TEXT
    }
  }

  async function getCurrentLocationAndWeather() {
    location.value = '获取位置...'
    gpsLocation.value = '获取位置...'
    weather.value = DEFAULT_WEATHER_TEXT

    const permissionStatus = await checkLocationPermission()
    if (permissionStatus === 'denied') {
      location.value = '位置权限未授权'
      gpsLocation.value = '位置权限未授权'
      return
    }

    if (permissionStatus === 'notRequested') {
      try {
        await requestLocationPermission()
      } catch {
        location.value = '位置权限未授权'
        gpsLocation.value = '位置权限未授权'
        return
      }
    }

    try {
      const locationData = await getCurrentLocation()
      const resolvedCity = resolveCityText(locationData.city) || '当前位置'
      location.value = resolvedCity
      gpsLocation.value = resolvedCity
      userStore.setLocation({
        province: resolveProvinceText(locationData.province),
        city: resolvedCity,
        latitude: locationData.latitude,
        longitude: locationData.longitude
      })
      await refreshWeather()
    } catch (error) {
      if (error?.message === 'auth_denied' || error?.errMsg?.includes?.('auth deny')) {
        location.value = '位置权限未授权'
        gpsLocation.value = '位置权限未授权'
      } else if (error?.message === 'location_failed') {
        location.value = '定位失败'
        gpsLocation.value = '定位失败'
      } else {
        location.value = '位置获取失败'
        gpsLocation.value = '位置获取失败'
      }
      weather.value = DEFAULT_WEATHER_TEXT
    }
  }

  async function initLocationAndWeather() {
    try {
      await getCurrentLocationAndWeather()
    } catch {
      const currentLocation = userStore.location || {}
      if (currentLocation.city && hasValidCoordinates(currentLocation)) {
        location.value = resolveCityText(currentLocation.city)
        await refreshWeather()
        return
      }
      location.value = '位置获取失败'
      gpsLocation.value = '位置获取失败'
      weather.value = DEFAULT_WEATHER_TEXT
    }
  }

  async function selectLocation() {
    try {
      await getCurrentLocationAndWeather()
      uni.showToast({ title: '位置已更新', icon: 'success', duration: TOAST_DURATION_MS })
    } catch {
      uni.showToast({ title: '位置获取失败', icon: 'none' })
    }
  }

  async function setCityLocation(cityData = {}) {
    const normalizedCityPayload = normalizeCityPayload(cityData)
    if (!normalizedCityPayload) {
      return false
    }

    location.value = normalizedCityPayload.city
    userStore.setLocation({
      province: normalizedCityPayload.province,
      city: normalizedCityPayload.city,
      latitude: normalizedCityPayload.latitude,
      longitude: normalizedCityPayload.longitude
    })
    await refreshWeather()
    return true
  }

  function toggleCache() {
    cacheEnabled.value = !cacheEnabled.value
    uni.showToast({
      title: cacheEnabled.value ? '缓存已启用' : '缓存已禁用',
      icon: 'none',
      duration: TOAST_DURATION_MS
    })
    refreshWeather()
  }

  onMounted(async () => {
    await initLocationAndWeather()
    refreshTimer = setInterval(refreshWeather, WEATHER_REFRESH_INTERVAL_MS)
  })

  onUnmounted(() => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  })

  return {
    location,
    gpsLocation,
    weather,
    cacheEnabled,
    selectLocation,
    toggleCache,
    setCityLocation,
    refreshWeather
  }
}
