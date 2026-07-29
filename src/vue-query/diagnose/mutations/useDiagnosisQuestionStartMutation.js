import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { requestDiagnosisQuestionStart } from '@/http-functions/diagnose/client'
import { handleDiagnoseError, runDiagnoseSuccessCallbacks } from './shared'

const QUESTION_START_CACHE_STALE_MS = 1000 * 45

function makeQuestionStartCacheKey(payload = {}) {
  const userPlantId = String(payload.userPlantId || payload.plantId || '').trim()
  const plantCatalogId = String(payload.plantCatalogId || '').trim()
  const symptomClassKey = String(payload.symptomClassKey || '').trim()
  const symptomKey = String(payload.symptomKey || '').trim()
  const description = String(payload.description || '').trim()
  const platform = String(payload.clientContext?.platform || 'web').trim()
  const skipAuth = Number(Boolean(payload.skipAuth)) ? '1' : '0'

  return [
    'diagnose',
    'question-start',
    userPlantId,
    plantCatalogId,
    symptomClassKey,
    symptomKey,
    platform,
    skipAuth,
    description
  ]
}

function normalizeQuestionStartPayload({
  plantId,
  userPlantId,
  plantCatalogId,
  plantName,
  symptomClassKey,
  symptomKey,
  description,
  diagnosisProfile = 'full',
  entrySource = 'diagnose_tab',
  skipAuth = false
} = {}) {
  const normalizedEntrySource = normalizeQuestionStartEntrySource(entrySource)
  const allowsStandaloneDiagnoseTab = normalizedEntrySource === 'diagnose_tab'

  if (!plantId && !userPlantId && !plantCatalogId && !allowsStandaloneDiagnoseTab) {
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
    diagnosisProfile,
    entrySource: normalizedEntrySource,
    skipAuth,
    clientContext: {
      source: normalizedEntrySource,
      platform: resolveQuestionStartClientPlatform(),
      reviewSourceType: 'manual_symptom_mode',
      visualInputVersion: 'manual_symptom_mode_v1',
      structuredImageCount: 0,
      diagnosisProfile,
      entrySource: normalizedEntrySource
    }
  }
}

function normalizeQuestionStartEntrySource(value = '') {
  return String(value || 'diagnose_tab').trim() || 'diagnose_tab'
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
  const queryClient = useQueryClient()

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
      diagnosisProfile = 'full',
      entrySource = 'diagnose_tab',
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
          diagnosisProfile,
          entrySource,
          skipAuth
        })
        const cacheKey = makeQuestionStartCacheKey(requestPayload)
        const normalizedResult = await queryClient.fetchQuery({
          queryKey: cacheKey,
          staleTime: QUESTION_START_CACHE_STALE_MS,
          queryFn: () => requestDiagnosisQuestionStart(requestPayload)
        })
        return runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish })
      } catch (error) {
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
