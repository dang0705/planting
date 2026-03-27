import { assertDiagnoseImageDataUrl } from '@/api/ai-stream.js'

export function buildDiagnosePayload({
  mode = 'quick',
  plantId,
  image,
  description,
  plantName,
  skipAuth = false
}) {
  return {
    mode,
    plantId,
    skipAuth,
    ...(image ? { image } : {}),
    ...(description ? { description } : {}),
    ...(plantName ? { plantName } : {})
  }
}

export function validateDiagnoseInput({ plantId, image }) {
  if (!plantId) {
    throw new Error('缺少植物ID，无法进行诊断')
  }
  if (image) {
    assertDiagnoseImageDataUrl(image)
  }
}

export function runDiagnoseSuccessCallbacks(normalizedResult, { onText, onFinish } = {}) {
  onText?.(normalizedResult.fullText, normalizedResult.fullText)
  onFinish?.(normalizedResult.diagnosis, normalizedResult.fullText)
  return normalizedResult
}

export function handleDiagnoseError(error, { onError } = {}) {
  onError?.(error)
  throw error
}

export function buildFollowUpMutationPayload({
  plantId,
  diagnosisId,
  observedSymptoms = [],
  followUpAnswers = []
}) {
  if (!plantId) {
    throw new Error('缺少植物ID，无法继续问诊')
  }

  return {
    mode: 'follow_up',
    plantId,
    diagnosisId,
    skipAIExtraction: true,
    observedSymptoms,
    followUpAnswers
  }
}
