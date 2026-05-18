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
const {
  normalizePublicDerivedEvidenceSet
} = require('../utils/derived-evidence')
const {
  normalizePublicDiagnosisDirectionSet
} = require('../utils/diagnosis-directions')
const {
  resolveStoredSymptomCn,
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime
} = require('./session-runtime-normalizers')

function resolvePrivateSymptomClassRuntime(response = {}) {
  return normalizePublicSymptomClassRuntime(
    response?.__symptomClassRuntime ||
      response?.symptomClassRuntime ||
      null
  )
}

function buildSnapshotPayload({
  sessionId,
  plantContext,
  response,
  followUps = [],
  clientContext = null
} = {}) {
  const explanation = response?.explanation || response?.resultExplanation || {}
  const observedSymptoms = (Array.isArray(response?.observedSymptoms) ? response.observedSymptoms : [])
    .map(item => ({
      symptomKey: String(item?.symptomKey || '').trim(),
      symptomCn: resolveStoredSymptomCn(item, String(item?.symptomKey || '').trim()),
      confidence: Number(item?.confidence || 0),
      source: String(item?.source || item?.evidenceSource || '').trim()
    }))
    .filter(item => item.symptomKey)
  const observedEvidenceSet = normalizePublicObservedEvidenceSet(response?.observedEvidenceSet || [])
  const derivedEvidenceSet = normalizePublicDerivedEvidenceSet(response?.derivedEvidenceSet || [])
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(response?.diagnosisDirections || [])
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

  return {
    diagnosisSessionId: sessionId,
    plantContext: {
      userPlantId: plantContext?.userPlantId || null,
      plantId: plantContext?.plantId || null,
      plantIdentityId: plantContext?.plantIdentityId || null,
      genus: plantContext?.genus || '',
      family: plantContext?.family || '',
      category: plantContext?.category || '',
      watering: plantContext?.watering || null,
      fertilization: plantContext?.fertilization || null,
      sunning: plantContext?.sunning || null,
      ventilation: plantContext?.ventilation || null,
      careAuditStatus: plantContext?.careAuditStatus || '',
      varianceLevel: plantContext?.varianceLevel || ''
    },
    clientContext: clientContext && typeof clientContext === 'object'
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
    questionQueue: response?.questionQueue || null,
    stopState: response?.stopState || null,
    outputEligibility: response?.outputEligibility || null,
    diagnosticTrace: Array.isArray(response?.diagnosticTrace) ? response.diagnosticTrace : [],
    observedSymptoms,
    observedEvidenceSet,
    derivedEvidenceSet,
    diagnosisDirections,
    symptomClassRuntime,
    careBaselineSummary: response?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(response?.environmentDeviationHints)
      ? response.environmentDeviationHints
      : [],
    finalResult: response?.finalResult || null,
    contributingFactors: Array.isArray(response?.contributingFactors) ? response.contributingFactors : [],
    intermediateStates: Array.isArray(response?.intermediateStates) ? response.intermediateStates : [],
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
    askedQuestions: (followUps || []).map(item => ({
      questionOrder: Number(item?.questionOrder || 0),
      text: item?.questionText || '',
      answerValue: item?.answerValue || '',
      status: item?.status || 'pending'
    })),
    chosenAnswers: (followUps || [])
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
  if (response?.followUpRequired) {
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
  return response?.followUpRequired ? 'awaiting_follow_up' : 'completed'
}

function buildOutcomePayload(response = {}) {
  const normalizedOutcomeType = normalizeOutcomeType(response?.outcomeType, '')
  if (!normalizedOutcomeType) {return null}

  return JSON.stringify({
    outcomeType: normalizedOutcomeType,
    nonProblematicType: response.nonProblematicType || '',
    nonProblematicLabel: response.nonProblematicLabel || '',
    finalResult: response.finalResult || null,
    topProblem: response.topProblem || null,
    confidenceLevel: response.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(response.confidenceReasons)
      ? response.confidenceReasons
      : [],
    needHumanReview: Boolean(response.needHumanReview)
  })
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
  const diagnosisDirections = normalizePublicDiagnosisDirectionSet(response?.diagnosisDirections || [])
  const symptomClassRuntime = resolvePrivateSymptomClassRuntime(response)
  const runtimeRouteDecision =
    response?.__runtimeRouteDecision && typeof response.__runtimeRouteDecision === 'object'
      ? response.__runtimeRouteDecision
      : null
  const persistedMetrics = response?.metrics && typeof response.metrics === 'object'
    ? {
        ...response.metrics,
        routeDecision: runtimeRouteDecision || response.metrics.routeDecision || null
      }
    : {
        routeDecision: runtimeRouteDecision || null
      }

  return JSON.stringify({
    diagnosisSessionId: sessionId,
    roundId: response?.roundId || `round_${round}`,
    roundIndex: Number(round || 1),
    plantContext: {
      userPlantId: plantContext?.userPlantId || null,
      plantId: plantContext?.plantId || null,
      plantIdentityId: plantContext?.plantIdentityId || null,
      genus: plantContext?.genus || '',
      family: plantContext?.family || '',
      category: plantContext?.category || '',
      watering: plantContext?.watering || null,
      fertilization: plantContext?.fertilization || null,
      sunning: plantContext?.sunning || null,
      ventilation: plantContext?.ventilation || null,
      careAuditStatus: plantContext?.careAuditStatus || '',
      varianceLevel: plantContext?.varianceLevel || ''
    },
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
            invalidatedFromQuestionId: String(response.uiPatch.invalidatedFromQuestionId || '').trim()
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
    derivedEvidenceSet,
    diagnosisDirections,
    symptomClassRuntime,
    followUpCount: Array.isArray(response?.followUps) ? response.followUps.length : 0,
    questionQueue: response?.questionQueue || null,
    stopState: response?.stopState || null,
    outputEligibility: response?.outputEligibility || null,
    diagnosticTrace: Array.isArray(response?.diagnosticTrace) ? response.diagnosticTrace : [],
    careBaselineSummary: response?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(response?.environmentDeviationHints)
      ? response.environmentDeviationHints
      : [],
    confidenceLevel: response?.confidenceLevel || 'normal',
    confidenceReasons: Array.isArray(response?.confidenceReasons)
      ? response.confidenceReasons
      : [],
    routeDecision: runtimeRouteDecision,
    metrics: persistedMetrics
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
  buildRuntimeSnapshotPayload
}
