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

function toCompactString(...values) {
  for (const value of values) {
    const text = String(value || '').trim()
    if (text) {return text}
  }
  return ''
}

function toCompactFlag(value, fallback = null) {
  if (value === null || typeof value === 'undefined') {
    return fallback
  }
  return Number(value) ? 1 : 0
}

function buildCompactVisualBatchTrace(visualBatchTrace = null) {
  if (!visualBatchTrace || typeof visualBatchTrace !== 'object') {
    return null
  }

  return {
    currentVisualCallBatchId: toCompactString(
      visualBatchTrace.currentVisualCallBatchId,
      visualBatchTrace.current_visual_call_batch_id
    ),
    originVisualCallBatchId: toCompactString(
      visualBatchTrace.originVisualCallBatchId,
      visualBatchTrace.origin_visual_call_batch_id
    ),
    supersedeApplied: toCompactFlag(
      visualBatchTrace.supersedeApplied ?? visualBatchTrace.supersede_applied,
      0
    )
  }
}

function buildCompactSuggestedFollowupCapture(suggestedFollowupCapture = null) {
  if (!suggestedFollowupCapture || typeof suggestedFollowupCapture !== 'object') {
    return null
  }

  return {
    needed: toCompactFlag(
      suggestedFollowupCapture.needed ?? suggestedFollowupCapture.isNeeded,
      0
    ),
    reason: toCompactString(suggestedFollowupCapture.reason),
    slotKey: toCompactString(suggestedFollowupCapture.slotKey, suggestedFollowupCapture.slot_key),
    locationKey: toCompactString(
      suggestedFollowupCapture.locationKey,
      suggestedFollowupCapture.location_key
    ),
    title: toCompactString(suggestedFollowupCapture.title, suggestedFollowupCapture.captureTitle),
    instruction: toCompactString(
      suggestedFollowupCapture.instruction,
      suggestedFollowupCapture.captureInstruction
    ),
    helpText: toCompactString(suggestedFollowupCapture.helpText, suggestedFollowupCapture.help_text),
    maxImages: Number(suggestedFollowupCapture.maxImages || suggestedFollowupCapture.max_images || 0)
  }
}

function buildCompactVisualAggregateSummary(visualAggregateSummary = null) {
  if (!visualAggregateSummary || typeof visualAggregateSummary !== 'object') {
    return null
  }

  return {
    visualCallBatchId: toCompactString(
      visualAggregateSummary.visualCallBatchId,
      visualAggregateSummary.visual_call_batch_id,
      visualAggregateSummary.callBatchId,
      visualAggregateSummary.call_batch_id
    ),
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      visualAggregateSummary.routePrimaryAction || visualAggregateSummary.route_primary_action,
      ''
    ),
    admissionReadyFlag: toCompactFlag(
      visualAggregateSummary.admissionReadyFlag ?? visualAggregateSummary.admission_ready_flag,
      null
    ),
    suggestedFollowupCapture: buildCompactSuggestedFollowupCapture(
      visualAggregateSummary.suggestedFollowupCapture ||
        visualAggregateSummary.suggested_followup_capture ||
        null
    )
  }
}

function buildCompactFinalResult(roundResult = {}) {
  const finalResult = roundResult?.finalResult || {}

  return {
    resultId: finalResult.resultId || roundResult?.resultId || '',
    problemId: finalResult.problemId || '',
    displayName: finalResult.displayName || roundResult?.topProblem?.displayName || '',
    summary: finalResult.summary || roundResult?.topProblem?.summary || '',
    severity: finalResult.severity || roundResult?.topProblem?.severity || 'medium',
    urgency: finalResult.urgency || roundResult?.topProblem?.urgency || 'medium'
  }
}

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
  buildCompactAnswerRoundResponse,
  buildPublicRoundResponse
}
