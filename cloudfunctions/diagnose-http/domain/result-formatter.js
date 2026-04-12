'use strict'

const { ranking: rankingConfig } = require('../constants/scoring')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const {
  toProblemId,
  toQuestionId,
  toOptionId,
  toResultId
} = require('../mappers/public-id-mapper')

function roundValue(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function pickPrimaryRanking(rankings = [], problemMap = new Map()) {
  const allowedRoles = new Set(rankingConfig.supportRolesAsTop1)
  for (const item of rankings || []) {
    const problem = problemMap.get(item.problemKey)
    const role = problem?.problemRole || ''
    if (allowedRoles.has(role)) return item
  }
  return null
}

function buildExplanation(problem, explanationRow) {
  return {
    whyItHappens:
      explanationRow?.whyItHappensCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid:
      explanationRow?.firstAidCn ||
      problem?.userActionCn ||
      problem?.defaultAction ||
      '',
    avoid:
      explanationRow?.avoidCn ||
      problem?.userPreventionCn ||
      problem?.defaultPrevention || '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

function mapSeverity(problem) {
  return (problem?.severityHintCn || '中').includes('高') ? 'high' : 'medium'
}

function mapUrgency(problem) {
  return (problem?.urgencyHintCn || '中').includes('高') ? 'high' : 'medium'
}

function buildLowConfidenceSummary(displayName, baseSummary, lowConfidence = {}) {
  if (!displayName) {
    return lowConfidence?.isLowConfidence ? '当前证据不足，暂时无法稳定判断。' : baseSummary
  }

  if (!lowConfidence?.isLowConfidence) {
    return baseSummary
  }

  return `当前更像 ${displayName}，但还不够确定。${baseSummary ? ` ${baseSummary}` : ''}`.trim()
}

function buildHighSpecificityFastConvergenceSummary(displayName = '', baseSummary = '') {
  if (!displayName) {
    return baseSummary || '当前证据非常支持问题性方向，可优先按该问题处理。'
  }

  return `当前证据非常支持 ${displayName} 方向，可优先按该问题处理；若后续出现反向证据，再复查。${
    baseSummary ? ` ${baseSummary}` : ''
  }`.trim()
}

function buildUncertainSummary(lowConfidence = {}) {
  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []

  if (advice.length) {
    return advice[0]
  }

  return '当前证据不足，暂不能安全判断，建议补充更稳定的图片或观察信息。'
}

function buildUncertainExplanation(lowConfidence = {}) {
  const advice = Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map(item => String(item || '').trim()).filter(Boolean)
    : []

  return {
    whyItHappens: '当前证据不足或仍有冲突，继续硬判具体问题风险较高。',
    whatToCheckNext:
      advice[0] ||
      '建议补拍整株、受损部位特写、叶背和盆土状态后重新判断。',
    firstAid:
      advice[1] ||
      '先保持当前养护稳定，避免一次性大幅调整浇水、施肥或用药。',
    avoid: '不要在证据不足时立即大幅调整养护或连续使用药剂。',
    reassurance: '暂不硬判是当前更安全的输出。'
  }
}

function buildUncertainFinalResult({ resultId, lowConfidence = {} } = {}) {
  return {
    resultId,
    problemId: '',
    displayName: '暂不能稳定判断',
    summary: buildUncertainSummary(lowConfidence),
    severity: 'low',
    urgency: 'medium'
  }
}

function resolveOutcomeType({ followUpRequired = false, lowConfidence = {} } = {}) {
  if (followUpRequired) return null
  return lowConfidence?.isLowConfidence ? 'uncertain' : 'problematic'
}

function resolveRoutePrimaryAction({
  followUpRequired = false,
  outcomeType = null,
  preferredRoutePrimaryAction = ''
} = {}) {
  if (preferredRoutePrimaryAction === 'retake_first') return 'retake_first'
  if (followUpRequired) return 'ask_first'
  if (outcomeType === 'uncertain') return 'uncertain_prepare'
  return 'standard_flow'
}

function resolveStopReason({ followUpRequired = false, outcomeType = null } = {}) {
  if (followUpRequired) return 'await_follow_up'
  if (outcomeType === 'uncertain') return 'uncertain_output_ready'
  if (outcomeType === 'non_problematic') return 'non_problematic_output_ready'
  return 'problematic_output_ready'
}

function formatDiagnosisResponse({
  sessionId,
  round = 1,
  stage,
  observedSymptoms = [],
  rankings = [],
  followUps = [],
  problems = [],
  explanations = [],
  causality = [],
  plantId,
  followUpRequired = false,
  lowConfidence = { isLowConfidence: false, reasons: [], advice: [] },
  highSpecificityFastConvergence = null,
  preferredRoutePrimaryAction = ''
}) {
  const problemMap = new Map((problems || []).map(item => [item.problemKey, item]))
  const explanationMap = new Map((explanations || []).map(item => [item.problemKey, item]))

  const primary = pickPrimaryRanking(rankings, problemMap)
  const primaryProblem = primary ? problemMap.get(primary.problemKey) : null
  const primaryExplanation = primary ? explanationMap.get(primary.problemKey) : null

  const contributingRoles = new Set(rankingConfig.contributingRoles)
  const intermediateRoles = new Set(rankingConfig.intermediateRoles)

  const contributingFactors = rankings
    .filter(item => {
      const role = problemMap.get(item.problemKey)?.problemRole || ''
      return contributingRoles.has(role)
    })
    .slice(0, 3)
    .map(item => ({
      factorId: `f_${item.problemKey}`,
      label: problemMap.get(item.problemKey)?.displayNameCn || item.problemCn || item.problemKey
    }))

  const intermediateStates = rankings
    .filter(item => {
      const role = problemMap.get(item.problemKey)?.problemRole || ''
      return intermediateRoles.has(role)
    })
    .slice(0, 3)
    .map(item => ({
      stateId: `s_${item.problemKey}`,
      label: problemMap.get(item.problemKey)?.displayNameCn || item.problemCn || item.problemKey
    }))

  const resultId = toResultId(sessionId, round)

  const baseSummaryText =
    primaryExplanation?.resultSummaryCn ||
    primaryProblem?.userDefinitionCn ||
    primaryProblem?.definition ||
    (primary ? `当前更像是 ${primary.problemCn || primary.problemKey}` : '暂无结论')
  const summaryText = highSpecificityFastConvergence?.applied
    ? buildHighSpecificityFastConvergenceSummary(
        primaryProblem?.displayNameCn || primary?.problemCn || primary?.problemKey || '',
        baseSummaryText
      )
    : buildLowConfidenceSummary(
        primaryProblem?.displayNameCn || primary?.problemCn || primary?.problemKey || '',
        baseSummaryText,
        lowConfidence
      )
  const outcomeType = resolveOutcomeType({ followUpRequired, lowConfidence })
  const routePrimaryAction = resolveRoutePrimaryAction({
    followUpRequired,
    outcomeType,
    preferredRoutePrimaryAction
  })
  const stopReason = resolveStopReason({ followUpRequired, outcomeType })
  const explanationPayload = outcomeType === 'uncertain'
    ? buildUncertainExplanation(lowConfidence)
    : buildExplanation(primaryProblem, primaryExplanation)
  const finalResultPayload = outcomeType === 'uncertain'
    ? buildUncertainFinalResult({ resultId, lowConfidence })
    : primary
      ? {
          resultId,
          problemId: toProblemId(primary.problemKey),
          displayName:
            primaryProblem?.displayNameCn ||
            primary.problemCn ||
            primary.problemKey,
          summary: summaryText,
          severity: mapSeverity(primaryProblem),
          urgency: mapUrgency(primaryProblem)
        }
      : null
  const nextSteps = outcomeType === 'uncertain'
    ? [
        ...(Array.isArray(lowConfidence?.advice)
          ? lowConfidence.advice.map((text, index) => ({
              stepId: `low_conf_${index + 1}`,
              text
            }))
          : []),
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先保持当前养护稳定，避免在证据不足时做大幅调整。'
        }
      ]
    : [
        ...(Array.isArray(lowConfidence?.advice)
          ? lowConfidence.advice.map((text, index) => ({
              stepId: `low_conf_${index + 1}`,
              text
            }))
          : []),
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先处理最明显的问题，再观察 3-7 天变化。'
        }
      ]

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: rankings.map(item => ({
      problemId: toProblemId(item.problemKey),
      problemKey: item.problemKey,
      problemCn: item.problemCn,
      role: problemMap.get(item.problemKey)?.problemRole || '',
      finalScore: roundValue(item.finalScore),
      baseScore: roundValue(item.baseScore),
      rankNo: item.rankNo
    })),
    topProblem: primary
      ? {
          problemId: toProblemId(primary.problemKey),
          problemKey: primary.problemKey,
          displayName:
            primaryProblem?.displayNameCn ||
            primary.problemCn ||
            primary.problemKey,
          summary: summaryText,
          severity: mapSeverity(primaryProblem),
          urgency: mapUrgency(primaryProblem)
        }
      : null,
    finalResult: finalResultPayload,
    followUpRequired: Boolean(followUpRequired && followUps.length),
    followUps: followUps.map(question => ({
      questionId: toQuestionId(question.questionKey),
      questionKey: question.questionKey,
      targetSymptomKey: question.targetSymptomKey || '',
      questionGroupKey: question.questionGroupKey,
      type: 'single_choice',
      text: question.questionText,
      helpText: question.helpText,
      options: question.options.map(option => ({
        optionId: toOptionId(option.optionKey),
        optionKey: option.optionKey,
        text: option.text
      }))
    })),
    contributingFactors,
    intermediateStates,
    problemCausality: causality,
    resultExplanation: explanationPayload,
    explanation: explanationPayload,
    nextSteps,
    whatToAvoid: explanationPayload.avoid
      ? [explanationPayload.avoid]
      : [],
    confidenceLevel: outcomeType === 'uncertain' ? 'low' : 'normal',
    confidenceReasons: Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : [],
    needHumanReview: Boolean(outcomeType === 'uncertain'),
    highSpecificityFastConvergence: highSpecificityFastConvergence?.applied
      ? highSpecificityFastConvergence
      : null,
    outcomeType,
    routePrimaryAction,
    stopReason,
    sessionStatus: followUpRequired ? 'awaiting_follow_up' : 'completed',
    plantId,
    resultId,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response)
  }
}

module.exports = {
  formatDiagnosisResponse
}
