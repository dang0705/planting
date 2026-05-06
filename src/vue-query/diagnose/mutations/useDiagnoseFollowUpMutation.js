import { useMutation } from '@tanstack/vue-query'
import { requestDiagnoseFollowUp } from '@/http-functions/diagnose/client'
import {
  buildFollowUpMutationPayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks
} from './shared'

export function useDiagnoseFollowUpMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'answer'],
    mutationFn: async ({
      diagnosisSessionId,
      roundId,
      answers = [],
      image = '',
      images = [],
      imageIds = [],
      latestVisualCallBatchId = null,
      visualBatchTrace = null,
      requestMode = '',
      baseAnswerRevision = 0,
      dirtyFromQuestionId = '',
      onFinish,
      onError
    } = {}) => {
      try {
        const normalizedResult = await requestDiagnoseFollowUp(
          buildFollowUpMutationPayload({
            diagnosisSessionId,
            roundId,
            answers,
            image,
            images,
            imageIds,
            latestVisualCallBatchId,
            visualBatchTrace,
            requestMode,
            baseAnswerRevision,
            dirtyFromQuestionId
          })
        )

        return runDiagnoseSuccessCallbacks(normalizedResult, { onFinish })
      } catch (error) {
        console.error('问诊重算失败:', error)
        return handleDiagnoseError(error, { onError })
      }
    }
  })
}
