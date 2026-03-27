import { useMutation } from '@tanstack/vue-query'
import { requestDiagnoseSync } from '@/http-functions/diagnose/client'
import {
  buildDiagnosePayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks,
  validateDiagnoseInput
} from './shared'

export function useDiagnoseMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'sync'],
    mutationFn: async ({
      mode = 'quick',
      image,
      description,
      plantName,
      plantId,
      onText,
      onFinish,
      onError,
      skipAuth = false
    } = {}) => {
      try {
        onText?.('思考中...', '思考中...')
        validateDiagnoseInput({ plantId, image })

        const normalizedResult = await requestDiagnoseSync(
          buildDiagnosePayload({
            mode,
            plantId,
            image,
            description,
            plantName,
            skipAuth
          })
        )

        return runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish })
      } catch (error) {
        console.error('同步诊断失败:', error)
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
