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
const {
  buildPublicQuestionQueue,
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult
} = require('./diagnosis-round-compact-presenter')

function buildCompactAnswerRoundResponse(roundResult = {}, helpers = diagnosisRoundPresenterHelpers) {
  const {
    resolvePublicPlantRefs,
    toPublicObservedSymptoms,
    toPublicQuestions,
    buildSummaryCard,
    resolveFollowUpCanUploadMoreImages
  } = helpers

  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isFollowUp = Boolean(roundResult?.followUpRequired)
  const plantRefs = resolvePublicPlantRefs(roundResult)
  const observedSymptoms = toPublicObservedSymptoms(roundResult?.observedSymptoms || [])
  const routePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    roundResult?.routePrimaryAction,
    isFollowUp ? 'ask_first' : 'standard_flow'
  )
  const stopReason = String(roundResult?.stopReason || '').trim()
  const visualAggregateSource = roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
  const compactVisualAggregateSummary = buildCompactVisualAggregateSummary(visualAggregateSource)
  const compactVisualBatchTrace = buildCompactVisualBatchTrace(roundResult?.visualBatchTrace || null)

  const response = {
    diagnosisSessionId,
    roundId,
    userPlantId: plantRefs.userPlantId,
    plantId: plantRefs.plantId,
    plantCatalogId: plantRefs.plantCatalogId,
    plantIdentityId: plantRefs.plantIdentityId,
    latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
    stage: isFollowUp ? 'followup' : 'final',
    status: isFollowUp ? 'active' : 'closed',
    routePrimaryAction,
    stopReason,
    outcomeType: normalizeOutcomeType(roundResult?.outcomeType, ''),
    observedSymptoms,
    visualBatchTrace: compactVisualBatchTrace,
    visualAggregateSummary: compactVisualAggregateSummary,
    identityResolutionStatus: roundResult?.identityResolutionStatus || '',
    summaryCard: buildSummaryCard(roundResult),
    explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
    nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
    whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
    actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
    primaryOutcome: buildCompactOutcomeEntry(roundResult?.primaryOutcome),
    secondaryOutcomes: (Array.isArray(roundResult?.secondaryOutcomes) ? roundResult.secondaryOutcomes : [])
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes) ? roundResult.visibleOutcomes : [])
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    outcomeMode: String(roundResult?.outcomeMode || '').trim(),
    routeDecisionCause: roundResult?.routeDecisionCause || null,
    confidenceLevel: roundResult?.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
      ? roundResult.confidenceReasons
      : [],
    needHumanReview: Boolean(roundResult?.needHumanReview),
    followUpRequired: isFollowUp
  }

  if (isFollowUp) {
    const questionQueue = buildPublicQuestionQueue(roundResult?.questionQueue || null)
    const questions = toPublicQuestions(
      filterQuestionsByQuestionQueue(roundResult?.followUps || [], questionQueue, {
        requireQueueAnchor: true
      })
    ).slice(0, 1)
    const publicVisualAggregateSummary = buildPublicVisualAggregateSummary(visualAggregateSource)
    const canUploadMoreImages = resolveFollowUpCanUploadMoreImages(
      publicVisualAggregateSummary,
      roundResult?.visualBatchTrace || null
    )

    return {
      ...response,
      questions,
      uiHints: {
        canUploadMoreImages,
        maxQuestionsThisRound: questions.length ? 1 : 0,
        questionDisplayMode: 'single',
        answerSubmitMode: 'per_question',
        optionLayout: 'vertical',
        transition: 'swiper'
      }
    }
  }

  return {
    ...response,
    nonProblematicType: roundResult?.nonProblematicType || '',
    nonProblematicLabel: roundResult?.nonProblematicLabel || '',
    finalResult: buildCompactFinalResult(roundResult),
    contributingFactors: Array.isArray(roundResult?.contributingFactors)
      ? roundResult.contributingFactors
      : [],
    intermediateStates: Array.isArray(roundResult?.intermediateStates)
      ? roundResult.intermediateStates
      : [],
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: 0
    }
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
    ).slice(0, 1)
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
      actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
      primaryOutcome: buildCompactOutcomeEntry(roundResult?.primaryOutcome),
      secondaryOutcomes: (Array.isArray(roundResult?.secondaryOutcomes) ? roundResult.secondaryOutcomes : [])
        .map(buildCompactOutcomeEntry)
        .filter(Boolean),
      visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes) ? roundResult.visibleOutcomes : [])
        .map(buildCompactOutcomeEntry)
        .filter(Boolean),
      outcomeMode: String(roundResult?.outcomeMode || '').trim(),
      routeDecisionCause: roundResult?.routeDecisionCause || null,
      confidenceLevel: roundResult?.confidenceLevel || 'normal',
      confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
        ? roundResult.confidenceReasons
        : [],
      needHumanReview: Boolean(roundResult?.needHumanReview),
      followUpRequired: true,
      questions,
      uiHints: {
        canUploadMoreImages,
        maxQuestionsThisRound: questions.length ? 1 : 0,
        questionDisplayMode: 'single',
        answerSubmitMode: 'per_question',
        optionLayout: 'vertical',
        transition: 'swiper'
      }
    }
  }

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
    finalResult: buildCompactFinalResult(roundResult),
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
    actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
    primaryOutcome: buildCompactOutcomeEntry(roundResult?.primaryOutcome),
    secondaryOutcomes: (Array.isArray(roundResult?.secondaryOutcomes) ? roundResult.secondaryOutcomes : [])
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes) ? roundResult.visibleOutcomes : [])
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    outcomeMode: String(roundResult?.outcomeMode || '').trim(),
    routeDecisionCause: roundResult?.routeDecisionCause || null,
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
  buildCompactAnswerRoundResponse,
  buildPublicRoundResponse
}
