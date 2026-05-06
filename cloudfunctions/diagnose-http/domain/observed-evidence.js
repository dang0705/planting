'use strict'

const { clamp01 } = require('../repositories/sql')

const ALLOWED_EVIDENCE_STATUS = ['active', 'retained', 'superseded']

function normalizeText(value, fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
}

function normalizeEvidenceStatus(value, fallback = 'active') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return ALLOWED_EVIDENCE_STATUS.includes(normalized) ? normalized : fallback
}

function normalizeEvidenceSourceType(value, fallback = '') {
  return normalizeText(value, fallback).toLowerCase()
}

function isVisualEvidenceSourceType(value = '') {
  const normalized = normalizeEvidenceSourceType(value)
  if (!normalized) return false
  if (normalized === 'legacy_observed_symptom') return true
  return normalized.includes('visual')
}

function buildObservedEvidenceSetId({
  sourceType = '',
  symptomKey = '',
  originVisualCallBatchId = '',
  parentEvidenceKey = '',
  sourceRecordId = ''
} = {}) {
  return [
    normalizeText(sourceType, 'unknown_source'),
    normalizeText(symptomKey, 'unknown_symptom'),
    normalizeText(originVisualCallBatchId, 'no_batch'),
    normalizeText(parentEvidenceKey, 'no_parent'),
    normalizeText(sourceRecordId, 'no_record')
  ].join('::')
}

function normalizeObservedEvidenceItem(item = {}, defaults = {}) {
  const symptomKey = normalizeText(item?.symptomKey || item?.symptom_key || '', '')
  if (!symptomKey) return null

  const sourceType = normalizeText(
    item?.sourceType || item?.source_type || defaults.sourceType || 'legacy_observed_symptom',
    'legacy_observed_symptom'
  )
  const parentEvidenceKey = normalizeText(
    item?.parentEvidenceKey || item?.parent_evidence_key || defaults.parentEvidenceKey || '',
    ''
  )
  const sourceRecordId = normalizeText(
    item?.sourceRecordId || item?.source_record_id || defaults.sourceRecordId || '',
    ''
  )
  const originVisualCallBatchId = normalizeText(
    item?.originVisualCallBatchId ||
      item?.origin_visual_call_batch_id ||
      defaults.originVisualCallBatchId ||
      '',
    ''
  )

  return {
    observedEvidenceSetId:
      normalizeText(item?.observedEvidenceSetId || item?.observed_evidence_set_id || '', '') ||
      buildObservedEvidenceSetId({
        sourceType,
        symptomKey,
        originVisualCallBatchId,
        parentEvidenceKey,
        sourceRecordId
      }),
    evidenceKey: normalizeText(item?.evidenceKey || item?.evidence_key || symptomKey, symptomKey),
    evidenceType: normalizeText(item?.evidenceType || item?.evidence_type || 'symptom', 'symptom'),
    symptomKey,
    symptomCn: normalizeText(item?.symptomCn || item?.symptom_cn || symptomKey, symptomKey),
    confidence: clamp01(item?.confidence ?? defaults.confidence ?? 0.7),
    sourceType,
    currentStatus: normalizeEvidenceStatus(
      item?.currentStatus || item?.current_status || defaults.currentStatus || 'active',
      'active'
    ),
    targetLayer: normalizeText(
      item?.targetLayer || item?.target_layer || defaults.targetLayer || 'observed_evidence_set',
      'observed_evidence_set'
    ),
    parentEvidenceKey,
    sourceRecordId,
    originVisualCallBatchId: originVisualCallBatchId || null,
    supersededByBatchId:
      normalizeText(
        item?.supersededByBatchId ||
          item?.superseded_by_batch_id ||
          defaults.supersededByBatchId ||
          '',
        ''
      ) || null,
    independenceGroupIds: normalizeStringList(
      item?.independenceGroupIds ||
        item?.independence_group_ids ||
        defaults.independenceGroupIds ||
        []
    ),
    conflictEvidenceKeys: normalizeStringList(
      item?.conflictEvidenceKeys ||
        item?.conflict_evidence_keys ||
        defaults.conflictEvidenceKeys ||
        []
    ),
    conflictLevel: normalizeText(
      item?.conflictLevel || item?.conflict_level || defaults.conflictLevel || '',
      ''
    ),
    conflictResolved: Number(
      item?.conflictResolved ?? item?.conflict_resolved ?? defaults.conflictResolved ?? 0
    )
      ? 1
      : 0,
    firstSeenStage: normalizeText(
      item?.firstSeenStage || item?.first_seen_stage || defaults.firstSeenStage || '',
      ''
    ),
    lastUpdatedAt: normalizeText(
      item?.lastUpdatedAt || item?.last_updated_at || defaults.lastUpdatedAt || new Date().toISOString(),
      new Date().toISOString()
    ),
    enteredRuntime: Number(
      item?.enteredRuntime ?? item?.entered_runtime ?? defaults.enteredRuntime ?? 1
    )
      ? 1
      : 0,
    enteredExplanation: Number(
      item?.enteredExplanation ?? item?.entered_explanation ?? defaults.enteredExplanation ?? 0
    )
      ? 1
      : 0,
    isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? defaults.isKeyEvidence ?? 0)
      ? 1
      : 0,
    visualStructuralEvidenceStatus: normalizeText(
      item?.visualStructuralEvidenceStatus ||
        item?.visual_structural_evidence_status ||
        defaults.visualStructuralEvidenceStatus ||
        '',
      ''
    ),
    visualSupportOrgans: normalizeStringList(
      item?.visualSupportOrgans ||
        item?.visual_support_organs ||
        defaults.visualSupportOrgans ||
        []
    ),
    visualSupportCount: Number(
      item?.visualSupportCount ?? item?.visual_support_count ?? defaults.visualSupportCount ?? 0
    ),
    visualSupportingRegionNote: normalizeText(
      item?.visualSupportingRegionNote ||
        item?.visual_supporting_region_note ||
        defaults.visualSupportingRegionNote ||
        '',
      ''
    ),
    visualConfidenceBand: normalizeText(
      item?.visualConfidenceBand ||
        item?.visual_confidence_band ||
        defaults.visualConfidenceBand ||
        '',
      ''
    ),
    visualStrengthLevel: normalizeText(
      item?.visualStrengthLevel ||
        item?.visual_strength_level ||
        defaults.visualStrengthLevel ||
        '',
      ''
    ),
    visualAdmissionReason: normalizeText(
      item?.visualAdmissionReason ||
        item?.visual_admission_reason ||
        defaults.visualAdmissionReason ||
        '',
      ''
    )
  }
}

function normalizeObservedEvidenceSetItems(items = [], defaults = {}) {
  return (Array.isArray(items) ? items : [])
    .map(item => normalizeObservedEvidenceItem(item, defaults))
    .filter(Boolean)
}

function buildObservedEvidenceSetFromSymptoms(observedSymptoms = [], defaults = {}) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .map(item =>
      normalizeObservedEvidenceItem(
        {
          symptomKey: item?.symptomKey || item?.symptom_key || '',
          symptomCn: item?.symptomCn || item?.symptom_cn || item?.symptomKey || '',
          confidence: Number(item?.confidence ?? defaults.confidence ?? 0.7),
          sourceType: defaults.sourceType || item?.source || item?.evidenceSource || 'legacy_observed_symptom',
          currentStatus: defaults.currentStatus || 'active',
          targetLayer: defaults.targetLayer || 'observed_evidence_set',
          originVisualCallBatchId: defaults.originVisualCallBatchId || '',
          firstSeenStage: defaults.firstSeenStage || '',
          enteredRuntime: defaults.enteredRuntime ?? 1,
          isKeyEvidence: defaults.isKeyEvidence ?? 0
        },
        defaults
      )
    )
    .filter(Boolean)
}

function buildObservedEvidenceSetFromVisualAggregateResult(visualAggregateResult = null, defaults = {}) {
  if (!visualAggregateResult || typeof visualAggregateResult !== 'object') {
    return []
  }

  const trace = visualAggregateResult.visual_batch_trace || {}
  const observedSymptomMap = new Map(
    (Array.isArray(visualAggregateResult.observed_symptoms) ? visualAggregateResult.observed_symptoms : [])
      .map(item => [normalizeText(item?.symptomKey || '', ''), item])
      .filter(([symptomKey]) => Boolean(symptomKey))
  )

  return (Array.isArray(visualAggregateResult.admission_records) ? visualAggregateResult.admission_records : [])
    .filter(item => normalizeText(item?.admission_result || '', '') === 'formally_admitted')
    .map(item => {
      const candidate = item?.candidate || {}
      const symptomKey = normalizeText(item?.object_key || candidate?.symptom_key || '', '')
      if (!symptomKey) return null

      const projectedSymptom = observedSymptomMap.get(symptomKey) || {}
      return normalizeObservedEvidenceItem(
        {
          observedEvidenceSetId: `visual_admitted::${item.visual_admission_record_id || symptomKey}`,
          evidenceKey: symptomKey,
          evidenceType: 'symptom',
          symptomKey,
          symptomCn: candidate.display_name_cn || projectedSymptom.symptomCn || symptomKey,
          confidence: Number(projectedSymptom.confidence ?? defaults.confidence ?? 0.75),
          sourceType: 'visual_admitted',
          currentStatus: 'active',
          targetLayer: item?.target_layer || 'observed_evidence_set',
          parentEvidenceKey: `visual_admission:${item.visual_admission_record_id || symptomKey}`,
          sourceRecordId: item?.visual_admission_record_id || '',
          originVisualCallBatchId:
            trace.origin_visual_call_batch_id || visualAggregateResult.visual_call_batch_id || '',
          supersededByBatchId: trace.superseded_by_batch_id || null,
          independenceGroupIds: candidate.support_group_keys || [],
          firstSeenStage: defaults.firstSeenStage || 'preliminary',
          enteredRuntime: Number(item?.entered_runtime || 0),
          isKeyEvidence:
            candidate.admission_readiness === 'ready' || Number(projectedSymptom.confidence || 0) >= 0.8
              ? 1
              : 0,
          visualStructuralEvidenceStatus: candidate.visual_structural_evidence_status || '',
          visualSupportOrgans: candidate.support_organs || [],
          visualSupportCount: Number(candidate.support_count || 0),
          visualSupportingRegionNote: candidate.supporting_region_note || '',
          visualConfidenceBand: candidate.confidence_band || '',
          visualStrengthLevel: candidate.strength_level || '',
          visualAdmissionReason: item?.admission_reason || ''
        },
        defaults
      )
    })
    .filter(Boolean)
}

function buildObservedEvidenceSetFromAnswerEffects(answerEffects = [], symptomMap = new Map(), defaults = {}) {
  return (Array.isArray(answerEffects) ? answerEffects : [])
    .filter(item => item?.effectType === 'positive' && normalizeText(item?.mappedSymptomKey || '', ''))
    .map(item => {
      const symptomKey = normalizeText(item.mappedSymptomKey || '', '')
      const symptomMeta = symptomMap.get(symptomKey)
      return normalizeObservedEvidenceItem(
        {
          observedEvidenceSetId: buildObservedEvidenceSetId({
            sourceType: 'follow_up_positive',
            symptomKey,
            originVisualCallBatchId: defaults.originVisualCallBatchId || '',
            parentEvidenceKey: `answer:${item.questionKey || ''}:${item.optionKey || ''}`,
            sourceRecordId: `${item.questionKey || ''}:${item.optionKey || ''}`
          }),
          evidenceKey: symptomKey,
          evidenceType: 'symptom',
          symptomKey,
          symptomCn: symptomMeta?.displayTextCn || symptomMeta?.symptomCn || symptomKey,
          confidence: 1,
          sourceType: 'follow_up_positive',
          currentStatus: 'active',
          targetLayer: 'observed_evidence_set',
          parentEvidenceKey: `answer:${item.questionKey || ''}:${item.optionKey || ''}`,
          sourceRecordId: `${item.questionKey || ''}:${item.optionKey || ''}`,
          originVisualCallBatchId: defaults.originVisualCallBatchId || '',
          firstSeenStage: defaults.firstSeenStage || 'followup',
          enteredRuntime: 1,
          isKeyEvidence: 1
        },
        defaults
      )
    })
    .filter(Boolean)
}

function mergeObservedEvidenceSet(...groups) {
  const merged = new Map()

  for (const group of groups) {
    for (const item of normalizeObservedEvidenceSetItems(group)) {
      const current = merged.get(item.observedEvidenceSetId)
      if (!current) {
        merged.set(item.observedEvidenceSetId, item)
        continue
      }

      merged.set(item.observedEvidenceSetId, {
        ...current,
        symptomCn: item.symptomCn || current.symptomCn || item.symptomKey,
        confidence: Math.max(Number(current.confidence || 0), Number(item.confidence || 0)),
        currentStatus:
          current.currentStatus === 'superseded' ? current.currentStatus : item.currentStatus,
        supersededByBatchId: current.supersededByBatchId || item.supersededByBatchId || null,
        independenceGroupIds: normalizeStringList([
          ...(current.independenceGroupIds || []),
          ...(item.independenceGroupIds || [])
        ]),
        conflictEvidenceKeys: normalizeStringList([
          ...(current.conflictEvidenceKeys || []),
          ...(item.conflictEvidenceKeys || [])
        ]),
        conflictLevel: current.conflictLevel || item.conflictLevel || '',
        conflictResolved:
          Number(current.conflictResolved || 0) || Number(item.conflictResolved || 0) ? 1 : 0,
        enteredExplanation:
          Number(current.enteredExplanation || 0) || Number(item.enteredExplanation || 0) ? 1 : 0,
        lastUpdatedAt: item.lastUpdatedAt || current.lastUpdatedAt
      })
    }
  }

  return Array.from(merged.values()).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
}

function filterVisualObservedEvidenceSet(observedEvidenceSet = []) {
  return normalizeObservedEvidenceSetItems(observedEvidenceSet).filter(
    item => isVisualEvidenceSourceType(item.sourceType)
  )
}

function projectObservedSymptomsFromEvidence(observedEvidenceSet = []) {
  const symptomMap = new Map()

  for (const item of normalizeObservedEvidenceSetItems(observedEvidenceSet)) {
    if (item.evidenceType !== 'symptom') continue
    if (item.enteredRuntime !== 1) continue
    if (item.currentStatus === 'superseded') continue

    const current = symptomMap.get(item.symptomKey)
    if (!current || Number(item.confidence || 0) > Number(current.confidence || 0)) {
      symptomMap.set(item.symptomKey, {
        symptomKey: item.symptomKey,
        symptomCn: item.symptomCn || item.symptomKey,
        confidence: clamp01(item.confidence ?? 0.7),
        source: item.sourceType || 'observed_evidence'
      })
    }
  }

  return Array.from(symptomMap.values()).sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
}

function projectVisualObservedSymptomsFromEvidence(observedEvidenceSet = []) {
  return projectObservedSymptomsFromEvidence(
    filterVisualObservedEvidenceSet(observedEvidenceSet)
  )
}

module.exports = {
  buildObservedEvidenceSetFromSymptoms,
  buildObservedEvidenceSetFromVisualAggregateResult,
  buildObservedEvidenceSetFromAnswerEffects,
  mergeObservedEvidenceSet,
  normalizeObservedEvidenceSetItems,
  projectObservedSymptomsFromEvidence,
  normalizeEvidenceSourceType,
  isVisualEvidenceSourceType,
  filterVisualObservedEvidenceSet,
  projectVisualObservedSymptomsFromEvidence
}
