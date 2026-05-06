'use strict'

const { models } = require('/opt/utils/cloudbase')

async function listVisualAdmissionRowsBySession(sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT
        visual_admission_record_id,
        visual_call_batch_id,
        object_type,
        object_key,
        admission_result,
        target_layer
      FROM visual_admission_records
      WHERE session_id = {{sessionId}}
      ORDER BY created_at ASC, visual_admission_record_id ASC
    `,
    { sessionId }
  )

  return result?.data?.executeResultList || []
}

async function upsertVisualSupervisionRows(list = []) {
  if (!list.length) {
    return
  }

  const values = list.map((_, index) => `(
    {{visualSupervisionRecordId_${index}}},
    {{openid_${index}}},
    {{sessionId_${index}}},
    {{visualCallBatchId_${index}}},
    {{visualAdmissionRecordId_${index}}},
    {{adoptedByEvidence_${index}}},
    {{correctedByQuestion_${index}}},
    {{deniedByRuntime_${index}}},
    {{deniedByOutcomeCompetition_${index}}},
    {{questionCorrectionScope_${index}}},
    {{finalOutcomeType_${index}}},
    {{finalStopReason_${index}}},
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`)

  const params = {}
  list.forEach((item, index) => {
    params[`visualSupervisionRecordId_${index}`] = item.visualSupervisionRecordId
    params[`openid_${index}`] = item.openid
    params[`sessionId_${index}`] = item.sessionId
    params[`visualCallBatchId_${index}`] = item.visualCallBatchId
    params[`visualAdmissionRecordId_${index}`] = item.visualAdmissionRecordId
    params[`adoptedByEvidence_${index}`] = item.adoptedByEvidence
    params[`correctedByQuestion_${index}`] = item.correctedByQuestion
    params[`deniedByRuntime_${index}`] = item.deniedByRuntime
    params[`deniedByOutcomeCompetition_${index}`] = item.deniedByOutcomeCompetition
    params[`questionCorrectionScope_${index}`] = item.questionCorrectionScope
    params[`finalOutcomeType_${index}`] = item.finalOutcomeType
    params[`finalStopReason_${index}`] = item.finalStopReason
  })

  await models.$runSQL(
    `
      INSERT INTO visual_supervision_records (
        visual_supervision_record_id,
        _openid,
        session_id,
        visual_call_batch_id,
        visual_admission_record_id,
        adopted_by_evidence,
        corrected_by_question,
        denied_by_runtime,
        denied_by_outcome_competition,
        question_correction_scope,
        final_outcome_type,
        final_stop_reason,
        created_at,
        updated_at
      ) VALUES ${values.join(', ')}
      ON DUPLICATE KEY UPDATE
        _openid = VALUES(_openid),
        visual_call_batch_id = VALUES(visual_call_batch_id),
        adopted_by_evidence = VALUES(adopted_by_evidence),
        corrected_by_question = VALUES(corrected_by_question),
        denied_by_runtime = VALUES(denied_by_runtime),
        denied_by_outcome_competition = VALUES(denied_by_outcome_competition),
        question_correction_scope = VALUES(question_correction_scope),
        final_outcome_type = VALUES(final_outcome_type),
        final_stop_reason = VALUES(final_stop_reason),
        updated_at = CURRENT_TIMESTAMP
    `,
    params
  )
}

module.exports = {
  listVisualAdmissionRowsBySession,
  upsertVisualSupervisionRows
}
