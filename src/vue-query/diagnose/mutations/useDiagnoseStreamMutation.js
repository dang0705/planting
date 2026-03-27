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

        const normalizedResult = await requestDiagnoseStream(
          buildDiagnosePayload({
            mode,
            plantId,
            image,
            description,
            plantName,
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
