export function isRetakeWindowExpiredError(error = null) {
  const code = String(error?.businessCode || error?.code || '').trim()
  const message = String(error?.message || error || '')
  return code === 'RETAKE_WINDOW_EXPIRED' || message.includes('RETAKE_WINDOW_EXPIRED')
}

export async function refreshRetakeExpiredDiagnosisResult(ctx = {}) {
  const {
    props,
    emit,
    result,
    currentNow,
    retakeAuthorizationReceivedClientAt,
    normalizeDiagnosisResult
  } = ctx
  const getCasePreviewImages = (...args) => ctx.getCasePreviewImages(...args)
  const resetQuestionState = (...args) => ctx.resetQuestionState(...args)
  const enrichDiagnosisResult = (...args) => ctx.enrichDiagnosisResult?.(...args) || args[0]
  const sessionId = String(result.value?.diagnosisSessionId || '').trim()
  if (!sessionId) {
    return false
  }
  const latest = await ctx.requestDiagnosisResult({ id: sessionId })
  currentNow.value = Date.now()
  retakeAuthorizationReceivedClientAt.value = 0
  result.value = enrichDiagnosisResult(
    normalizeDiagnosisResult(latest, {
      images: getCasePreviewImages({ includeAdditionalImages: true }),
      plantName: props.plantName || result.value.plantName || '植物'
    }),
    latest
  )
  resetQuestionState([], { answerRevision: result.value.answerRevision })
  emit('success', result.value)
  return true
}

export async function handleRetakeExpiredUploadError(error = null, ctx = {}) {
  if (!isRetakeWindowExpiredError(error)) {
    return false
  }
  await refreshRetakeExpiredDiagnosisResult(ctx)
  globalThis.uni?.showToast?.({ title: '补拍时间已结束，本次诊断已结束', icon: 'none' })
  return true
}
