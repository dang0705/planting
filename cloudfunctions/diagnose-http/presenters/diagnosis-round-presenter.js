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
} = require('../utils/question-contract')
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compactCareBehaviorEvent(event = {}, eventType = '') {
  if (!isPlainObject(event)) {return null}
  const date = String(event.date || '').trim()
  if (!date) {return null}

  if (eventType === 'watering') {
    return {
      date,
      watered: Boolean(event.watered !== false),
      amount: String(event.amount || '').trim()
    }
  }

  if (eventType === 'fertilizing') {
    return {
      date,
      fertilized: Boolean(event.fertilized !== false),
      strength: String(event.strength || '').trim()
    }
  }

  return {
    date,
    event: String(event.event || '').trim()
  }
}

function compactCareBehaviorEventList(events = [], eventType = '') {
  return (Array.isArray(events) ? events : [])
    .slice(0, 10)
    .map(event => compactCareBehaviorEvent(event, eventType))
    .filter(Boolean)
}

function compactCareBehaviorSummary(summary = null) {
  if (!isPlainObject(summary)) {return null}

  return {
    wateringCount10d: Number(summary.wateringCount10d || 0),
    fertilizingCount10d: Number(summary.fertilizingCount10d || 0),
    lastWateredDaysAgo:
      summary.lastWateredDaysAgo === null || summary.lastWateredDaysAgo === undefined
        ? null
        : Number(summary.lastWateredDaysAgo),
    lastFertilizedBucket: String(summary.lastFertilizedBucket || '').trim(),
    movedToStrongerLightWithin10d: Boolean(summary.movedToStrongerLightWithin10d),
    userHasDirectSunExposure: Boolean(summary.userHasDirectSunExposure)
  }
}

function compactEnvironmentSummary(summary = null) {
  if (!isPlainObject(summary)) {return null}

  return {
    windowDays: summary.windowDays === null || summary.windowDays === undefined ? null : Number(summary.windowDays),
    recordCount: summary.recordCount === null || summary.recordCount === undefined ? null : Number(summary.recordCount),
    highHumidityDays: Number(summary.highHumidityDays || 0),
    lowHumidityDays: Number(summary.lowHumidityDays || 0),
    coldHumidDays: Number(summary.coldHumidDays || 0),
    hotDryDays: Number(summary.hotDryDays || 0),
    hotHumidDays: Number(summary.hotHumidDays || 0),
    rainyDays: Number(summary.rainyDays || 0),
    maxConsecutiveHighHumidityDays: Number(summary.maxConsecutiveHighHumidityDays || 0),
    maxConsecutiveLowHumidityDays: Number(summary.maxConsecutiveLowHumidityDays || 0),
    maxConsecutiveColdHumidDays: Number(summary.maxConsecutiveColdHumidDays || 0),
    maxConsecutiveHotDryDays: Number(summary.maxConsecutiveHotDryDays || 0),
    maxConsecutiveRainyDays: Number(summary.maxConsecutiveRainyDays || 0),
    thresholds: isPlainObject(summary.thresholds) ? summary.thresholds : null,
    ...(summary.maxUvIndex === null || summary.maxUvIndex === undefined
      ? {}
      : { maxUvIndex: Number(summary.maxUvIndex) }),
    ...(summary.aboveGenusUvMaxDays === null || summary.aboveGenusUvMaxDays === undefined
      ? {}
      : { aboveGenusUvMaxDays: Number(summary.aboveGenusUvMaxDays) })
  }
}

function compactWateringPlanner(value = null) {
  if (!isPlainObject(value)) {return null}
  return {
    baseline: isPlainObject(value.baseline) ? value.baseline : null,
    wateringContext: String(value.wateringContext || '').trim(),
    action: String(value.action || '').trim(),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    calculation: isPlainObject(value.calculation) ? value.calculation : null,
    summary: compactCareBehaviorSummary(value.summary)
  }
}

function compactFertilizingPlanner(value = null) {
  if (!isPlainObject(value)) {return null}
  return {
    baseline: isPlainObject(value.baseline) ? value.baseline : null,
    action: String(value.action || '').trim(),
    lastFertilizedBucket: String(value.lastFertilizedBucket || '').trim(),
    reasons: Array.isArray(value.reasons)
      ? value.reasons.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    calculation: isPlainObject(value.calculation) ? value.calculation : null
  }
}

function compactLightPlanner(value = null) {
  if (!isPlainObject(value)) {return null}
  return {
    lightContext: Array.isArray(value.lightContext)
      ? value.lightContext.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    realExposureScene: Boolean(value.realExposureScene)
  }
}

function compactCareBehaviorTimelineForPublic(value = null) {
  if (!isPlainObject(value)) {return null}

  const referenceDate = String(value.referenceDate || value.reference_date || '').trim()
  const dailyRecords = Array.isArray(value.dailyRecords)
    ? value.dailyRecords.slice(0, 10)
    : Array.isArray(value.daily_records)
      ? value.daily_records.slice(0, 10)
      : []
  const wateringEvents10d = compactCareBehaviorEventList(
    value.wateringEvents10d || value.watering_events_10d || [],
    'watering'
  )
  const fertilizingEvents10d = compactCareBehaviorEventList(
    value.fertilizingEvents10d || value.fertilizing_events_10d || [],
    'fertilizing'
  )
  const lightChangeEvents10d = compactCareBehaviorEventList(
    value.lightChangeEvents10d || value.light_change_events_10d || [],
    'light_change'
  )

  return {
    ...(referenceDate ? { referenceDate, reference_date: referenceDate } : {}),
    dailyRecords,
    daily_records: dailyRecords,
    wateringEvents10d,
    watering_events_10d: wateringEvents10d,
    fertilizingEvents10d,
    fertilizing_events_10d: fertilizingEvents10d,
    lightChangeEvents10d,
    light_change_events_10d: lightChangeEvents10d,
    lastFertilizedBucket: String(value.lastFertilizedBucket || value.last_fertilized_bucket || '').trim(),
    last_fertilized_bucket: String(value.lastFertilizedBucket || value.last_fertilized_bucket || '').trim(),
    summary: compactCareBehaviorSummary(value.summary)
  }
}

function compactEnvironmentCareContextForPublic(value = null, careBehaviorTimeline = null) {
  if (!isPlainObject(value)) {return null}

  const outputs = isPlainObject(value.outputs)
    ? {
        wateringContext: String(value.outputs.wateringContext || '').trim(),
        wateringAction: String(value.outputs.wateringAction || '').trim(),
        fertilizingAction: String(value.outputs.fertilizingAction || '').trim(),
        lightContext: Array.isArray(value.outputs.lightContext)
          ? value.outputs.lightContext.map(item => String(item || '').trim()).filter(Boolean)
          : []
      }
    : null
  const compactTimeline = compactCareBehaviorTimelineForPublic(
    careBehaviorTimeline || value.careBehaviorTimeline || value.care_behavior_timeline || null
  )

  return {
    version: String(value.version || '').trim() || 'v7',
    outputs,
    behaviorSummary10d: compactCareBehaviorSummary(value.behaviorSummary10d),
    historicalSummary10d: compactEnvironmentSummary(value.historicalSummary10d),
    forecastSummary15d: compactEnvironmentSummary(value.forecastSummary15d),
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    watering: compactWateringPlanner(value.watering),
    fertilizing: compactFertilizingPlanner(value.fertilizing),
    light: compactLightPlanner(value.light),
    calculationTrace: isPlainObject(value.calculationTrace) ? value.calculationTrace : null,
    ...(compactTimeline ? { careBehaviorTimeline: compactTimeline } : {})
  }
}

function buildCompactAnswerRoundResponse(roundResult = {}, helpers = diagnosisRoundPresenterHelpers) {
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
  const plantRefs = resolvePublicPlantRefs(roundResult)
  const observedSymptoms = toPublicObservedSymptoms(roundResult?.observedSymptoms || [])
  const routePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    roundResult?.routePrimaryAction,
    isQuestion ? 'ask_first' : 'standard_flow'
  )
  const stopReason = String(roundResult?.stopReason || '').trim()
  const visualAggregateSource = roundResult?.visualAggregateSummary || roundResult?.visualAggregateResult || null
  const compactVisualAggregateSummary = buildCompactVisualAggregateSummary(visualAggregateSource)
  const compactVisualBatchTrace = buildCompactVisualBatchTrace(roundResult?.visualBatchTrace || null)
  const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
    roundResult?.careBehaviorTimeline || roundResult?.environmentCareContext?.careBehaviorTimeline || null
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
    stage: isQuestion ? 'question' : 'final',
    status: isQuestion ? 'active' : 'closed',
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
    questionRequired: isQuestion,
    ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
    ...(environmentCareContext ? { environmentCareContext } : {})
  }

  if (isQuestion) {
    const questionQueue = buildPublicQuestionQueue(roundResult?.questionQueue || null)
    const questions = toPublicQuestions(
      filterQuestionsByQuestionQueue(roundResult?.questions || [], questionQueue, {
        requireQueueAnchor: true
      })
    ).slice(0, 1)
    const publicVisualAggregateSummary = buildPublicVisualAggregateSummary(visualAggregateSource)
    const canUploadMoreImages = resolveQuestionCanUploadMoreImages(
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
    resolveQuestionCanUploadMoreImages
  } = helpers

  const diagnosisSessionId = roundResult?.diagnosisSessionId || ''
  const roundId = roundResult?.roundId || 'round_1'
  const isQuestion = Boolean(roundResult?.questionRequired)
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
  const careBehaviorTimeline = compactCareBehaviorTimelineForPublic(
    roundResult?.careBehaviorTimeline || roundResult?.environmentCareContext?.careBehaviorTimeline || null
  )
  const environmentCareContext = compactEnvironmentCareContextForPublic(
    roundResult?.environmentCareContext || null,
    roundResult?.careBehaviorTimeline || null
  )

  if (isQuestion) {
    const questions = toPublicQuestions(
      filterQuestionsByQuestionQueue(roundResult?.questions || [], questionQueue, {
        requireQueueAnchor: true
      })
    ).slice(0, 1)
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
      questionRequired: true,
      ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
      ...(environmentCareContext ? { environmentCareContext } : {}),
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
    ...(careBehaviorTimeline ? { careBehaviorTimeline } : {}),
    ...(environmentCareContext ? { environmentCareContext } : {}),
    summaryCard: buildSummaryCard(roundResult),
    explanation: roundResult?.explanation || roundResult?.resultExplanation || {},
    nextSteps: Array.isArray(roundResult?.nextSteps) ? roundResult.nextSteps : [],
    whatToAvoid: Array.isArray(roundResult?.whatToAvoid) ? roundResult.whatToAvoid : [],
    actionAdvice: buildCompactActionAdvice(roundResult?.actionAdvice),
    visibleOutcomes: (Array.isArray(roundResult?.visibleOutcomes) ? roundResult.visibleOutcomes : [])
      .map(buildCompactOutcomeEntry)
      .filter(Boolean),
    outcomeMode: String(roundResult?.outcomeMode || '').trim(),
    routeDecisionCause: roundResult?.routeDecisionCause || null,
    questionRequired: false,
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
  buildPublicRoundResponse,
  compactCareBehaviorTimelineForPublic,
  compactEnvironmentCareContextForPublic
}
