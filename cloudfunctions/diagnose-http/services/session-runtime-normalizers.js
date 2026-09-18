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

function resolveStoredSymptomCn(item = {}, conservative = '') {
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
      conservative,
    conservative
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
        questionModeV1: normalizeStoredNullableText(runtime.primaryClass.questionModeV1, ''),
        runtimeScore: Number(runtime.primaryClass.runtimeScore || 0)
      }
    : null

  const secondaryClasses = (Array.isArray(runtime?.secondaryClasses) ? runtime.secondaryClasses : [])
    .map(item => ({
      classKey: normalizeStoredNullableText(item?.classKey, ''),
      classNameCn: normalizeStoredNullableText(item?.classNameCn, ''),
      questionModeV1: normalizeStoredNullableText(item?.questionModeV1, ''),
      runtimeScore: Number(item?.runtimeScore || 0)
    }))
    .filter(item => item.classKey)

  const classScores = (Array.isArray(runtime?.classScores) ? runtime.classScores : [])
    .map(item => ({
      classKey: normalizeStoredNullableText(item?.classKey, ''),
      classNameCn: normalizeStoredNullableText(item?.classNameCn, ''),
      questionModeV1: normalizeStoredNullableText(item?.questionModeV1, ''),
      runtimeConditionRule: normalizeStoredNullableText(item?.runtimeConditionRule, ''),
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
      classConditionType: normalizeStoredNullableText(item?.classConditionType, ''),
      questionModeV1: normalizeStoredNullableText(item?.questionModeV1, ''),
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
  const classConditionDecision = runtime?.classConditionDecision && typeof runtime.classConditionDecision === 'object'
    ? {
      enabled: Boolean(runtime.classConditionDecision.enabled),
      conditionMode: normalizeStoredNullableText(
        runtime.classConditionDecision.conditionMode,
        classSwitchRules.classConditionTypes.soft
      ),
      sourceMode: normalizeStoredNullableText(
        runtime.classConditionDecision.sourceMode,
        classSwitchRules.classConditionTypes.soft
      ),
      primaryClassKey: normalizeStoredNullableText(runtime.classConditionDecision.primaryClassKey, ''),
      primaryClassRuntimeScore: Number(runtime.classConditionDecision.primaryClassRuntimeScore || 0),
      unknownLockCount: Number(runtime.classConditionDecision.unknownLockCount || 0),
      currentClassKey: normalizeStoredNullableText(runtime.classConditionDecision.currentClassKey, ''),
      hasEnabledGroups: Boolean(runtime.classConditionDecision.hasEnabledGroups),
      isHardBlocked: Boolean(runtime.classConditionDecision.isHardBlocked),
      classSwitchBlocked: Boolean(runtime.classConditionDecision.classSwitchBlocked),
      blockedReason: normalizeStoredNullableText(runtime.classConditionDecision.blockedReason, ''),
      reviewedAtRound: Number(runtime.classConditionDecision.reviewedAtRound || 0),
      disabledGroupKeys: normalizeStoredStringList(runtime.classConditionDecision.disabledGroupKeys || [])
    }
    : {
      enabled: false,
      conditionMode: classSwitchRules.classConditionTypes.disabled,
      sourceMode: classSwitchRules.classConditionTypes.disabled,
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
    classConditionDecision
  }
}

module.exports = {
  resolveStoredSymptomCn,
  normalizePublicObservedEvidenceSet,
  normalizePublicSymptomClassRuntime
}
