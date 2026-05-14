'use strict'

const { lowConfidence: lowConfidenceConfig } = require('../constants/scoring')
const {
  getOutputEligibleProblemRankings
} = require('../utils/output-eligibility')

const FORMAL_UNCERTAIN_LEGALITY_REASONS = new Set([
  'evidence_conflict_unresolved',
  'input_unfillable',
  'no_high_value_question',
  'user_interrupt',
  'resource_limit',
  'out_of_pool_no_mapping'
])

function buildLowConfidenceAdvice({
  observedSymptoms = [],
  unknownCountByGroup = {},
  noHighValueQuestion = false
} = {}) {
  const advice = []

  if (noHighValueQuestion) {
    advice.push('当前缺少高价值问诊题，建议补拍整株、病斑特写、叶背和盆土照片后重新开始诊断。')
  }

  if ((observedSymptoms || []).length === 0) {
    advice.push('当前可用症状较少，建议在自然光下重新拍摄受损部位和整株照片。')
  }

  if (
    Object.values(unknownCountByGroup || {}).some(
      value => Number(value || 0) >= lowConfidenceConfig.unknownGroupThreshold
    )
  ) {
    advice.push('已有多个关键问题无法确认，建议重点检查叶背、根部、盆土表面或虫体。')
  }

  if (!advice.length) {
    advice.push('当前证据仍不够稳定，建议补查叶背、根部、盆土状态，必要时重新开始诊断。')
  }

  return Array.from(new Set(advice))
}

function pickCorroboratedPrimaryCandidate({
  rankings = [],
  problemRoleByKey = {},
  observedEvidenceSet = [],
  symptomClassRuntime = null
} = {}) {
  const corroboratedScoreFloor = Math.max(
    Number(lowConfidenceConfig.topScoreThreshold || 0) - 0.17,
    0.45
  )
  const corroboratedVisualFloor = 0.25
  const corroboratedQuestionFloor = 0.18

  for (const item of getOutputEligibleProblemRankings(
    rankings,
    observedEvidenceSet,
    problemRoleByKey instanceof Map ? problemRoleByKey : new Map(Object.entries(problemRoleByKey || {})),
    {
      symptomClassRuntime
    }
  )) {
    if (!item?.problemKey) {continue}

    if (
      Number(item.visualEvidence || 0) >= corroboratedVisualFloor &&
      Number(item.questionEvidence || 0) >= corroboratedQuestionFloor &&
      Number(item.finalScore || 0) >= corroboratedScoreFloor
    ) {
      return item
    }
  }

  return null
}

function resolveLowConfidenceState({
  rankings = [],
  observedSymptoms = [],
  observedEvidenceSet = [],
  unknownCountByGroup = {},
  noHighValueQuestion = false,
  problemRoleByKey = {},
  symptomClassRuntime = null
} = {}) {
  const outputEligibleRankings = getOutputEligibleProblemRankings(
    rankings,
    observedEvidenceSet,
    problemRoleByKey instanceof Map ? problemRoleByKey : new Map(Object.entries(problemRoleByKey || {})),
    {
      symptomClassRuntime
    }
  )
  const scoringRankings = outputEligibleRankings.length
    ? outputEligibleRankings
    : (Array.isArray(rankings) ? rankings : [])
  const topScore = Number(scoringRankings[0]?.finalScore || 0)
  const secondScore = Number(scoringRankings[1]?.finalScore || 0)
  const scoreGap = Math.max(topScore - secondScore, 0)
  const maxVisualConfidence = Math.max(
    0,
    ...(observedSymptoms || []).map(item => Number(item?.confidence || 0))
  )
  const unknownGroupCount = Object.values(unknownCountByGroup || {}).filter(
    value => Number(value || 0) >= lowConfidenceConfig.unknownGroupThreshold
  ).length
  const corroboratedTopProblem =
    noHighValueQuestion &&
    unknownGroupCount === 0 &&
    Boolean(pickCorroboratedPrimaryCandidate({
      rankings,
      problemRoleByKey,
      observedEvidenceSet,
      symptomClassRuntime
    }))

  const reasons = []
  if (topScore < lowConfidenceConfig.topScoreThreshold && !corroboratedTopProblem) {
    reasons.push('top_score_low')
  }
  if (
    scoreGap < lowConfidenceConfig.scoreGapThreshold &&
    !corroboratedTopProblem
  ) {
    reasons.push('score_gap_small')
  }
  if (unknownGroupCount > 0) {reasons.push('too_many_unknowns')}
  if (
    (observedSymptoms || []).length > 0 &&
    maxVisualConfidence < lowConfidenceConfig.visualConfidenceThreshold
  ) {
    reasons.push('visual_confidence_low')
  }
  if (noHighValueQuestion && !corroboratedTopProblem) {
    reasons.push('no_high_value_questions')
  }

  let uncertainLegalityReason = ''
  if (!corroboratedTopProblem && reasons.length > 0) {
    if (noHighValueQuestion) {
      uncertainLegalityReason =
        unknownGroupCount > 0 ? 'input_unfillable' : 'no_high_value_question'
    }
  }

  return {
    isLowConfidence: reasons.length > 0,
    reasons,
    advice: buildLowConfidenceAdvice({
      observedSymptoms,
      unknownCountByGroup,
      noHighValueQuestion
    }),
    corroboratedTopProblem,
    uncertainLegalityReason:
      FORMAL_UNCERTAIN_LEGALITY_REASONS.has(uncertainLegalityReason)
        ? uncertainLegalityReason
        : ''
  }
}

module.exports = {
  FORMAL_UNCERTAIN_LEGALITY_REASONS,
  buildLowConfidenceAdvice,
  pickCorroboratedPrimaryCandidate,
  resolveLowConfidenceState
}
