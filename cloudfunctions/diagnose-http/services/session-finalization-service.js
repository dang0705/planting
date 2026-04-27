'use strict'

const versionMetadata = require('../constants/versions')
const { fromResultId } = require('../mappers/public-id-mapper')
const {
  upsertDiagnosisSnapshotRecord,
  insertDiagnosisFeedbackRecord
} = require('../repositories/session-finalization-repository')
const { buildSnapshotPayload } = require('./session-runtime-snapshot-codec')
const { getFollowUpSnapshotRows } = require('./session-follow-up-service')

async function saveFinalDiagnosisSnapshot({
  sessionId,
  openid,
  plantContext,
  response
} = {}) {
  const followUps = await getFollowUpSnapshotRows(sessionId)
  const snapshot = buildSnapshotPayload({
    sessionId,
    plantContext,
    response,
    followUps
  })

  try {
    await upsertDiagnosisSnapshotRecord({
      diagnosisId: sessionId,
      openid,
      snapshotJson: JSON.stringify(snapshot),
      diagnosisEngineVersion: versionMetadata.diagnosisEngineVersion,
      dataBundleVersion: versionMetadata.dataBundleVersion,
      questionSystemVersion: versionMetadata.questionSystemVersion,
      resultExplanationVersion: versionMetadata.resultExplanationVersion,
      legacyAdapterVersion: versionMetadata.legacyAdapterVersion
    })
  } catch (error) {
    console.warn('写入 diagnosis_result_snapshots 失败（已降级忽略）:', error.message)
  }
}

async function saveDiagnosisFeedback(openid, { resultId, feedback } = {}) {
  const parsed = fromResultId(resultId || '')
  const diagnosisId = parsed.sessionId || resultId

  try {
    await insertDiagnosisFeedbackRecord({
      openid,
      diagnosisId,
      isHelpful: feedback?.isHelpful ? 1 : 0,
      isAccurate: feedback?.isAccurate ? 1 : 0,
      note: feedback?.note || ''
    })
  } catch (error) {
    console.warn('写入 diagnosis_feedback 失败（已降级忽略）:', error.message)
  }

  return { ok: true }
}

module.exports = {
  saveFinalDiagnosisSnapshot,
  saveDiagnosisFeedback
}
