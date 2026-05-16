'use strict'

const { ranking: rankingConfig } = require('../constants/scoring')
const { buildRuntimeArtifacts } = require('./runtime-artifacts')
const { resolveRouteOutcomePayload } = require('./outcome-action-resolver')
const {
  toProblemId,
  toQuestionId,
  toOptionId,
  toResultId
} = require('../mappers/public-id-mapper')
const {
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')
const {
  buildActionAdviceSteps,
  buildActionAvoidTexts,
  buildExplanation,
  buildHighSpecificityFastConvergenceSummary,
  buildLowConfidenceSummary,
  buildUncertainExplanation,
  buildUncertainFinalResult,
  buildUncertainSummary,
  mapSeverity,
  mapUrgency,
  normalizeText,
  pickPrimaryRanking,
  resolveOutcomeType,
  resolveRoutePrimaryAction,
  resolveStopReason,
  roundValue,
  uniqList
} = require('./result-formatter-helpers')

function buildRouteExplanationPayload({
  routePrimaryOutcome = null,
  routePrimaryProblem = null,
  routePrimaryExplanation = null,
  routeSafeSummary = ''
} = {}) {
  const explanation = buildExplanation(routePrimaryProblem, routePrimaryExplanation)
  return {
    whyItHappens: normalizeText(
      explanation.whyItHappens ||
        routePrimaryOutcome?.summary ||
        routeSafeSummary ||
        '',
      ''
    ),
    whatToCheckNext: normalizeText(explanation.whatToCheckNext || '', ''),
    firstAid: normalizeText(
      explanation.firstAid || routePrimaryOutcome?.firstAid || '',
      ''
    ),
    avoid: normalizeText(
      explanation.avoid || routePrimaryOutcome?.avoid || '',
      ''
    ),
    reassurance: normalizeText(
      explanation.reassurance || routePrimaryOutcome?.reassurance || '',
      ''
    )
  }
}

function formatDiagnosisResponse({
  sessionId,
  round = 1,
  stage,
  observedSymptoms = [],
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  diagnosisDirections = [],
  rankings = [],
  followUps = [],
  problems = [],
  explanations = [],
  routeOutcomes = [],
  causality = [],
  plantContext = {},
  plantId,
  followUpRequired = false,
  lowConfidence = { isLowConfidence: false, reasons: [], advice: [] },
  symptomClassRuntime = null,
  highSpecificityFastConvergence = null,
  stopDecision = null,
  preferredRoutePrimaryAction = '',
  routeDecision = null,
  routeOutputEnabled = true,
  actionProfiles = [],
  hideRankings = false
}) {
  const problemMap = new Map((problems || []).map(item => [item.problemKey, item]))
  const explanationMap = new Map((explanations || []).map(item => [item.problemKey, item]))

  const primary = pickPrimaryRanking(rankings, problemMap)
  const primaryProblem = primary ? problemMap.get(primary.problemKey) : null
  const primaryExplanation = primary ? explanationMap.get(primary.problemKey) : null

  const contributingRoles = new Set(rankingConfig.contributingRoles)
  const intermediateRoles = new Set(rankingConfig.intermediateRoles)

  const rawContributingFactors = rankings
    .filter(item => {
      const role = problemMap.get(item.problemKey)?.problemRole || ''
      return contributingRoles.has(role)
    })
    .slice(0, 3)
    .map(item => ({
      factorId: `f_${item.problemKey}`,
      label: problemMap.get(item.problemKey)?.displayNameCn || item.problemCn || item.problemKey
    }))

  const rawIntermediateStates = rankings
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
  const outcomeType = resolveOutcomeType({ followUpRequired, lowConfidence, stopDecision })
  const shouldSuppressProblemLikePresentation = outcomeType === 'uncertain'
  const routePrimaryAction = resolveRoutePrimaryAction({
    followUpRequired,
    outcomeType,
    preferredRoutePrimaryAction
  })
  const stopReason = resolveStopReason({ followUpRequired, stopDecision })
  const legacyExplanationPayload = outcomeType === 'uncertain'
    ? buildUncertainExplanation(lowConfidence, symptomClassRuntime)
    : buildExplanation(primaryProblem, primaryExplanation)
  const routeOutcomePayload = resolveRouteOutcomePayload({
    routeDecision: routeOutputEnabled ? routeDecision : null,
    rankings,
    problems,
    explanations,
    routeOutcomes,
    actionProfiles,
    plantContext,
    observedEvidenceSet,
    outcomeType,
    followUpRequired
  })
  const {
    authoritativeRouteDecision,
    primaryOutcome: routePrimaryOutcome,
    secondaryOutcomes: routeSecondaryOutcomes,
    visibleOutcomes: routeVisibleOutcomes,
    outcomeMode: rawRouteOutcomeMode,
    routeDecisionCause: rawRouteDecisionCause,
    routeSafeSummary,
    careGuidance,
    actionAdvice: rawActionAdvice
  } = routeOutcomePayload
  const primaryOutcome = routeOutputEnabled ? routePrimaryOutcome : null
  const secondaryOutcomes = routeOutputEnabled ? routeSecondaryOutcomes : []
  const visibleOutcomes = routeOutputEnabled ? routeVisibleOutcomes : []
  const outcomeMode = routeOutputEnabled ? rawRouteOutcomeMode : ''
  const routeDecisionCause = routeOutputEnabled ? rawRouteDecisionCause : null
  const actionAdvice = routeOutputEnabled ? rawActionAdvice : null
  const shouldUseRouteExplanation = Boolean(
    authoritativeRouteDecision &&
    primaryOutcome &&
    outcomeType !== 'uncertain'
  )
  const explanationPayload = shouldUseRouteExplanation
    ? buildRouteExplanationPayload({
        routePrimaryOutcome: primaryOutcome,
        routePrimaryProblem: problemMap.get(primaryOutcome.problemKey) || null,
        routePrimaryExplanation: explanationMap.get(primaryOutcome.problemKey) || null,
        routeSafeSummary
      })
    : legacyExplanationPayload
  if (careGuidance.environmentDeviationHints.length) {
    explanationPayload.whatToCheckNext = uniqList([
      explanationPayload.whatToCheckNext,
      careGuidance.environmentDeviationHints[0]
    ]).join(' ')
  }
  const finalResultPayload = outcomeType === 'uncertain'
    ? buildUncertainFinalResult({
        resultId,
        lowConfidence: {
          ...lowConfidence,
          advice: uniqList([
            buildUncertainSummary(lowConfidence, symptomClassRuntime)
          ])
        }
      })
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
  const lowConfidenceAdviceSteps = outcomeType === 'uncertain' && Array.isArray(lowConfidence?.advice)
    ? lowConfidence.advice.map((text, index) => ({
        stepId: `low_conf_${index + 1}`,
        text
      }))
    : []
  const shouldUseRouteActionAdvice = Boolean(
    authoritativeRouteDecision &&
    !followUpRequired &&
    outcomeType !== 'uncertain'
  )
  const routeActionSteps = shouldUseRouteActionAdvice
    ? buildActionAdviceSteps(actionAdvice)
    : []
  const routeAvoidTexts = shouldUseRouteActionAdvice
    ? buildActionAvoidTexts(actionAdvice)
    : []
  const nextSteps = outcomeType === 'uncertain'
    ? [
        ...lowConfidenceAdviceSteps,
        ...careGuidance.nextSteps,
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先保持当前养护稳定，避免在证据不足时做大幅调整。'
        }
      ]
    : routeActionSteps.length
      ? routeActionSteps
    : [
        ...careGuidance.nextSteps,
        {
          stepId: 'step_1',
          text:
            explanationPayload.firstAid ||
            '先处理最明显的问题，再观察 3-7 天变化。'
        }
      ]
  const contributingFactors = shouldSuppressProblemLikePresentation ? [] : rawContributingFactors
  const intermediateStates = shouldSuppressProblemLikePresentation ? [] : rawIntermediateStates
  const topProblemPayload = shouldSuppressProblemLikePresentation || !primary
    ? null
    : {
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

  const routeBackedTopProblemPayload =
    shouldSuppressProblemLikePresentation || !primaryOutcome || outcomeType !== 'problematic'
      ? null
      : {
          problemId: toProblemId(primaryOutcome.problemKey),
          problemKey: primaryOutcome.problemKey,
          displayName: primaryOutcome.displayNameCn,
          summary: primaryOutcome.summary || routeSafeSummary,
          severity: primaryOutcome.severity || mapSeverity(primaryProblem),
          urgency: primaryOutcome.urgency || mapUrgency(primaryProblem)
        }

  const routeBackedFinalResultPayload =
    primaryOutcome &&
    !followUpRequired &&
    !shouldSuppressProblemLikePresentation &&
    outcomeType === 'problematic'
      ? {
          resultId,
          problemId: toProblemId(primaryOutcome.problemKey),
          displayName: primaryOutcome.displayNameCn,
          summary: primaryOutcome.summary || routeSafeSummary,
          severity: primaryOutcome.severity || mapSeverity(primaryProblem),
          urgency: primaryOutcome.urgency || mapUrgency(primaryProblem),
          primaryOutcome,
          secondaryOutcomes,
          visibleOutcomes,
          outcomeMode,
          actionAdvice
        }
      : primaryOutcome &&
        !followUpRequired &&
        outcomeType === 'non_problematic'
        ? {
            resultId,
            problemId: '',
            displayName: primaryOutcome.displayNameCn,
            summary: primaryOutcome.summary || routeSafeSummary,
            severity: 'low',
            urgency: 'low',
            nonProblematicType: primaryOutcome.outcomeKey,
            primaryOutcome,
            secondaryOutcomes,
            visibleOutcomes,
            outcomeMode,
            actionAdvice
          }
      : finalResultPayload

  const response = {
    diagnosisSessionId: sessionId,
    roundId: `round_${round}`,
    stage,
    observedSymptoms,
    rankings: hideRankings
      ? []
      : rankings.map(item => ({
        problemId: toProblemId(item.problemKey),
        problemKey: item.problemKey,
        problemCn: item.problemCn,
        role: problemMap.get(item.problemKey)?.problemRole || '',
        visualEvidence: roundValue(item.visualEvidence),
        questionEvidence: roundValue(item.questionEvidence),
        totalEvidence: roundValue(item.totalEvidence),
        penalty: roundValue(item.penalty),
        hostCompatibility: roundValue(item.hostCompatibility),
        genusCompatibility: roundValue(item.genusCompatibility),
        evidenceCount: Number(item.evidenceCount || 0),
        finalScore: roundValue(item.finalScore),
        baseScore: roundValue(item.baseScore),
        rankNo: item.rankNo
      })),
    topProblem: authoritativeRouteDecision ? routeBackedTopProblemPayload : topProblemPayload,
    finalResult: authoritativeRouteDecision ? routeBackedFinalResultPayload : finalResultPayload,
    followUpRequired: Boolean(followUpRequired && followUps.length),
    followUps: followUps.map(question => {
      const questionRole = normalizeQuestionRole(
        question.questionRole || question.question_role || '',
        inferQuestionRole(question.targetDimension || question.target_dimension || '', question.routingScope || question.routing_scope || '')
      )
      const effectMode = normalizeQuestionEffectMode(
        question.effectMode || question.effect_mode || '',
        inferQuestionEffectMode(questionRole, question.targetDimension || question.target_dimension || '')
      )
      const resolvedQuestionText = String(
        question.questionText ||
          question.text ||
          question.questionTextUserCn ||
          question.questionTextCn ||
          question.title ||
          ''
      ).trim()

      return {
        questionId: toQuestionId(question.questionKey),
        questionKey: question.questionKey,
        targetSymptomKey: question.targetSymptomKey || '',
        questionGroupKey: question.questionGroupKey,
        targetDimension: question.targetDimension || '',
        routingScope: question.routingScope || '',
        questionRole,
        questionCategory: questionRole,
        effectMode,
        type: 'single_choice',
        text: resolvedQuestionText,
        questionText: resolvedQuestionText,
        helpText: question.helpText,
        defaultOptionKey: question.defaultOptionKey || '',
        defaultOptionId: question.defaultOptionKey ? toOptionId(question.defaultOptionKey) : '',
        uiVariant: question.uiVariant || '',
        renderMode: question.renderMode || '',
        options: question.options.map(option => ({
          optionId: toOptionId(option.optionKey),
          optionKey: option.optionKey,
          text: option.text,
          description: option.description || option.desc || '',
          isDefault: Boolean(option.isDefault)
        }))
      }
    }),
    contributingFactors,
    intermediateStates,
    problemCausality: causality,
    resultExplanation: explanationPayload,
    explanation: explanationPayload,
    nextSteps,
    whatToAvoid: uniqList([
      ...(routeAvoidTexts.length ? routeAvoidTexts : []),
      ...(!routeAvoidTexts.length && explanationPayload.avoid ? [explanationPayload.avoid] : []),
      ...(!routeAvoidTexts.length ? (careGuidance.whatToAvoid || []) : [])
    ]),
    confidenceLevel: outcomeType === 'uncertain' ? 'low' : 'normal',
    confidenceReasons: Array.isArray(lowConfidence?.reasons) ? lowConfidence.reasons : [],
    needHumanReview: Boolean(outcomeType === 'uncertain'),
    highSpecificityFastConvergence: highSpecificityFastConvergence?.applied
      ? highSpecificityFastConvergence
      : null,
    actionAdvice,
    primaryOutcome,
    secondaryOutcomes,
    visibleOutcomes,
    outcomeMode,
    routeDecisionCause,
    outcomeType,
    outcomeLocked: normalizeText(stopDecision?.outcomeLocked || '', ''),
    uncertainLegalityReason: normalizeText(
      stopDecision?.uncertainLegalityReason || lowConfidence?.uncertainLegalityReason || '',
      ''
    ),
    decisionCause:
      stopDecision?.decisionCause && typeof stopDecision.decisionCause === 'object'
        ? stopDecision.decisionCause
        : null,
    stopDecision: stopDecision
      ? {
          outcomeLocked: normalizeText(stopDecision.outcomeLocked || '', ''),
          stopReason: normalizeText(stopDecision.stopReason || '', ''),
          stopReasonDetail: normalizeText(stopDecision.stopReasonDetail || '', ''),
          uncertainLegalityReason: normalizeText(
            stopDecision.uncertainLegalityReason || '',
            ''
          ),
          decisionCause:
            stopDecision?.decisionCause && typeof stopDecision.decisionCause === 'object'
              ? stopDecision.decisionCause
              : null
        }
      : null,
    routePrimaryAction,
    stopReason,
    stopReasonDetail: normalizeText(stopDecision?.stopReasonDetail || '', ''),
    sessionStatus: followUpRequired ? 'awaiting_follow_up' : 'completed',
    plantId,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary: careGuidance.careBaselineSummary,
    environmentDeviationHints: careGuidance.environmentDeviationHints,
    resultId,
    timestamp: Date.now()
  }

  return {
    ...response,
    ...buildRuntimeArtifacts(response, {
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections
    })
  }
}

module.exports = {
  formatDiagnosisResponse
}
