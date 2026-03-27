import { useMutation } from '@tanstack/vue-query'
import { requestDiagnoseFollowUp } from '@/http-functions/diagnose/client'
import {
  buildFollowUpMutationPayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks
} from './shared'

export function useDiagnoseFollowUpMutation() {
  return useMutation({
    mutationKey: ['diagnose', 'follow-up'],
    mutationFn: async ({
      plantId,
      diagnosisId,
      observedSymptoms = [],
      followUpAnswers = [],
      onFinish,
      onError
    } = {}) => {
      try {
        const normalizedResult = await requestDiagnoseFollowUp(
          buildFollowUpMutationPayload({
            plantId,
            diagnosisId,
            observedSymptoms,
            followUpAnswers
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
