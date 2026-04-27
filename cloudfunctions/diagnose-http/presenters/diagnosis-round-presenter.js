'use strict'

const {
  buildPublicVisualAggregateSummary
} = require('../utils/public-runtime-summary')
const {
  buildPublicCoreProcess
} = require('../utils/public-core-process')
const {
  normalizePublicDerivedEvidenceSet
} = require('../utils/derived-evidence')
const {
  normalizePublicDiagnosisDirectionSet
} = require('../utils/diagnosis-directions')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const {
  diagnosisRoundPresenterHelpers
} = require('./diagnosis-round-presenter-helpers')
const {
  filterQuestionsByQuestionQueue
} = require('../utils/follow-up-contract')

function buildPublicQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return null
  }

  return {
    questionQueueId: String(questionQueue?.questionQueueId || '').trim(),
    sessionId: String(questionQueue?.sessionId || '').trim(),
    roundId: String(questionQueue?.roundId || '').trim(),
    roundIndex: Number(questionQueue?.roundIndex || 1),
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(questionQueue?.routePrimaryAction, ''),
    queueStatus: String(questionQueue?.queueStatus || '').trim(),
    queueDecision: questionQueue?.queueDecision && typeof questionQueue.queueDecision === 'object'
      ? {
          hasActionableItems: Number(questionQueue.queueDecision?.hasActionableItems || 0) ? 1 : 0,
          exhaustedReason: String(questionQueue.queueDecision?.exhaustedReason || '').trim(),
          serviceTarget: String(questionQueue.queueDecision?.serviceTarget || '').trim(),
          decisionCauseKey: String(questionQueue.queueDecision?.decisionCauseKey || '').trim(),
          decisionCauseCategory: String(questionQueue.queueDecision?.decisionCauseCategory || '').trim(),
          decisionCauseText: String(questionQueue.queueDecision?.decisionCauseText || '').trim(),
          decisionCauseDetails:
            questionQueue.queueDecision?.decisionCauseDetails &&
            typeof questionQueue.queueDecision.decisionCauseDetails === 'object'
              ? questionQueue.queueDecision.decisionCauseDetails
              : null
        }
      : null,
    questionItems: (Array.isArray(questionQueue?.questionItems) ? questionQueue.questionItems : []).map(item => ({
      questionKey: String(item?.questionKey || '').trim(),
      questionId: String(item?.questionId || '').trim(),
      targetSymptomKey: String(item?.targetSymptomKey || '').trim(),
      questionGroupKey: String(item?.questionGroupKey || '').trim(),
      targetDimension: String(item?.targetDimension || '').trim(),
      routingScope: String(item?.routingScope || '').trim(),
      questionText: String(item?.questionText || '').trim(),
      helpText: String(item?.helpText || '').trim(),
      currentPriority: Number(item?.currentPriority || 0),
      estimatedInformationGain: Number(item?.estimatedInformationGain || 0),
      serviceTarget: String(item?.serviceTarget || '').trim(),
      appliesWhen: item?.appliesWhen || null,
      asked: Number(item?.asked || 0) ? 1 : 0,
      answered: Number(item?.answered || 0) ? 1 : 0,
      invalidated: Number(item?.invalidated || 0) ? 1 : 0,
      invalidReason: String(item?.invalidReason || '').trim(),
      status: String(item?.status || '').trim() || 'pending'
    })),
    activeItemCount: Number(questionQueue?.activeItemCount || 0),
    askedItemCount: Number(questionQueue?.askedItemCount || 0),
    answeredItemCount: Number(questionQueue?.answeredItemCount || 0),
    invalidatedItemCount: Number(questionQueue?.invalidatedItemCount || 0)
  }
}

function buildPublicStopState(stopState = null) {
  if (!stopState || typeof stopState !== 'object') {
    return null
  }

  return {
    stopStateId: String(stopState?.stopStateId || '').trim(),
    sessionId: String(stopState?.sessionId || '').trim(),
    roundId: String(stopState?.roundId || '').trim(),
    roundIndex: Number(stopState?.roundIndex || 1),
    isStopped: Number(stopState?.isStopped || 0) ? 1 : 0,
    stopReasonType: String(stopState?.stopReasonType || '').trim(),
    stopReason: String(stopState?.stopReason || '').trim(),
    stopReasonDetail: String(stopState?.stopReasonDetail || '').trim(),
    stopReasonText: String(stopState?.stopReasonText || '').trim(),
    decisionCauseKey: String(stopState?.decisionCauseKey || '').trim(),
    decisionCauseCategory: String(stopState?.decisionCauseCategory || '').trim(),
    decisionCauseText: String(stopState?.decisionCauseText || '').trim(),
    decisionCauseDetails:
      stopState?.decisionCauseDetails && typeof stopState.decisionCauseDetails === 'object'
        ? stopState.decisionCauseDetails
        : null,
    finalOutputRef: stopState?.finalOutputRef || null,
    allowMoreQuestions: Number(stopState?.allowMoreQuestions || 0) ? 1 : 0
  }
}

function buildPublicOutputEligibility(outputEligibility = null) {
  if (!outputEligibility || typeof outputEligibility !== 'object') {
    return null
  }

  return {
    eligible: Number(outputEligibility?.eligible || 0) ? 1 : 0,
    judgment: String(outputEligibility?.judgment || '').trim(),
    conclusionType: String(outputEligibility?.conclusionType || '').trim(),
    conclusionStatus: String(outputEligibility?.conclusionStatus || '').trim(),
    outputConservatism: String(outputEligibility?.outputConservatism || '').trim(),
    decisionCauseKey: String(outputEligibility?.decisionCauseKey || '').trim(),
    decisionCauseCategory: String(outputEligibility?.decisionCauseCategory || '').trim(),
    keyEvidenceSummary: String(outputEligibility?.keyEvidenceSummary || '').trim(),
    unresolvedRisks: Array.isArray(outputEligibility?.unresolvedRisks) ? outputEligibility.unresolvedRisks : [],
    nextStepHints: Array.isArray(outputEligibility?.nextStepHints) ? outputEligibility.nextStepHints : []
  }
}

function buildPublicRoundResponse(roundResult = {}, helpers = diagnosisRoundPresenterHelpers) {
  const {
    resolvePublicPlantRefs,
    toPublicObservedSymptoms,
    toPublicObservedEvidenceSet,
    toPublicQuestions,
    buildSummaryCard,
    resolveFollowUpCanUploadMoreImages
  } = helpers

  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isFollowUp = Boolean(roundResult?.followUpRequired)
  const plantRefs = resolvePublicPlantRefs(roundResult)
  const observedSymptoms = toPublicObservedSymptoms(roundResult?.observedSymptoms || [])
  const observedEvidenceSet = toPublicObservedEvidenceSet(roundResult?.observedEvidenceSet || [])
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(roundResult?.derivedEvidenceSet || [])
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(roundResult?.diagnosisDirections || [])
  const questionQueue = buildPublicQuestionQueue(roundResult?.questionQueue || null)
  const stopState = buildPublicStopState(roundResult?.stopState || null)
  const outputEligibility = buildPublicOutputEligibility(roundResult?.outputEligibility || null)
  const diagnosticTrace = Array.isArray(roundResult?.diagnosticTrace) ? roundResult.diagnosticTrace : []
  const careBaselineSummary = roundResult?.careBaselineSummary || null
  const environmentDeviationHints = Array.isArray(roundResult?.environmentDeviationHints)
    ? roundResult.environmentDeviationHints
    : []

  if (isFollowUp) {
    const questions = toPublicQuestions(
      filterQuestionsByQuestionQueue(roundResult?.followUps || [], questionQueue, {
        requireQueueAnchor: true
      })
    )
    const visualAggregateSummary = buildPublicVisualAggregateSummary(
      roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
    )
    const canUploadMoreImages = resolveFollowUpCanUploadMoreImages(
      visualAggregateSummary,
      roundResult?.visualBatchTrace || null
    )

    const coreProcess = buildPublicCoreProcess({
      latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
      visualBatchTrace: roundResult?.visualBatchTrace || null,
      visualAggregateSummary,
      shadowCompareSummary: visualAggregateSummary?.shadowCompareSummary || null,
      observedSymptoms,
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary,
      environmentDeviationHints,
      routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
        roundResult?.routePrimaryAction,
        'ask_first'
      ),
      questionQueue,
      stopReason: roundResult?.stopReason || '',
      stopState,
      outputEligibility,
      diagnosticTrace
    })

    return {
      diagnosisSessionId,
      roundId,
      userPlantId: plantRefs.userPlantId,
      plantId: plantRefs.plantId,
      plantCatalogId: plantRefs.plantCatalogId,
      plantIdentityId: plantRefs.plantIdentityId,
      latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
      stage: 'followup',
      status: 'active',
      routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
        roundResult?.routePrimaryAction,
        'ask_first'
      ),
      stopReason: String(roundResult?.stopReason || '').trim(),
      outcomeType: normalizeOutcomeType(roundResult?.outcomeType, ''),
      observedSymptoms,
      observedEvidenceSet,
      derivedEvidenceSet,
      diagnosisDirections,
      careBaselineSummary,
      environmentDeviationHints,
      visualBatchTrace: roundResult?.visualBatchTrace || null,
      visualAggregateSummary,
      shadowCompareSummary: visualAggregateSummary?.shadowCompareSummary || null,
      identityResolutionStatus: roundResult?.identityResolutionStatus || '',
      questionQueue,
      stopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      summaryCard: buildSummaryCard(roundResult),
      explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
      nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
      whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
      confidenceLevel: roundResult?.confidenceLevel || 'normal',
      confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
        ? roundResult.confidenceReasons
        : [],
      needHumanReview: Boolean(roundResult?.needHumanReview),
      followUpRequired: true,
      questions,
      uiHints: {
        canUploadMoreImages,
        maxQuestionsThisRound: questions.length || 3
      }
    }
  }

  const finalResult = roundResult?.finalResult || {}
  const visualAggregateSummary = buildPublicVisualAggregateSummary(
    roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
  )
  const normalizedRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    roundResult?.routePrimaryAction,
    'standard_flow'
  )
  const normalizedStopReason = String(roundResult?.stopReason || '').trim()
  const coreProcess = buildPublicCoreProcess({
    latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
    visualBatchTrace: roundResult?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary: visualAggregateSummary?.shadowCompareSummary || null,
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary,
    environmentDeviationHints,
    routePrimaryAction: normalizedRoutePrimaryAction,
    questionQueue,
    stopReason: normalizedStopReason,
    stopState,
    outputEligibility,
    diagnosticTrace
  })

  return {
    diagnosisSessionId,
    roundId,
    userPlantId: plantRefs.userPlantId,
    plantId: plantRefs.plantId,
    plantCatalogId: plantRefs.plantCatalogId,
    plantIdentityId: plantRefs.plantIdentityId,
    latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
    stage: 'final',
    status: 'closed',
    routePrimaryAction: normalizedRoutePrimaryAction,
    outcomeType: normalizeOutcomeType(roundResult?.outcomeType, ''),
    nonProblematicType: roundResult?.nonProblematicType || '',
    nonProblematicLabel: roundResult?.nonProblematicLabel || '',
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    careBaselineSummary,
    environmentDeviationHints,
    visualBatchTrace: roundResult?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary: visualAggregateSummary?.shadowCompareSummary || null,
    identityResolutionStatus: roundResult?.identityResolutionStatus || '',
    stopReason: normalizedStopReason,
    questionQueue,
    stopState,
    outputEligibility,
    diagnosticTrace,
    coreProcess,
    finalResult: {
      resultId: finalResult.resultId || roundResult?.resultId || '',
      problemId: finalResult.problemId || '',
      displayName: finalResult.displayName || roundResult?.topProblem?.displayName || '',
      summary: finalResult.summary || roundResult?.topProblem?.summary || '',
      severity: finalResult.severity || roundResult?.topProblem?.severity || 'medium',
      urgency: finalResult.urgency || roundResult?.topProblem?.urgency || 'medium'
    },
    contributingFactors: Array.isArray(roundResult?.contributingFactors)
      ? roundResult.contributingFactors
      : [],
    intermediateStates: Array.isArray(roundResult?.intermediateStates)
      ? roundResult.intermediateStates
      : [],
    confidenceLevel: roundResult?.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
      ? roundResult.confidenceReasons
      : [],
    needHumanReview: Boolean(roundResult?.needHumanReview),
    summaryCard: buildSummaryCard(roundResult),
    explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
    nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
    whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
    followUpRequired: false,
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: 0
    }
  }
}

module.exports = {
  buildPublicQuestionQueue,
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildPublicRoundResponse
}
