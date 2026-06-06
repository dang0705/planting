import { normalizeStringList, resolveDisplaySymptomCn } from './diagnose-flow-shared.js'

export function normalizeObservedSymptoms(observedSymptoms = []) {
  return (Array.isArray(observedSymptoms) ? observedSymptoms : [])
    .filter(item => item?.symptomKey)
    .map(item => ({
      symptomKey: item.symptomKey,
      symptomCn: resolveDisplaySymptomCn(
        item.symptomCn,
        item.symptom_cn,
        item.displayTextCn,
        item.display_text_cn,
        item.label,
        item.evidenceLabel,
        item.symptomKey
      ),
      confidence: Number(item.confidence || 0),
      source: item.source || item.evidenceSource || 'mixed'
    }))
}

export function normalizeObservedEvidenceSet(observedEvidenceSet = []) {
  return (Array.isArray(observedEvidenceSet) ? observedEvidenceSet : [])
    .filter(item => item?.observedEvidenceSetId || item?.observed_evidence_set_id)
    .map(item => ({
      observedEvidenceSetId: String(
        item?.observedEvidenceSetId || item?.observed_evidence_set_id || ''
      ).trim(),
      evidenceKey: String(
        item?.evidenceKey || item?.evidence_key || item?.symptomKey || item?.symptom_key || ''
      ).trim(),
      evidenceType: String(item?.evidenceType || item?.evidence_type || '').trim(),
      symptomKey: String(item?.symptomKey || item?.symptom_key || '').trim(),
      symptomCn: resolveDisplaySymptomCn(
        item?.symptomCn,
        item?.symptom_cn,
        item?.displayTextCn,
        item?.display_text_cn,
        item?.label,
        item?.evidenceLabel,
        item?.symptomKey,
        item?.symptom_key,
        item?.evidenceKey,
        item?.evidence_key
      ),
      confidence: Number(item?.confidence || 0),
      sourceType: String(item?.sourceType || item?.source_type || '').trim(),
      currentStatus: String(item?.currentStatus || item?.current_status || '').trim() || 'active',
      targetLayer: String(item?.targetLayer || item?.target_layer || '').trim(),
      evidenceRole: String(item?.evidenceRole || item?.evidence_role || '').trim(),
      observability: String(item?.observability || '').trim(),
      reliability: String(item?.reliability || '').trim(),
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
      firstSeenStage: String(item?.firstSeenStage || item?.first_seen_stage || '').trim(),
      lastUpdatedAt: String(item?.lastUpdatedAt || item?.last_updated_at || '').trim(),
      enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
      isKeyEvidence: Number(item?.isKeyEvidence ?? item?.is_key_evidence ?? 0) ? 1 : 0
    }))
    .filter(item => item.observedEvidenceSetId && (item.evidenceKey || item.symptomKey))
}

export function normalizeVisualBatchTrace(trace = null) {
  if (!trace || typeof trace !== 'object') {
    return null
  }

  return {
    currentVisualCallBatchId:
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || null,
    originVisualCallBatchId:
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || null,
    supersedeTargetBatchId:
      trace?.supersedeTargetBatchId || trace?.supersede_target_batch_id || null,
    supersededByBatchId:
      trace?.supersededByBatchId || trace?.superseded_by_batch_id || null,
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0,
    supersedeReason: String(trace?.supersedeReason || trace?.supersede_reason || '').trim(),
    supersedeScope: String(trace?.supersedeScope || trace?.supersede_scope || '').trim(),
    supersedeSource: String(trace?.supersedeSource || trace?.supersede_source || '').trim(),
    supersedeTime: String(trace?.supersedeTime || trace?.supersede_time || '').trim() || null
  }
}

export function normalizeShadowCompareSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    enabled: Number(summary?.enabled ?? 0) ? 1 : 0,
    compareStatus: String(summary?.compareStatus || summary?.compare_status || '').trim() || 'disabled',
    comparedImageCount: Number(summary?.comparedImageCount ?? summary?.compared_image_count ?? 0),
    succeededImageCount: Number(summary?.succeededImageCount ?? summary?.succeeded_image_count ?? 0),
    skippedImageCount: Number(summary?.skippedImageCount ?? summary?.skipped_image_count ?? 0),
    failedImageCount: Number(summary?.failedImageCount ?? summary?.failed_image_count ?? 0),
    providers: normalizeStringList(summary?.providers),
    modelNames: normalizeStringList(summary?.modelNames || summary?.model_names)
  }
}

export function normalizeVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    visualCallBatchId: summary?.visualCallBatchId || summary?.visual_call_batch_id || null,
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    organCoverageSummary:
      summary?.organCoverageSummary || summary?.organ_coverage_summary || null,
    duplicateViewGroups: Array.isArray(summary?.duplicateViewGroups || summary?.duplicate_view_groups)
      ? (summary.duplicateViewGroups || summary.duplicate_view_groups)
      : [],
    aggregateQualityGrade:
      summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '',
    aggregateAnalyzability:
      summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '',
    aggregateVisualDiscriminators: Array.isArray(
      summary?.aggregateVisualDiscriminators || summary?.aggregate_visual_discriminators
    )
      ? (summary.aggregateVisualDiscriminators || summary.aggregate_visual_discriminators)
      : [],
    aggregateMissingInfoForPath: Array.isArray(
      summary?.aggregateMissingInfoForPath || summary?.aggregate_missing_info_for_path
    )
      ? (summary.aggregateMissingInfoForPath || summary.aggregate_missing_info_for_path)
      : [],
    suggestedFollowupCapture: normalizeStringList(
      summary?.suggestedFollowupCapture || summary?.suggested_followup_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0) ? 1 : 0,
    routePrimaryAction: String(summary?.routePrimaryAction || summary?.route_primary_action || '').trim(),
    shadowCompareSummary: normalizeShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary
    )
  }
}

export function normalizeDerivedEvidenceSet(derivedEvidenceSet = []) {
  return (Array.isArray(derivedEvidenceSet) ? derivedEvidenceSet : [])
    .map(item => ({
      derivedEvidenceId: String(
        item?.derivedEvidenceId || item?.derived_evidence_id || ''
      ).trim(),
      derivedEvidenceKey: String(
        item?.derivedEvidenceKey || item?.derived_evidence_key || ''
      ).trim(),
      derivedEvidenceType: String(
        item?.derivedEvidenceType || item?.derived_evidence_type || ''
      ).trim(),
      patternKey: String(item?.patternKey || item?.pattern_key || '').trim(),
      locationKey: String(item?.locationKey || item?.location_key || '').trim(),
      distributionKey: String(item?.distributionKey || item?.distribution_key || '').trim(),
      label: String(item?.label || item?.labelCn || '').trim(),
      sourceType: String(item?.sourceType || item?.source_type || '').trim(),
      evidenceState: String(item?.evidenceState || item?.evidence_state || '').trim(),
      confidence: Number(item?.confidence || 0),
      parentEvidenceKeys: normalizeStringList(
        item?.parentEvidenceKeys || item?.parent_evidence_keys
      ),
      parentSymptomKeys: normalizeStringList(
        item?.parentSymptomKeys || item?.parent_symptom_keys
      ),
      independenceGroupIds: normalizeStringList(
        item?.independenceGroupIds || item?.independence_group_ids
      ),
      enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
      enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0
    }))
    .filter(item => item.derivedEvidenceId)
}

export function normalizeDiagnosisDirections(diagnosisDirections = []) {
  return (Array.isArray(diagnosisDirections) ? diagnosisDirections : [])
    .map(item => ({
      directionId: String(item?.directionId || item?.direction_id || '').trim(),
      directionKey: String(item?.directionKey || item?.direction_key || '').trim(),
      categoryKey: String(item?.categoryKey || item?.category_key || '').trim(),
      label: String(item?.label || item?.labelCn || '').trim(),
      confidence: Number(item?.confidence || 0),
      status: String(item?.status || '').trim(),
      matchedSymptomKeys: normalizeStringList(
        item?.matchedSymptomKeys || item?.matched_symptom_keys
      ),
      matchedPatternKeys: normalizeStringList(
        item?.matchedPatternKeys || item?.matched_pattern_keys
      ),
      matchedCandidateSymptomKeys: normalizeStringList(
        item?.matchedCandidateSymptomKeys || item?.matched_candidate_symptom_keys
      ),
      matchedRouteHintTypes: normalizeStringList(
        item?.matchedRouteHintTypes || item?.matched_route_hint_types
      ),
      matchedRouteHintReasons: normalizeStringList(
        item?.matchedRouteHintReasons || item?.matched_route_hint_reasons
      ),
      coveredFactDimensions: normalizeStringList(
        item?.coveredFactDimensions || item?.covered_fact_dimensions
      ),
      preferredQuestionDimensions: normalizeStringList(
        item?.preferredQuestionDimensions || item?.preferred_question_dimensions
      ),
      allowedProblemKeys: normalizeStringList(
        item?.allowedProblemKeys || item?.allowed_problem_keys || item?.candidateProblemKeys
      ),
      candidateProblemKeys: normalizeStringList(
        item?.candidateProblemKeys || item?.candidate_problem_keys
      ),
      supportSummary:
        item?.supportSummary && typeof item.supportSummary === 'object'
          ? {
              matchedSymptomCount: Number(item.supportSummary?.matchedSymptomCount || 0),
              matchedPatternCount: Number(item.supportSummary?.matchedPatternCount || 0),
              confidence: Number(item.supportSummary?.confidence || 0)
            }
          : null,
      outputGateHints:
        item?.outputGateHints && typeof item.outputGateHints === 'object'
          ? {
              allowConclusionOnlyByProblemKey:
                Number(item.outputGateHints?.allowConclusionOnlyByProblemKey || 0) ? 1 : 0,
              requiresAuditedClosure:
                Number(item.outputGateHints?.requiresAuditedClosure || 0) ? 1 : 0,
              shouldStayInternal:
                Number(item.outputGateHints?.shouldStayInternal || 0) ? 1 : 0
            }
          : null,
      round: Math.max(1, Number(item?.round || 1)),
      updatedAt: Number(item?.updatedAt || item?.updated_at || 0) || 0
    }))
    .filter(item => item.directionId)
}
