'use strict'

const {
  normalizeStoredNullableText,
  normalizeStringList
} = require('./stored-value')
const {
  normalizeDiagnosisRoutePrimaryAction
} = require('./diagnosis-contract')

function buildPublicShadowCompareSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    enabled: Number(summary?.enabled ?? 0) ? 1 : 0,
    compareStatus: normalizeStoredNullableText(
      summary?.compareStatus || summary?.compare_status || '',
      'disabled'
    ),
    comparedImageCount: Number(summary?.comparedImageCount ?? summary?.compared_image_count ?? 0),
    succeededImageCount: Number(summary?.succeededImageCount ?? summary?.succeeded_image_count ?? 0),
    skippedImageCount: Number(summary?.skippedImageCount ?? summary?.skipped_image_count ?? 0),
    failedImageCount: Number(summary?.failedImageCount ?? summary?.failed_image_count ?? 0),
    providers: normalizeStringList(summary?.providers),
    modelNames: normalizeStringList(summary?.modelNames || summary?.model_names)
  }
}

function resolveVisualRouteSummary(summary = {}) {
  const route =
    summary?.diagnosis_mode_route_result ||
    summary?.diagnosisModeRouteResult ||
    summary?.routeResult ||
    {}
  return route && typeof route === 'object' ? route : {}
}

function buildPublicVisualModeCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const modeKey = String(
    candidate?.modeKey || candidate?.mode || candidate?.diagnosisMode || ''
  ).trim()
  if (!modeKey) {
    return null
  }
  return {
    modeKey,
    confidence: Number(candidate?.confidence || 0),
    role: String(candidate?.role || '').trim(),
    imageId: String(candidate?.imageId || candidate?.image_id || '').trim(),
    sourceRecordId: String(
      candidate?.sourceRecordId || candidate?.source_record_id || ''
    ).trim(),
    regionRef: String(candidate?.regionRef || candidate?.region_ref || '').trim(),
    inputSlotType: String(
      candidate?.inputSlotType || candidate?.input_slot_type || ''
    ).trim(),
    modelOrgan: String(candidate?.modelOrgan || candidate?.model_organ || '').trim(),
    analyzability: String(candidate?.analyzability || '').trim(),
    organConflictFlag: Number(
      candidate?.organConflictFlag ?? candidate?.organ_conflict_flag ?? 0
    )
      ? 1
      : 0
  }
}

function buildPublicVisualConflict(conflict = {}) {
  if (!conflict || typeof conflict !== 'object') {
    return null
  }
  const modeKeys = normalizeStringList(conflict?.modeKeys || conflict?.mode_keys)
  if (!modeKeys.length) {
    return null
  }
  return {
    conflictType: String(conflict?.conflictType || conflict?.conflict_type || '').trim(),
    modeKeys,
    families: normalizeStringList(conflict?.families),
    candidateSources: (Array.isArray(conflict?.candidateSources || conflict?.candidate_sources)
      ? conflict.candidateSources || conflict.candidate_sources
      : []
    )
      .map(buildPublicVisualModeCandidate)
      .filter(Boolean)
      .slice(0, 12)
  }
}

function buildPublicModelDirectDecision(decision = {}) {
  if (!decision || typeof decision !== 'object') {
    return null
  }
  const imageId = String(decision?.imageId || decision?.image_id || '').trim()
  const status = String(decision?.status || '').trim()
  if (!imageId && !status) {
    return null
  }
  return {
    imageId,
    sourceRecordId: String(decision?.sourceRecordId || decision?.source_record_id || '').trim(),
    inputSlotType: String(decision?.inputSlotType || decision?.input_slot_type || '').trim(),
    modelOrgan: String(decision?.modelOrgan || decision?.model_organ || '').trim(),
    analyzability: String(decision?.analyzability || '').trim(),
    organConflictFlag: Number(
      decision?.organConflictFlag ?? decision?.organ_conflict_flag ?? 0
    )
      ? 1
      : 0,
    status,
    acceptedModeKeys: normalizeStringList(decision?.acceptedModeKeys || decision?.accepted_mode_keys),
    blockedModeKeys: normalizeStringList(decision?.blockedModeKeys || decision?.blocked_mode_keys),
    highConfidenceCandidates: (Array.isArray(
      decision?.highConfidenceCandidates || decision?.high_confidence_candidates
    )
      ? decision.highConfidenceCandidates || decision.high_confidence_candidates
      : []
    )
      .map(buildPublicVisualModeCandidate)
      .filter(Boolean)
      .slice(0, 12)
  }
}

function buildPublicOrganCoverageSummary(summary = {}) {
  const source = summary?.organCoverageSummary || summary?.organ_coverage_summary || {}
  if (!source || typeof source !== 'object') {
    return null
  }
  return {
    coveredOrgans: normalizeStringList(source?.coveredOrgans || source?.covered_organs),
    requestedImageCount: Number(
      source?.requestedImageCount ?? source?.requested_image_count ?? 0
    ),
    effectiveImageCount: Number(
      source?.effectiveImageCount ?? source?.effective_image_count ?? 0
    ),
    sources: (Array.isArray(source?.sources) ? source.sources : [])
      .map(item => ({
        imageId: String(item?.image_id || item?.imageId || '').trim(),
        sourceRecordId: String(
          item?.visual_normalized_image_result_id ||
            item?.visualNormalizedImageResultId ||
            item?.sourceRecordId ||
            ''
        ).trim(),
        inputSlotType: String(item?.input_slot_type || item?.inputSlotType || '').trim(),
        modelOrgan: String(item?.model_organ || item?.modelOrgan || '').trim(),
        normalizedOrgan: String(item?.normalized_organ || item?.normalizedOrgan || '').trim(),
        organSource: String(item?.organ_source || item?.organSource || '').trim(),
        organConflictFlag: Number(
          item?.organ_conflict_flag ?? item?.organConflictFlag ?? 0
        )
          ? 1
          : 0
      }))
      .filter(item => item.imageId || item.sourceRecordId || item.normalizedOrgan)
      .slice(0, 8)
  }
}

function buildPublicVisualEvidenceCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return null
  }
  const symptomKey = String(candidate?.symptom_key || candidate?.symptomKey || '').trim()
  if (!symptomKey) {
    return null
  }
  const supportingSources = (
    Array.isArray(candidate?.supporting_sources || candidate?.supportingSources)
      ? candidate.supporting_sources || candidate.supportingSources
      : []
  )
    .map(source => ({
      imageId: String(source?.image_id || source?.imageId || '').trim(),
      sourceRecordId: String(
        source?.visual_normalized_image_result_id ||
          source?.visualNormalizedImageResultId ||
          source?.sourceRecordId ||
          ''
      ).trim(),
      organ: String(source?.organ || '').trim(),
      visibilityScope: String(
        source?.visibility_scope || source?.visibilityScope || ''
      ).trim(),
      captureRegion: String(
        source?.capture_region || source?.captureRegion || ''
      ).trim()
    }))
    .filter(source => source.imageId || source.sourceRecordId || source.organ)
    .slice(0, 8)

  return {
    symptomKey,
    displayNameCn: String(
      candidate?.display_name_cn || candidate?.displayNameCn || symptomKey
    ).trim(),
    strengthLevel: String(
      candidate?.strength_level || candidate?.strengthLevel || ''
    ).trim(),
    confidenceBand: String(
      candidate?.confidence_band || candidate?.confidenceBand || ''
    ).trim(),
    visibilityScope: String(
      candidate?.visibility_scope || candidate?.visibilityScope || ''
    ).trim(),
    admissionReadiness: String(
      candidate?.admission_readiness || candidate?.admissionReadiness || ''
    ).trim(),
    supportCount: Number(candidate?.support_count ?? candidate?.supportCount ?? 0),
    supportImageCount: Math.max(
      normalizeStringList(candidate?.support_image_ids || candidate?.supportImageIds).length,
      supportingSources.length
    ),
    supportOrgans: normalizeStringList(candidate?.support_organs || candidate?.supportOrgans),
    primarySupportImageId: String(
      candidate?.primary_support_image_id || candidate?.primarySupportImageId || ''
    ).trim(),
    primarySupportOrgan: String(
      candidate?.primary_support_organ || candidate?.primarySupportOrgan || ''
    ).trim(),
    primaryCaptureRegion: String(
      candidate?.primary_capture_region || candidate?.primaryCaptureRegion || ''
    ).trim(),
    supportingSources
  }
}

function buildQuestionPackageVisualEvidenceSnapshot(summary = null) {
  const publicSummary = buildPublicVisualAggregateSummary(summary)
  if (!publicSummary) {
    return null
  }

  return {
    visualCallBatchId: publicSummary.visualCallBatchId,
    effectiveImageCount: publicSummary.effectiveImageCount,
    organCoverageSummary: publicSummary.organCoverageSummary,
    aggregateQualityGrade: publicSummary.aggregateQualityGrade,
    aggregateAnalyzability: publicSummary.aggregateAnalyzability,
    suggestedFollowupCapture: publicSummary.suggestedFollowupCapture,
    admissionReadyFlag: publicSummary.admissionReadyFlag,
    routePrimaryAction: publicSummary.routePrimaryAction,
    decisionSource: publicSummary.decisionSource,
    primaryModelDirectModes: publicSummary.primaryModelDirectModes,
    modelDirectDecisionStatus: publicSummary.modelDirectDecisionStatus,
    aggregatedSymptomCandidates: publicSummary.aggregatedSymptomCandidates
      .map(buildPublicVisualEvidenceCandidate)
      .filter(Boolean)
      .slice(0, 12),
    aggregateVisualDiscriminators: publicSummary.aggregateVisualDiscriminators.slice(0, 12),
    aggregateMissingInfoForPath: publicSummary.aggregateMissingInfoForPath.slice(0, 12),
    secondaryVisualCandidates: publicSummary.secondaryVisualCandidates.slice(0, 24),
    visualConflicts: publicSummary.visualConflicts.slice(0, 4),
    modelDirectDecisions: publicSummary.modelDirectDecisions.slice(0, 8),
    observedSymptoms: publicSummary.observedSymptoms.slice(0, 12)
  }
}

function buildPublicVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  const route = resolveVisualRouteSummary(summary)
  const primaryModelDirectModes = normalizeStringList(
    summary?.primaryModelDirectModes ||
      summary?.primary_model_direct_modes ||
      route?.primaryModelDirectModes ||
      route?.primary_model_direct_modes
  )
  const secondaryVisualCandidates = (
    Array.isArray(
      summary?.secondaryVisualCandidates ||
        summary?.secondary_visual_candidates ||
        route?.secondaryVisualCandidates ||
        route?.secondary_visual_candidates
    )
      ? summary?.secondaryVisualCandidates ||
        summary?.secondary_visual_candidates ||
        route?.secondaryVisualCandidates ||
        route?.secondary_visual_candidates
      : []
  )
    .map(buildPublicVisualModeCandidate)
    .filter(Boolean)
    .slice(0, 24)
  const visualConflicts = (
    Array.isArray(
      summary?.visualConflicts ||
        summary?.visual_conflicts ||
        route?.visualConflicts ||
        route?.visual_conflicts
    )
      ? summary?.visualConflicts ||
        summary?.visual_conflicts ||
        route?.visualConflicts ||
        route?.visual_conflicts
      : []
  )
    .map(buildPublicVisualConflict)
    .filter(Boolean)
    .slice(0, 4)
  const modelDirectDecisions = (
    Array.isArray(
      summary?.modelDirectDecisions ||
        summary?.model_direct_decisions ||
        route?.modelDirectDecisions ||
        route?.model_direct_decisions
    )
      ? summary?.modelDirectDecisions ||
        summary?.model_direct_decisions ||
        route?.modelDirectDecisions ||
        route?.model_direct_decisions
      : []
  )
    .map(buildPublicModelDirectDecision)
    .filter(Boolean)
    .slice(0, 8)

  return {
    visualCallBatchId:
      normalizeStoredNullableText(summary?.visualCallBatchId || summary?.visual_call_batch_id || '', null),
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    organCoverageSummary:
      buildPublicOrganCoverageSummary(summary),
    duplicateViewGroups: Array.isArray(summary?.duplicateViewGroups || summary?.duplicate_view_groups)
      ? (summary.duplicateViewGroups || summary.duplicate_view_groups)
      : [],
    aggregateQualityGrade:
      normalizeStoredNullableText(summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '', ''),
    aggregateAnalyzability:
      normalizeStoredNullableText(summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '', ''),
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
      summary?.suggestedFollowupCapture || summary?.suggested_question_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0) ? 1 : 0,
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      summary?.routePrimaryAction ||
        summary?.route_primary_action ||
        route?.routePrimaryAction ||
        route?.route_primary_action ||
        '',
      ''
    ),
    decisionSource: normalizeStoredNullableText(
      summary?.decisionSource ||
        summary?.decision_source ||
        route?.decisionSource ||
        route?.decision_source ||
        '',
      ''
    ),
    primaryModelDirectModes,
    modelDirectDecisionStatus: normalizeStoredNullableText(
      summary?.modelDirectDecisionStatus ||
        summary?.model_direct_decision_status ||
        route?.modelDirectDecisionStatus ||
        route?.model_direct_decision_status ||
        '',
      ''
    ),
    secondaryVisualCandidates,
    visualConflicts,
    modelDirectDecisions,
    shadowCompareSummary: buildPublicShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary || null
    ),
    aggregatedSymptomCandidates: Array.isArray(summary?.aggregatedSymptomCandidates || summary?.aggregated_symptom_candidates)
      ? (summary.aggregatedSymptomCandidates || summary.aggregated_symptom_candidates)
      : [],
    outOfPoolSymptomHints: Array.isArray(summary?.outOfPoolSymptomHints || summary?.out_of_pool_symptom_hints)
      ? (summary.outOfPoolSymptomHints || summary.out_of_pool_symptom_hints)
      : [],
    admissionRecords: Array.isArray(summary?.admissionRecords || summary?.admission_records)
      ? (summary.admissionRecords || summary.admission_records)
      : [],
    observedSymptoms: Array.isArray(summary?.observedSymptoms || summary?.observed_symptoms)
      ? (summary.observedSymptoms || summary.observed_symptoms)
      : []
  }
}

module.exports = {
  buildPublicShadowCompareSummary,
  buildPublicVisualAggregateSummary,
  buildQuestionPackageVisualEvidenceSnapshot
}
