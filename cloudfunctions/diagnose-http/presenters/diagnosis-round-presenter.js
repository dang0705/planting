'use strict'

const {
  buildPublicVisualAggregateSummary,
  buildPublicCoreProcess,
  normalizePublicDerivedEvidenceSet,
  normalizePublicDiagnosisDirectionSet,
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction,
  diagnosisRoundPresenterHelpers,
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactActionAdvice,
  buildCompactOutcomeEntry,
  buildCompactVisualBatchTrace,
  buildCompactVisualAggregateSummary,
  buildCompactFinalResult,
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic
} = require('./diagnosis-round-presenter-shared')

function buildCompactAnswerRoundResponse(
  roundResult = {},
  helpers = diagnosisRoundPresenterHelpers
) {
  const {
    resolvePublicPlantRefs,
    toPublicObservedSymptoms,
    toPublicQuestions,
    buildSummaryCard,
    resolveQuestionCanUploadMoreImages
  } = helpers

  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isQuestion = Boolean(roundResult?.questionRequired)
  const isPackageQuestion =
    isQuestion &&
    String(
      roundResult?.questionPackage?.answerSubmitMode || roundResult?.uiHints?.answerSubmitMode || ''
    ).trim() === 'package'
  const isActiveIntermediate =
    !['completed', 'closed'].includes(String(roundResult?.sessionStatus || '').trim()) &&
    String(roundResult?.stopReason || '').trim() !== 'ended_retake_timeout' &&
    ['choose_direction', 'request_followup_capture'].includes(
      String(roundResult?.routePrimaryAction || '').trim()
    )
  const plantRefs = resolvePublicPlantRefs(roundResult)
  const observedSymptoms = toPublicObservedSymptoms(roundResult?.observedSymptoms || [])
  const routePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    roundResult?.routePrimaryAction,
    isQuestion ? 'ask_first' : 'standard_flow'
  )
  const stopReason = String(roundResult?.stopReason || '').trim()
  const visualAggregateSource =
    roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
  const compactVisualAggregateSummary = buildCompactVisualAggregateSummary(visualAggregateSource)
  const compactVisualBatchTrace = buildCompactVisualBatchTrace(
    roundResult?.visualBatchTrace || null
  )
  const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
    roundResult?.careBehaviorTimeline ||
      roundResult?.environmentCareContext?.careBehaviorTimeline ||
      null
  )
  const environmentCareContext = compactEnvironmentCareContextForPublic(
    roundResult?.environmentCareContext || null,
    roundResult?.careBehaviorTimeline || null
  )

  const response = {
    diagnosisSessionId,
    roundId,
    userPlantId: plantRefs.userPlantId,
    plantId: plantRefs.plantId,
    plantCatalogId: plantRefs.plantCatalogId,
    plantIdentityId: plantRefs.plantIdentityId,
    latestVisualCallBatchId: plantRefs.latestVisualCallBatchId,
    stage: isQuestion ? 'question' : isActiveIntermediate ? 'intermediate' : 'final',
    status: isQuestion || isActiveIntermediate ? 'active' : 'closed',
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
    visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes)
      ? roundResult.visibleOutcomes
      : []
    )
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    outcomeMode: String(roundResult?.outcomeMode || '').trim(),
    routeDecisionCause: roundResult?.routeDecisionCause || null,
    confidenceLevel: roundResult?.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
      ? roundResult.confidenceReasons
      : [],
    needHumanReview: Boolean(roundResult?.needHumanReview),
    questionRequired: isQuestion,
    ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
    ...(environmentCareContext ? { environmentCareContext } : {})
  }

  if (isQuestion) {
    const allQuestions = toPublicQuestions(roundResult?.questions || [])
    const questions = isPackageQuestion ? allQuestions : allQuestions.slice(0, 1)
    const publicVisualAggregateSummary = buildPublicVisualAggregateSummary(visualAggregateSource)
    const canUploadMoreImages = resolveQuestionCanUploadMoreImages(
      publicVisualAggregateSummary,
      roundResult?.visualBatchTrace || null
    )

    return {
      ...response,
      questions,
      ...(roundResult?.questionPackage && typeof roundResult.questionPackage === 'object'
        ? { questionPackage: roundResult.questionPackage }
        : {}),
      uiHints: {
        canUploadMoreImages,
        maxQuestionsThisRound: isPackageQuestion ? questions.length : questions.length ? 1 : 0,
        questionDisplayMode: isPackageQuestion ? 'package' : 'single',
        answerSubmitMode: isPackageQuestion ? 'package' : 'per_question',
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
    ...(roundResult?.questionPackage && typeof roundResult.questionPackage === 'object'
      ? { questionPackage: roundResult.questionPackage }
      : {}),
    // fix #78: optionalFollowUp 场景下 questions 必须透传到 client，
    // 否则 likely 结论响应中 finalResult 存在但客户端看不到可选确认问题。
    ...(roundResult?.questionPackage?.optionalFollowUp &&
    Array.isArray(roundResult?.questions) &&
    roundResult.questions.length > 0
      ? { questions: roundResult.questions.slice(0, 1) }
      : {}),
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: roundResult?.questionPackage?.questionCount || 0,
      ...(roundResult?.uiHints && typeof roundResult.uiHints === 'object'
        ? roundResult.uiHints
        : {})
    },
    ...(Array.isArray(roundResult?.directionChoices)
      ? { directionChoices: roundResult.directionChoices }
      : {}),
    ...(roundResult?.recommendedDirection
      ? { recommendedDirection: roundResult.recommendedDirection }
      : {}),
    ...(roundResult?.recommendedMode ? { recommendedMode: roundResult.recommendedMode } : {}),
    ...(Array.isArray(roundResult?.directMatches)
      ? { directMatches: roundResult.directMatches }
      : {}),
    ...(Array.isArray(roundResult?.evidenceLedger)
      ? { evidenceLedger: roundResult.evidenceLedger }
      : {}),
    ...(roundResult?.pendingDirectPestSnapshot
      ? { pendingDirectPestSnapshot: roundResult.pendingDirectPestSnapshot }
      : {}),
    ...(roundResult?.retakeRequest ? { retakeRequest: roundResult.retakeRequest } : {}),
    ...(roundResult?.retakeAuthorizationState
      ? { retakeAuthorizationState: roundResult.retakeAuthorizationState }
      : {})
  }
}

function buildPublicRoundResponse(roundResult = {}, helpers = diagnosisRoundPresenterHelpers) {
  const {
    resolvePublicPlantRefs,
    toPublicObservedSymptoms,
    toPublicObservedEvidenceSet,
    toPublicQuestions,
    buildSummaryCard,
    resolveQuestionCanUploadMoreImages
  } = helpers

  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isQuestion = Boolean(roundResult?.questionRequired)
  const isPackageQuestion =
    isQuestion &&
    String(
      roundResult?.questionPackage?.answerSubmitMode || roundResult?.uiHints?.answerSubmitMode || ''
    ).trim() === 'package'
  const plantRefs = resolvePublicPlantRefs(roundResult)
  const observedSymptoms = toPublicObservedSymptoms(roundResult?.observedSymptoms || [])
  const observedEvidenceSet = toPublicObservedEvidenceSet(roundResult?.observedEvidenceSet || [])
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(
    roundResult?.derivedEvidenceSet || []
  )
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(
    roundResult?.diagnosisDirections || []
  )
  const stopState = buildPublicStopState(roundResult?.stopState || null)
  const outputEligibility = buildPublicOutputEligibility(roundResult?.outputEligibility || null)
  const diagnosticTrace = Array.isArray(roundResult?.diagnosticTrace)
    ? roundResult.diagnosticTrace
    : []
  const careBaselineSummary = roundResult?.careBaselineSummary || null
  const environmentDeviationHints = Array.isArray(roundResult?.environmentDeviationHints)
    ? roundResult.environmentDeviationHints
    : []
  const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
    roundResult?.careBehaviorTimeline ||
      roundResult?.environmentCareContext?.careBehaviorTimeline ||
      null
  )
  const environmentCareContext = compactEnvironmentCareContextForPublic(
    roundResult?.environmentCareContext || null,
    roundResult?.careBehaviorTimeline || null
  )

  if (isQuestion) {
    const allQuestions = toPublicQuestions(roundResult?.questions || [])
    const questions = isPackageQuestion ? allQuestions : allQuestions.slice(0, 1)
    const visualAggregateSummary = buildPublicVisualAggregateSummary(
      roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
    )
    const canUploadMoreImages = resolveQuestionCanUploadMoreImages(
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
      stage: 'question',
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
      stopState,
      outputEligibility,
      diagnosticTrace,
      coreProcess,
      summaryCard: buildSummaryCard(roundResult),
      explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
      nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
      whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
      actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
      visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes)
        ? roundResult.visibleOutcomes
        : []
      )
        .map(buildCompactOutcomeEntry)
        .filter(Boolean),
      outcomeMode: String(roundResult?.outcomeMode || '').trim(),
      routeDecisionCause: roundResult?.routeDecisionCause || null,
      confidenceLevel: roundResult?.confidenceLevel || 'normal',
      confidenceReasons: Array.isArray(roundResult?.confidenceReasons)
        ? roundResult.confidenceReasons
        : [],
      needHumanReview: Boolean(roundResult?.needHumanReview),
      questionRequired: true,
      ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
      ...(environmentCareContext ? { environmentCareContext } : {}),
      questions,
      ...(roundResult?.questionPackage && typeof roundResult.questionPackage === 'object'
        ? { questionPackage: roundResult.questionPackage }
        : {}),
      uiHints: {
        canUploadMoreImages,
        maxQuestionsThisRound: isPackageQuestion ? questions.length : questions.length ? 1 : 0,
        questionDisplayMode: isPackageQuestion ? 'package' : 'single',
        answerSubmitMode: isPackageQuestion ? 'package' : 'per_question',
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
  const isActiveIntermediate =
    !['completed', 'closed'].includes(String(roundResult?.sessionStatus || '').trim()) &&
    normalizedStopReason !== 'ended_retake_timeout' &&
    ['choose_direction', 'request_followup_capture'].includes(normalizedRoutePrimaryAction)
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
    stage: isActiveIntermediate ? 'intermediate' : 'final',
    status: isActiveIntermediate ? 'active' : 'closed',
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
    ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
    ...(environmentCareContext ? { environmentCareContext } : {}),
    summaryCard: buildSummaryCard(roundResult),
    explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
    nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
    whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
    actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
    visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes)
      ? roundResult.visibleOutcomes
      : []
    )
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    outcomeMode: String(roundResult?.outcomeMode || '').trim(),
    routeDecisionCause: roundResult?.routeDecisionCause || null,
    questionRequired: false,
    // fix #78: optionalFollowUp 场景下 questionPackage 和 questions 必须透传到 client，
    // 否则 likely 结论响应中 finalResult 存在但客户端看不到可选确认问题。
    ...(roundResult?.questionPackage && typeof roundResult.questionPackage === 'object'
      ? { questionPackage: roundResult.questionPackage }
      : {}),
    ...(roundResult?.questionPackage?.optionalFollowUp &&
    Array.isArray(roundResult?.questions) &&
    roundResult.questions.length > 0
      ? { questions: roundResult.questions.slice(0, 1) }
      : {}),
    uiHints: {
      canUploadMoreImages: false,
      maxQuestionsThisRound: 0,
      ...(roundResult?.uiHints && typeof roundResult.uiHints === 'object'
        ? roundResult.uiHints
        : {})
    },
    ...(Array.isArray(roundResult?.directionChoices)
      ? { directionChoices: roundResult.directionChoices }
      : {}),
    ...(roundResult?.recommendedDirection
      ? { recommendedDirection: roundResult.recommendedDirection }
      : {}),
    ...(roundResult?.recommendedMode ? { recommendedMode: roundResult.recommendedMode } : {}),
    ...(Array.isArray(roundResult?.directMatches)
      ? { directMatches: roundResult.directMatches }
      : {}),
    ...(Array.isArray(roundResult?.evidenceLedger)
      ? { evidenceLedger: roundResult.evidenceLedger }
      : {}),
    ...(roundResult?.pendingDirectPestSnapshot
      ? { pendingDirectPestSnapshot: roundResult.pendingDirectPestSnapshot }
      : {}),
    ...(roundResult?.retakeRequest ? { retakeRequest: roundResult.retakeRequest } : {}),
    ...(roundResult?.retakeAuthorizationState
      ? { retakeAuthorizationState: roundResult.retakeAuthorizationState }
      : {})
  }
}

module.exports = {
  buildPublicStopState,
  buildPublicOutputEligibility,
  buildCompactAnswerRoundResponse,
  buildPublicRoundResponse,
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic
}
