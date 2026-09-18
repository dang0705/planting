import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  DEFAULT_CACHE_KEY,
  resolveInitialDiagnosisResult,
  resolveQuestionPackagePayload
} from './payload.js'
import { getDiagnosisResult } from '../api/diagnosis.js'
import { isDiagnosisFlowAvailable } from '@/utils/platform-capabilities.js'

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

export function bindQuestionPackagePageEntry({
  routeOptions,
  payload,
  images,
  result,
  resetQuestionState
}) {
  const historyLoading = ref(false)
  const historyError = ref('')
  const historyRecordId = ref('')

  async function loadHistoryResult(id = historyRecordId.value) {
    const recordId = String(id || '').trim()
    if (!recordId || historyLoading.value) {
      return
    }
    historyRecordId.value = recordId
    historyLoading.value = true
    historyError.value = ''
    result.value = null
    try {
      const historyResult = await getDiagnosisResult({ id: recordId })
      if (!historyResult || typeof historyResult !== 'object') {
        throw new Error('诊断记录不存在')
      }
      payload.value = {
        diagnosisResult: historyResult,
        plantName: historyResult.plantName || '植物'
      }
      images.value = Array.isArray(historyResult.images) ? historyResult.images : []
      result.value = resolveInitialDiagnosisResult(payload.value)
      await resetQuestionState(result.value?.questions || [])
    } catch {
      result.value = null
      historyError.value = '暂时无法加载诊断记录，请检查网络后重试。'
    } finally {
      historyLoading.value = false
    }
  }

  if (!isDiagnosisFlowAvailable()) {
    return { historyLoading, historyError, historyRecordId, loadHistoryResult }
  }
  onLoad(async options => {
    routeOptions.value = options || {}
    const historyId = String(options?.id || options?.resultId || '').trim()
    if (historyId) {
      await loadHistoryResult(historyId)
      return
    }
    const cacheKey =
      String(
        options?.draftKey || options?.cacheKey || options?.payloadKey || DEFAULT_CACHE_KEY
      ).trim() || DEFAULT_CACHE_KEY
    payload.value = resolveQuestionPackagePayload(routeOptions.value, cacheKey)
    images.value = Array.isArray(payload.value?.images) ? payload.value.images : []
    result.value = resolveInitialDiagnosisResult(payload.value)
    await resetQuestionState(result.value?.questions || [])
  })
  return { historyLoading, historyError, historyRecordId, loadHistoryResult }
}
