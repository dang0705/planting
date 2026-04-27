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

function buildPublicVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    visualCallBatchId:
      normalizeStoredNullableText(summary?.visualCallBatchId || summary?.visual_call_batch_id || '', null),
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    organCoverageSummary:
      summary?.organCoverageSummary || summary?.organ_coverage_summary || null,
    duplicateViewGroups: Array.isArray(summary?.duplicateViewGroups || summary?.duplicate_view_groups)
      ? (summary.duplicateViewGroups || summary.duplicate_view_groups)
      : [],
    aggregateQualityGrade:
      normalizeStoredNullableText(summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || '', ''),
    aggregateAnalyzability:
      normalizeStoredNullableText(summary?.aggregateAnalyzability || summary?.aggregate_analyzability || '', ''),
    suggestedFollowupCapture: normalizeStringList(
      summary?.suggestedFollowupCapture || summary?.suggested_followup_capture
    ),
    admissionReadyFlag: Number(summary?.admissionReadyFlag ?? summary?.admission_ready_flag ?? 0) ? 1 : 0,
    routePrimaryAction: normalizeDiagnosisRoutePrimaryAction(
      summary?.routePrimaryAction || summary?.route_primary_action || '',
      ''
    ),
    shadowCompareSummary: buildPublicShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary || null
    ),
    aggregatedSymptomCandidates: Array.isArray(summary?.aggregatedSymptomCandidates || summary?.aggregated_symptom_candidates)
      ? (summary.aggregatedSymptomCandidates || summary.aggregated_symptom_candidates)
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
  buildPublicVisualAggregateSummary
}
