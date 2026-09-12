import { DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX } from '@/constants/diagnosis-intake.js'

function normalizeString(value = '') {
  return String(value || '').trim()
}

export function persistDiagnosisQuestionPackageDraft({
  diagnosisResult,
  images = [],
  plantName = '植物'
} = {}) {
  const diagnosisSessionId = normalizeString(diagnosisResult?.diagnosisSessionId)
  const storageKey = `${DIAGNOSIS_QUESTION_PACKAGE_STORAGE_KEY_PREFIX}${
    diagnosisSessionId || Date.now()
  }`

  uni.setStorageSync(storageKey, {
    diagnosisResult,
    images: Array.isArray(images) ? images.filter(Boolean) : [],
    plantName: normalizeString(plantName) || '植物',
    createdAt: Date.now()
  })
  return storageKey
}
