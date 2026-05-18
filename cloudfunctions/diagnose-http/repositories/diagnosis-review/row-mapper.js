'use strict'

const { toResultId } = require('../../mappers/public-id-mapper')
const { safeJsonParse, normalizeStoredNullableText } = require('../../utils/stored-value')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../../utils/diagnosis-contract')
const { resolveQuestionCountSummary, buildSymptomClassRuntimeReviewPayload } = require('./question-summary')
const {
  normalizeVisualLlmAudit,
  normalizeReviewPromptColumns,
  resolveLlmPromptAuditFromRawStructuredOutput,
  resolveReplayPreviewImage
} = require('./prompt-audit-mappers')
const { toPublicProblemId, resolveDisplayName, buildFeedbackSummary } = require('./display-mappers')

function resolveRouteDecisionFromSnapshot(runtimeSnapshot = null) {
  if (!runtimeSnapshot || typeof runtimeSnapshot !== 'object') {
    return null
  }
  return runtimeSnapshot.routeDecision && typeof runtimeSnapshot.routeDecision === 'object'
    ? runtimeSnapshot.routeDecision
    : (runtimeSnapshot.metrics &&
      runtimeSnapshot.metrics.routeDecision &&
      typeof runtimeSnapshot.metrics.routeDecision === 'object'
        ? runtimeSnapshot.metrics.routeDecision
        : null)
}

function buildRouteDecisionReviewSummary(routeDecision = null, stopReason = '') {
  const safeDecision = routeDecision && typeof routeDecision === 'object' ? routeDecision : null
  if (!safeDecision) {
    const normalizedStopReason = String(stopReason || '').trim()
    if (!normalizedStopReason) {
      return null
    }

    return {
      stopReason: normalizedStopReason,
      activeRouteGroupKeys: [],
      visibleOutcomeKeys: [],
      visibleOutcomeCount: 0,
      nextQuestionKeys: [],
      visibleActionConflictGroups: [],
      visibleActionProfileKeys: [],
      requiresFollowUp: false,
      decisionCause: {
        decisionCauseKey: '',
        decisionCauseText: '',
        decisionCauseCategory: ''
      },
      candidateOutcomeStates: [],
      hasVisibleOutcome: false,
      hasVisibleActionConflict: false,
      visibleActionConflictCount: 0,
      displayableCandidateCount: 0
    }
  }

  const visibleOutcomeKeys = Array.isArray(safeDecision.visibleOutcomeKeys)
    ? safeDecision.visibleOutcomeKeys.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const visibleActionConflictGroups = Array.isArray(safeDecision.visibleActionConflictGroups)
    ? safeDecision.visibleActionConflictGroups.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const nextQuestionKeys = Array.isArray(safeDecision.nextQuestionKeys)
    ? safeDecision.nextQuestionKeys.map(item => String(item || '').trim()).filter(Boolean)
    : []

  const candidateOutcomeStates = Array.isArray(safeDecision.candidateOutcomeStates)
    ? safeDecision.candidateOutcomeStates.map(state => ({
      outcomeKey: String(state?.outcomeKey || '').trim(),
      state: String(state?.state || '').trim(),
      routeKeys: Array.isArray(state?.routeKeys)
        ? state.routeKeys.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      missingGateKeys: Array.isArray(state?.missingGateKeys)
        ? state.missingGateKeys.map(item => String(item || '').trim()).filter(Boolean)
        : [],
      nextQuestionKeys: Array.isArray(state?.nextQuestionKeys)
        ? state.nextQuestionKeys.map(item => String(item || '').trim()).filter(Boolean)
        : []
    }))
    : []

  const decisionCause = safeDecision.decisionCause && typeof safeDecision.decisionCause === 'object'
    ? {
        decisionCauseKey: String(safeDecision.decisionCause.decisionCauseKey || '').trim(),
        decisionCauseText: String(safeDecision.decisionCause.decisionCauseText || '').trim(),
        decisionCauseCategory: String(
          safeDecision.decisionCause.decisionCauseCategory || ''
        ).trim()
      }
    : {
        decisionCauseKey: '',
        decisionCauseText: '',
        decisionCauseCategory: ''
      }

  return {
    stopReason: String(stopReason || safeDecision.stopReason || '').trim(),
    activeRouteGroupKeys: Array.isArray(safeDecision.activeRouteGroupKeys)
      ? safeDecision.activeRouteGroupKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    visibleOutcomeKeys,
    visibleOutcomeCount: visibleOutcomeKeys.length,
    nextQuestionKeys,
    visibleActionConflictGroups,
    visibleActionProfileKeys: Array.isArray(safeDecision.visibleActionProfileKeys)
      ? safeDecision.visibleActionProfileKeys.map(item => String(item || '').trim()).filter(Boolean)
      : [],
    requiresFollowUp: Boolean(safeDecision.requiresFollowUp),
    decisionCause,
    candidateOutcomeStates,
    hasVisibleOutcome: visibleOutcomeKeys.length > 0,
    hasVisibleActionConflict: visibleActionConflictGroups.length > 0,
    visibleActionConflictCount: visibleActionConflictGroups.length,
    displayableCandidateCount: candidateOutcomeStates.filter(
      item => item.state === 'display_eligible'
    ).length
  }
}

function mapDiagnosisReviewRow(row = {}) {
  const runtimeSnapshot = safeJsonParse(row.runtime_snapshot_json, {}) || {}
  const outcomePayload = safeJsonParse(row.outcome_payload_json, {}) || {}
  const normalizedPromptRow = normalizeReviewPromptColumns(
    row,
    {
      promptAudit: resolveLlmPromptAuditFromRawStructuredOutput(row.raw_structured_output)
    }
  )
  const normalizedOutcomeType = normalizeOutcomeType(row.outcome_type, '')
  const hunyuanPromptAudit = normalizeVisualLlmAudit(normalizedPromptRow)
  const diagnosisDirections = Array.isArray(runtimeSnapshot?.diagnosisDirections)
    ? runtimeSnapshot.diagnosisDirections
    : []
  const directionLabels = diagnosisDirections
    .map(item => String(item?.label || item?.directionKey || '').trim())
    .filter(Boolean)
  const observedEvidenceSet = Array.isArray(runtimeSnapshot?.observedEvidenceSet)
    ? runtimeSnapshot.observedEvidenceSet
    : []
  const derivedEvidenceSet = Array.isArray(runtimeSnapshot?.derivedEvidenceSet)
    ? runtimeSnapshot.derivedEvidenceSet
    : []
  const _questionQueue = runtimeSnapshot?.questionQueue || null
  const questionCountSummary = resolveQuestionCountSummary(row, runtimeSnapshot)
  const stopReason = normalizeStoredNullableText(
    runtimeSnapshot?.stopReason || runtimeSnapshot?.stopState?.stopReason,
    ''
  )
  const routeDecision = resolveRouteDecisionFromSnapshot(runtimeSnapshot)
  const routeDecisionSummary = buildRouteDecisionReviewSummary(routeDecision, stopReason)
  const routePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    row.current_route_primary_action || runtimeSnapshot?.routePrimaryAction || '',
    ''
  )
  const displayName = resolveDisplayName({
    outcomeType: normalizedOutcomeType,
    finalProblemCn: row.final_problem_cn || '',
    finalProblemKey: row.final_problem_key || '',
    outcomePayload,
    routeDecisionSummary
  })
  const imagePreview = resolveReplayPreviewImage(row)
  const feedbackSummary = buildFeedbackSummary(row)
  const roundIndex = Math.max(
    1,
    Number(row.current_round_index || 0),
    Number(row.follow_up_round || 0)
  )

  return {
    diagnosisSessionId: row.diagnosis_id || '',
    resultId: toResultId(row.diagnosis_id || '', roundIndex),
    userPlantId: row.user_plant_id || null,
    plantCatalogId: normalizeStoredNullableText(row.plant_id, null),
    plantIdentityId: normalizeStoredNullableText(row.current_plant_identity_id, ''),
    latestVisualCallBatchId: normalizeStoredNullableText(row.latest_visual_call_batch_id, null),
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
    outcomeType: normalizedOutcomeType,
    nonProblematicType:
      normalizedOutcomeType === 'non_problematic'
        ? String(outcomePayload?.nonProblematicType || '').trim()
        : '',
    nonProblematicLabel:
      normalizedOutcomeType === 'non_problematic'
        ? String(outcomePayload?.nonProblematicLabel || '').trim()
        : '',
    problemId:
      normalizedOutcomeType === 'problematic'
        ? toPublicProblemId(row.final_problem_key || '')
        : '',
    problemKey:
      normalizedOutcomeType === 'problematic'
        ? String(row.final_problem_key || '').trim()
        : '',
    displayName,
    summary: normalizeStoredNullableText(row.ai_summary, ''),
    routePrimaryAction,
    stopReason,
    sessionStatus: String(row.session_status || '').trim(),
    identityResolutionStatus: String(row.current_identity_resolution_status || '').trim(),
    followUpRound: Number(row.follow_up_round || 0),
    currentRoundIndex: Number(row.current_round_index || 0),
    imageCount: Number(row.image_count || 0),
    previewVisualRawImageRecordId: String(row.preview_visual_raw_image_record_id || '').trim(),
    previewImageRef: imagePreview.previewImageRef,
    hasReplayImage: imagePreview.hasReplayImage,
    imageState: imagePreview.imageState,
    hunyuanPromptAudit,
    // 兼容前端列表直接消费的平铺字段（避免再次手工拆 nested 字段）
    llmPromptText: String(normalizedPromptRow.llm_prompt_text || '').trim(),
    llmPromptPreview: String(normalizedPromptRow.llm_prompt_preview || '').trim(),
    llmPromptLength: Number(normalizedPromptRow.llm_prompt_length || 0),
    llmPromptVersion: String(
      normalizedPromptRow.llm_prompt_version || normalizedPromptRow.prompt_version || ''
    ).trim(),
    llmSourceModelProvider: String(normalizedPromptRow.llm_source_model_provider || '').trim(),
    llmSourceModelName: String(normalizedPromptRow.llm_source_model_name || '').trim(),
    promptTokens: Number(hunyuanPromptAudit?.usage?.promptTokens || 0),
    completionTokens: Number(hunyuanPromptAudit?.usage?.completionTokens || 0),
    totalTokens: Number(hunyuanPromptAudit?.usage?.totalTokens || 0),
    promptCacheHitTokens: Number(hunyuanPromptAudit?.usage?.promptCacheHitTokens || 0),
    promptCacheMissTokens: Number(hunyuanPromptAudit?.usage?.promptCacheMissTokens || 0),
    promptCacheCreationInputTokens: Number(
      hunyuanPromptAudit?.usage?.promptCacheCreationInputTokens || 0
    ),
    promptCacheHitRatio: Number(hunyuanPromptAudit?.usage?.promptCacheHitRatio || 0),
    promptCacheStatus: hunyuanPromptAudit?.promptCacheStatus || null,
    qwenCacheStatus: hunyuanPromptAudit?.qwenCacheStatus || null,
    feedbackSummary,
    observedEvidenceCount: observedEvidenceSet.length,
    derivedEvidenceCount: derivedEvidenceSet.length,
    diagnosisDirectionCount: diagnosisDirections.length,
    diagnosisDirectionLabels: directionLabels,
    symptomClass: buildSymptomClassRuntimeReviewPayload(runtimeSnapshot?.symptomClassRuntime || null),
    questionCountSummary,
    reviewSourceType: String(row.review_source_type || '').trim() || 'legacy',
    clientPlatform: String(row.client_platform || '').trim(),
    reviewSourceEvidence: String(row.review_source_evidence || '').trim(),
    batchReviewMeta:
      String(row.review_source_type || '').trim() === 'batch'
        ? {
            batchSource: String(row.batch_source || '').trim(),
            sampleLabel: String(row.batch_sample_label || '').trim(),
            sampleFileName: String(row.batch_sample_file_name || '').trim(),
            sampleAbsolutePath: String(row.batch_sample_absolute_path || '').trim(),
            answerPathSignature: String(row.batch_answer_path_signature || '').trim(),
            batchGeneratedAt: String(row.batch_generated_at || '').trim()
          }
        : null,
    coreSummary: {
      routePrimaryAction,
      stopReason,
      observedEvidenceCount: observedEvidenceSet.length,
      derivedEvidenceCount: derivedEvidenceSet.length,
      diagnosisDirectionLabels: directionLabels,
      questionCountSummary,
      _questionQueue
    },
    routeDecisionSummary
  }
}

module.exports = {
  mapDiagnosisReviewRow
}
