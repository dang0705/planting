import { buildQuestionAnswerPayload, normalizeDiagnosisResult } from '../utils/diagnose-flow.js'
import { preserveDiagnosisContinuationContext } from '@/subpackages/diagnosis/diagnose-flow/retake-continuation.js'
import { ANALYTICS_EVENTS, reportAnalyticsEvent } from '@/utils/analytics.js'

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
  airEnvironmentByQuestionId,
  airEnvironmentSnapshotsByQuestionId,
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
    airEnvironmentByQuestionId,
    airEnvironmentSnapshotsByQuestionId,
    environmentWeatherWindow
  })
  const rerunResult = await diagnosisAnswerMutation.mutateAsync(payloadForSubmit)
  const nextResult = preserveDiagnosisContinuationContext(
    normalizeDiagnosisResult(rerunResult, {
      images,
      plantName: plantName || currentResult.plantName || '植物'
    }),
    currentResult
  )
  result.value = nextResult
  reportAnalyticsEvent(ANALYTICS_EVENTS.DIAGNOSE_QUESTION_COMPLETED)
  if (!nextResult?.hasActiveQuestions && !nextResult?.retakeRequest) {
    reportAnalyticsEvent(ANALYTICS_EVENTS.DIAGNOSE_RESULT_READY)
  }
  await resetQuestionState(nextResult?.questions || [])
  diagnoseStore.addToHistory({
    images,
    diagnosis: nextResult,
    diagnosisId: nextResult.diagnosisSessionId || ''
  })
  uni.showToast({
    title: nextResult.retakeRequest
      ? '请按提示完成补拍'
      : nextResult.hasActiveQuestions
        ? '问诊已更新'
        : '诊断已完成',
    icon: 'success'
  })
}
