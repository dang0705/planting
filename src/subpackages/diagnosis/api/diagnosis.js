import {
  requestDiagnosisAnswer,
  requestDiagnosisFeedback,
  requestDiagnosisHistory,
  requestDiagnosisResult,
  requestDiagnosisStart
} from '../http-functions/diagnose/client.js'

export function startDiagnosis(payload) {
  return requestDiagnosisStart(payload)
}

export function submitDiagnosisAnswers(payload) {
  return requestDiagnosisAnswer(payload)
}

export function getDiagnosisResult(params) {
  return requestDiagnosisResult(params)
}

export function getDiagnosisHistory(params) {
  return requestDiagnosisHistory(params)
}

export function submitDiagnosisFeedback(payload) {
  return requestDiagnosisFeedback(payload)
}
