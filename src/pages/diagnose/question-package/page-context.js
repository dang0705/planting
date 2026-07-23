import { computed } from 'vue'

function resolveQuestionPackageModeTitle(mode = '') {
  if (mode === 'specific_pest_visual') {
    return '虫害细节确认'
  }
  return mode === 'wilting_droop' ? '发蔫或下垂问诊' : '叶子发黄问诊'
}

export function useQuestionPackageContext({ payload, result, routeOptions }) {
  const plantName = computed(() => {
    const plant = payload.value?.plant || payload.value?.plantInfo || {}
    return String(
      payload.value?.plantName ||
        plant.displayName ||
        plant.name ||
        result.value?.plantName ||
        routeOptions.value?.plantName ||
        '植物'
    ).trim()
  })
  const questionDiagnosisContextText = computed(() => {
    const mode = String(result.value?.questionPackage?.mode || '').trim()
    return `针对${plantName.value || '植物'}的${resolveQuestionPackageModeTitle(mode)}`
  })

  return { plantName, questionDiagnosisContextText }
}
