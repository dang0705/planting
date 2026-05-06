'use strict'

const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')

function normalizeEvidenceSourceType(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isEnglishLikeSymptomLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  return /[A-Za-z]/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)
}

function resolvePublicSymptomCn(item = {}, fallback = '') {
  const candidate = String(
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
      fallback ||
      ''
  ).trim()

  if (!candidate || isEnglishLikeSymptomLabel(candidate)) {
    return '待确认症状'
  }

  return candidate
}

function isVisualEvidenceItem(item = {}) {
  const sourceType = normalizeEvidenceSourceType(item?.sourceType || item?.source_type || '')
  if (!sourceType) return false
  if (sourceType === 'legacy_observed_symptom') return true
  return sourceType.includes('visual')
}

function hasConsumedFollowUpRetakeQuota(visualBatchTrace = null) {
  if (!visualBatchTrace || typeof visualBatchTrace !== 'object') {
    return false
  }

  const currentBatchId = String(
    visualBatchTrace?.currentVisualCallBatchId ||
    visualBatchTrace?.current_visual_call_batch_id ||
    ''
  ).trim()
  const originBatchId = String(
    visualBatchTrace?.originVisualCallBatchId ||
    visualBatchTrace?.origin_visual_call_batch_id ||
    ''
  ).trim()
  const supersedeApplied = Number(
    visualBatchTrace?.supersedeApplied ?? visualBatchTrace?.supersede_applied ?? 0
  ) === 1

  if (supersedeApplied) {
    return true
  }

  return Boolean(currentBatchId && originBatchId && currentBatchId !== originBatchId)
}

function resolveFollowUpCanUploadMoreImages(visualAggregateSummary = null, visualBatchTrace = null) {
  if (hasConsumedFollowUpRetakeQuota(visualBatchTrace)) {
    return false
  }

  if (!visualAggregateSummary || typeof visualAggregateSummary !== 'object') {
    return false
  }

  if (String(visualAggregateSummary?.routePrimaryAction || '').trim() === 'retake_first') {
    return true
  }

  return Array.isArray(visualAggregateSummary?.suggestedFollowupCapture) &&
    visualAggregateSummary.suggestedFollowupCapture.length > 0
}

function resolvePublicPlantRefs(source = {}, fallbackPlantId = '') {
  const plantContext = source?.plantContext || {}
  const userPlantId = plantContext?.userPlantId || null
  const plantCatalogId = plantContext?.plantId || null
  const plantIdentityId = plantContext?.plantIdentityId || ''
  const latestVisualCallBatchId = resolveLatestVisualCallBatchId(source, plantContext)

  return {
    userPlantId,
    plantCatalogId,
    plantIdentityId,
    latestVisualCallBatchId,
    plantId: userPlantId || plantCatalogId || fallbackPlantId || ''
  }
}

function buildSummaryCard(roundResult = {}) {
  if (String(roundResult?.outcomeType || '').trim() === 'uncertain') {
    return {
      resultId: roundResult?.resultId || roundResult?.finalResult?.resultId || '',
      title: '暂不能稳定判断',
      subtitle: '当前证据不足以安全落到具体问题，建议补充更明确的观察或图片。',
      severity: 'low'
    }
  }

  const topProblem = roundResult?.topProblem || roundResult?.finalResult || null
  const followUpCount = Array.isArray(roundResult?.followUps) ? roundResult.followUps.length : 0

  return {
    resultId: roundResult?.resultId || roundResult?.finalResult?.resultId || '',
    title: topProblem?.displayName ? `更像是${topProblem.displayName}` : '正在进一步确认诊断方向',
    subtitle:
      followUpCount > 0
        ? `还需要再确认 ${followUpCount} 个关键信息`
        : '当前证据已基本收敛',
    severity: topProblem?.severity || 'medium'
  }
}

function toPublicQuestions(followUps = []) {
  return (Array.isArray(followUps) ? followUps : []).map(item => ({
    questionId: item.questionId,
    questionKey: item.questionKey || '',
    selectionSource: item.selectionSource || '',
    targetSymptomKey: item.targetSymptomKey || '',
    questionGroupKey: item.questionGroupKey || '',
    targetDimension: item.targetDimension || '',
    routingScope: item.routingScope || '',
    questionRole: item.questionRole || item.questionCategory || '',
    questionCategory: item.questionCategory || item.questionRole || '',
    effectMode: item.effectMode || '',
    defaultOptionKey: item.defaultOptionKey || '',
    defaultOptionId: item.defaultOptionId || '',
    uiVariant: item.uiVariant || '',
    renderMode: item.renderMode || '',
    type: item.type || 'single_choice',
    text: item.text || '',
    helpText: item.helpText || '',
    options: (Array.isArray(item.options) ? item.options : []).map(option => ({
      optionId: option.optionId,
      optionKey: option.optionKey || '',
      text: option.text || '',
      description: option.description || option.desc || '',
      isDefault: Boolean(option.isDefault)
    }))
  }))
}

function toPublicObservedSymptoms(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : []).map(item => ({
    symptomKey: String(item?.symptomKey || '').trim(),
    symptomCn: resolvePublicSymptomCn(item),
    confidence: Number(item?.confidence || 0),
    source: String(item?.source || item?.evidenceSource || '').trim()
  })).filter(item => item.symptomKey)
}

function toPublicObservedEvidenceSet(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : []).map(item => {
    const observedEvidenceSetId = String(
      item?.observedEvidenceSetId || item?.observed_evidence_set_id || ''
    ).trim()
    const evidenceKey = String(item?.evidenceKey || item?.evidence_key || item?.symptomKey || '').trim()
    const symptomKey = String(item?.symptomKey || item?.symptom_key || '').trim()

    if (!observedEvidenceSetId || (!evidenceKey && !symptomKey)) {
      return null
    }

    return {
      observedEvidenceSetId,
      evidenceKey: evidenceKey || symptomKey,
      evidenceType: String(item?.evidenceType || item?.evidence_type || 'symptom').trim() || 'symptom',
      symptomKey,
      symptomCn: resolvePublicSymptomCn(item, symptomKey || evidenceKey),
      confidence: Number(item?.confidence || 0),
      sourceType: String(item?.sourceType || item?.source_type || '').trim(),
      currentStatus: String(item?.currentStatus || item?.current_status || '').trim() || 'active',
      targetLayer: String(item?.targetLayer || item?.target_layer || '').trim(),
      parentEvidenceKey: String(item?.parentEvidenceKey || item?.parent_evidence_key || '').trim(),
      sourceRecordId: String(item?.sourceRecordId || item?.source_record_id || '').trim(),
      originVisualCallBatchId:
        item?.originVisualCallBatchId || item?.origin_visual_call_batch_id || null,
      supersededByBatchId:
        item?.supersededByBatchId || item?.superseded_by_batch_id || null,
      independenceGroupIds: (Array.isArray(item?.independenceGroupIds)
        ? item.independenceGroupIds
        : Array.isArray(item?.independence_group_ids)
          ? item.independence_group_ids
          : []
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
      conflictEvidenceKeys: (Array.isArray(item?.conflictEvidenceKeys)
        ? item.conflictEvidenceKeys
        : Array.isArray(item?.conflict_evidence_keys)
          ? item.conflict_evidence_keys
          : []
      )
        .map(value => String(value || '').trim())
        .filter(Boolean),
      conflictLevel: String(item?.conflictLevel || item?.conflict_level || '').trim(),
      conflictResolved: Number(item?.conflictResolved ?? item?.conflict_resolved ?? 0) ? 1 : 0,
      firstSeenStage: String(item?.firstSeenStage || item?.first_seen_stage || '').trim(),
      lastUpdatedAt: String(item?.lastUpdatedAt || item?.last_updated_at || '').trim(),
      enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
      enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0,
      isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? 0) ? 1 : 0
    }
  }).filter(Boolean)
}

const diagnosisRoundPresenterHelpers = {
  resolvePublicPlantRefs,
  toPublicObservedSymptoms,
  toPublicObservedEvidenceSet,
  toPublicQuestions,
  buildSummaryCard,
  resolveFollowUpCanUploadMoreImages
}

module.exports = {
  normalizeEvidenceSourceType,
  isVisualEvidenceItem,
  hasConsumedFollowUpRetakeQuota,
  resolveFollowUpCanUploadMoreImages,
  resolvePublicPlantRefs,
  buildSummaryCard,
  toPublicQuestions,
  toPublicObservedSymptoms,
  toPublicObservedEvidenceSet,
  diagnosisRoundPresenterHelpers
}
