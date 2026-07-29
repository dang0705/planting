import { useMutation } from '@tanstack/vue-query'
import { requestDiagnosisAnswer } from '@/http-functions/diagnose/client'
import {
  buildDiagnosisAnswerMutationPayload,
  handleDiagnoseError,
  runDiagnoseSuccessCallbacks
} from './shared'

export function useDiagnosisAnswerMutation() {
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
      questionPackage = null,
      uiHints = null,
      onFinish,
      onError,
      careBehaviorTimeline = null,
      environmentWeatherWindow = null,
      selectedModeKey = '',
      directionChoice = null,
      ...careBehaviorSidecar
    } = {}) => {
      try {
        const normalizedResult = await requestDiagnosisAnswer(
          buildDiagnosisAnswerMutationPayload({
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
            dirtyFromQuestionId,
            questionPackage,
            uiHints,
            careBehaviorTimeline,
            environmentWeatherWindow,
            selectedModeKey,
            directionChoice,
            ...careBehaviorSidecar
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
