import { useMutation } from '@tanstack/vue-query'
import { requestDiagnosisQuestionStart } from '@/http-functions/diagnose/client'
import {
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks
} from './shared'

function normalizeQuestionStartPayload({
  plantId,
  userPlantId,
  plantCatalogId,
  plantName,
  symptomClassKey,
  symptomKey,
  description,
  skipAuth = false
} = {}) {
  if (!plantId && !userPlantId && !plantCatalogId) {
    throw new Error('缺少植物ID，无法开始问诊')
  }

  const normalizedSymptomClassKey = String(symptomClassKey || '').trim()
  if (!normalizedSymptomClassKey) {
    throw new Error('请选择症状模式')
  }

  return {
    plantId,
    userPlantId: userPlantId || plantId || null,
    ...(plantCatalogId ? { plantCatalogId } : {}),
    ...(plantName ? { plantName } : {}),
    symptomClassKey: normalizedSymptomClassKey,
    ...(symptomKey ? { symptomKey } : {}),
    ...(description ? { description } : {}),
    skipAuth,
    clientContext: {
      source: 'DiagnosePopup',
      platform: resolveQuestionStartClientPlatform(),
      reviewSourceType: 'manual_symptom_mode',
      visualInputVersion: 'manual_symptom_mode_v1',
      structuredImageCount: 0
    }
  }
}

function resolveQuestionStartClientPlatform() {
  try {
    if (typeof wx !== 'undefined' && typeof wx?.cloud !== 'undefined') {
      return 'wechat-mini-program'
    }
  } catch {
    // ignore runtime probe failures
  }

  return 'web'
}

export function useDiagnosisQuestionStartMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'question-start'],
    mutationFn: async ({
      plantId,
      userPlantId,
      plantCatalogId,
      plantName,
      symptomClassKey,
      symptomKey,
      description,
      onText,
      onFinish,
      onError,
      skipAuth = false
    } = {}) => {
      try {
        onText?.('正在生成问诊...', '正在生成问诊...')
        const requestPayload = normalizeQuestionStartPayload({
          plantId,
          userPlantId,
          plantCatalogId,
          plantName,
          symptomClassKey,
          symptomKey,
          description,
          skipAuth
        })
        const normalizedResult = await requestDiagnosisQuestionStart(requestPayload)
        return runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish })
      } catch (error) {
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
