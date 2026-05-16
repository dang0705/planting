'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const { getPromptSymptomDictionary } = require('../symptom-repository')
const { getQuestionOptionMappings } = require('../question-repository')
const { buildSyntheticFollowUpOptionMappings } = require('../../utils/synthetic-follow-up')
const {
  mapDiagnosisFollowUpReviewRow,
  indexSyntheticFollowUpOptionMappings,
  applySyntheticFollowUpReviewFallback
} = require('./follow-up-mappers')

async function listDiagnosisReviewFollowUps(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        followups.id,
        followups.diagnosis_id,
        followups.question_order,
        followups.symptom_key,
        followups.question_text,
        followups.rationale,
        followups.asked,
        followups.answer_value,
        followups.answer_confidence,
        followups.status,
        followups.created_at,
        followups.answered_at,
        questions.target_symptom_key,
        questions.target_dimension,
        questions.routing_scope,
        questions.question_role,
        questions.effect_mode,
        questions.question_group_key,
        questions.question_text_cn,
        questions.question_text_user_cn,
        options.option_text_cn,
        options.option_text_user_cn,
        options.maps_to_symptom_key,
        options.value AS option_value,
        options.answer_effect_cn
      FROM ${table('diagnosis_follow_ups')} AS followups
      LEFT JOIN ${table('question_library_v5_real')} AS questions
        ON questions.question_key = followups.symptom_key
      LEFT JOIN ${table('question_option_mapping_v5_real')} AS options
        ON options.question_key = followups.symptom_key
       AND options.option_key = followups.answer_value
      WHERE followups.diagnosis_id = {{diagnosisSessionId}}
      ORDER BY followups.question_order ASC, followups.id ASC
      LIMIT 20
    `,
    { diagnosisSessionId: safeSessionId }
  )

  const rows = result?.data?.executeResultList || []
  const questionKeys = Array.from(
    new Set(rows.map(row => String(row?.symptom_key || '').trim()).filter(Boolean))
  )
  const [auditedOptionMappings, symptomDictionary] = await Promise.all([
    questionKeys.length ? getQuestionOptionMappings(questionKeys) : [],
    getPromptSymptomDictionary()
  ])
  const resolvedMappingIndex = indexSyntheticFollowUpOptionMappings([
    ...auditedOptionMappings,
    ...buildSyntheticFollowUpOptionMappings(questionKeys, symptomDictionary)
  ])

  return rows
    .map(row => applySyntheticFollowUpReviewFallback(row, resolvedMappingIndex))
    .map(mapDiagnosisFollowUpReviewRow)
}

async function listDiagnosisReviewAnswerEvents(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        id,
        event_id,
        diagnosis_id,
        answer_revision_before,
        answer_revision_after,
        dirty_question_key,
        dirty_round_index,
        event_type,
        question_row_id,
        question_key,
        question_text,
        question_round_index,
        previous_option_key,
        previous_status,
        previous_asked,
        new_option_key,
        new_status,
        new_asked,
        reason,
        created_at
      FROM ${table('diagnosis_follow_up_answer_events')}
      WHERE diagnosis_id = {{diagnosisSessionId}}
      ORDER BY created_at ASC, id ASC
      LIMIT 100
    `,
    { diagnosisSessionId: safeSessionId }
  )

  return (result?.data?.executeResultList || []).map(row => ({
    id: Number(row.id || 0),
    eventId: String(row.event_id || '').trim(),
    diagnosisId: String(row.diagnosis_id || '').trim(),
    answerRevisionBefore: Number(row.answer_revision_before || 0),
    answerRevisionAfter: Number(row.answer_revision_after || 0),
    dirtyQuestionKey: String(row.dirty_question_key || '').trim(),
    dirtyRoundIndex: Number(row.dirty_round_index || 0),
    eventType: String(row.event_type || '').trim(),
    questionRowId: Number(row.question_row_id || 0),
    questionKey: String(row.question_key || '').trim(),
    questionText: String(row.question_text || '').trim(),
    questionRoundIndex: Number(row.question_round_index || 0),
    previousOptionKey: String(row.previous_option_key || '').trim(),
    previousStatus: String(row.previous_status || '').trim(),
    previousAsked: Number(row.previous_asked || 0) ? 1 : 0,
    newOptionKey: String(row.new_option_key || '').trim(),
    newStatus: String(row.new_status || '').trim(),
    newAsked: Number(row.new_asked || 0) ? 1 : 0,
    reason: String(row.reason || '').trim(),
    createdAt: String(row.created_at || '').trim()
  }))
}

module.exports = {
  listDiagnosisReviewFollowUps,
  listDiagnosisReviewAnswerEvents
}
