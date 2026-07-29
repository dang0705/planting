import { onMounted, onUnmounted } from 'vue'
import { onShow } from '@dcloudio/uni-app'

export function useDiagnoseRetakeSession(ctx) {
  const {
    props,
    result,
    currentNow,
    retakeAuthorizationReceivedClientAt,
    normalizeDiagnosisResult,
    getCasePreviewImages,
    resetQuestionState
  } = ctx

  const enrichDiagnosisResult = (...args) => ctx.enrichDiagnosisResult?.(...args) || args[0]
  let retakeTimer = null

  async function refreshActiveSessionFromService() {
    const sessionId = String(result.value?.diagnosisSessionId || '').trim()
    if (!sessionId || !result.value?.retakeAuthorizationState) {
      return
    }
    try {
      const latest = await ctx.requestDiagnosisResult({ id: sessionId })
      currentNow.value = Date.now()
      retakeAuthorizationReceivedClientAt.value = currentNow.value
      result.value = enrichDiagnosisResult(
        normalizeDiagnosisResult(latest, {
          images: getCasePreviewImages({ includeAdditionalImages: true }),
          plantName: props.plantName || result.value.plantName || '植物'
        }),
        latest
      )
      if (result.value?.sessionStatus === 'completed') {
        resetQuestionState([], { answerRevision: result.value.answerRevision })
      }
    } catch (error) {
      console.warn('刷新补拍会话状态失败:', error)
    }
  }

  onMounted(() => {
    currentNow.value = Date.now()
    retakeTimer = setInterval(() => {
      currentNow.value = Date.now()
    }, 1000)
  })

  onUnmounted(() => {
    if (retakeTimer) {
      clearInterval(retakeTimer)
    }
  })

  onShow(() => {
    currentNow.value = Date.now()
    refreshActiveSessionFromService()
  })

  return { refreshActiveSessionFromService }
}
