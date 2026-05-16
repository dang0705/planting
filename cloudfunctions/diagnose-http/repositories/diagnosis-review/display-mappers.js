'use strict'

const { toProblemId } = require('../../mappers/public-id-mapper')
const { normalizeStoredNullableText } = require('../../utils/stored-value')

function toPublicProblemId(problemKey = '') {
  const normalized = String(problemKey || '').trim()
  if (!normalized) {return ''}
  return toProblemId(normalized)
}

function resolveDisplayName({
  outcomeType = '',
  finalProblemCn = '',
  finalProblemKey = '',
  outcomePayload = {},
  routeDecisionSummary = null
} = {}) {
  if (outcomeType === 'non_problematic') {
    return normalizeStoredNullableText(outcomePayload?.nonProblematicLabel, '') || '暂未见明显问题'
  }

  if (outcomeType === 'uncertain') {
    const safeSummary = routeDecisionSummary && typeof routeDecisionSummary === 'object' ? routeDecisionSummary : null
    const stopReason = String(safeSummary?.stopReason || '').trim()
    const visibleOutcomeCount = Number(safeSummary?.visibleOutcomeCount || 0)
    const hasVisibleActionConflict = Boolean(safeSummary?.hasVisibleActionConflict)

    if (stopReason === 'route_uncertain_with_candidates') {
      if (visibleOutcomeCount > 0) {
        return `候选未闭合（可见候选 ${visibleOutcomeCount} 个）`
      }
      if (hasVisibleActionConflict) {
        return '候选未闭合（存在动作冲突）'
      }
      return '疑似规则候选未满足可输出条件'
    }

    const candidateOutcomeCount = Number(safeSummary?.displayableCandidateCount || 0)
    if (candidateOutcomeCount > 0 && hasVisibleActionConflict) {
      return `候选未闭合（可见候选 ${candidateOutcomeCount} 个，动作冲突）`
    }
    return '暂不能稳定判断'
  }

  return (
    normalizeStoredNullableText(finalProblemCn, '') ||
    normalizeStoredNullableText(finalProblemKey, '') ||
    '待进一步确认'
  )
}

function normalizeFeedbackFlag(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return Number(value) ? 1 : 0
}

function buildFeedbackSummary(row = {}) {
  const feedbackCount = Number(row.feedback_count || 0)
  const latestFeedback = feedbackCount
    ? {
        isHelpful: normalizeFeedbackFlag(row.latest_feedback_is_helpful),
        isAccurate: normalizeFeedbackFlag(row.latest_feedback_is_accurate),
        note: String(row.latest_feedback_note || '').trim(),
        createdAt: String(row.latest_feedback_created_at || '').trim()
      }
    : null

  return {
    feedbackCount,
    hasFeedback: feedbackCount > 0 ? 1 : 0,
    latestFeedback
  }
}

module.exports = {
  toPublicProblemId,
  resolveDisplayName,
  normalizeFeedbackFlag,
  buildFeedbackSummary
}
