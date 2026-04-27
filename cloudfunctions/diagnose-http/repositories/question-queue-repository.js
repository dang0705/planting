'use strict'

const { models } = require('/opt/utils/cloudbase')
const { safeJsonParse } = require('../utils/stored-value')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeRoundId(roundId = '', fallback = 'round_1') {
  return normalizeText(roundId, fallback)
}

function hydrateQuestionQueue(row = null) {
  if (!row || typeof row !== 'object') {
    return null
  }

  const questionItems = safeJsonParse(row.question_items_json, [])

  return {
    questionQueueId: normalizeText(row.question_queue_id),
    openid: normalizeText(row._openid),
    sessionId: normalizeText(row.session_id),
    roundId: normalizeRoundId(row.round_id),
    roundIndex: Number(row.round_index || 1),
    routePrimaryAction: normalizeText(row.route_primary_action),
    queueStatus: normalizeText(row.queue_status, 'active'),
    queueDecision: {
      hasActionableItems: Number(row.active_item_count || 0) > 0 ? 1 : 0,
      exhaustedReason: normalizeText(row.exhausted_reason),
      serviceTarget: normalizeText(row.service_target)
    },
    questionItems: Array.isArray(questionItems) ? questionItems : [],
    activeItemCount: Number(row.active_item_count || 0),
    askedItemCount: Number(row.asked_item_count || 0),
    answeredItemCount: Number(row.answered_item_count || 0),
    invalidatedItemCount: Number(row.invalidated_item_count || 0),
    updatedAt: normalizeText(row.updated_at)
  }
}

async function replaceQueueForRound({ sessionId, openid, questionQueue } = {}) {
  if (!questionQueue?.questionQueueId) {
    return
  }

  await models.$runSQL(
    `
      INSERT INTO question_queue (
        question_queue_id,
        _openid,
        session_id,
        diagnosis_id,
        round_id,
        round_index,
        route_primary_action,
        queue_status,
        service_target,
        exhausted_reason,
        question_items_json,
        active_item_count,
        asked_item_count,
        answered_item_count,
        invalidated_item_count,
        created_at,
        updated_at
      ) VALUES (
        {{questionQueueId}},
        {{openid}},
        {{sessionId}},
        {{diagnosisId}},
        {{roundId}},
        {{roundIndex}},
        {{routePrimaryAction}},
        {{queueStatus}},
        {{serviceTarget}},
        {{exhaustedReason}},
        {{questionItemsJson}},
        {{activeItemCount}},
        {{askedItemCount}},
        {{answeredItemCount}},
        {{invalidatedItemCount}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON DUPLICATE KEY UPDATE
        route_primary_action = VALUES(route_primary_action),
        queue_status = VALUES(queue_status),
        service_target = VALUES(service_target),
        exhausted_reason = VALUES(exhausted_reason),
        question_items_json = VALUES(question_items_json),
        active_item_count = VALUES(active_item_count),
        asked_item_count = VALUES(asked_item_count),
        answered_item_count = VALUES(answered_item_count),
        invalidated_item_count = VALUES(invalidated_item_count),
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      questionQueueId: questionQueue.questionQueueId,
      openid: String(openid || ''),
      sessionId,
      diagnosisId: sessionId,
      roundId: normalizeRoundId(questionQueue.roundId),
      roundIndex: Number(questionQueue.roundIndex || 1),
      routePrimaryAction: normalizeText(questionQueue.routePrimaryAction),
      queueStatus: normalizeText(questionQueue.queueStatus, 'active'),
      serviceTarget: normalizeText(questionQueue?.queueDecision?.serviceTarget),
      exhaustedReason: normalizeText(questionQueue?.queueDecision?.exhaustedReason),
      questionItemsJson: JSON.stringify(Array.isArray(questionQueue.questionItems) ? questionQueue.questionItems : []),
      activeItemCount: Number(questionQueue.activeItemCount || 0),
      askedItemCount: Number(questionQueue.askedItemCount || 0),
      answeredItemCount: Number(questionQueue.answeredItemCount || 0),
      invalidatedItemCount: Number(questionQueue.invalidatedItemCount || 0)
    }
  )
}

async function getQueueBySessionAndRound(sessionId = '', round = 1) {
  const roundId = normalizeRoundId(`round_${Number(round || 1) || 1}`)
  const result = await models.$runSQL(
    `
      SELECT
        question_queue_id,
        _openid,
        session_id,
        round_id,
        round_index,
        route_primary_action,
        queue_status,
        service_target,
        exhausted_reason,
        question_items_json,
        active_item_count,
        asked_item_count,
        answered_item_count,
        invalidated_item_count,
        updated_at
      FROM question_queue
      WHERE session_id = {{sessionId}} AND round_id = {{roundId}}
      LIMIT 1
    `,
    { sessionId, roundId }
  )

  return hydrateQuestionQueue(result?.data?.executeResultList?.[0] || null)
}

async function getLatestQueueBySession(sessionId = '', openid = '') {
  const conditions = ['session_id = {{sessionId}}']
  const params = { sessionId }
  if (normalizeText(openid)) {
    conditions.push('_openid = {{openid}}')
    params.openid = normalizeText(openid)
  }

  const result = await models.$runSQL(
    `
      SELECT
        question_queue_id,
        _openid,
        session_id,
        round_id,
        round_index,
        route_primary_action,
        queue_status,
        service_target,
        exhausted_reason,
        question_items_json,
        active_item_count,
        asked_item_count,
        answered_item_count,
        invalidated_item_count,
        updated_at
      FROM question_queue
      WHERE ${conditions.join(' AND ')}
      ORDER BY round_index DESC, updated_at DESC
      LIMIT 1
    `,
    params
  )

  return hydrateQuestionQueue(result?.data?.executeResultList?.[0] || null)
}

module.exports = {
  replaceQueueForRound,
  getLatestQueueBySession,
  getQueueBySessionAndRound
}
