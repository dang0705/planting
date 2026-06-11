'use strict'

const versionMetadata = require('../constants/versions')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const {
  buildPublicShadowCompareSummary,
  buildPublicVisualAggregateSummary
} = require('../utils/public-runtime-summary')
const { normalizePublicDerivedEvidenceSet } = require('../utils/derived-evidence')
const { normalizePublicDiagnosisDirectionSet } = require('../utils/diagnosis-directions')
const {
  resolveStoredSymptomCn,
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime
} = require('./session-runtime-normalizers')

const SNAPSHOT_CARE_DAILY_RECORD_LIMIT = 25
const SNAPSHOT_HISTORICAL_DAYS_LIMIT = 10
const SNAPSHOT_FORECAST_DAYS_LIMIT = 15

function resolvePrivateSymptomClassRuntime(response = {}) {
  return normalizePublicSymptomClassRuntime(
    response?.__symptomClassRuntime || response?.symptomClassRuntime || null
  )
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function compactCareBehaviorTimelineForSnapshot(value = null) {
  if (!isPlainObject(value)) {
    return null
  }

  const dailyRecords = Array.isArray(value.dailyRecords)
    ? value.dailyRecords.slice(0, SNAPSHOT_CARE_DAILY_RECORD_LIMIT)
    : Array.isArray(value.daily_records)
      ? value.daily_records.slice(0, SNAPSHOT_CARE_DAILY_RECORD_LIMIT)
      : []

  return {
    ...value,
    dailyRecords,
    daily_records: dailyRecords
  }
}

function normalizeSnapshotNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function compactPlantContextForSnapshot(plantContext = null) {
  if (!isPlainObject(plantContext)) {
    return null
  }

  return {
    userPlantId: plantContext?.userPlantId || null,
    plantId: plantContext?.plantId || null,
    plantDisplayName: plantContext?.plantDisplayName || '',
    plantIdentityId: plantContext?.plantIdentityId || null,
    identityResolutionStatus: plantContext?.identityResolutionStatus || '',
    latestVisualCallBatchId: plantContext?.latestVisualCallBatchId || '',
    genus: plantContext?.genus || '',
    family: plantContext?.family || '',
    category: plantContext?.category || '',
    watering: plantContext?.watering || null,
    fertilization: plantContext?.fertilization || null,
    sunning: plantContext?.sunning || null,
    ventilation: plantContext?.ventilation || null,
    temperatureMin: normalizeSnapshotNumber(plantContext?.temperatureMin),
    temperatureMax: normalizeSnapshotNumber(plantContext?.temperatureMax),
    humidityMin: normalizeSnapshotNumber(plantContext?.humidityMin),
    humidityMax: normalizeSnapshotNumber(plantContext?.humidityMax),
    uvIndexMax: normalizeSnapshotNumber(plantContext?.uvIndexMax),
    careAuditStatus: plantContext?.careAuditStatus || '',
    varianceLevel: plantContext?.varianceLevel || ''
  }
}

function compactEnvironmentWeatherWindowForSnapshot(value = null) {
  if (!isPlainObject(value)) {
    return null
  }

  const historicalDays = Array.isArray(value.historicalDays)
    ? value.historicalDays.slice(0, SNAPSHOT_HISTORICAL_DAYS_LIMIT)
    : Array.isArray(value.historical_days)
      ? value.historical_days.slice(0, SNAPSHOT_HISTORICAL_DAYS_LIMIT)
      : []
  const forecastDays = Array.isArray(value.forecastDays)
    ? value.forecastDays.slice(0, SNAPSHOT_FORECAST_DAYS_LIMIT)
    : Array.isArray(value.forecast_days)
      ? value.forecast_days.slice(0, SNAPSHOT_FORECAST_DAYS_LIMIT)
      : []

  return {
    ...value,
    historicalDays,
    historical_days: historicalDays,
    forecastDays,
    forecast_days: forecastDays
  }
}

function compactEnvironmentCareContextForSnapshot(value = null) {
  if (!isPlainObject(value)) {
    return null
  }

  return {
    version: String(value.version || '').trim() || 'v7',
    outputs: isPlainObject(value.outputs) ? value.outputs : null,
    behaviorSummary10d: isPlainObject(value.behaviorSummary10d) ? value.behaviorSummary10d : null,
    historicalSummary10d: isPlainObject(value.historicalSummary10d)
      ? value.historicalSummary10d
      : null,
    forecastSummary15d: isPlainObject(value.forecastSummary15d) ? value.forecastSummary15d : null,
    thresholds: isPlainObject(value.thresholds) ? value.thresholds : null,
    watering: isPlainObject(value.watering) ? value.watering : null,
    fertilizing: isPlainObject(value.fertilizing) ? value.fertilizing : null,
    light: isPlainObject(value.light) ? value.light : null,
    calculationTrace: isPlainObject(value.calculationTrace) ? value.calculationTrace : null,
    environmentWeatherWindow: compactEnvironmentWeatherWindowForSnapshot(
      value.environmentWeatherWindow || value.environment_weather_window || null
    ),
    careBehaviorTimeline: compactCareBehaviorTimelineForSnapshot(
      value.careBehaviorTimeline || value.care_behavior_timeline || null
    )
  }
}

function buildSnapshotPayload({
  sessionId,
  plantContext,
  response,
  questions = [],
  clientContext = null
} = {}) {
  const explanation = response?.explanation || response?.resultExplanation || {}
  const observedSymptoms = (
    Array.isArray(response?.observedSymptoms) ? response.observedSymptoms : []
  )
    .map(item => ({
      symptomKey: String(item?.symptomKey || '').trim(),
      symptomCn: resolveStoredSymptomCn(item, String(item?.symptomKey || '').trim()),
      confidence: Number(item?.confidence || 0),
      source: String(item?.source || item?.evidenceSource || '').trim()
    }))
    .filter(item => item.symptomKey)
  const observedEvidenceSet = normalizePublicObservedEvidenceSet(
    response?.observedEvidenceSet || []
  )
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(response?.derivedEvidenceSet || [])
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(
    response?.diagnosisDirections || []
  )
  const symptomClassRuntime = resolvePrivateSymptomClassRuntime(response)
  const visualAggregateSummary = buildPublicVisualAggregateSummary(
    response?.visualAggregateSummary || response?.visualAggregateResult || null
  )
  const shadowCompareSummary =
    buildPublicShadowCompareSummary(response?.shadowCompareSummary) ||
    visualAggregateSummary?.shadowCompareSummary ||
    null
  const normalizedRoutePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    response?.routePrimaryAction,
    ''
  )
  const normalizedOutcomeType = normalizeOutcomeType(response?.outcomeType, '')
  const careBehaviorTimeline = compactCareBehaviorTimelineForSnapshot(
    response?.careBehaviorTimeline || null
  )
  const environmentCareContext = compactEnvironmentCareContextForSnapshot(
    response?.environmentCareContext || null
  )

  return {
    diagnosisSessionId: sessionId,
    plantContext: compactPlantContextForSnapshot(plantContext),
    clientContext:
      clientContext && typeof clientContext === 'object'
        ? {
            source: String(clientContext?.source || '').trim(),
            platform: String(clientContext?.platform || '').trim(),
            reviewSourceType: String(clientContext?.reviewSourceType || '').trim(),
            visualInputVersion: String(clientContext?.visualInputVersion || '').trim(),
            structuredImageCount: Number(clientContext?.structuredImageCount || 0),
            auditLabel: String(clientContext?.auditLabel || '').trim(),
            auditFileName: String(clientContext?.auditFileName || '').trim(),
            auditCaseKey: String(clientContext?.auditCaseKey || '').trim()
          }
        : null,
    reviewSourceType:
      clientContext && typeof clientContext === 'object'
        ? String(clientContext?.reviewSourceType || '').trim()
        : '',
    routePrimaryAction: normalizedRoutePrimaryAction,
    identityResolutionStatus:
      response?.identityResolutionStatus ||
      (plantContext?.plantIdentityId ? 'matched' : 'unresolved'),
    outcomeType: normalizedOutcomeType,
    nonProblematicType: response?.nonProblematicType || '',
    nonProblematicLabel: response?.nonProblematicLabel || '',
    stopReason: response?.stopReason || '',
    sessionStatus: response?.sessionStatus || '',
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(response, plantContext),
    visualBatchTrace: response?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary,
    stopState: response?.stopState || null,
    outputEligibility: response?.outputEligibility || null,
    diagnosticTrace: Array.isArray(response?.diagnosticTrace) ? response.diagnosticTrace : [],
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    symptomClassRuntime,
    careBaselineSummary: response?.careBaselineSummary || null,
    careBehaviorTimeline,
    environmentCareContext,
    environmentDeviationHints: Array.isArray(response?.environmentDeviationHints)
      ? response.environmentDeviationHints
      : [],
    finalResult: response?.finalResult || null,
    contributingFactors: Array.isArray(response?.contributingFactors)
      ? response.contributingFactors
      : [],
    intermediateStates: Array.isArray(response?.intermediateStates)
      ? response.intermediateStates
      : [],
    explanation: {
      whyItHappens: explanation?.whyItHappens || '',
      whatToCheckNext: explanation?.whatToCheckNext || '',
      firstAid: explanation?.firstAid || '',
      avoid: explanation?.avoid || '',
      reassurance: explanation?.reassurance || ''
    },
    confidenceLevel: response?.confidenceLevel || 'normal',
    needHumanReview: Boolean(response?.needHumanReview),
    nextSteps: Array.isArray(response?.nextSteps) ? response.nextSteps : [],
    whatToAvoid: Array.isArray(response?.whatToAvoid) ? response.whatToAvoid : [],
    askedQuestions: (questions || []).map(item => ({
      questionOrder: Number(item?.questionOrder || 0),
      text: item?.questionText || '',
      answerValue: item?.answerValue || '',
      status: item?.status || 'pending'
    })),
    chosenAnswers: (questions || [])
      .filter(item => String(item?.answerValue || '').trim())
      .map(item => ({
        questionOrder: Number(item?.questionOrder || 0),
        text: item?.questionText || '',
        answerValue: item?.answerValue || '',
        status: item?.status || 'pending'
      })),
    versionMetadata
  }
}

function resolveSessionIdentityStatus({ plantContext, response } = {}) {
  if (response?.identityResolutionStatus) {
    return response.identityResolutionStatus
  }
  return plantContext?.plantIdentityId ? 'matched' : 'unresolved'
}

function resolveSessionRoute(response = {}) {
  if (response?.routePrimaryAction) {
    return normalizeDiagnosisRoutePrimaryAction(response.routePrimaryAction, 'ask_first')
  }
  if (response?.questionRequired) {
    return 'ask_first'
  }
  if (normalizeOutcomeType(response?.outcomeType, '') === 'uncertain') {
    return 'uncertain_prepare'
  }
  return 'standard_flow'
}

function resolveSessionStatus(response = {}) {
  if (response?.sessionStatus) {
    return response.sessionStatus
  }
  return response?.questionRequired ? 'awaiting_follow_up' : 'completed'
}

function buildOutcomePayload(response = {}) {
  const normalizedOutcomeType = normalizeOutcomeType(response?.outcomeType, '')
  if (!normalizedOutcomeType) {
    return null
  }

  return JSON.stringify({
    outcomeType: normalizedOutcomeType,
    nonProblematicType: response.nonProblematicType || '',
    nonProblematicLabel: response.nonProblematicLabel || '',
    finalResult: response.finalResult || null,
    topProblem: response.topProblem || null,
    confidenceLevel: response.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(response.confidenceReasons) ? response.confidenceReasons : [],
    needHumanReview: Boolean(response.needHumanReview)
  })
}

function normalizeRuntimeStringList(items = []) {
  return (Array.isArray(items) ? items : []).map(item => String(item || '').trim()).filter(Boolean)
}

function buildCompactRouteDecision(routeDecision = null) {
  if (!routeDecision || typeof routeDecision !== 'object') {
    return null
  }
  const decisionCause =
    routeDecision.decisionCause && typeof routeDecision.decisionCause === 'object'
      ? {
          decisionCauseKey: String(routeDecision.decisionCause.decisionCauseKey || '').trim(),
          decisionCauseText: String(routeDecision.decisionCause.decisionCauseText || '').trim(),
          decisionCauseCategory: String(
            routeDecision.decisionCause.decisionCauseCategory || ''
          ).trim()
        }
      : null
  return {
    stopReason: String(routeDecision.stopReason || '').trim(),
    activeRouteGroupKeys: normalizeRuntimeStringList(routeDecision.activeRouteGroupKeys),
    visibleOutcomeKeys: normalizeRuntimeStringList(routeDecision.visibleOutcomeKeys),
    nextQuestionKeys: normalizeRuntimeStringList(routeDecision.nextQuestionKeys),
    visibleActionConflictGroups: normalizeRuntimeStringList(
      routeDecision.visibleActionConflictGroups
    ),
    visibleActionProfileKeys: normalizeRuntimeStringList(routeDecision.visibleActionProfileKeys),
    requiresQuestion: Boolean(routeDecision.requiresQuestion),
    ...(decisionCause ? { decisionCause } : {}),
    candidateOutcomeStates: (Array.isArray(routeDecision.candidateOutcomeStates)
      ? routeDecision.candidateOutcomeStates
      : []
    )
      .map(state => ({
        outcomeKey: String(state?.outcomeKey || '').trim(),
        state: String(state?.state || '').trim(),
        routeKeys: normalizeRuntimeStringList(state?.routeKeys),
        missingConditionKeys: normalizeRuntimeStringList(state?.missingConditionKeys),
        nextQuestionKeys: normalizeRuntimeStringList(state?.nextQuestionKeys)
      }))
      .filter(state => state.outcomeKey || state.state)
  }
}

function buildRuntimeSnapshotPayload({
  sessionId,
  plantContext,
  response,
  round = 1,
  clientContext = null
} = {}) {
  const observedEvidenceSet = Array.isArray(response?.observedEvidenceSet)
    ? response.observedEvidenceSet
    : []
  const visualAggregateSummary = buildPublicVisualAggregateSummary(
    response?.visualAggregateSummary || response?.visualAggregateResult || null
  )
  const shadowCompareSummary =
    buildPublicShadowCompareSummary(response?.shadowCompareSummary) ||
    visualAggregateSummary?.shadowCompareSummary ||
    null
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(response?.derivedEvidenceSet || [])
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(
    response?.diagnosisDirections || []
  )
  const symptomClassRuntime = resolvePrivateSymptomClassRuntime(response)
  const runtimeRouteDecision =
    response?.__runtimeRouteDecision && typeof response.__runtimeRouteDecision === 'object'
      ? response.__runtimeRouteDecision
      : null
  const compactRouteDecision = buildCompactRouteDecision(
    runtimeRouteDecision ||
      (response?.metrics && typeof response.metrics === 'object'
        ? response.metrics.routeDecision
        : null)
  )
  const isQuestionPackageSnapshot = Boolean(response?.questionPackageSnapshot)
  const isQuestionRuntimeSnapshot =
    Boolean(response?.questionRequired) && !isQuestionPackageSnapshot
  const careBehaviorTimeline = compactCareBehaviorTimelineForSnapshot(
    response?.careBehaviorTimeline || null
  )
  const environmentCareContext = compactEnvironmentCareContextForSnapshot(
    response?.environmentCareContext || null
  )

  return JSON.stringify({
    diagnosisSessionId: sessionId,
    roundId: response?.roundId || `round_${round}`,
    roundIndex: Number(round || 1),
    plantContext: compactPlantContextForSnapshot(plantContext),
    clientContext:
      clientContext && typeof clientContext === 'object'
        ? {
            source: String(clientContext?.source || '').trim(),
            platform: String(clientContext?.platform || '').trim(),
            reviewSourceType: String(clientContext?.reviewSourceType || '').trim(),
            visualInputVersion: String(clientContext?.visualInputVersion || '').trim(),
            structuredImageCount: Number(clientContext?.structuredImageCount || 0),
            auditLabel: String(clientContext?.auditLabel || '').trim(),
            auditFileName: String(clientContext?.auditFileName || '').trim(),
            auditCaseKey: String(clientContext?.auditCaseKey || '').trim()
          }
        : null,
    reviewSourceType:
      clientContext && typeof clientContext === 'object'
        ? String(clientContext?.reviewSourceType || '').trim()
        : '',
    routePrimaryAction: resolveSessionRoute(response),
    answerRevision: Number(response?.answerRevision || 0),
    uiPatch:
      response?.uiPatch && typeof response.uiPatch === 'object'
        ? {
            keepUntilQuestionId: String(response.uiPatch.keepUntilQuestionId || '').trim(),
            invalidatedFromQuestionId: String(
              response.uiPatch.invalidatedFromQuestionId || ''
            ).trim()
          }
        : null,
    identityResolutionStatus: resolveSessionIdentityStatus({ plantContext, response }),
    outcomeType: normalizeOutcomeType(response?.outcomeType, ''),
    nonProblematicType: response?.nonProblematicType || '',
    stopReason: response?.stopReason || '',
    sessionStatus: resolveSessionStatus(response),
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(response, plantContext),
    visualBatchTrace: response?.visualBatchTrace || null,
    visualAggregateSummary,
    shadowCompareSummary,
    observedSymptomsCount: Array.isArray(response?.observedSymptoms)
      ? response.observedSymptoms.length
      : 0,
    observedEvidenceSet,
    observedEvidenceSetCount: observedEvidenceSet.length,
    derivedEvidenceSet: isQuestionRuntimeSnapshot ? [] : derivedEvidenceSet,
    diagnosisDirections: isQuestionRuntimeSnapshot ? [] : diagnosisDirections,
    symptomClassRuntime,
    ...(isQuestionPackageSnapshot
      ? {
          packageQuestionCount: Array.isArray(response?.questionPackageSnapshot?.packageQuestions)
            ? response.questionPackageSnapshot.packageQuestions.length
            : 0
        }
      : {
          questionCount: Array.isArray(response?.questions) ? response.questions.length : 0
        }),
    questionPackageSnapshot: response?.questionPackageSnapshot || null,
    stopState: response?.stopState || null,
    outputEligibility: response?.outputEligibility || null,
    diagnosticTrace: isQuestionRuntimeSnapshot
      ? []
      : Array.isArray(response?.diagnosticTrace)
        ? response.diagnosticTrace
        : [],
    careBaselineSummary: isQuestionRuntimeSnapshot ? null : response?.careBaselineSummary || null,
    careBehaviorTimeline,
    environmentCareContext,
    environmentDeviationHints: Array.isArray(response?.environmentDeviationHints)
      ? response.environmentDeviationHints
      : [],
    confidenceLevel: response?.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(response?.confidenceReasons) ? response.confidenceReasons : [],
    routeDecision: compactRouteDecision,
    metrics: null
  })
}

module.exports = {
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime,
  buildPublicShadowCompareSummary,
  buildPublicVisualAggregateSummary,
  buildSnapshotPayload,
  resolveSessionIdentityStatus,
  resolveSessionRoute,
  resolveSessionStatus,
  buildOutcomePayload,
  buildCompactRouteDecision,
  compactPlantContextForSnapshot,
  compactEnvironmentWeatherWindowForSnapshot,
  buildRuntimeSnapshotPayload
}
