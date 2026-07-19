#!/usr/bin/env node

import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { models } = require('/Users/jay/WebstormProjects/planting/cloudfunctions/layer/utils/cloudbase')

function normalizeText(value = '') {
  return String(value || '').trim()
}

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    const key = String(rawKey || '').trim()
    const value = rest.length ? rest.join('=').trim() : 'true'
    if (key) {
      result[key] = value
    }
    return result
  }, {})
}

function safeJsonParse(value, fallback = null) {
  if (typeof value !== 'string' || !value.trim()) {return fallback}
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

async function queryRows(sql) {
  const response = await models.$runSQL(sql)
  return Array.isArray(response?.data?.executeResultList) ? response.data.executeResultList : []
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const sessionId = normalizeText(args.session)
  if (!sessionId) {
    throw new Error('缺少 --session=<diagnosisSessionId>')
  }

  const sessionRows = await queryRows(`
    SELECT
      session_id,
      status,
      round_count,
      created_at,
      updated_at,
      final_result_json,
      runtime_snapshot_json
    FROM diagnosis_sessions
    WHERE session_id = '${sessionId}'
    LIMIT 1
  `)

  const stopStateRows = await queryRows(`
    SELECT
      stop_state_id,
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
    FROM stop_state
    WHERE session_id = '${sessionId}'
    ORDER BY round_index DESC, updated_at DESC
  `)

  const answerEventRows = await queryRows(`
    SELECT
      answer_event_id,
      round_id,
      round_index,
      answer_event_type,
      question_key,
      selected_option_key,
      created_at
    FROM diagnosis_follow_up_answer_events
    WHERE session_id = '${sessionId}'
    ORDER BY round_index ASC, created_at ASC
  `)

  const followUpRows = await queryRows(`
    SELECT
      follow_up_id,
      round_id,
      round_index,
      question_key,
      symptom_key,
      rationale_json,
      created_at
    FROM diagnosis_follow_ups
    WHERE session_id = '${sessionId}'
    ORDER BY round_index ASC, created_at ASC
  `)

  const sessionRow = sessionRows[0] || null
  const finalResult = safeJsonParse(sessionRow?.final_result_json, {})
  const runtimeSnapshot = safeJsonParse(sessionRow?.runtime_snapshot_json, {})

  const output = {
    sessionId,
    session: sessionRow
      ? {
          sessionId: sessionRow.session_id,
          status: sessionRow.status,
          roundCount: Number(sessionRow.round_count || 0),
          createdAt: sessionRow.created_at,
          updatedAt: sessionRow.updated_at,
          finalResult,
          runtimeSnapshot: {
            stopReason: runtimeSnapshot?.stopReason || '',
            stopReasonDetail: runtimeSnapshot?.stopReasonDetail || '',
            decisionCause: runtimeSnapshot?.decisionCause || null,
            routeDecision: runtimeSnapshot?.routeDecision || null,
            routeDecisionPublic: runtimeSnapshot?.routeDecisionPublic || null,
            outputDecision: runtimeSnapshot?.outputDecision || null,
            primaryOutcome: runtimeSnapshot?.primaryOutcome || null,
            visibleOutcomes: runtimeSnapshot?.visibleOutcomes || [],
            actionAdvice: runtimeSnapshot?.actionAdvice || null
          }
        }
      : null,
    stopStates: stopStateRows.map(row => ({
      stopStateId: row.stop_state_id,
      roundId: row.round_id,
      roundIndex: Number(row.round_index || 0),
      isStopped: Number(row.is_stopped || 0),
      stopReasonType: row.stop_reason_type || '',
      stopReason: row.stop_reason || '',
      stopReasonText: row.stop_reason_text || '',
      finalOutputRef: row.final_output_ref || '',
      allowMoreQuestions: Number(row.allow_more_questions || 0),
      outputEligible: Number(row.output_eligible || 0),
      outputJudgment: row.output_judgment || '',
      conclusionType: row.conclusion_type || '',
      conclusionStatus: row.conclusion_status || '',
      outputConservatism: row.output_conservatism || '',
      keyEvidenceSummary: row.key_evidence_summary || '',
      unresolvedRisks: safeJsonParse(row.unresolved_risks_json, []),
      nextStepHints: safeJsonParse(row.next_step_hints_json, []),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    })),
    answerEvents: answerEventRows.map(row => ({
      answerEventId: row.answer_event_id,
      roundId: row.round_id,
      roundIndex: Number(row.round_index || 0),
      eventType: row.answer_event_type || '',
      questionKey: row.question_key || '',
      selectedOptionKey: row.selected_option_key || '',
      createdAt: row.created_at
    })),
    followUps: followUpRows.map(row => ({
      followUpId: row.follow_up_id,
      roundId: row.round_id,
      roundIndex: Number(row.round_index || 0),
      questionKey: row.question_key || '',
      symptomKey: row.symptom_key || '',
      rationale: safeJsonParse(row.rationale_json, {}),
      createdAt: row.created_at
    }))
  }

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`)
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
