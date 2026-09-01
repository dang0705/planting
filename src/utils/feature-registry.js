import { ref } from 'vue'

export const FEATURE_UNAVAILABLE_MESSAGES = Object.freeze({
  identify: '当前端暂未开放 AI 植物识别，敬请期待。',
  diagnosis: '当前端暂未开放 AI 植物诊断，敬请期待。',
  watering: '当前端暂未开放浇水提醒，敬请期待。',
  fertilization: '当前端暂未开放施肥提醒，敬请期待。',
  calendar: '当前端暂未开放日历提醒，敬请期待。',
  subscription: '当前端暂未开放订阅服务，敬请期待。',
  image: '当前端暂未开放植物图片，敬请期待。'
})

export function useFeatureUnavailableModal() {
  const openedFeatureKey = ref('')
  const visible = ref(false)

  function openFeatureUnavailable(featureKey) {
    openedFeatureKey.value = FEATURE_UNAVAILABLE_MESSAGES[featureKey] ? featureKey : ''
    visible.value = true
  }

  return { openedFeatureKey, visible, openFeatureUnavailable }
}
