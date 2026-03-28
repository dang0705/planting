'use strict'

const { ranking: rankingConfig } = require('../constants/scoring')
const {
  toProblemId,
  toQuestionId,
  toOptionId,
  toResultId
} = require('../mappers/public-id-mapper')

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits))
}

function pickPrimaryRanking(rankings = [], problemMap = new Map()) {
  const allowedRoles = new Set(rankingConfig.supportRolesAsTop1)
  for (const item of rankings || []) {
    const problem = problemMap.get(item.problemKey)
    const role = problem?.problemRole || ''
    if (allowedRoles.has(role)) return item
  }
  return rankings[0] || null
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
  followUpRequired = false
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

  const summaryText =
    primaryExplanation?.resultSummaryCn ||
    primaryProblem?.userDefinitionCn ||
    primaryProblem?.definition ||
    (primary ? `当前更像是 ${primary.problemCn || primary.problemKey}` : '暂无结论')

  return {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: rankings.map(item => ({
      problemId: toProblemId(item.problemKey),
      problemKey: item.problemKey,
      problemCn: item.problemCn,
      role: problemMap.get(item.problemKey)?.problemRole || '',
      finalScore: round(item.finalScore),
      baseScore: round(item.baseScore),
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
    finalResult: primary
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
      : null,
    followUpRequired: Boolean(followUpRequired && followUps.length),
    followUps: followUps.map(question => ({
      questionId: toQuestionId(question.questionKey),
      questionKey: question.questionKey,
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
    resultExplanation: buildExplanation(primaryProblem, primaryExplanation),
    explanation: buildExplanation(primaryProblem, primaryExplanation),
    nextSteps: [
      {
        stepId: 'step_1',
        text:
          buildExplanation(primaryProblem, primaryExplanation).firstAid ||
          '先处理最明显的问题，再观察 3-7 天变化。'
      }
    ],
    whatToAvoid: buildExplanation(primaryProblem, primaryExplanation).avoid
      ? [buildExplanation(primaryProblem, primaryExplanation).avoid]
      : [],
    plantId,
    resultId,
    timestamp: Date.now()
  }
}

module.exports = {
  formatDiagnosisResponse
}
