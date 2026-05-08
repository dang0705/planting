'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')

function normalizeText(value = '', fallback = '') {
  return String(value || '').trim() || String(fallback || '').trim()
}

function truncateText(value = '', maxLength = 255) {
  const normalized = normalizeText(value)
  return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

function normalizeBooleanFlag(value) {
  return Number(value || 0) ? 1 : 0
}

function buildAnswerEventId(sessionId = '', index = 0) {
  const safeSession = normalizeText(sessionId).replace(/[^a-z0-9_]/gi, '').slice(-12) || 'session'
  return `fae_${safeSession}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`
}

async function insertFollowUpQuestionsRows(sessionId, list = []) {
  if (!list.length) {return}

  const values = list.map((_, index) => `(
    {{diagnosisId}},
    {{questionOrder_${index}}},
    {{questionKey_${index}}},
    {{questionText_${index}}},
    {{rationale_${index}}},
    0,
    0,
    'pending'
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`questionOrder_${index}`] = item.questionOrder
    params[`questionKey_${index}`] = item.questionKey
    params[`questionText_${index}`] = item.questionText
    params[`rationale_${index}`] = item.rationale
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_follow_ups (
        diagnosis_id,
        question_order,
        symptom_key,
        question_text,
        rationale,
        information_gain,
        asked,
        status
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function listFollowUpRows(sessionId) {
  const result = await models.$runSQL(
    `
      SELECT id, symptom_key, rationale, asked, question_order, question_text, answer_value, status
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    {
      diagnosisId: sessionId
    }
  )

  return result?.data?.executeResultList || []
}

async function markFollowUpAnswerRow({
  rowId,
  answerValue,
  answerConfidence,
  status
} = {}) {
  await models.$runSQL(
    `
      UPDATE diagnosis_follow_ups
      SET
        asked = 1,
        answer_value = {{answerValue}},
        answer_confidence = {{answerConfidence}},
        status = {{status}},
        answered_at = CURRENT_TIMESTAMP
      WHERE id = {{rowId}}
    `,
    {
      rowId,
      answerValue,
      answerConfidence,
      status
    }
  )
}

async function invalidateFollowUpRowsAfterQuestion({
  sessionId,
  dirtyQuestionKey
} = {}) {
  const rows = await listFollowUpRows(sessionId)
  const normalizedDirtyQuestionKey = String(dirtyQuestionKey || '').trim()
  if (!normalizedDirtyQuestionKey) {
    return {
      invalidatedCount: 0,
      dirtyRowId: null,
      dirtyQuestionKey: ''
    }
  }

  const dirtyRow = rows.find(row => {
    const rationale = String(row?.rationale || '')
    return (
      String(row?.symptom_key || '').trim() === normalizedDirtyQuestionKey ||
      rationale.includes(`"qk":"${normalizedDirtyQuestionKey}"`) ||
      rationale.includes(`"questionKey":"${normalizedDirtyQuestionKey}"`)
    )
  })

  if (!dirtyRow?.id) {
    return {
      invalidatedCount: 0,
      dirtyRowId: null,
      dirtyQuestionKey: normalizedDirtyQuestionKey
    }
  }

  const dirtyRowId = Number(dirtyRow.id || 0)
  const invalidatedRows = rows.filter(row => Number(row?.id || 0) > dirtyRowId)
  if (!invalidatedRows.length) {
    return {
      invalidatedCount: 0,
      dirtyRowId,
      dirtyQuestionKey: normalizedDirtyQuestionKey
    }
  }

  await models.$runSQL(
    `
      UPDATE diagnosis_follow_ups
      SET
        asked = 0,
        answer_value = '',
        answer_confidence = 0,
        status = 'invalidated',
        answered_at = NULL
      WHERE diagnosis_id = {{diagnosisId}}
        AND id > {{dirtyRowId}}
    `,
    {
      diagnosisId: sessionId,
      dirtyRowId
    }
  )

  return {
    invalidatedCount: invalidatedRows.length,
    dirtyRowId,
    dirtyQuestionKey: normalizedDirtyQuestionKey
  }
}

async function insertFollowUpAnswerRevisionEvents({
  sessionId,
  openid = '',
  answerRevisionBefore = 0,
  answerRevisionAfter = 0,
  dirtyQuestionKey = '',
  dirtyRound = 1,
  events = []
} = {}) {
  const safeEvents = (Array.isArray(events) ? events : [])
    .map((event, index) => ({
      eventId: event.eventId || buildAnswerEventId(sessionId, index),
      openid,
      sessionId,
      answerRevisionBefore: Number(answerRevisionBefore || 0),
      answerRevisionAfter: Number(answerRevisionAfter || 0),
      dirtyQuestionKey: truncateText(dirtyQuestionKey, 255),
      dirtyRound: Number(dirtyRound || 1),
      eventType: truncateText(event.eventType, 32),
      questionRowId: Number(event.questionRowId || 0) || null,
      questionKey: truncateText(event.questionKey, 255),
      questionText: normalizeText(event.questionText),
      questionRound: Number(event.questionRound || dirtyRound || 1),
      previousOptionKey: truncateText(event.previousOptionKey, 128),
      previousStatus: truncateText(event.previousStatus, 64),
      previousAsked: normalizeBooleanFlag(event.previousAsked),
      newOptionKey: truncateText(event.newOptionKey, 128),
      newStatus: truncateText(event.newStatus, 64),
      newAsked: normalizeBooleanFlag(event.newAsked),
      reason: truncateText(event.reason, 128)
    }))
    .filter(event => event.sessionId && event.eventType && event.questionKey)

  if (!safeEvents.length) {return { insertedCount: 0 }}

  const params = {}
  const values = safeEvents.map((event, index) => {
    Object.entries(event).forEach(([key, value]) => {
      params[`${key}_${index}`] = value
    })
    return `(
      {{eventId_${index}}},
      {{openid_${index}}},
      {{sessionId_${index}}},
      {{answerRevisionBefore_${index}}},
      {{answerRevisionAfter_${index}}},
      {{dirtyQuestionKey_${index}}},
      {{dirtyRound_${index}}},
      {{eventType_${index}}},
      {{questionRowId_${index}}},
      {{questionKey_${index}}},
      {{questionText_${index}}},
      {{questionRound_${index}}},
      {{previousOptionKey_${index}}},
      {{previousStatus_${index}}},
      {{previousAsked_${index}}},
      {{newOptionKey_${index}}},
      {{newStatus_${index}}},
      {{newAsked_${index}}},
      {{reason_${index}}},
      CURRENT_TIMESTAMP
    )`
  })

  try {
    await models.$runSQL(
      `
        INSERT INTO ${table('diagnosis_follow_up_answer_events')} (
          event_id,
          _openid,
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
        ) VALUES ${values.join(', ')}
      `,
      params
    )
  } catch (error) {
    console.warn('diagnosis follow-up answer event insert failed:', {
      sessionId,
      message: String(error?.message || error).slice(0, 300)
    })
    return { insertedCount: 0, failed: true }
  }

  return { insertedCount: safeEvents.length }
}

module.exports = {
  insertFollowUpQuestionsRows,
  listFollowUpRows,
  markFollowUpAnswerRow,
  invalidateFollowUpRowsAfterQuestion,
  insertFollowUpAnswerRevisionEvents
}
