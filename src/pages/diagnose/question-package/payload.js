import { normalizeDiagnosisResult } from '@/utils/diagnose-flow.js'
import { preserveDiagnosisContinuationContext } from '@/components/diagnose-flow/retake-continuation.js'

export const DEFAULT_CACHE_KEY = 'diagnose_question_package_payload'

export function parseJsonLike(value = '') {
  if (!value) {
    return null
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    const decoded = decodeURIComponent(String(value || ''))
    const parsed = JSON.parse(decoded)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

export function readStoragePayload(key = DEFAULT_CACHE_KEY) {
  try {
    const value = uni.getStorageSync(key)
    if (!value) {
      return null
    }
    if (typeof value === 'string') {
      return parseJsonLike(value)
    }
    return typeof value === 'object' ? value : null
  } catch (error) {
    console.warn('读取问诊缓存失败:', error)
    return null
  }
}

export function resolveQuestionPackagePayload(options = {}, key = DEFAULT_CACHE_KEY) {
  const inlinePayload = parseJsonLike(options?.payload || options?.data || '')
  if (inlinePayload) {
    return inlinePayload
  }
  const storedPayload = readStoragePayload(key)
  if (storedPayload) {
    return storedPayload
  }
  return {
    diagnosisSessionId: options?.diagnosisSessionId || options?.sessionId || '',
    roundId: options?.roundId || '',
    plantName: options?.plantName || '',
    questions: []
  }
}

export function resolveInitialDiagnosisResult(value = {}) {
  if (value?.normalizedResult) {
    return preserveDiagnosisContinuationContext(value.normalizedResult, {}, value)
  }
  const rawResult = value?.diagnosisResult || value?.result || value?.visualDiagnosisResult || value
  return preserveDiagnosisContinuationContext(
    normalizeDiagnosisResult(rawResult, {
      images: Array.isArray(value?.images) ? value.images : [],
      plantName: value?.plantName || value?.plant?.displayName || '植物'
    }),
    {},
    value
  )
}
