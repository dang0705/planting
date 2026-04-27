'use strict'

const { models } = require('/opt/utils/cloudbase')
const { safeJsonParse } = require('../utils/stored-value')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function hydrateStopState(row = null) {
  if (!row || typeof row !== 'object') {
    return null
  }

  return {
    stopStateId: normalizeText(row.stop_state_id),
    sessionId: normalizeText(row.session_id),
    roundId: normalizeText(row.round_id, 'round_1'),
    roundIndex: Number(row.round_index || 1),
    isStopped: Number(row.is_stopped || 0) ? 1 : 0,
    stopReasonType: normalizeText(row.stop_reason_type),
    stopReason: normalizeText(row.stop_reason),
    stopReasonText: normalizeText(row.stop_reason_text),
    finalOutputRef: normalizeText(row.final_output_ref, null),
    allowMoreQuestions: Number(row.allow_more_questions || 0) ? 1 : 0
  }
}

function hydrateOutputEligibility(row = null) {
  if (!row || typeof row !== 'object') {
    return null
  }

  return {
    eligible: Number(row.output_eligible || 0) ? 1 : 0,
    judgment: normalizeText(row.output_judgment),
    conclusionType: normalizeText(row.conclusion_type),
    conclusionStatus: normalizeText(row.conclusion_status),
    outputConservatism: normalizeText(row.output_conservatism),
    keyEvidenceSummary: normalizeText(row.key_evidence_summary),
    unresolvedRisks: safeJsonParse(row.unresolved_risks_json, []) || [],
    nextStepHints: safeJsonParse(row.next_step_hints_json, []) || []
  }
}

async function upsertStopState({ sessionId, openid, stopState, outputEligibility } = {}) {
  if (!stopState?.stopStateId) {
    return
  }

  await models.$runSQL(
    `
      INSERT INTO stop_state (
        stop_state_id,
        _openid,
        session_id,
        diagnosis_id,
        round_id,
        round_index,
        is_stopped,
        stop_reason_type,
        stop_reason,
        stop_reason_text,
        final_output_ref,
        allow_more_questions,
        output_eligible,
        output_judgment,
        conclusion_type,
        conclusion_status,
        output_conservatism,
        key_evidence_summary,
        unresolved_risks_json,
        next_step_hints_json,
        created_at,
        updated_at
      ) VALUES (
        {{stopStateId}},
        {{openid}},
        {{sessionId}},
        {{diagnosisId}},
        {{roundId}},
        {{roundIndex}},
        {{isStopped}},
        {{stopReasonType}},
        {{stopReason}},
        {{stopReasonText}},
        {{finalOutputRef}},
        {{allowMoreQuestions}},
        {{outputEligible}},
        {{outputJudgment}},
        {{conclusionType}},
        {{conclusionStatus}},
        {{outputConservatism}},
        {{keyEvidenceSummary}},
        {{unresolvedRisksJson}},
        {{nextStepHintsJson}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        is_stopped = VALUES(is_stopped),
        stop_reason_type = VALUES(stop_reason_type),
        stop_reason = VALUES(stop_reason),
        stop_reason_text = VALUES(stop_reason_text),
        final_output_ref = VALUES(final_output_ref),
        allow_more_questions = VALUES(allow_more_questions),
        output_eligible = VALUES(output_eligible),
        output_judgment = VALUES(output_judgment),
        conclusion_type = VALUES(conclusion_type),
        conclusion_status = VALUES(conclusion_status),
        output_conservatism = VALUES(output_conservatism),
        key_evidence_summary = VALUES(key_evidence_summary),
        unresolved_risks_json = VALUES(unresolved_risks_json),
        next_step_hints_json = VALUES(next_step_hints_json),
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      stopStateId: stopState.stopStateId,
      openid: String(openid || ''),
      sessionId,
      diagnosisId: sessionId,
      roundId: normalizeText(stopState.roundId, 'round_1'),
      roundIndex: Number(stopState.roundIndex || 1),
      isStopped: Number(stopState.isStopped || 0) ? 1 : 0,
      stopReasonType: normalizeText(stopState.stopReasonType),
      stopReason: normalizeText(stopState.stopReason),
      stopReasonText: normalizeText(stopState.stopReasonText),
      finalOutputRef: normalizeText(stopState.finalOutputRef, null),
      allowMoreQuestions: Number(stopState.allowMoreQuestions || 0) ? 1 : 0,
      outputEligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
      outputJudgment: normalizeText(outputEligibility?.judgment),
      conclusionType: normalizeText(outputEligibility?.conclusionType),
      conclusionStatus: normalizeText(outputEligibility?.conclusionStatus),
      outputConservatism: normalizeText(outputEligibility?.outputConservatism),
      keyEvidenceSummary: normalizeText(outputEligibility?.keyEvidenceSummary),
      unresolvedRisksJson: JSON.stringify(
        Array.isArray(outputEligibility?.unresolvedRisks) ? outputEligibility.unresolvedRisks : []
      ),
      nextStepHintsJson: JSON.stringify(
        Array.isArray(outputEligibility?.nextStepHints) ? outputEligibility.nextStepHints : []
      )
    }
  )
}

async function getLatestStopStateBySession(sessionId = '', openid = '') {
  const conditions = ['session_id = {{sessionId}}']
  const params = { sessionId }
  if (normalizeText(openid)) {
    conditions.push('_openid = {{openid}}')
    params.openid = normalizeText(openid)
  }

  const result = await models.$runSQL(
    `
      SELECT
        stop_state_id,
        session_id,
        round_id,
        round_index,
        is_stopped,
        stop_reason_type,
        stop_reason,
        stop_reason_text,
        final_output_ref,
        allow_more_questions,
        output_eligible,
        output_judgment,
        conclusion_type,
        conclusion_status,
        output_conservatism,
        key_evidence_summary,
        unresolved_risks_json,
        next_step_hints_json
      FROM stop_state
      WHERE ${conditions.join(' AND ')}
      ORDER BY round_index DESC, updated_at DESC
      LIMIT 1
    `,
    params
  )

  const row = result?.data?.executeResultList?.[0] || null
  if (!row) {
    return null
  }

  return {
    stopState: hydrateStopState(row),
    outputEligibility: hydrateOutputEligibility(row)
  }
}

module.exports = {
  upsertStopState,
  getLatestStopStateBySession
}
