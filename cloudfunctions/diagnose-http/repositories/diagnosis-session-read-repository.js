'use strict'

const { models } = require('/opt/utils/cloudbase')

async function listObservedSymptomRows(sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT symptom_key, symptom_cn, confidence, evidence_source
      FROM diagnosis_symptom_observations
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY confidence DESC, id ASC
    `,
    { diagnosisId: sessionId }
  )

  return result?.data?.executeResultList || []
}

async function listObservedEvidenceRows(sessionId = '', openid = '') {
  const conditions = ['session_id = {{sessionId}}']
  const params = { sessionId }

  if (String(openid || '').trim()) {
    conditions.push('_openid = {{openid}}')
    params.openid = String(openid || '')
  }

  const result = await models.$runSQL(
    `
      SELECT
        observed_evidence_set_id,
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
        entered_explanation,
        is_key_evidence
      FROM observed_evidence_set
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_key_evidence DESC, confidence DESC, created_at ASC, observed_evidence_set_id ASC
    `,
    params
  )

  return result?.data?.executeResultList || []
}

async function getDiagnosisSnapshotRow(openid = '', sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT snapshot_json
      FROM diagnosis_result_snapshots
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: sessionId, openid }
  )

  return result?.data?.executeResultList?.[0] || null
}

async function getDiagnosisSessionStateRow(openid = '', sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        session_id,
        user_plant_id,
        plant_id,
        plant_genus,
        plant_family,
        plant_category,
        current_plant_identity_id,
        current_identity_resolution_status,
        current_route_primary_action,
        current_round_id,
        current_round_index,
        latest_visual_call_batch_id,
        outcome_type,
        session_status,
        needs_follow_up,
        follow_up_round,
        runtime_snapshot_json,
        created_at,
        updated_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: sessionId, openid }
  )

  return result?.data?.executeResultList?.[0] || null
}

async function listDiagnosisSessionHistoryRows(openid = '', { userPlantId = null, limit = 20, offset = 0 } = {}) {
  const conditions = ['_openid = {{openid}}']
  const params = { openid, limit, offset }

  if (userPlantId) {
    conditions.push('user_plant_id = {{userPlantId}}')
    params.userPlantId = Number(userPlantId)
  }

  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        user_plant_id,
        plant_id,
        current_round_index,
        follow_up_round,
        current_plant_identity_id,
        latest_visual_call_batch_id,
        outcome_type,
        outcome_payload_json,
        final_problem_cn,
        top_problem_key,
        health_status,
        created_at
      FROM diagnosis_sessions
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    params
  )

  return result?.data?.executeResultList || []
}

async function countDiagnosisSessionHistoryRows(openid = '', { userPlantId = null } = {}) {
  const conditions = ['_openid = {{openid}}']
  const params = { openid }

  if (userPlantId) {
    conditions.push('user_plant_id = {{userPlantId}}')
    params.userPlantId = Number(userPlantId)
  }

  const result = await models.$runSQL(
    `SELECT COUNT(*) AS total FROM diagnosis_sessions WHERE ${conditions.join(' AND ')}`,
    params
  )

  return Number(result?.data?.executeResultList?.[0]?.total || 0)
}

async function getDiagnosisSessionResultRow(openid = '', sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        user_plant_id,
        plant_id,
        current_plant_identity_id,
        latest_visual_call_batch_id,
        outcome_type,
        outcome_payload_json,
        current_route_primary_action,
        current_identity_resolution_status,
        runtime_snapshot_json,
        final_problem_key,
        final_problem_cn,
        ai_summary,
        treatment,
        prevention,
        created_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: sessionId, openid }
  )

  return result?.data?.executeResultList?.[0] || null
}

module.exports = {
  listObservedSymptomRows,
  listObservedEvidenceRows,
  getDiagnosisSnapshotRow,
  getDiagnosisSessionStateRow,
  listDiagnosisSessionHistoryRows,
  countDiagnosisSessionHistoryRows,
  getDiagnosisSessionResultRow
}
