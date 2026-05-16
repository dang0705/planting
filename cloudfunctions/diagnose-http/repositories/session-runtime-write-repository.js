'use strict'

const { models } = require('/opt/utils/cloudbase')

async function replaceObservedSymptomsRows(sessionId, list = []) {
  await models.$runSQL(
    'DELETE FROM diagnosis_symptom_observations WHERE diagnosis_id = {{diagnosisId}}',
    { diagnosisId: sessionId }
  )

  if (!list.length) {return}

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{symptomKey_${index}}},
    {{symptomCn_${index}}},
    {{source_${index}}},
    1,
    {{confidence_${index}}}
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn
    params[`source_${index}`] = item.source
    params[`confidence_${index}`] = item.confidence
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_symptom_observations (
        diagnosis_id,
        symptom_key,
        symptom_cn,
        evidence_source,
        observed,
        confidence
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function replaceObservedEvidenceSetRows({ sessionId, openid, list = [] } = {}) {
  await models.$runSQL(
    'DELETE FROM observed_evidence_set WHERE session_id = {{sessionId}} AND _openid = {{openid}}',
    { sessionId, openid: String(openid || '') }
  )

  if (!list.length) {return}

  const values = list.map((item, index) => `(
    {{observedEvidenceSetId_${index}}},
    {{openid}},
    {{sessionId}},
    {{diagnosisId}},
    {{evidenceKey_${index}}},
    {{evidenceType_${index}}},
    {{symptomKey_${index}}},
    {{symptomCn_${index}}},
    {{confidence_${index}}},
    {{sourceType_${index}}},
    {{currentStatus_${index}}},
    {{targetLayer_${index}}},
    {{parentEvidenceKey_${index}}},
    {{sourceRecordId_${index}}},
    {{originVisualCallBatchId_${index}}},
    {{supersededByBatchId_${index}}},
    {{independenceGroupIdsJson_${index}}},
    {{conflictEvidenceKeysJson_${index}}},
    {{conflictLevel_${index}}},
    {{conflictResolved_${index}}},
    {{firstSeenStage_${index}}},
    COALESCE({{lastUpdatedAt_${index}}}, CURRENT_TIMESTAMP),
    {{enteredRuntime_${index}}},
    {{isKeyEvidence_${index}}},
    {{enteredExplanation_${index}}},
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`)

  const params = {
    openid: String(openid || ''),
    sessionId,
    diagnosisId: sessionId
  }

  list.forEach((item, index) => {
    params[`observedEvidenceSetId_${index}`] = item.observedEvidenceSetId
    params[`evidenceKey_${index}`] = item.evidenceKey
    params[`evidenceType_${index}`] = item.evidenceType
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn
    params[`confidence_${index}`] = item.confidence
    params[`sourceType_${index}`] = item.sourceType
    params[`currentStatus_${index}`] = item.currentStatus
    params[`targetLayer_${index}`] = item.targetLayer
    params[`parentEvidenceKey_${index}`] = item.parentEvidenceKey
    params[`sourceRecordId_${index}`] = item.sourceRecordId
    params[`originVisualCallBatchId_${index}`] = item.originVisualCallBatchId
    params[`supersededByBatchId_${index}`] = item.supersededByBatchId
    params[`independenceGroupIdsJson_${index}`] = item.independenceGroupIdsJson
    params[`conflictEvidenceKeysJson_${index}`] = item.conflictEvidenceKeysJson
    params[`conflictLevel_${index}`] = item.conflictLevel
    params[`conflictResolved_${index}`] = item.conflictResolved
    params[`firstSeenStage_${index}`] = item.firstSeenStage
    params[`lastUpdatedAt_${index}`] = item.lastUpdatedAt
    params[`enteredRuntime_${index}`] = item.enteredRuntime
    params[`isKeyEvidence_${index}`] = item.isKeyEvidence
    params[`enteredExplanation_${index}`] = item.enteredExplanation
  })

  await models.$runSQL(
    `
      INSERT INTO observed_evidence_set (
        observed_evidence_set_id,
        _openid,
        session_id,
        diagnosis_id,
        evidence_key,
        evidence_type,
        symptom_key,
        symptom_cn,
        confidence,
        source_type,
        current_status,
        target_layer,
        parent_evidence_key,
        source_record_id,
        origin_visual_call_batch_id,
        superseded_by_batch_id,
        independence_group_ids_json,
        conflict_evidence_keys_json,
        conflict_level,
        conflict_resolved,
        first_seen_stage,
        last_updated_at,
        entered_runtime,
        is_key_evidence,
        entered_explanation,
        created_at,
        updated_at
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

module.exports = {
  replaceObservedSymptomsRows,
  replaceObservedEvidenceSetRows
}
