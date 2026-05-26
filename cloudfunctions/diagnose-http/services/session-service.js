'use strict'
const {
  upsertDiagnosisSession
} = require('./session-state-write-service')
const {
  replaceObservedSymptoms,
  replaceObservedEvidenceSet
} = require('./session-runtime-write-service')
const {
  getSessionState,
  getObservedSymptomsBySession,
  getObservedEvidenceSetBySession,
  getFinalDiagnosisSnapshot,
  listDiagnosisHistory,
  getResultById
} = require('./session-read-service')
const {
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  prepareAnswerRevision
} = require('./session-follow-up-service')
const {
  upsertVisualSupervisionRecords
} = require('./session-supervision-service')
const {
  saveFinalDiagnosisSnapshot,
  saveDiagnosisFeedback
} = require('./session-finalization-service')

function buildSessionId() {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

module.exports = {
  buildSessionId,
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  prepareAnswerRevision,
  getSessionState,
  getObservedEvidenceSetBySession,
  getObservedSymptomsBySession,
  getFinalDiagnosisSnapshot,
  listDiagnosisHistory,
  getResultById,
  saveFinalDiagnosisSnapshot,
  saveDiagnosisFeedback
}
