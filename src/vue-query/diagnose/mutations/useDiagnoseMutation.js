import { useMutation } from '@tanstack/vue-query'
import { requestDiagnosisStart, requestDiagnoseStream } from '@/http-functions/diagnose/client'
import {
  buildDiagnosePayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks,
  validateDiagnoseInput
} from './shared'

export function useDiagnoseMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'start'],
    mutationFn: async ({
      image,
      images = [],
      imageIds = [],
      description,
      plantId,
      userPlantId,
      plantCatalogId,
      observedSymptoms = [],
      observedEvidenceSet = [],
      latestVisualCallBatchId = null,
      visualBatchTrace = null,
      onText,
      onFinish,
      onError,
      skipAuth = false
    } = {}) => {
      try {
        onText?.('思考中...', '思考中...')
        validateDiagnoseInput({ plantId, userPlantId, image, images, observedSymptoms })

        const requestPayload = buildDiagnosePayload({
          plantId,
          userPlantId,
          plantCatalogId,
          image,
          images,
          imageIds,
          description,
          observedSymptoms,
          observedEvidenceSet,
          latestVisualCallBatchId,
          visualBatchTrace,
          skipAuth
        })
        const normalizedResult =
          typeof onText === 'function'
            ? await requestDiagnoseStream(requestPayload, {
                onProgress: fullText => onText?.(fullText, fullText)
              })
            : await requestDiagnosisStart(requestPayload)

        return runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish })
      } catch (error) {
        console.error('同步诊断失败:', error)
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
