'use strict'

const { models } = require('/opt/utils/cloudbase')

function normalizeRequiredText(value = '') {
  return String(value || '').trim()
}

function assertDiagnosisSessionRecordParams(params = {}) {
  const requiredFields = ['diagnosisId', 'sessionId', 'openid', 'diagnosisMode', 'currentRoundId']
  const missingFields = requiredFields.filter(field => !normalizeRequiredText(params[field]))

  if (missingFields.length) {
    throw new Error(`diagnosis-session-repository 缺少必要参数: ${missingFields.join(', ')}`)
  }
}

async function upsertDiagnosisSessionRecord(input = {}) {
  const params = {
    ...input,
    diagnosisId: normalizeRequiredText(input.diagnosisId || input.sessionId),
    sessionId: normalizeRequiredText(input.sessionId || input.diagnosisId),
    openid: normalizeRequiredText(input.openid)
  }

  assertDiagnosisSessionRecordParams(params)

  await models.$runSQL(
    `
      INSERT INTO diagnosis_sessions (
        diagnosis_id,
        session_id,
        _openid,
        user_plant_id,
        plant_id,
        diagnosis_mode,
        plant_genus,
        plant_family,
        plant_category,
        current_plant_identity_id,
        current_identity_resolution_status,
        current_route_primary_action,
        current_round_id,
        current_round_index,
        latest_visual_call_batch_id,
        image_url,
        user_description,
        ai_summary,
        health_score,
        health_status,
        top_problem_key,
        top_problem_score,
        reliability_score,
        follow_up_round,
        needs_follow_up,
        outcome_type,
        outcome_payload_json,
        stop_reason,
        session_status,
        runtime_snapshot_json,
        final_problem_key,
        final_problem_cn,
        treatment,
        prevention,
        ended_at
      ) VALUES (
        {{diagnosisId}},
        {{sessionId}},
        {{openid}},
        IF({{userPlantIdHasValue}} = 1, {{userPlantIdValue}}, NULL),
        {{plantId}},
        {{diagnosisMode}},
        {{plantGenus}},
        {{plantFamily}},
        {{plantCategory}},
        {{currentPlantIdentityId}},
        {{currentIdentityResolutionStatus}},
        {{currentRoutePrimaryAction}},
        {{currentRoundId}},
        {{currentRoundIndex}},
        IF({{latestVisualCallBatchIdHasValue}} = 1, {{latestVisualCallBatchIdValue}}, NULL),
        {{imageUrl}},
        {{userDescription}},
        {{aiSummary}},
        NULL,
        {{healthStatus}},
        {{topProblemKey}},
        IF({{topProblemScoreHasValue}} = 1, {{topProblemScoreValue}}, NULL),
        {{reliabilityScore}},
        {{followUpRound}},
        {{needsFollowUp}},
        {{outcomeType}},
        {{outcomePayloadJson}},
        {{stopReason}},
        {{sessionStatus}},
        {{runtimeSnapshotJson}},
        {{finalProblemKey}},
        {{finalProblemCn}},
        {{treatment}},
        {{prevention}},
        IF({{endedAtFlag}} = 1, CURRENT_TIMESTAMP, NULL)
      )
      ON DUPLICATE KEY UPDATE
        diagnosis_mode = {{diagnosisMode}},
        user_plant_id = IF({{userPlantIdHasValue}} = 1, {{userPlantIdValue}}, user_plant_id),
        plant_genus = COALESCE(plant_genus, {{plantGenus}}),
        plant_family = COALESCE(plant_family, {{plantFamily}}),
        plant_category = COALESCE(plant_category, {{plantCategory}}),
        current_plant_identity_id = {{currentPlantIdentityId}},
        current_identity_resolution_status = {{currentIdentityResolutionStatus}},
        current_route_primary_action = {{currentRoutePrimaryAction}},
        current_round_id = {{currentRoundId}},
        current_round_index = {{currentRoundIndex}},
        latest_visual_call_batch_id = IF(
          {{latestVisualCallBatchIdHasValue}} = 1,
          {{latestVisualCallBatchIdValue}},
          latest_visual_call_batch_id
        ),
        image_url = COALESCE(NULLIF({{imageUrl}}, ''), image_url),
        user_description = COALESCE(NULLIF({{userDescription}}, ''), user_description),
        ai_summary = COALESCE(NULLIF({{aiSummary}}, ''), ai_summary),
        health_status = {{healthStatus}},
        top_problem_key = {{topProblemKey}},
        top_problem_score = IF({{topProblemScoreHasValue}} = 1, {{topProblemScoreValue}}, NULL),
        reliability_score = {{reliabilityScore}},
        follow_up_round = {{followUpRound}},
        needs_follow_up = {{needsFollowUp}},
        outcome_type = {{outcomeType}},
        outcome_payload_json = {{outcomePayloadJson}},
        stop_reason = {{stopReason}},
        session_status = {{sessionStatus}},
        runtime_snapshot_json = {{runtimeSnapshotJson}},
        final_problem_key = {{finalProblemKey}},
        final_problem_cn = {{finalProblemCn}},
        treatment = {{treatment}},
        prevention = {{prevention}},
        ended_at = IF({{endedAtFlag}} = 1, COALESCE(ended_at, CURRENT_TIMESTAMP), ended_at),
        updated_at = CURRENT_TIMESTAMP
    `,
    params
  )
}

module.exports = {
  upsertDiagnosisSessionRecord
}
