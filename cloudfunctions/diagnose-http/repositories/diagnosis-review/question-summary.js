'use strict'

function summarizeQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return {
      totalItems: 0,
      activeItems: 0,
      askedItems: 0,
      answeredItems: 0,
      invalidatedItems: 0
    }
  }

  const questionItems = Array.isArray(questionQueue?.questionItems)
    ? questionQueue.questionItems
    : []
  const askedItems = questionItems.filter(item => Number(item?.asked || 0) ? 1 : 0).length
  const answeredItems = questionItems.filter(item => Number(item?.answered || 0) ? 1 : 0).length
  const invalidatedItems = questionItems.filter(item => Number(item?.invalidated || 0) ? 1 : 0).length
  const activeItems = questionItems.filter(item => {
    const status = String(item?.status || '').trim().toLowerCase()
    return Number(item?.asked || 0) && !Number(item?.answered || 0) && !Number(item?.invalidated || 0) && status !== 'answered' && status !== 'invalidated'
  }).length

  return {
    totalItems: questionItems.length,
    activeItems: Number(questionQueue?.activeItemCount || activeItems || 0),
    askedItems: Number(questionQueue?.askedItemCount || askedItems || 0),
    answeredItems: Number(questionQueue?.answeredItemCount || answeredItems || 0),
    invalidatedItems: Number(questionQueue?.invalidatedItemCount || invalidatedItems || 0)
  }
}

function summarizeQuestionCountByDbFields(row = {}) {
  if (!row || typeof row !== 'object') {
    return {
      totalItems: 0,
      activeItems: 0,
      askedItems: 0,
      answeredItems: 0,
      invalidatedItems: 0
    }
  }

  const hasDbSummary =
    row.question_total_count !== undefined ||
    row.question_asked_count !== undefined ||
    row.question_answered_count !== undefined ||
    row.question_invalidated_count !== undefined ||
    row.question_active_count !== undefined

  if (!hasDbSummary) {
    return null
  }

  return {
    totalItems: Number(row.question_total_count || 0),
    activeItems: Number(row.question_active_count || 0),
    askedItems: Number(row.question_asked_count || 0),
    answeredItems: Number(row.question_answered_count || 0),
    invalidatedItems: Number(row.question_invalidated_count || 0)
  }
}

function resolveQuestionCountSummary(row = {}, runtimeSnapshot = null) {
  const dbSummary = summarizeQuestionCountByDbFields(row)
  const queueSummary = summarizeQuestionQueue(runtimeSnapshot?.questionQueue || runtimeSnapshot || null)
  if (!dbSummary) {return queueSummary}

  return {
    totalItems: Math.max(Number(dbSummary.totalItems || 0), Number(queueSummary.totalItems || 0)),
    activeItems: Math.max(Number(dbSummary.activeItems || 0), Number(queueSummary.activeItems || 0)),
    askedItems: Math.max(Number(dbSummary.askedItems || 0), Number(queueSummary.askedItems || 0)),
    answeredItems: Math.max(Number(dbSummary.answeredItems || 0), Number(queueSummary.answeredItems || 0)),
    invalidatedItems: Math.max(Number(dbSummary.invalidatedItems || 0), Number(queueSummary.invalidatedItems || 0))
  }
}

function buildSymptomClassRuntimeReviewPayload(symptomClassRuntime = null) {
  if (!symptomClassRuntime || typeof symptomClassRuntime !== 'object') {
    return null
  }

  return {
    primaryClass: symptomClassRuntime?.primaryClass && typeof symptomClassRuntime.primaryClass === 'object'
      ? {
          classKey: String(symptomClassRuntime.primaryClass?.classKey || '').trim(),
          classNameCn: String(symptomClassRuntime.primaryClass?.classNameCn || '').trim()
        }
      : null,
    secondaryClasses: Array.isArray(symptomClassRuntime?.secondaryClasses)
      ? symptomClassRuntime.secondaryClasses
          .map(item => ({
            classKey: String(item?.classKey || '').trim(),
            classNameCn: String(item?.classNameCn || '').trim()
          }))
          .filter(item => item.classKey)
      : [],
    currentClassKey: String(symptomClassRuntime?.currentClassKey || '').trim(),
    currentGroupKey: String(symptomClassRuntime?.currentGroupKey || '').trim(),
    classScores: Array.isArray(symptomClassRuntime?.classScores) ? symptomClassRuntime.classScores : [],
    classSwitchHistory: Array.isArray(symptomClassRuntime?.classSwitchHistory)
      ? symptomClassRuntime.classSwitchHistory
      : [],
    classGateDecision: symptomClassRuntime?.classGateDecision &&
      typeof symptomClassRuntime.classGateDecision === 'object'
      ? symptomClassRuntime.classGateDecision
      : null
  }
}

module.exports = {
  summarizeQuestionQueue,
  summarizeQuestionCountByDbFields,
  resolveQuestionCountSummary,
  buildSymptomClassRuntimeReviewPayload
}
