'use strict'

const { safeJsonParse } = require('../utils/stored-value')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope
} = require('../utils/question-target-dimension')
const { getQuestionsByKeys } = require('../repositories/question-repository')
const {
  insertFollowUpQuestionsRows,
  listFollowUpRows,
  markFollowUpAnswerRow
} = require('../repositories/session-follow-up-repository')
const {
  collectQueuedQuestionKeys,
  filterQuestionsByQuestionQueue
} = require('../utils/follow-up-contract')
const { getQueueBySessionAndRound } = require('../repositories/question-queue-repository')

function readQuestionKeyFromRationale(rationale) {
  const parsed = safeJsonParse(rationale, {}) || {}
  return String(parsed.questionKey || parsed.qk || '').trim()
}

function readQuestionGroupKeyFromRationale(rationale) {
  const parsed = safeJsonParse(rationale, {}) || {}
  return String(parsed.questionGroupKey || parsed.qg || '__default__').trim() || '__default__'
}

function readRoundFromRationale(rationale) {
  const parsed = safeJsonParse(rationale, {}) || {}
  return Number(parsed.round || parsed.r || 1) || 1
}

async function appendFollowUpQuestions(sessionId, round, questions = [], { questionQueue = null } = {}) {
  const list = filterQuestionsByQuestionQueue(questions, questionQueue, {
    requireQueueAnchor: true
  })
  const questionMetaMap = new Map(
    (await getQuestionsByKeys(list.map(item => item?.questionKey)))
      .map(item => [String(item?.questionKey || '').trim(), item])
      .filter(([questionKey]) => Boolean(questionKey))
  )
  await insertFollowUpQuestionsRows(
    sessionId,
    list.map((item, index) => {
      const questionKey = String(item?.questionKey || '').trim()
      const questionMeta = questionMetaMap.get(questionKey) || {}
      const targetSymptomKey = String(item?.targetSymptomKey || questionMeta?.targetSymptomKey || '').trim()
      return {
        questionOrder: Number(index + 1),
        questionKey,
        questionText: item.text || item.questionText || '',
        rationale: JSON.stringify({
          qk: questionKey,
          qg: item.questionGroupKey || '',
          tsk: targetSymptomKey,
          td: normalizeQuestionTargetDimension(
            item?.targetDimension || questionMeta?.targetDimension || '',
            QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
          ),
          rs: normalizeQuestionRoutingScope(
            item?.routingScope || questionMeta?.routingScope || '',
            ''
          ),
          r: Number(round || 1)
        })
      }
    })
  )
}

async function markFollowUpAnswers(sessionId, answers = [], { optionMappings = [], answerRound = 1 } = {}) {
  const list = (Array.isArray(answers) ? answers : []).filter(item => item?.questionKey && item?.optionKey)
  const followUpRows = await listFollowUpRows(sessionId)

  const optionMetaByQuestionOption = new Map()
  for (const option of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(option?.questionKey || '').trim()
    const optionKey = String(option?.optionKey || '').trim().toLowerCase()
    if (!questionKey || !optionKey) continue
    optionMetaByQuestionOption.set(`${questionKey}::${optionKey}`, option)
  }

  for (const answer of list) {
    const optionKey = String(answer.optionKey || '').toLowerCase()
    const matchedRow = followUpRows.find(row => {
      return (
        readQuestionKeyFromRationale(row.rationale) === String(answer.questionKey || '').trim() &&
        readRoundFromRationale(row.rationale) === Number(answerRound || 1)
      )
    })

    if (!matchedRow?.id) {
      continue
    }

    const optionMeta = optionMetaByQuestionOption.get(
      `${String(answer.questionKey || '').trim()}::${optionKey}`
    )
    const optionValue = Number(optionMeta?.value || 0)
    const associationStrength = Number(optionMeta?.associationStrength || 0)
    const isUnknownOption =
      optionKey === 'unknown' ||
      (optionValue === 0 &&
        associationStrength === 0 &&
        /unknown|不确定|看不出/i.test(
          String(optionMeta?.text || optionMeta?.optionTextUserCn || optionMeta?.optionTextCn || '')
        ))

    const status = isUnknownOption
      ? 'skipped'
      : optionValue > 0
        ? 'confirmed'
        : optionValue < 0
          ? 'rejected'
          : 'answered'

    await markFollowUpAnswerRow({
      rowId: matchedRow.id,
      answerValue: optionKey || 'unknown',
      answerConfidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
      status
    })
  }
}

async function validateFollowUpAnswerOwnership(sessionId, answers = [], answerRound = 1) {
  const normalizedAnswers = (Array.isArray(answers) ? answers : [])
    .map(item => String(item?.questionKey || '').trim())
    .filter(Boolean)

  if (!normalizedAnswers.length) {
    return {
      ok: false,
      reason: 'missing_answers',
      invalidQuestionKeys: []
    }
  }

  const allowed = new Set()
  for (const row of await listFollowUpRows(sessionId)) {
    const round = readRoundFromRationale(row.rationale)
    const questionKey = readQuestionKeyFromRationale(row.rationale)
    if (
      round === Number(answerRound || 1) &&
      questionKey &&
      Number(row.asked || 0) === 0
    ) {
      allowed.add(questionKey)
    }
  }

  const questionQueue = await getQueueBySessionAndRound(sessionId, answerRound)
  for (const questionKey of collectQueuedQuestionKeys(questionQueue)) {
    allowed.add(questionKey)
  }

  const invalidQuestionKeys = normalizedAnswers.filter(key => !allowed.has(key))

  return {
    ok: invalidQuestionKeys.length === 0,
    reason: invalidQuestionKeys.length ? 'question_not_in_session_round' : '',
    invalidQuestionKeys
  }
}

async function getFollowUpSnapshotRows(sessionId) {
  return (await listFollowUpRows(sessionId)).map(row => ({
    questionOrder: Number(row.question_order || 0),
    questionText: row.question_text || '',
    answerValue: row.answer_value || '',
    status: row.status || 'pending'
  }))
}

module.exports = {
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  getFollowUpSnapshotRows,
  readQuestionGroupKeyFromRationale,
  readQuestionKeyFromRationale,
  readRoundFromRationale
}
