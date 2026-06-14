import { buildQuestionAnswerPayload, normalizeDiagnosisResult } from '@/utils/diagnose-flow.js'

export async function submitQuestionPackageAnswers({
  result,
  images,
  plantName,
  questionAnswers,
  questionStack,
  currentQuestion,
  isQuestionPackageMode,
  careBehaviorTimelineByQuestionId,
  lightEnvironmentByQuestionId,
  environmentWeatherWindow,
  diagnosisAnswerMutation,
  diagnoseStore,
  resetQuestionState
}) {
  const currentResult = result.value
  const submitQuestionStack = isQuestionPackageMode
    ? questionStack
    : currentQuestion
      ? [currentQuestion]
      : []
  const payloadForSubmit = buildQuestionAnswerPayload(currentResult, questionAnswers, {
    questionStack: submitQuestionStack,
    requestMode: 'answer_submit',
    careBehaviorTimelineByQuestionId,
    lightEnvironmentByQuestionId,
    environmentWeatherWindow
  })
  const rerunResult = await diagnosisAnswerMutation.mutateAsync(payloadForSubmit)
  const nextResult = normalizeDiagnosisResult(rerunResult, {
    images,
    plantName: plantName || currentResult.plantName || '植物'
  })
  result.value = nextResult
  resetQuestionState(nextResult?.questions || [])
  diagnoseStore.addToHistory({
    images,
    diagnosis: nextResult,
    diagnosisId: nextResult.diagnosisSessionId || ''
  })
  uni.showToast({
    title: nextResult.hasActiveQuestions ? '问诊已更新' : '诊断已完成',
    icon: 'success'
  })
}
