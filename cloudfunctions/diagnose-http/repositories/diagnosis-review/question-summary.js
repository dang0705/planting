'use strict'

function summarizeQuestionCountByDbFields(row = {}) {
  if (!row || typeof row !== 'object') {
    return {
      questionTotal: 0,
      questionPending: 0,
      questionAsked: 0,
      questionAnswered: 0,
      questionInvalidated: 0
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
    questionTotal: Number(row.question_total_count || 0),
    questionPending: Number(row.question_active_count || 0),
    questionAsked: Number(row.question_asked_count || 0),
    questionAnswered: Number(row.question_answered_count || 0),
    questionInvalidated: Number(row.question_invalidated_count || 0)
  }
}

function resolveQuestionCountSummary(row = {}) {
  return summarizeQuestionCountByDbFields(row) || {
    questionTotal: 0,
    questionPending: 0,
    questionAsked: 0,
    questionAnswered: 0,
    questionInvalidated: 0
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
    classConditionDecision: symptomClassRuntime?.classConditionDecision &&
      typeof symptomClassRuntime.classConditionDecision === 'object'
      ? symptomClassRuntime.classConditionDecision
      : null
  }
}

module.exports = {
  summarizeQuestionCountByDbFields,
  resolveQuestionCountSummary,
  buildSymptomClassRuntimeReviewPayload
}
