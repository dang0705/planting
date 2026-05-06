import { useMutation } from '@tanstack/vue-query'
import { requestDiagnoseStream } from '@/http-functions/diagnose/client'
import {
  buildDiagnosePayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks,
  validateDiagnoseInput
} from './shared'

export function useDiagnoseStreamMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'stream'],
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

        const normalizedResult = await requestDiagnoseStream(
          buildDiagnosePayload({
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
          }),
          {
            onProgress: fullText => onText?.(fullText, fullText)
          }
        )

        return runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish })
      } catch (error) {
        console.error('流式诊断失败:', error)
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
