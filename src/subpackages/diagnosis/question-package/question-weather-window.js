import { ref } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import {
  buildWeatherByDateFromEnvironmentWeatherWindow,
  mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline
} from '@/utils/care-behavior-weather-window.js'
import { isCareBehaviorWateringTimelineQuestion } from '@/utils/care-behavior-timeline.js'
import { isLightEnvironmentQuestion } from '@/utils/light-environment.js'
import { resolveDiagnosisCareLocation } from './question-care-location.js'
import {
  resolveCareBehaviorReferenceDate,
  resolveCareBehaviorWeatherLocation
} from './question-environment.js'

/**
 * 维护问诊阶段养护行为时间线所需的环境天气窗口。
 *
 * 原本内联在 question-flow.js 中；抽出后 question-flow.js 保持在 500 行以内。
 * 职责：解析诊断位置、按 locationKey+diagnosisDate 去重、拉取 environment weather window、
 * 将天气窗口 merge 进养护行为时间线（直接 mutate 传入的 careBehaviorTimelineByQuestionId ref）。
 */
export function useEnvironmentWeatherWindow({ result, plantStore, userStore }) {
  const environmentWeatherWindow = ref(null)
  const environmentWeatherByDate = ref({})
  const environmentWeatherWindowRequestKey = ref('')
  const environmentWeatherWindowLoading = ref(false)
  const environmentWeatherWindowError = ref('')

  function hydrateEnvironmentWeatherWindow(weatherWindow = null) {
    if (!weatherWindow || typeof weatherWindow !== 'object') {
      return false
    }
    const weatherByDate = buildWeatherByDateFromEnvironmentWeatherWindow(weatherWindow)
    if (!Object.keys(weatherByDate).length) {
      return false
    }
    environmentWeatherWindow.value = weatherWindow
    environmentWeatherByDate.value = weatherByDate
    return true
  }

  function applyEnvironmentWeatherWindowToCareBehaviorTimelines(careBehaviorTimelineByQuestionId) {
    if (!environmentWeatherWindow.value) {
      return
    }
    careBehaviorTimelineByQuestionId.value = Object.fromEntries(
      Object.entries(careBehaviorTimelineByQuestionId.value || {}).map(([questionId, timeline]) => [
        questionId,
        mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline(
          timeline,
          environmentWeatherWindow.value
        )
      ])
    )
  }

  async function refreshEnvironmentWeatherWindowForCareBehavior(
    questions,
    careBehaviorTimelineByQuestionId
  ) {
    environmentWeatherWindowError.value = ''
    try {
      const environmentQuestions = (Array.isArray(questions) ? questions : []).filter(
        item => isCareBehaviorWateringTimelineQuestion(item) || isLightEnvironmentQuestion(item)
      )
      if (!environmentQuestions.length || environmentWeatherWindowLoading.value) {
        return
      }
      const diagnosisDate = resolveCareBehaviorReferenceDate(environmentQuestions)
      const userPlantId = String(result.value?.userPlantId || '').trim()
      const independentLocation = userPlantId
        ? null
        : resolveCareBehaviorWeatherLocation(userStore.location || {})
      if (independentLocation) {
        environmentWeatherWindowLoading.value = true
        const weatherWindow = await getEnvironmentWeatherWindow({
          ...independentLocation,
          diagnosisDate,
          mode: 'diagnosis',
          plantId: String(result.value?.plantId || '').trim(),
          // 独立问诊刚创建，不能加入可能遗留的同 key 查询等待队列；这里必须用真实
          // wx.request 取得当前城市的诊断窗口，并在网络异常时由 timeout 释放页面初始化。
          forceRefresh: true,
          timeout: 8_000
        })
        if (hydrateEnvironmentWeatherWindow(weatherWindow)) {
          applyEnvironmentWeatherWindowToCareBehaviorTimelines(careBehaviorTimelineByQuestionId)
        }
        return
      }
      const location = await resolveDiagnosisCareLocation({
        result: result.value,
        plantStore,
        userLocation: userStore.location || {}
      })
      if (!location) {
        return
      }
      const requestKey = `${location.locationKey}|${diagnosisDate}`
      if (
        requestKey === environmentWeatherWindowRequestKey.value &&
        environmentWeatherWindow.value
      ) {
        applyEnvironmentWeatherWindowToCareBehaviorTimelines(careBehaviorTimelineByQuestionId)
        return
      }
      environmentWeatherWindowLoading.value = true
      const weatherWindow = await getEnvironmentWeatherWindow({
        lat: location.latitude,
        lng: location.longitude,
        city: location.cityName,
        locationKey: location.locationKey,
        careLocationId: location.careLocationId,
        source: location.source,
        plantId: location.plantId || result.value?.userPlantId || result.value?.plantId || '',
        diagnosisDate,
        mode: 'diagnosis'
      })
      if (weatherWindow) {
        hydrateEnvironmentWeatherWindow(weatherWindow)
        environmentWeatherWindowRequestKey.value = requestKey
        applyEnvironmentWeatherWindowToCareBehaviorTimelines(careBehaviorTimelineByQuestionId)
      }
    } catch (error) {
      console.warn('获取养护时间线环境天气失败:', error)
      environmentWeatherWindowError.value = '暂时无法加载当时的天气情况，请稍后重试。'
    } finally {
      environmentWeatherWindowLoading.value = false
    }
  }

  return {
    environmentWeatherWindow,
    environmentWeatherByDate,
    environmentWeatherWindowLoading,
    environmentWeatherWindowError,
    hydrateEnvironmentWeatherWindow,
    refreshEnvironmentWeatherWindowForCareBehavior
  }
}
