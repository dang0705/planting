import { computed, ref } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { estimatePotVolumeMl, formatMlRangeToBottleText } from '@/utils/water-volume-format.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import {
  buildPlannerSummaryRows,
  buildWateringReminderInputSignature,
  fetchWateringPlannerResult,
  resolveWeatherLocation,
  todayStr
} from './watering-reminder-options.js'

/**
 * 浇水提醒的天气窗口 + planner 协调逻辑。
 *
 * 原本内联在 WateringReminderSheet.vue 中；抽出后组件保持在 500 行以内。
 * 职责：按 plant.careLocation（缺失时回退 userStore.location）同源拉取 weather window、
 * 暴露 plannerLocationKey/plannerTimezone、调用 fetchWateringPlannerResult、
 * 派生 amountBottleText / plannerSummaryRows / isOverWateringBlocked 等展示态。
 *
 * D0 与 forecast 必须同源：优先用 plant.careLocation 拉 weather window，否则会出现
 * D0 用 plant location、forecast 用 user GPS 的拼接错位，corrupting humidity/rain/temp 摘要。
 */
export function useWateringReminderPlanner({ props, userStore, selectedWateringEventsForPlanner }) {
  const plannerResult = ref(null)
  const hasWeatherRef = ref(false)
  const weatherDays = ref([])
  const forecastDays = ref([])
  const environmentWeatherWindow = ref(null)
  const weatherLoading = ref(false)
  const loading = ref(false)

  // D0 注入契约：locationKey 统一从 plant.careLocation.locationKey 读取，
  // 用于后端从 day file latestSample 注入当日天气；缺失时 todayWeatherSource='missing'。
  const plannerLocationKey = computed(() => {
    const fromPlant =
      props.plant?.careLocation?.locationKey || props.plant?.locationKey || ''
    const fromWindow =
      environmentWeatherWindow.value?.locationKey ||
      environmentWeatherWindow.value?.location?.locationKey ||
      ''
    return String(fromPlant || fromWindow || '').trim()
  })
  const plannerTimezone = computed(() => {
    const fromWindow =
      environmentWeatherWindow.value?.location?.timezone ||
      environmentWeatherWindow.value?.meta?.timezone ||
      ''
    return String(fromWindow || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  })
  const potVolumeMl = computed(
    () => plannerResult.value?.potVolumeMl || estimatePotVolumeMl(props.plant?.potProfile)
  )
  const isOverWateringBlocked = computed(
    () => plannerResult.value?.wateringContext === 'likely_too_wet'
  )
  const amountBottleText = computed(() => {
    // 前端负责单位换算，不依赖后端 amountBottleText
    if (Array.isArray(plannerResult.value?.amountRangeMl)) {
      return formatMlRangeToBottleText(plannerResult.value.amountRangeMl)
    }
    return ''
  })
  const plannerSummaryRows = computed(() => {
    return buildPlannerSummaryRows({
      plannerResult: plannerResult.value,
      amountBottleText: amountBottleText.value,
      isOverWateringBlocked: isOverWateringBlocked.value,
      potVolumeMl: potVolumeMl.value
    })
  })

  function resetWeatherPlannerState() {
    plannerResult.value = null
    hasWeatherRef.value = false
    weatherDays.value = []
    forecastDays.value = []
    environmentWeatherWindow.value = null
  }

  async function loadWeatherDays() {
    // D0 与 forecast 必须同源：优先用 plant.careLocation 拉 weather window，
    // 否则会出现 D0 用 plant location、forecast 用 user GPS 的拼接错位，corrupting 摘要。
    // plant 无 careLocation 时 fallback 到 userStore.location（此时 D0 也用 user location，保持同源）。
    const plantCareLocation = props.plant?.careLocation || null
    const plantLocationSource = plantCareLocation
      ? {
          latitude: plantCareLocation.lat ?? plantCareLocation.latitude,
          longitude: plantCareLocation.lng ?? plantCareLocation.longitude,
          city: plantCareLocation.city || '',
          province: plantCareLocation.province || '',
          locationKey: plantCareLocation.locationKey || ''
        }
      : userStore.location
    const location = resolveWeatherLocation(plantLocationSource)
    if (!location) {
      hasWeatherRef.value = false
      weatherDays.value = []
      return
    }
    weatherLoading.value = true
    try {
      const window = await getEnvironmentWeatherWindow({
        ...location,
        // 透传 plant careLocation 的 locationKey，让后端用同一 key 解析 D0 day file
        ...(plantLocationSource.locationKey
          ? { locationKey: plantLocationSource.locationKey }
          : {}),
        diagnosisDate: todayStr(),
        mode: 'environment'
      })
      environmentWeatherWindow.value = window || null
      weatherDays.value = window?.historicalDays || window?.historical_days || []
      forecastDays.value = window?.forecastDays || window?.forecast_days || []
      hasWeatherRef.value = weatherDays.value.length > 0 || forecastDays.value.length > 0
    } finally {
      weatherLoading.value = false
    }
  }

  async function fetchPlanner() {
    if (!props.plant?.id) {
      return
    }
    loading.value = true
    try {
      const result = await fetchWateringPlannerResult({
        plantId: props.plant.id,
        wateringEvents: selectedWateringEventsForPlanner.value,
        weatherDays: weatherDays.value,
        forecastDays: forecastDays.value,
        locationKey: plannerLocationKey.value,
        timezone: plannerTimezone.value
      })
      if (result) {
        plannerResult.value = result
      }
    } catch (error) {
      uni.showToast({ title: error?.message || '建议计算失败，请重试', icon: 'none' })
    } finally {
      loading.value = false
    }
  }

  return {
    plannerResult,
    loading,
    hasWeatherRef,
    weatherLoading,
    environmentWeatherWindow,
    plannerLocationKey,
    plannerTimezone,
    potVolumeMl,
    isOverWateringBlocked,
    amountBottleText,
    plannerSummaryRows,
    resetWeatherPlannerState,
    loadWeatherDays,
    fetchPlanner
  }
}

// 供 timelineInput 派生使用（合并 weather window 到 timeline base）
export { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline }
export { buildWateringReminderInputSignature }
