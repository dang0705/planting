'use strict'

const { safeJsonParse } = require('../utils/stored-value')
const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope,
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')
const { getQuestionsByKeys } = require('../repositories/question-repository')
const {
  insertQuestionQuestionsRows,
  listQuestionRows,
  markQuestionAnswerRow,
  invalidateQuestionRowsAfterQuestion,
  insertQuestionAnswerRevisionEvents
} = require('../repositories/session-question-repository')
const {
  collectQueuedQuestionKeys,
  filterQuestionsByQuestionQueue
} = require('../utils/question-contract')
const {
  isSyntheticObservedProbeQuestionKey,
  isSyntheticVisualCandidateQuestionKey
} = require('../utils/synthetic-question-package')
const { getQueueBySessionAndRound } = require('../repositories/question-queue-repository')
const { buildQuestionTextCandidateKeys } = require('../utils/question-text-resolver')
const { resolveQuestionText } = require('../utils/question-text-resolver')

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

function resolveQuestionKey(item = {}) {
  return buildQuestionTextCandidateKeys(item)[0] || String(item?.questionKey || item?.question_key || '').trim()
}

function resolveQuestionStorageSymptomKey(questionKey = '', targetSymptomKey = '') {
  const normalizedQuestionKey = String(questionKey || '').trim()
  const normalizedTargetSymptomKey = String(targetSymptomKey || '').trim()
  if (
    normalizedTargetSymptomKey &&
    (
      isSyntheticObservedProbeQuestionKey(normalizedQuestionKey) ||
      isSyntheticVisualCandidateQuestionKey(normalizedQuestionKey)
    )
  ) {
    return normalizedTargetSymptomKey
  }
  return normalizedQuestionKey
}

function buildAnswerRevisionEvents({
  rowEntries = [],
  dirtyEntry = null,
  answerMap = new Map(),
  dirtyQuestionKey = ''
} = {}) {
  if (!dirtyEntry) {return []}

  const events = []
  for (const item of rowEntries) {
    const previousOptionKey = String(item.row?.answer_value || '').trim().toLowerCase()
    const previousStatus = String(item.row?.status || '').trim()
    const previousAsked = Number(item.row?.asked || 0) ? 1 : 0

    if (item.index <= dirtyEntry.index) {
      const submittedAnswer = answerMap.get(item.questionKey)
      if (!submittedAnswer) {continue}
      const newOptionKey = String(submittedAnswer.optionKey || '').trim().toLowerCase()
      if (!newOptionKey || previousOptionKey === newOptionKey) {continue}
      events.push({
        eventType: previousOptionKey ? 'answer_changed' : 'historical_answer_added',
        questionRowId: item.row?.id,
        questionKey: item.questionKey,
        questionText: item.row?.question_text || '',
        questionRound: item.round,
        previousOptionKey,
        previousStatus,
        previousAsked,
        newOptionKey,
        newStatus: 'answered',
        newAsked: 1,
        reason: item.questionKey === dirtyQuestionKey ? 'dirty_question_changed' : 'revision_resubmitted'
      })
      continue
    }

    if (previousOptionKey || previousAsked || previousStatus === 'answered' || previousStatus === 'confirmed' || previousStatus === 'rejected') {
      events.push({
        eventType: 'downstream_invalidated',
        questionRowId: item.row?.id,
        questionKey: item.questionKey,
        questionText: item.row?.question_text || '',
        questionRound: item.round,
        previousOptionKey,
        previousStatus,
        previousAsked,
        newOptionKey: '',
        newStatus: 'invalidated',
        newAsked: 0,
        reason: 'answer_revision'
      })
    }
  }

  return events
}

async function appendQuestionQuestions(
  sessionId,
  round,
  questions = [],
  {
    questionQueue = null,
    assumeNoExisting = false,
    allowUnqueuedQuestions = false
  } = {}
) {
  const list = allowUnqueuedQuestions
    ? filterQuestionsByQuestionQueue(questions, null, { requireQueueAnchor: false })
    : filterQuestionsByQuestionQueue(questions, questionQueue, { requireQueueAnchor: true })
  if (!list.length) {return}

  const questionRows = assumeNoExisting ? [] : await listQuestionRows(sessionId)
  const existingQuestionKeys = new Set(
    (Array.isArray(questionRows) ? questionRows : [])
      .map(row => readQuestionKeyFromRationale(row?.rationale || '') || String(row?.symptom_key || '').trim())
      .filter(Boolean)
  )
  const deDupedQuestionRows = []
  const pendingInPayloadKeys = new Set()

  for (const item of list) {
    const questionKey = resolveQuestionKey(item)
    if (!questionKey || existingQuestionKeys.has(questionKey) || pendingInPayloadKeys.has(questionKey)) {
      continue
    }

    pendingInPayloadKeys.add(questionKey)
    deDupedQuestionRows.push(item)
  }

  if (!deDupedQuestionRows.length) {return}

  const needsQuestionMetaLookup = deDupedQuestionRows.some(item =>
    !resolveQuestionText(item, {}) ||
    !String(item?.targetDimension || '').trim() ||
    !String(item?.targetSymptomKey || '').trim()
  )
  const questionMetaMap = needsQuestionMetaLookup
    ? new Map(
      (await getQuestionsByKeys(deDupedQuestionRows.map(item => resolveQuestionKey(item))))
        .map(item => [String(item?.questionKey || '').trim(), item])
        .filter(([questionKey]) => Boolean(questionKey))
    )
    : new Map()
  await insertQuestionQuestionsRows(
    sessionId,
    deDupedQuestionRows.map((item, index) => {
      const questionKey = resolveQuestionKey(item)
      const questionMeta = questionMetaMap.get(questionKey) || {}
      const targetSymptomKey = String(item?.targetSymptomKey || questionMeta?.targetSymptomKey || '').trim()
      const targetDimension = normalizeQuestionTargetDimension(
        item?.targetDimension || questionMeta?.targetDimension || '',
        QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
      const routingScope = normalizeQuestionRoutingScope(
        item?.routingScope || questionMeta?.routingScope || '',
        ''
      )
      const questionRole = normalizeQuestionRole(
        item?.questionRole || item?.questionCategory || questionMeta?.questionRole || '',
        inferQuestionRole(targetDimension, routingScope)
      )
      const effectMode = normalizeQuestionEffectMode(
        item?.effectMode || questionMeta?.effectMode || '',
        inferQuestionEffectMode(questionRole, targetDimension)
      )
      return {
        questionOrder: Number(index + 1),
        storageSymptomKey: resolveQuestionStorageSymptomKey(questionKey, targetSymptomKey),
        questionKey,
        questionText: resolveQuestionText(item, questionMeta),
        rationale: JSON.stringify({
          qk: questionKey,
          qg: item.questionGroupKey || '',
          tsk: targetSymptomKey,
          td: targetDimension,
          rs: routingScope,
          qr: questionRole,
          em: effectMode,
          dok: String(item?.defaultOptionKey || '').trim(),
          uv: String(item?.uiVariant || '').trim(),
          opts: (Array.isArray(item?.options) ? item.options : [])
            .map(option => ({
              k: String(option?.optionKey || option?.optionId || '').trim(),
              t: String(option?.text || option?.label || '').trim(),
              d: String(option?.description || option?.desc || '').trim(),
              df: Boolean(option?.isDefault)
            }))
            .filter(option => option.k || option.t || option.d),
          r: Number(round || 1)
        })
      }
    })
  )
}

async function markQuestionAnswers(
  sessionId,
  answers = [],
  {
    optionMappings = [],
    answerRound = 1,
    allowHistoricalQuestions = false,
    questionRows: preloadedQuestionRows = null,
    awaitPersistence = true
  } = {}
) {
  const list = (Array.isArray(answers) ? answers : []).filter(item => item?.questionKey && item?.optionKey)
  const questionRows = Array.isArray(preloadedQuestionRows)
    ? preloadedQuestionRows
    : await listQuestionRows(sessionId)

  const optionMetaByQuestionOption = new Map()
  for (const option of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(option?.questionKey || '').trim()
    const optionKey = String(option?.optionKey || '').trim().toLowerCase()
    if (!questionKey || !optionKey) {continue}
      optionMetaByQuestionOption.set(`${questionKey}::${optionKey}`, option)
  }

  const questionRowsByQuestionAndRound = new Map()
  const questionRowsByQuestion = new Map()
  for (const row of questionRows) {
    const questionKey = readQuestionKeyFromRationale(row.rationale) || String(row?.symptom_key || '').trim()
    const round = readRoundFromRationale(row.rationale)
    if (!questionKey) {continue}
    const roundQuestionKey = `${Number(round || 1)}::${questionKey}`
    if (!questionRowsByQuestionAndRound.has(roundQuestionKey)) {
      questionRowsByQuestionAndRound.set(roundQuestionKey, row)
    }
    if (!questionRowsByQuestion.has(questionKey)) {
      questionRowsByQuestion.set(questionKey, row)
    }
  }

  const updatedAnswers = []
  const updatedRowsById = new Map()
  const markTasks = []

  for (const answer of list) {
    const optionKey = String(answer.optionKey || '').toLowerCase()
    const normalizedQuestionKey = String(answer.questionKey || '').trim()
    const normalizedRound = Number(answerRound || 1)
    const matchLookupKey = `${normalizedRound}::${normalizedQuestionKey}`
    const matchedRow = allowHistoricalQuestions
      ? questionRowsByQuestion.get(normalizedQuestionKey)
      : questionRowsByQuestionAndRound.get(matchLookupKey) ||
        questionRowsByQuestion.get(normalizedQuestionKey)

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

    const targetQuestionKey = normalizedQuestionKey
    const targetQuestionGroup = readQuestionGroupKeyFromRationale(matchedRow.rationale)
    markTasks.push(
      markQuestionAnswerRow({
      rowId: matchedRow.id,
      answerValue: optionKey || 'unknown',
      answerConfidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
      status
    })
    )
    updatedAnswers.push({
      questionKey: targetQuestionKey,
      optionKey,
      answerValue: optionKey || 'unknown',
      answerConfidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
      status,
      questionGroupKey: targetQuestionGroup || '__default__'
    })
    updatedRowsById.set(Number(matchedRow.id || 0), {
      asked: 1,
      answer_value: optionKey || 'unknown',
      answerValue: optionKey || 'unknown',
      answer_confidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
      answerConfidence: isUnknownOption ? 0 : Math.max(0, associationStrength || 1),
      status
    })
  }

  if (awaitPersistence) {
    await Promise.all(markTasks)
  }

  return {
    questionRows: questionRows.map(row => ({
      ...row,
      ...(updatedRowsById.get(Number(row?.id || 0)) || {})
    })),
    updatedAnswers,
    pendingWrites: awaitPersistence ? null : markTasks
  }
}

async function validateQuestionAnswerOwnership(
  sessionId,
  answers = [],
  answerRound = 1,
  { questionRows: preloadedQuestionRows = null, queuedQuestionKeys = null } = {}
) {
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

  const questionRows = Array.isArray(preloadedQuestionRows)
    ? preloadedQuestionRows
    : await listQuestionRows(sessionId)
  const allowed = new Set()
  for (const row of questionRows) {
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

  const normalizedQueuedQuestionKeys = queuedQuestionKeys instanceof Set
    ? new Set(Array.from(queuedQuestionKeys).map(item => String(item || '').trim()).filter(Boolean))
    : null
  const questionQueueQuestionKeys = normalizedQueuedQuestionKeys
    ? normalizedQueuedQuestionKeys
    : collectQueuedQuestionKeys(await getQueueBySessionAndRound(sessionId, answerRound))
  for (const questionKey of questionQueueQuestionKeys) {
    allowed.add(questionKey)
  }

  const invalidQuestionKeys = normalizedAnswers.filter(key => !allowed.has(key))

  return {
    ok: invalidQuestionKeys.length === 0,
    reason: invalidQuestionKeys.length ? 'question_not_in_session_round' : '',
    invalidQuestionKeys,
    questionRows
  }
}

async function prepareAnswerRevision({
  sessionId,
  openid = '',
  answers = [],
  dirtyQuestionKey = '',
  optionMappings = [],
  questionRows = null,
  answerRevisionBefore = 0,
  answerRevisionAfter = 0
} = {}) {
  const normalizedDirtyQuestionKey = String(dirtyQuestionKey || '').trim()
  const questionRowsSnapshot = Array.isArray(questionRows) ? questionRows : await listQuestionRows(sessionId)
  const rowEntries = questionRowsSnapshot
    .map((row, index) => ({
      row,
      index,
      questionKey: readQuestionKeyFromRationale(row.rationale) || String(row.symptom_key || '').trim(),
      round: readRoundFromRationale(row.rationale)
    }))
    .filter(item => item.questionKey)
  const dirtyEntry = rowEntries.find(item => item.questionKey === normalizedDirtyQuestionKey) || null

  if (!normalizedDirtyQuestionKey || !dirtyEntry) {
    return {
      ok: false,
      reason: 'dirty_question_not_in_session',
      effectiveAnswers: [],
      invalidatedFromQuestionId: normalizedDirtyQuestionKey,
      keepUntilQuestionId: '',
      dirtyRound: 1
    }
  }

  const allowedQuestionKeys = new Set(rowEntries.map(item => item.questionKey))
  const answerMap = new Map(
    (Array.isArray(answers) ? answers : [])
      .filter(item => item?.questionKey && item?.optionKey)
      .map(item => [String(item.questionKey || '').trim(), item])
  )
  const invalidQuestionKeys = Array.from(answerMap.keys()).filter(key => !allowedQuestionKeys.has(key))

  if (invalidQuestionKeys.length) {
    return {
      ok: false,
      reason: 'question_not_in_session',
      invalidQuestionKeys,
      effectiveAnswers: [],
      invalidatedFromQuestionId: normalizedDirtyQuestionKey,
      keepUntilQuestionId: '',
      dirtyRound: dirtyEntry.round || 1
    }
  }

  const effectiveAnswers = rowEntries
    .filter(item => item.index <= dirtyEntry.index)
    .map(item => answerMap.get(item.questionKey))
    .filter(Boolean)
  const revisionEvents = buildAnswerRevisionEvents({
    rowEntries,
    dirtyEntry,
    answerMap,
    dirtyQuestionKey: normalizedDirtyQuestionKey
  })
  const eventResult = await insertQuestionAnswerRevisionEvents({
    sessionId,
    openid,
    answerRevisionBefore,
    answerRevisionAfter,
    dirtyQuestionKey: normalizedDirtyQuestionKey,
    dirtyRound: dirtyEntry.round || 1,
    events: revisionEvents
  })

  await invalidateQuestionRowsAfterQuestion({
    sessionId,
    dirtyQuestionKey: normalizedDirtyQuestionKey
  })
  await markQuestionAnswers(sessionId, effectiveAnswers, {
    optionMappings,
    answerRound: dirtyEntry.round || 1,
    allowHistoricalQuestions: true,
    questionRows: rowEntries.map(item => item.row)
  })

  return {
    ok: true,
    reason: '',
    effectiveAnswers,
    invalidatedFromQuestionId: normalizedDirtyQuestionKey,
    keepUntilQuestionId: normalizedDirtyQuestionKey,
    dirtyRound: dirtyEntry.round || 1,
    answerRevisionEventCount: Number(eventResult?.insertedCount || 0)
  }
}

async function getQuestionSnapshotRows(sessionId) {
  return (await listQuestionRows(sessionId)).map(row => ({
    questionOrder: Number(row.question_order || 0),
    questionText: row.question_text || '',
    answerValue: row.answer_value || '',
    status: row.status || 'pending'
  }))
}

module.exports = {
  appendQuestionQuestions,
  markQuestionAnswers,
  validateQuestionAnswerOwnership,
  prepareAnswerRevision,
  getQuestionSnapshotRows,
  readQuestionGroupKeyFromRationale,
  readQuestionKeyFromRationale,
  readRoundFromRationale
}
