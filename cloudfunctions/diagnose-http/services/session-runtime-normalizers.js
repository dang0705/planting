'use strict'

const classSwitchRules = require('../constants/class-switch-rules')
const {
  normalizeStoredNullableText,
  normalizeStoredStringList
} = require('../utils/stored-value')

function isEnglishLikeSymptomLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {return false}
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

module.exports = {
  resolveStoredSymptomCn,
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime
}
