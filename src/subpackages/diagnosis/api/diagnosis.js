import {
  requestDiagnosisAnswer,
  requestDiagnosisFeedback,
  requestDiagnosisHistory,
  requestDiagnosisStart
} from '../http-functions/diagnose/client.js'
import { fetchDiagnosisDetailQuery } from '../vue-query/diagnosis-history/queries/history.js'

export function startDiagnosis(payload) {
  return requestDiagnosisStart(payload)
}

export function submitDiagnosisAnswers(payload) {
  return requestDiagnosisAnswer(payload)
}

export function getDiagnosisResult(params) {
  const id =
    params && typeof params === 'object'
      ? params.id || params.resultId || params.sessionId || ''
      : params
  return fetchDiagnosisDetailQuery(id)
}

export function getDiagnosisHistory(params) {
  return requestDiagnosisHistory(params)
}

export function submitDiagnosisFeedback(payload) {
  return requestDiagnosisFeedback(payload)
}
