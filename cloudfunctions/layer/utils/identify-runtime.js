'use strict'

const { models } = require('./cloudbase')

function buildRuntimeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function stringifyJson(value) {
  if (value === null || value === undefined) return null
  return JSON.stringify(value)
}

function normalizePersistedImageRef(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^data:image\//i.test(normalized)) {
    return '[inline_data_url]'
  }
  return normalized
}

function normalizeConfidence(value) {
  const score = Number(value || 0)
  if (!Number.isFinite(score)) return 0
  if (score < 0) return 0
  if (score > 1) return 1
  return score
}

function resolveQualityLevel(score) {
  if (score >= 0.85) return 'high'
  if (score >= 0.65) return 'medium'
  if (score >= 0.45) return 'marginal'
  return 'low'
}

function resolveCompletenessLevel(score, inputSlotType) {
  if (inputSlotType === 'whole_plant') {
    if (score >= 0.75) return 'high'
    if (score >= 0.5) return 'medium'
    return 'low'
  }
  if (score >= 0.7) return 'medium'
  if (score >= 0.45) return 'low'
  return 'unknown'
}

function resolveRoutePrimaryAction({ taxonomyMatchStatus, confidence }) {
  if (taxonomyMatchStatus === 'matched') {
    return 'standard_flow'
  }
  if (taxonomyMatchStatus === 'weak_matched') {
    return confidence >= 0.6 ? 'ask_first' : 'retake_first'
  }
  return confidence >= 0.55 ? 'ask_first' : 'retake_first'
}

function buildRouteHints({ taxonomyMatchStatus, confidence, candidateCount }) {
  if (taxonomyMatchStatus === 'matched') {
    return [
      {
        type: 'identity_confirmed',
        reason: 'taxonomy_strong_match'
      }
    ]
  }

  if (taxonomyMatchStatus === 'weak_matched') {
    return [
      {
        type: 'host_confirmation',
        reason: candidateCount > 1 ? 'multiple_weak_candidates' : 'single_weak_candidate',
        confidence
      }
    ]
  }

  return [
    {
      type: confidence >= 0.55 ? 'host_confirmation' : 'retake_image',
      reason: 'taxonomy_unresolved',
      confidence
    }
  ]
}

function resolveAdmissionResult(taxonomyMatchStatus) {
  if (taxonomyMatchStatus === 'matched') return 'formally_admitted'
  if (taxonomyMatchStatus === 'weak_matched') return 'candidate_retained'
  return 'explanation_retained'
}

function resolveTargetLayer(taxonomyMatchStatus) {
  if (taxonomyMatchStatus === 'matched') return 'identity_resolution'
  if (taxonomyMatchStatus === 'weak_matched') return 'identity_candidate'
  return 'explanation_only'
}

function buildMatchRule(candidate) {
  if (!candidate) return null
  const score = Number(candidate.matchScore || 0)
  const aliasType = String(candidate.matchType || '').trim()

  if (score >= 4) return `alias_exact:${aliasType || 'alias'}`
  if (score >= 3) return aliasType ? `field_exact:${aliasType}` : 'field_exact'
  if (score >= 2) return `alias_fuzzy:${aliasType || 'alias'}`
  if (score >= 1) return aliasType ? `field_fuzzy:${aliasType}` : 'field_fuzzy'
  return null
}

function buildMatchReason({ taxonomyMatchStatus, candidate }) {
  if (!candidate) {
    return 'Taxonomy 未形成稳定命中，当前仅保留原始识别名与候选上下文。'
  }

  const alias = String(candidate.matchAlias || '').trim()
  const canonicalName = String(candidate.canonicalName || '').trim()
  const score = Number(candidate.matchScore || 0)

  if (taxonomyMatchStatus === 'matched') {
    return alias
      ? `Taxonomy 强命中：候选“${canonicalName}”由别名“${alias}”稳定归一，score=${score}。`
      : `Taxonomy 强命中：候选“${canonicalName}”形成稳定归一，score=${score}。`
  }

  return alias
    ? `Taxonomy 弱命中：候选“${canonicalName}”与别名“${alias}”存在弱匹配，仅保留为候选，score=${score}。`
    : `Taxonomy 弱命中：候选“${canonicalName}”存在弱匹配，仅保留为候选，score=${score}。`
}

async function persistIdentifyRuntimeArtifacts({
  sessionId,
  openid,
  imageUrl,
  provider = 'baidu',
  recognizedName = '',
  recognizedType = 'plant',
  confidence = 0,
  rawPayload = null,
  candidateMatches = [],
  primaryCandidate = null,
  taxonomyMatchStatus = 'unresolved',
  identityResolutionStatus = 'unresolved',
  inputSlotType = 'unknown',
  legacyCanonicalPlantId = null
}) {
  const normalizedConfidence = normalizeConfidence(confidence)
  const visualCallBatchId = buildRuntimeId('visbatch')
  const visualRawImageRecordId = buildRuntimeId('visraw')
  const visualNormalizedImageResultId = buildRuntimeId('visnorm')
  const visualAdmissionRecordId = buildRuntimeId('visadmit')
  const identityResolutionRecordId = buildRuntimeId('idres')
  const routePrimaryAction = resolveRoutePrimaryAction({
    taxonomyMatchStatus,
    confidence: normalizedConfidence
  })
  const routeHints = buildRouteHints({
    taxonomyMatchStatus,
    confidence: normalizedConfidence,
    candidateCount: Array.isArray(candidateMatches) ? candidateMatches.length : 0
  })
  const admissionResult = resolveAdmissionResult(taxonomyMatchStatus)
  const targetLayer = resolveTargetLayer(taxonomyMatchStatus)
  const qualityLevel = resolveQualityLevel(normalizedConfidence)
  const completenessLevel = resolveCompletenessLevel(normalizedConfidence, inputSlotType)
  const primaryOrganType = inputSlotType === 'unknown' ? null : inputSlotType
  const organSource = inputSlotType === 'unknown' ? 'unknown' : 'ui_hint'
  const matchedPlantIdentityId = primaryCandidate?.plantIdentityId || null
  const matchRule = buildMatchRule(primaryCandidate)
  const matchReason = buildMatchReason({
    taxonomyMatchStatus,
    candidate: primaryCandidate
  })
  const longTailNoiseFlag = taxonomyMatchStatus === 'unresolved' && normalizedConfidence < 0.55 ? 1 : 0
  const batchStatus = taxonomyMatchStatus === 'matched' ? 'completed' : 'needs_followup'

  await models.$runSQL(
    `
      INSERT INTO visual_call_batches (
        visual_call_batch_id, _openid, session_id, trigger_source, round_id, batch_status,
        image_count, created_at, updated_at
      ) VALUES (
        {{visualCallBatchId}}, {{openid}}, {{sessionId}}, {{triggerSource}}, {{roundId}}, {{batchStatus}},
        {{imageCount}}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    {
      visualCallBatchId,
      openid,
      sessionId,
      triggerSource: 'identify_http',
      roundId: 'identify_round_1',
      batchStatus,
      imageCount: 1
    }
  )

  await models.$runSQL(
    `
      INSERT INTO visual_raw_image_records (
        visual_raw_image_record_id, _openid, session_id, visual_call_batch_id, image_ref,
        input_slot_type, input_slot_order, input_slot_label, user_declared_organ_type,
        user_declared_organ_confidence, source_model_provider, source_model_name, model_name,
        model_version, prompt_version, raw_text_output, raw_structured_output, call_status,
        latency_ms, error_code, created_at
      ) VALUES (
        {{visualRawImageRecordId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}}, {{imageRef}},
        {{inputSlotType}}, {{inputSlotOrder}}, {{inputSlotLabel}}, {{userDeclaredOrganType}},
        {{userDeclaredOrganConfidence}}, {{sourceModelProvider}}, {{sourceModelName}},
        {{modelName}}, {{modelVersion}}, {{promptVersion}}, {{rawTextOutput}},
        {{rawStructuredOutput}}, {{callStatus}}, {{latencyMs}}, {{errorCode}}, CURRENT_TIMESTAMP
      )
    `,
    {
      visualRawImageRecordId,
      openid,
      sessionId,
      visualCallBatchId,
      imageRef: normalizePersistedImageRef(imageUrl),
      inputSlotType,
      inputSlotOrder: 0,
      inputSlotLabel: '',
      userDeclaredOrganType: '',
      userDeclaredOrganConfidence: null,
      sourceModelProvider: provider,
      sourceModelName: provider,
      modelName: provider,
      modelVersion: '',
      promptVersion: null,
      rawTextOutput: recognizedName || '',
      rawStructuredOutput: stringifyJson(rawPayload),
      callStatus: 'succeeded',
      latencyMs: null,
      errorCode: null
    }
  )

  await models.$runSQL(
    `
      INSERT INTO visual_normalized_image_results (
        visual_normalized_image_result_id, _openid, session_id, visual_call_batch_id,
        visual_raw_image_record_id, source_model_provider, source_model_name,
        input_slot_order, input_slot_label, user_declared_organ_type,
        user_declared_organ_confidence, analyzability_level, clarity_level,
        subject_completeness_level, primary_organ_type, primary_organ_confidence, organ_source,
        multi_organ_detected, organ_conflict_flag, organ_resolution_reason,
        topk_symptoms_json, pattern_candidates_json, route_hints_json, route_primary_action,
        top1_stability_score, top3_stability_score, long_tail_noise_flag,
        pattern_derivation_status, created_at
      ) VALUES (
        {{visualNormalizedImageResultId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
        {{visualRawImageRecordId}}, {{sourceModelProvider}}, {{sourceModelName}},
        {{inputSlotOrder}}, {{inputSlotLabel}}, {{userDeclaredOrganType}},
        {{userDeclaredOrganConfidence}}, {{analyzabilityLevel}}, {{clarityLevel}},
        {{subjectCompletenessLevel}}, {{primaryOrganType}}, {{primaryOrganConfidence}},
        {{organSource}}, {{multiOrganDetected}}, {{organConflictFlag}},
        {{organResolutionReason}}, {{topkSymptomsJson}}, {{patternCandidatesJson}},
        {{routeHintsJson}}, {{routePrimaryAction}}, {{top1StabilityScore}},
        {{top3StabilityScore}}, {{longTailNoiseFlag}}, {{patternDerivationStatus}},
        CURRENT_TIMESTAMP
      )
    `,
    {
      visualNormalizedImageResultId,
      openid,
      sessionId,
      visualCallBatchId,
      visualRawImageRecordId,
      sourceModelProvider: provider,
      sourceModelName: provider,
      inputSlotOrder: 0,
      inputSlotLabel: '',
      userDeclaredOrganType: '',
      userDeclaredOrganConfidence: null,
      analyzabilityLevel: qualityLevel,
      clarityLevel: qualityLevel,
      subjectCompletenessLevel: completenessLevel,
      primaryOrganType,
      primaryOrganConfidence: null,
      organSource,
      multiOrganDetected: 0,
      organConflictFlag: 0,
      organResolutionReason: '',
      topkSymptomsJson: stringifyJson([]),
      patternCandidatesJson: stringifyJson([]),
      routeHintsJson: stringifyJson(routeHints),
      routePrimaryAction,
      top1StabilityScore: null,
      top3StabilityScore: null,
      longTailNoiseFlag,
      patternDerivationStatus: 'not_applicable'
    }
  )

  await models.$runSQL(
    `
      INSERT INTO visual_admission_records (
        visual_admission_record_id, _openid, session_id, visual_call_batch_id,
        visual_normalized_image_result_id, object_type, object_key, admission_result,
        admission_reason, entered_runtime, target_layer, created_at
      ) VALUES (
        {{visualAdmissionRecordId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
        {{visualNormalizedImageResultId}}, {{objectType}}, {{objectKey}}, {{admissionResult}},
        {{admissionReason}}, {{enteredRuntime}}, {{targetLayer}}, CURRENT_TIMESTAMP
      )
    `,
    {
      visualAdmissionRecordId,
      openid,
      sessionId,
      visualCallBatchId,
      visualNormalizedImageResultId,
      objectType: 'plant_identity',
      objectKey: matchedPlantIdentityId || recognizedName || null,
      admissionResult,
      admissionReason: matchReason,
      enteredRuntime: taxonomyMatchStatus === 'matched' ? 1 : 0,
      targetLayer
    }
  )

  await models.$runSQL(
    `
      INSERT INTO plant_identity_resolution_records (
        identity_resolution_record_id, _openid, session_id, visual_call_batch_id,
        raw_recognition_name, taxonomy_match_status, identity_resolution_status,
        matched_plant_identity_id, is_current_primary_identity, match_rule,
        match_score, match_reason, superseded_by_resolution_id, superseded_reason,
        superseded_at, created_at, updated_at
      ) VALUES (
        {{identityResolutionRecordId}}, {{openid}}, {{sessionId}}, {{visualCallBatchId}},
        {{rawRecognitionName}}, {{taxonomyMatchStatus}}, {{identityResolutionStatus}},
        {{matchedPlantIdentityId}}, {{isCurrentPrimaryIdentity}}, {{matchRule}},
        {{matchScore}}, {{matchReason}}, NULL, NULL,
        NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `,
    {
      identityResolutionRecordId,
      openid,
      sessionId,
      visualCallBatchId,
      rawRecognitionName: recognizedName || '',
      taxonomyMatchStatus,
      identityResolutionStatus,
      matchedPlantIdentityId,
      isCurrentPrimaryIdentity: taxonomyMatchStatus === 'matched' ? 1 : 0,
      matchRule,
      matchScore: primaryCandidate?.matchScore ?? null,
      matchReason
    }
  )

  await models.$runSQL(
    `
      INSERT INTO identify_sessions (
        identify_id, _openid, image_url, provider, recognized_name, recognized_type,
        confidence, canonical_plant_id, match_type, raw_payload, candidate_matches
      ) VALUES (
        {{identifyId}}, {{openid}}, {{imageUrl}}, {{provider}}, {{recognizedName}}, {{recognizedType}},
        {{confidence}}, NULLIF({{canonicalPlantId}}, ''), {{matchType}}, {{rawPayload}}, {{candidateMatches}}
      )
    `,
    {
      identifyId: sessionId,
      openid,
      imageUrl,
      provider,
      recognizedName,
      recognizedType,
      confidence: normalizedConfidence,
      canonicalPlantId: legacyCanonicalPlantId || '',
      matchType: primaryCandidate?.matchType || null,
      rawPayload: stringifyJson(rawPayload),
      candidateMatches: stringifyJson(candidateMatches)
    }
  )

  return {
    visualCallBatchId,
    visualRawImageRecordId,
    visualNormalizedImageResultId,
    visualAdmissionRecordId,
    identityResolutionRecordId,
    taxonomyMatchStatus,
    identityResolutionStatus,
    routePrimaryAction
  }
}

module.exports = {
  persistIdentifyRuntimeArtifacts
}
