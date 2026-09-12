import { computed, ref } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import {
  resolveWeatherLocation,
  todayStr
} from '@/pages/index/components/watering-reminder-options.js'

/**
 * watering-advisor 页的天气窗口加载 + planner locationKey 解析。
 *
 * 原本内联在 watering-advisor.vue 中；抽出后页面保持在 500 行以内。
 * 职责：按选中植物（我的植物优先 careLocation，目录植物回退 userStore.location）同源拉取
 * weather window，暴露 weatherDays/forecastDays/plannerLocationKey 给 planner 调用。
 *
 * D0 与 forecast 必须同源：选中"我的植物"时优先用 plant.careLocation 拉 weather window，
 * 否则会出现 D0 用 plant location、forecast 用 user GPS 的拼接错位，corrupting 摘要。
 * plant 无 careLocation 时 fallback 到 userStore.location（此时 D0 也用 user location，保持同源）。
 */
export function useWateringAdvisorWeather({ selectedCatalogPlant, plantStore, userStore }) {
  const weatherDays = ref([])
  const forecastDays = ref([])
  const weatherLocationKey = ref('')
  let requestVersion = 0

  function clearWeather() {
    weatherDays.value = []
    forecastDays.value = []
    weatherLocationKey.value = ''
  }

  function getSelectionKey(plant) {
    return [plant?.userPlantId || '', plant?.plantIdentityId || '', plant?.sessionPlantId || '']
      .map(value => String(value || '').trim())
      .join('|')
  }

  // D0 最新缓存注入契约：locationKey 统一从 plant.careLocation.locationKey 读取，
  // 用于后端从当天 day file.latestSample 注入当日天气；缺失时 todayWeatherSource='missing'。
  // 我的植物路径优先用 careLocation.locationKey；目录植物无 careLocation，兜底 weather window。
  const plannerLocationKey = computed(() => {
    const plant = selectedCatalogPlant.value
    if (plant?.userPlantId) {
      const userPlant = plantStore.userPlants?.find(item => item.id === plant.userPlantId)
      const fromCareLocation = userPlant?.careLocation?.locationKey || userPlant?.locationKey || ''
      if (fromCareLocation) {
        return String(fromCareLocation).trim()
      }
    }
    return String(weatherLocationKey.value || '').trim()
  })

  async function loadWeatherDays() {
    const selectedPlant = selectedCatalogPlant.value
    const selectionKey = getSelectionKey(selectedPlant)
    const version = ++requestVersion
    const userPlant = selectedPlant?.userPlantId
      ? plantStore.userPlants?.find(item => item.id === selectedPlant.userPlantId)
      : null
    const plantCareLocation = userPlant?.careLocation || null
    const locationSource = plantCareLocation
      ? {
          latitude: plantCareLocation.lat ?? plantCareLocation.latitude,
          longitude: plantCareLocation.lng ?? plantCareLocation.longitude,
          city: plantCareLocation.city || '',
          province: plantCareLocation.province || '',
          locationKey: plantCareLocation.locationKey || ''
        }
      : userStore.location
    const location = resolveWeatherLocation(locationSource)
    if (!location) {
      if (version === requestVersion) {
        clearWeather()
      }
      uni.showToast({ title: '未获取到定位，建议将使用默认天气', icon: 'none' })
      return
    }
    try {
      const window = await getEnvironmentWeatherWindow({
        ...location,
        // 透传 plant careLocation 的 locationKey，让后端用同一 key 解析 D0 day file
        ...(plantCareLocation?.locationKey ? { locationKey: plantCareLocation.locationKey } : {}),
        diagnosisDate: todayStr(),
        mode: 'environment'
      })
      if (
        version !== requestVersion ||
        selectionKey !== getSelectionKey(selectedCatalogPlant.value)
      ) {
        return
      }
      weatherDays.value = window?.historicalDays || window?.historical_days || []
      forecastDays.value = window?.forecastDays || window?.forecast_days || []
      weatherLocationKey.value = String(
        window?.locationKey || window?.location?.locationKey || ''
      ).trim()
    } catch {
      if (version === requestVersion) {
        clearWeather()
      }
    }
  }

  function resetWeatherDays() {
    requestVersion += 1
    clearWeather()
  }

  return {
    weatherDays,
    forecastDays,
    weatherLocationKey,
    plannerLocationKey,
    loadWeatherDays,
    resetWeatherDays
  }
}
