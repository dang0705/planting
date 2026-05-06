'use strict'

const versionMetadata = require('../constants/versions')
const classSwitchRules = require('../constants/class-switch-rules')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  normalizeStoredNullableText,
  normalizeStoredStringList
} = require('../utils/stored-value')
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

function isEnglishLikeSymptomLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  return /[A-Za-z]/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)
}

function resolveStoredSymptomCn(item = {}, fallback = '') {
  const candidate = normalizeStoredNullableText(
    item?.symptomCn ||
      item?.symptom_cn ||
      item?.displayTextCn ||
      item?.display_text_cn ||
      item?.label ||
      item?.evidenceLabel ||
      item?.evidence_label ||
      item?.symptomKey ||
      item?.symptom_key ||
      item?.evidenceKey ||
      item?.evidence_key ||
      fallback,
    fallback
  )

  if (!candidate || isEnglishLikeSymptomLabel(candidate)) {
    return '待确认症状'
  }

  return candidate
}

function normalizePublicObservedEvidenceItem(item = {}) {
  const observedEvidenceSetId = normalizeStoredNullableText(
    item?.observedEvidenceSetId || item?.observed_evidence_set_id || '',
    ''
  )
  const symptomKey = normalizeStoredNullableText(item?.symptomKey || item?.symptom_key || '', '')
  if (!observedEvidenceSetId || !symptomKey) {
    return null
  }

  return {
    observedEvidenceSetId,
    evidenceKey: normalizeStoredNullableText(
      item?.evidenceKey || item?.evidence_key || symptomKey,
      symptomKey
    ),
    evidenceType: normalizeStoredNullableText(item?.evidenceType || item?.evidence_type || 'symptom', 'symptom'),
    symptomKey,
    symptomCn: resolveStoredSymptomCn(item, symptomKey),
    confidence: Number(item?.confidence || 0),
    sourceType: normalizeStoredNullableText(item?.sourceType || item?.source_type || '', ''),
    currentStatus: normalizeStoredNullableText(
      item?.currentStatus || item?.current_status || 'active',
      'active'
    ),
    targetLayer: normalizeStoredNullableText(item?.targetLayer || item?.target_layer || '', ''),
    parentEvidenceKey: normalizeStoredNullableText(
      item?.parentEvidenceKey || item?.parent_evidence_key || '',
      ''
    ),
    sourceRecordId: normalizeStoredNullableText(item?.sourceRecordId || item?.source_record_id || '', ''),
    originVisualCallBatchId:
      normalizeStoredNullableText(
        item?.originVisualCallBatchId || item?.origin_visual_call_batch_id || '',
        null
      ),
    supersededByBatchId:
      normalizeStoredNullableText(
        item?.supersededByBatchId || item?.superseded_by_batch_id || '',
        null
      ),
    independenceGroupIds: normalizeStoredStringList(
      item?.independenceGroupIds ||
        item?.independence_group_ids ||
        item?.independence_group_ids_json ||
        []
    ),
    conflictEvidenceKeys: normalizeStoredStringList(
      item?.conflictEvidenceKeys ||
        item?.conflict_evidence_keys ||
        item?.conflict_evidence_keys_json ||
        []
    ),
    conflictLevel: normalizeStoredNullableText(
      item?.conflictLevel || item?.conflict_level || '',
      ''
    ),
    conflictResolved: Number(item?.conflictResolved ?? item?.conflict_resolved ?? 0) ? 1 : 0,
    firstSeenStage: normalizeStoredNullableText(
      item?.firstSeenStage || item?.first_seen_stage || '',
      ''
    ),
    lastUpdatedAt: normalizeStoredNullableText(
      item?.lastUpdatedAt || item?.last_updated_at || '',
      ''
    ),
    enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
    enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0,
    isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? 0) ? 1 : 0
  }
}

function normalizePublicObservedEvidenceSet(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => normalizePublicObservedEvidenceItem(item))
    .filter(Boolean)
}

function normalizePublicSymptomClassRuntime(runtime = null) {
  if (!runtime || typeof runtime !== 'object') {
    return null
  }

  const primaryClass = runtime?.primaryClass && typeof runtime.primaryClass === 'object'
    ? {
        classKey: normalizeStoredNullableText(runtime.primaryClass.classKey, ''),
        classNameCn: normalizeStoredNullableText(runtime.primaryClass.classNameCn, ''),
        followupModeV1: normalizeStoredNullableText(runtime.primaryClass.followupModeV1, ''),
        runtimeScore: Number(runtime.primaryClass.runtimeScore || 0)
      }
    : null

  const secondaryClasses = (Array.isArray(runtime?.secondaryClasses) ? runtime.secondaryClasses : [])
    .map(item => ({
      classKey: normalizeStoredNullableText(item?.classKey, ''),
      classNameCn: normalizeStoredNullableText(item?.classNameCn, ''),
      followupModeV1: normalizeStoredNullableText(item?.followupModeV1, ''),
      runtimeScore: Number(item?.runtimeScore || 0)
    }))
    .filter(item => item.classKey)

  const classScores = (Array.isArray(runtime?.classScores) ? runtime.classScores : [])
    .map(item => ({
      classKey: normalizeStoredNullableText(item?.classKey, ''),
      classNameCn: normalizeStoredNullableText(item?.classNameCn, ''),
      followupModeV1: normalizeStoredNullableText(item?.followupModeV1, ''),
      runtimeGateRule: normalizeStoredNullableText(item?.runtimeGateRule, ''),
      visualScore: Number(item?.visualScore || 0),
      questionActivationScore: Number(item?.questionActivationScore || 0),
      primaryLockScore: Number(item?.primaryLockScore || 0),
      runtimeScore: Number(item?.runtimeScore || 0),
      matchedSymptomKeys: normalizeStoredStringList(item?.matchedSymptomKeys || [])
    }))
    .filter(item => item.classKey)

  const questionGroupPool = (Array.isArray(runtime?.questionGroupPool) ? runtime.questionGroupPool : [])
    .map(item => ({
      classKey: normalizeStoredNullableText(item?.classKey, ''),
      groupKey: normalizeStoredNullableText(item?.groupKey, ''),
      groupRole: normalizeStoredNullableText(item?.groupRole, ''),
      basePriority: Number(item?.basePriority || 0),
      maxQuestionsPerRound: Number(item?.maxQuestionsPerRound || 0),
      classGateType: normalizeStoredNullableText(item?.classGateType, ''),
      followupModeV1: normalizeStoredNullableText(item?.followupModeV1, ''),
      runtimeBlockReason: normalizeStoredNullableText(item?.runtimeBlockReason, '')
    }))
    .filter(item => item.groupKey)

  const classSwitchHistory = (Array.isArray(runtime?.classSwitchHistory) ? runtime.classSwitchHistory : [])
    .map(item => ({
      fromClassKey: normalizeStoredNullableText(item?.fromClassKey, ''),
      toClassKey: normalizeStoredNullableText(item?.toClassKey, ''),
      roundIndex: Number(item?.roundIndex || 0),
      reason: normalizeStoredNullableText(item?.reason, '')
    }))
    .filter(item => item.fromClassKey || item.toClassKey)
  const classGateDecision = runtime?.classGateDecision && typeof runtime.classGateDecision === 'object'
    ? {
      enabled: Boolean(runtime.classGateDecision.enabled),
      gateMode: normalizeStoredNullableText(
        runtime.classGateDecision.gateMode,
        classSwitchRules.classGateTypes.soft
      ),
      sourceMode: normalizeStoredNullableText(
        runtime.classGateDecision.sourceMode,
        classSwitchRules.classGateTypes.soft
      ),
      primaryClassKey: normalizeStoredNullableText(runtime.classGateDecision.primaryClassKey, ''),
      primaryClassRuntimeScore: Number(runtime.classGateDecision.primaryClassRuntimeScore || 0),
      unknownLockCount: Number(runtime.classGateDecision.unknownLockCount || 0),
      currentClassKey: normalizeStoredNullableText(runtime.classGateDecision.currentClassKey, ''),
      hasEnabledGroups: Boolean(runtime.classGateDecision.hasEnabledGroups),
      isHardBlocked: Boolean(runtime.classGateDecision.isHardBlocked),
      classSwitchBlocked: Boolean(runtime.classGateDecision.classSwitchBlocked),
      blockedReason: normalizeStoredNullableText(runtime.classGateDecision.blockedReason, ''),
      reviewedAtRound: Number(runtime.classGateDecision.reviewedAtRound || 0),
      disabledGroupKeys: normalizeStoredStringList(runtime.classGateDecision.disabledGroupKeys || [])
    }
    : {
      enabled: false,
      gateMode: classSwitchRules.classGateTypes.disabled,
      sourceMode: classSwitchRules.classGateTypes.disabled,
      primaryClassKey: '',
      primaryClassRuntimeScore: 0,
      unknownLockCount: 0,
      currentClassKey: '',
      hasEnabledGroups: false,
      isHardBlocked: false,
      classSwitchBlocked: false,
      blockedReason: '',
      reviewedAtRound: 1,
      disabledGroupKeys: []
    }

  return {
    enabled: Boolean(runtime?.enabled),
    primaryClass,
    secondaryClasses,
    classScores,
    currentClassKey: normalizeStoredNullableText(runtime?.currentClassKey, ''),
    currentGroupKey: normalizeStoredNullableText(runtime?.currentGroupKey, ''),
    unknownCountInGroup: Number(runtime?.unknownCountInGroup || 0),
    classSwitchHistory,
    questionGroupPool,
    classGateDecision
  }
}

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
  if (!normalizedOutcomeType) return null

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
    rankings: Array.isArray(response?.rankings)
      ? response.rankings.map(item => ({
          problemKey: item?.problemKey || '',
          problemCn: item?.problemCn || '',
          baseScore: Number(item?.baseScore || 0),
          finalScore: Number(item?.finalScore || 0),
          visualEvidence: Number(item?.visualEvidence || 0),
          questionEvidence: Number(item?.questionEvidence || 0),
          totalEvidence: Number(item?.totalEvidence || item?.supportScore || 0),
          penalty: Number(item?.penalty || 0),
          evidenceCount: Number(item?.evidenceCount || 0),
          rankNo: Number(item?.rankNo || 0)
        }))
      : [],
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
    metrics: response?.metrics || null
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
