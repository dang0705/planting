import { ref } from 'vue'
import { getEnvironmentWeatherWindow } from '@/api/weather.js'
import { mergeEnvironmentWeatherWindowIntoCareBehaviorTimeline } from '@/utils/care-behavior-weather-window.js'
import {
  isCareBehaviorWateringTimelineQuestion,
  isLightEnvironmentQuestion
} from '@/utils/care-behavior-timeline.js'
import { resolveDiagnosisCareLocation } from './question-care-location.js'
import { resolveCareBehaviorReferenceDate } from './question-environment.js'

/**
 * 维护问诊阶段养护行为时间线所需的环境天气窗口。
 *
 * 原本内联在 question-flow.js 中；抽出后 question-flow.js 保持在 500 行以内。
 * 职责：解析诊断位置、按 locationKey+diagnosisDate 去重、拉取 environment weather window、
 * 将天气窗口 merge 进养护行为时间线（直接 mutate 传入的 careBehaviorTimelineByQuestionId ref）。
 */
export function useEnvironmentWeatherWindow({ result, plantStore, userStore }) {
  const environmentWeatherWindow = ref(null)
  const environmentWeatherWindowRequestKey = ref('')
  const environmentWeatherWindowLoading = ref(false)
  const environmentWeatherWindowError = ref('')

  function applyEnvironmentWeatherWindowToCareBehaviorTimelines(
    careBehaviorTimelineByQuestionId
  ) {
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
      const location = await resolveDiagnosisCareLocation({
        result: result.value,
        plantStore,
        userLocation: userStore.location || {}
      })
      if (!location) {
        return
      }
      const diagnosisDate = resolveCareBehaviorReferenceDate(environmentQuestions)
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
        environmentWeatherWindow.value = weatherWindow
        environmentWeatherWindowRequestKey.value = requestKey
        applyEnvironmentWeatherWindowToCareBehaviorTimelines(careBehaviorTimelineByQuestionId)
      }
    } catch (error) {
      console.warn('获取养护时间线环境天气失败:', error)
      environmentWeatherWindowError.value = String(
        error?.message || error?.msg || '养护时间线天气加载失败，请稍后重试。'
      ).trim()
    } finally {
      environmentWeatherWindowLoading.value = false
    }
  }

  return {
    environmentWeatherWindow,
    environmentWeatherWindowLoading,
    environmentWeatherWindowError,
    refreshEnvironmentWeatherWindowForCareBehavior
  }
}
