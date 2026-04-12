'use strict'

const crypto = require('crypto')
const { models } = require('/opt/utils/cloudbase')
const {
  fromProblemId,
  fromResultId,
  toResultId,
  toProblemId
} = require('../mappers/public-id-mapper')
const versionMetadata = require('../constants/versions')
const { getProblemsByKeys } = require('../repositories/problem-repository')
const { getLatestQueueBySession } = require('../repositories/question-queue-repository')
const { getLatestStopStateBySession } = require('../repositories/stop-state-repository')
const { resolveLatestVisualCallBatchId } = require('../utils/visual-batch-id')
const {
  normalizePublicObservedEvidenceSet,
  buildSnapshotPayload,
  resolveSessionIdentityStatus,
  resolveSessionRoute,
  resolveSessionStatus,
  buildOutcomePayload,
  buildRuntimeSnapshotPayload
} = require('./session-runtime-snapshot-codec')

function buildSessionId() {
  return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function buildVisualSupervisionRecordId(sessionId = '', visualAdmissionRecordId = '') {
  const hash = crypto
    .createHash('sha1')
    .update(`${String(sessionId || '').trim()}::${String(visualAdmissionRecordId || '').trim()}`)
    .digest('hex')
    .slice(0, 24)

  return `vissup_${hash}`
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function readRoundFromRationale(rationale) {
  const parsed = safeJsonParse(rationale, {}) || {}
  return Number(parsed.round || 1) || 1
}

function toNullableDecimalString(value, digits = 6) {
  if (value === null || value === undefined || value === '') return ''
  const num = Number(value)
  if (!Number.isFinite(num)) return ''
  return num.toFixed(digits)
}

function toNullableDateTimeString(value) {
  if (value === null || value === undefined || value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 19).replace('T', ' ')
}

function normalizeStoredNullableText(value, fallback = null) {
  if (value === null || value === undefined) return fallback
  const normalized = String(value).trim()
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return fallback
  }
  return normalized
}

function normalizeNullableSqlText(value) {
  return normalizeStoredNullableText(value, null)
}

function normalizeNullableSqlNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function normalizeNullableSqlInteger(value) {
  const num = normalizeNullableSqlNumber(value)
  return num === null ? null : Math.trunc(num)
}

function normalizeNullableSqlDateTime(value) {
  const normalized = toNullableDateTimeString(value)
  return normalized || null
}

function normalizePersistedImageUrl(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (/^data:image\//i.test(normalized)) {
    return '[inline_data_url]'
  }
  return normalized
}

function mapSeverityHintToLevel(severityHint = '') {
  const normalized = String(severityHint || '').trim()
  if (!normalized) return ''
  if (normalized.includes('高') || normalized.toLowerCase() === 'high') return 'high'
  if (normalized.includes('低') || normalized.toLowerCase() === 'low') return 'low'
  return 'medium'
}

function toPublicProblemId(problemValue = '') {
  const value = String(problemValue || '').trim()
  if (!value) return ''
  if (value.startsWith('p_')) return value
  return toProblemId(value)
}

function normalizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeStoredStringList(value = []) {
  if (Array.isArray(value)) {
    return normalizeStringList(value)
  }

  const parsed = safeJsonParse(value, [])
  return normalizeStringList(Array.isArray(parsed) ? parsed : [])
}

function normalizeVisualBatchTraceForSupervision(trace = null) {
  if (!trace || typeof trace !== 'object') {
    return {
      currentVisualCallBatchId: null,
      originVisualCallBatchId: null,
      supersedeApplied: 0
    }
  }

  return {
    currentVisualCallBatchId: normalizeStoredNullableText(
      trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '',
      null
    ),
    originVisualCallBatchId: normalizeStoredNullableText(
      trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '',
      null
    ),
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0
  }
}

function normalizeAnswerEffectsForSupervision(answerEffects = []) {
  return (Array.isArray(answerEffects) ? answerEffects : [])
    .map(item => ({
      mappedSymptomKey: normalizeStoredNullableText(item?.mappedSymptomKey || '', ''),
      effectType: normalizeStoredNullableText(item?.effectType || '', ''),
      questionKey: normalizeStoredNullableText(item?.questionKey || '', ''),
      optionKey: normalizeStoredNullableText(item?.optionKey || '', '')
    }))
    .filter(item => item.mappedSymptomKey && item.effectType && item.effectType !== 'neutral')
}

function resolveQuestionCorrectionScopeForSymptom(answerEffects = [], symptomKey = '') {
  const safeSymptomKey = normalizeStoredNullableText(symptomKey, '')
  if (!safeSymptomKey) {
    return 'none'
  }

  const relevantEffects = (Array.isArray(answerEffects) ? answerEffects : []).filter(
    item => item?.mappedSymptomKey === safeSymptomKey
  )
  if (!relevantEffects.length) {
    return 'none'
  }

  const touchedSymptoms = new Set(
    (Array.isArray(answerEffects) ? answerEffects : [])
      .map(item => normalizeStoredNullableText(item?.mappedSymptomKey || '', ''))
      .filter(Boolean)
  )

  return touchedSymptoms.size > 1 ? 'multiple' : 'symptom'
}

async function upsertDiagnosisSession({
  sessionId,
  openid,
  plantContext,
  response,
  round = 1,
  reliabilityScore = 0,
  mode = 'new_v13',
  image = '',
  description = ''
}) {
  const topRanking = Array.isArray(response?.rankings) ? response.rankings[0] : null
  const topProblem = response?.topProblem || null
  const topProblemRanking = (Array.isArray(response?.rankings) ? response.rankings : []).find(
    item => String(item?.problemId || '').trim() === String(topProblem?.problemId || '').trim() ||
      String(item?.problemKey || '').trim() === String(topProblem?.problemKey || '').trim()
  ) || null
  const finalResult = response?.finalResult || null
  const routePrimaryAction = resolveSessionRoute(response)
  const identityResolutionStatus = resolveSessionIdentityStatus({ plantContext, response })
  const sessionStatus = resolveSessionStatus(response)
  const outcomeType = response?.outcomeType || null
  const isProblematicOutcome = outcomeType === 'problematic'
  const shouldMarkEnded = sessionStatus === 'completed'
  const outcomePayloadJson = buildOutcomePayload(response)
  const normalizedTopProblemScore = normalizeNullableSqlNumber(
    topProblemRanking?.finalScore ?? topRanking?.finalScore
  )
  const normalizedUserPlantId = normalizeNullableSqlInteger(plantContext?.userPlantId)
  const resolvedLatestVisualCallBatchId = resolveLatestVisualCallBatchId(response, plantContext)
  const runtimeSnapshotJson = buildRuntimeSnapshotPayload({
    sessionId,
    plantContext,
    response,
    round
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_sessions (
        diagnosis_id,
        session_id,
        _openid,
        user_plant_id,
        plant_id,
        diagnosis_mode,
        plant_genus,
        plant_family,
        plant_category,
        current_plant_identity_id,
        current_identity_resolution_status,
        current_route_primary_action,
        current_round_id,
        current_round_index,
        latest_visual_call_batch_id,
        image_url,
        user_description,
        ai_summary,
        health_score,
        health_status,
        top_problem_key,
        top_problem_score,
        reliability_score,
        follow_up_round,
        needs_follow_up,
        outcome_type,
        outcome_payload_json,
        stop_reason,
        session_status,
        runtime_snapshot_json,
        final_problem_key,
        final_problem_cn,
        treatment,
        prevention,
        ended_at
      ) VALUES (
        {{diagnosisId}},
        {{sessionId}},
        {{openid}},
        CASE
          WHEN {{userPlantIdHasValue}} = 1 THEN {{userPlantIdValue}}
          ELSE NULL
        END,
        {{plantId}},
        {{diagnosisMode}},
        {{plantGenus}},
        {{plantFamily}},
        {{plantCategory}},
        {{currentPlantIdentityId}},
        {{currentIdentityResolutionStatus}},
        {{currentRoutePrimaryAction}},
        {{currentRoundId}},
        {{currentRoundIndex}},
        CASE
          WHEN {{latestVisualCallBatchIdHasValue}} = 1 THEN {{latestVisualCallBatchIdValue}}
          ELSE NULL
        END,
        {{imageUrl}},
        {{userDescription}},
        {{aiSummary}},
        NULL,
        {{healthStatus}},
        {{topProblemKey}},
        CASE
          WHEN {{topProblemScoreHasValue}} = 1 THEN {{topProblemScoreValue}}
          ELSE NULL
        END,
        {{reliabilityScore}},
        {{followUpRound}},
        {{needsFollowUp}},
        {{outcomeType}},
        {{outcomePayloadJson}},
        {{stopReason}},
        {{sessionStatus}},
        {{runtimeSnapshotJson}},
        {{finalProblemKey}},
        {{finalProblemCn}},
        {{treatment}},
        {{prevention}},
        CASE
          WHEN {{endedAtFlag}} = 1 THEN CURRENT_TIMESTAMP
          ELSE NULL
        END
      )
      ON DUPLICATE KEY UPDATE
        diagnosis_mode = VALUES(diagnosis_mode),
        user_plant_id = CASE
          WHEN {{userPlantIdHasValue}} = 1 THEN {{userPlantIdValue}}
          ELSE user_plant_id
        END,
        plant_genus = COALESCE(plant_genus, VALUES(plant_genus)),
        plant_family = COALESCE(plant_family, VALUES(plant_family)),
        plant_category = COALESCE(plant_category, VALUES(plant_category)),
        current_plant_identity_id = VALUES(current_plant_identity_id),
        current_identity_resolution_status = VALUES(current_identity_resolution_status),
        current_route_primary_action = VALUES(current_route_primary_action),
        current_round_id = VALUES(current_round_id),
        current_round_index = VALUES(current_round_index),
        latest_visual_call_batch_id = CASE
          WHEN {{latestVisualCallBatchIdHasValue}} = 1 THEN {{latestVisualCallBatchIdValue}}
          ELSE latest_visual_call_batch_id
        END,
        image_url = COALESCE(NULLIF(VALUES(image_url), ''), image_url),
        user_description = COALESCE(NULLIF(VALUES(user_description), ''), user_description),
        ai_summary = COALESCE(NULLIF(VALUES(ai_summary), ''), ai_summary),
        health_status = VALUES(health_status),
        top_problem_key = VALUES(top_problem_key),
        top_problem_score = CASE
          WHEN {{topProblemScoreHasValue}} = 1 THEN {{topProblemScoreValue}}
          ELSE NULL
        END,
        reliability_score = VALUES(reliability_score),
        follow_up_round = VALUES(follow_up_round),
        needs_follow_up = VALUES(needs_follow_up),
        outcome_type = VALUES(outcome_type),
        outcome_payload_json = VALUES(outcome_payload_json),
        stop_reason = VALUES(stop_reason),
        session_status = VALUES(session_status),
        runtime_snapshot_json = VALUES(runtime_snapshot_json),
        final_problem_key = VALUES(final_problem_key),
        final_problem_cn = VALUES(final_problem_cn),
        treatment = VALUES(treatment),
        prevention = VALUES(prevention),
        ended_at = CASE
          WHEN {{endedAtFlag}} = 1 THEN COALESCE(ended_at, CURRENT_TIMESTAMP)
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
    `,
    {
      diagnosisId: sessionId,
      sessionId,
      openid,
      userPlantIdValue: normalizedUserPlantId === null ? 0 : normalizedUserPlantId,
      userPlantIdHasValue: normalizedUserPlantId === null ? 0 : 1,
      plantId: normalizeNullableSqlText(plantContext?.plantId),
      diagnosisMode: mode,
      plantGenus: plantContext?.genus || '',
      plantFamily: plantContext?.family || '',
      plantCategory: plantContext?.category || '',
      currentPlantIdentityId: normalizeNullableSqlText(
        plantContext?.plantIdentityId || response?.plantIdentityId
      ),
      currentIdentityResolutionStatus: identityResolutionStatus,
      currentRoutePrimaryAction: routePrimaryAction,
      currentRoundId: response?.roundId || `round_${Number(round || 1)}`,
      currentRoundIndex: Number(round || 1),
      latestVisualCallBatchIdValue: resolvedLatestVisualCallBatchId || '',
      latestVisualCallBatchIdHasValue: resolvedLatestVisualCallBatchId ? 1 : 0,
      imageUrl: normalizePersistedImageUrl(image || ''),
      userDescription: description || '',
      aiSummary: finalResult?.summary || topProblem?.summary || '',
      healthStatus:
        response?.followUpRequired
          ? (topProblem ? 'warning' : 'unknown')
          : (isProblematicOutcome && topProblem ? 'warning' : 'unknown'),
      topProblemKey: topProblem?.problemId || null,
      topProblemScoreValue: normalizedTopProblemScore === null ? 0 : normalizedTopProblemScore,
      topProblemScoreHasValue: normalizedTopProblemScore === null ? 0 : 1,
      reliabilityScore: Number(reliabilityScore || 0),
      followUpRound: Number(round || 1),
      needsFollowUp: response?.followUpRequired ? 1 : 0,
      outcomeType: normalizeNullableSqlText(outcomeType),
      outcomePayloadJson,
      stopReason: normalizeNullableSqlText(response?.stopReason),
      sessionStatus,
      runtimeSnapshotJson,
      finalProblemKey: normalizeNullableSqlText(
        !response?.followUpRequired && isProblematicOutcome
          ? (finalResult?.problemId || topProblem?.problemId)
          : null
      ),
      finalProblemCn: normalizeNullableSqlText(
        !response?.followUpRequired
          ? (finalResult?.displayName || topProblem?.displayName)
          : null
      ),
      treatment: response?.resultExplanation?.firstAid || '',
      prevention: response?.resultExplanation?.avoid || '',
      endedAtFlag: shouldMarkEnded ? 1 : 0
    }
  )
}

async function replaceObservedSymptoms(sessionId, observedSymptoms = []) {
  await models.$runSQL(
    'DELETE FROM diagnosis_symptom_observations WHERE diagnosis_id = {{diagnosisId}}',
    { diagnosisId: sessionId }
  )

  const list = (Array.isArray(observedSymptoms) ? observedSymptoms : []).filter(item => item?.symptomKey)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{symptomKey_${index}}},
    {{symptomCn_${index}}},
    {{source_${index}}},
    1,
    {{confidence_${index}}}
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn || item.symptomKey
    params[`source_${index}`] = item.source || 'mixed'
    params[`confidence_${index}`] = Number(item.confidence || 0)
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_symptom_observations (
        diagnosis_id,
        symptom_key,
        symptom_cn,
        evidence_source,
        observed,
        confidence
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function replaceObservedEvidenceSet(sessionId, openid, observedEvidenceSet = []) {
  await models.$runSQL(
    'DELETE FROM observed_evidence_set WHERE session_id = {{sessionId}} AND _openid = {{openid}}',
    { sessionId, openid: String(openid || '') }
  )

  const list = normalizePublicObservedEvidenceSet(observedEvidenceSet)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{observedEvidenceSetId_${index}}},
    {{openid}},
    {{sessionId}},
    {{diagnosisId}},
    {{evidenceKey_${index}}},
    {{evidenceType_${index}}},
    {{symptomKey_${index}}},
    {{symptomCn_${index}}},
    {{confidence_${index}}},
    {{sourceType_${index}}},
    {{currentStatus_${index}}},
    {{targetLayer_${index}}},
    {{parentEvidenceKey_${index}}},
    {{sourceRecordId_${index}}},
    {{originVisualCallBatchId_${index}}},
    {{supersededByBatchId_${index}}},
    {{independenceGroupIdsJson_${index}}},
    {{conflictEvidenceKeysJson_${index}}},
    {{conflictLevel_${index}}},
    {{conflictResolved_${index}}},
    {{firstSeenStage_${index}}},
    COALESCE({{lastUpdatedAt_${index}}}, CURRENT_TIMESTAMP),
    {{enteredRuntime_${index}}},
    {{isKeyEvidence_${index}}},
    {{enteredExplanation_${index}}},
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`)

  const params = {
    openid: String(openid || ''),
    sessionId,
    diagnosisId: sessionId
  }

  list.forEach((item, index) => {
    params[`observedEvidenceSetId_${index}`] = item.observedEvidenceSetId
    params[`evidenceKey_${index}`] = item.evidenceKey
    params[`evidenceType_${index}`] = item.evidenceType || 'symptom'
    params[`symptomKey_${index}`] = item.symptomKey
    params[`symptomCn_${index}`] = item.symptomCn || item.symptomKey
    params[`confidence_${index}`] = normalizeNullableSqlNumber(item.confidence)
    params[`sourceType_${index}`] = item.sourceType || ''
    params[`currentStatus_${index}`] = item.currentStatus || 'active'
    params[`targetLayer_${index}`] = item.targetLayer || 'observed_evidence_set'
    params[`parentEvidenceKey_${index}`] = normalizeNullableSqlText(item.parentEvidenceKey)
    params[`sourceRecordId_${index}`] = normalizeNullableSqlText(item.sourceRecordId)
    params[`originVisualCallBatchId_${index}`] = normalizeNullableSqlText(item.originVisualCallBatchId)
    params[`supersededByBatchId_${index}`] = normalizeNullableSqlText(item.supersededByBatchId)
    params[`independenceGroupIdsJson_${index}`] = JSON.stringify(item.independenceGroupIds || [])
    params[`conflictEvidenceKeysJson_${index}`] = JSON.stringify(item.conflictEvidenceKeys || [])
    params[`conflictLevel_${index}`] = normalizeNullableSqlText(item.conflictLevel)
    params[`conflictResolved_${index}`] = Number(item.conflictResolved || 0) ? 1 : 0
    params[`firstSeenStage_${index}`] = normalizeNullableSqlText(item.firstSeenStage)
    params[`lastUpdatedAt_${index}`] = normalizeNullableSqlDateTime(item.lastUpdatedAt)
    params[`enteredRuntime_${index}`] = Number(item.enteredRuntime || 0) ? 1 : 0
    params[`isKeyEvidence_${index}`] = Number(item.isKeyEvidence || 0) ? 1 : 0
    params[`enteredExplanation_${index}`] = Number(item.enteredExplanation || 0) ? 1 : 0
  })

  await models.$runSQL(
    `
      INSERT INTO observed_evidence_set (
        observed_evidence_set_id,
        _openid,
        session_id,
        diagnosis_id,
        evidence_key,
        evidence_type,
        symptom_key,
        symptom_cn,
        confidence,
        source_type,
        current_status,
        target_layer,
        parent_evidence_key,
        source_record_id,
        origin_visual_call_batch_id,
        superseded_by_batch_id,
        independence_group_ids_json,
        conflict_evidence_keys_json,
        conflict_level,
        conflict_resolved,
        first_seen_stage,
        last_updated_at,
        entered_runtime,
        is_key_evidence,
        entered_explanation,
        created_at,
        updated_at
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function getVisualAdmissionRowsBySession(sessionId = '') {
  const result = await models.$runSQL(
    `
      SELECT
        visual_admission_record_id,
        visual_call_batch_id,
        object_type,
        object_key,
        admission_result,
        target_layer
      FROM visual_admission_records
      WHERE session_id = {{sessionId}}
      ORDER BY created_at ASC, visual_admission_record_id ASC
    `,
    { sessionId }
  )

  return result?.data?.executeResultList || []
}

async function upsertVisualSupervisionRecords({
  sessionId,
  openid,
  response
} = {}) {
  const admissionRows = await getVisualAdmissionRowsBySession(sessionId)
  if (!admissionRows.length) {
    return
  }

  const observedEvidenceSet = normalizePublicObservedEvidenceSet(response?.observedEvidenceSet || [])
  const activeEvidenceItems = observedEvidenceSet.filter(item =>
    ['active', 'retained'].includes(String(item?.currentStatus || 'active').trim().toLowerCase())
  )
  const activeAdmissionIds = new Set(
    activeEvidenceItems
      .map(item => normalizeStoredNullableText(item?.sourceRecordId || '', ''))
      .filter(Boolean)
  )
  const activeSymptomKeys = new Set(
    activeEvidenceItems
      .map(item => normalizeStoredNullableText(item?.symptomKey || '', ''))
      .filter(Boolean)
  )
  const answerEffects = normalizeAnswerEffectsForSupervision(response?.answerEffects || [])
  const touchedSymptomKeys = new Set(answerEffects.map(item => item.mappedSymptomKey))
  const negativeSymptomKeys = new Set(
    answerEffects
      .filter(item => item.effectType === 'negative')
      .map(item => item.mappedSymptomKey)
  )
  const trace = normalizeVisualBatchTraceForSupervision(response?.visualBatchTrace)
  const currentVisualCallBatchId = resolveLatestVisualCallBatchId(response, trace)
  const hasFinalDecision = !response?.followUpRequired && Boolean(
    normalizeStoredNullableText(response?.outcomeType || '', '') ||
      normalizeStoredNullableText(response?.stopReason || '', '') ||
      normalizeStoredNullableText(response?.sessionStatus || '', '') === 'completed'
  )

  const supervisionRows = admissionRows.map(item => {
    const visualAdmissionRecordId = normalizeStoredNullableText(item?.visual_admission_record_id || '', '')
    const visualCallBatchId = normalizeStoredNullableText(item?.visual_call_batch_id || '', '')
    const symptomKey = normalizeStoredNullableText(item?.object_key || '', '')
    const adoptedByEvidence = Number(
      activeAdmissionIds.has(visualAdmissionRecordId) ||
      (symptomKey && activeSymptomKeys.has(symptomKey))
    )
      ? 1
      : 0
    const correctedByQuestion = Number(symptomKey && touchedSymptomKeys.has(symptomKey)) ? 1 : 0
    const supersededByRetake = Number(
      trace.supersedeApplied &&
      currentVisualCallBatchId &&
      visualCallBatchId &&
      visualCallBatchId !== currentVisualCallBatchId
    )
      ? 1
      : 0
    const deniedByRuntime = adoptedByEvidence
      ? 0
      : Number((symptomKey && negativeSymptomKeys.has(symptomKey)) || supersededByRetake)
        ? 1
        : 0
    const deniedByOutcomeCompetition =
      adoptedByEvidence || deniedByRuntime || !hasFinalDecision ? 0 : 1

    return {
      visualSupervisionRecordId: buildVisualSupervisionRecordId(sessionId, visualAdmissionRecordId),
      openid: String(openid || ''),
      sessionId,
      visualCallBatchId,
      visualAdmissionRecordId,
      adoptedByEvidence,
      correctedByQuestion,
      deniedByRuntime,
      deniedByOutcomeCompetition,
      questionCorrectionScope: resolveQuestionCorrectionScopeForSymptom(
        answerEffects,
        symptomKey
      ),
      finalOutcomeType: normalizeNullableSqlText(response?.outcomeType),
      finalStopReason: normalizeNullableSqlText(response?.stopReason)
    }
  })
    .filter(item => item.visualAdmissionRecordId)

  if (!supervisionRows.length) {
    return
  }

  const values = supervisionRows.map((_, index) => `(
    {{visualSupervisionRecordId_${index}}},
    {{openid_${index}}},
    {{sessionId_${index}}},
    {{visualCallBatchId_${index}}},
    {{visualAdmissionRecordId_${index}}},
    {{adoptedByEvidence_${index}}},
    {{correctedByQuestion_${index}}},
    {{deniedByRuntime_${index}}},
    {{deniedByOutcomeCompetition_${index}}},
    {{questionCorrectionScope_${index}}},
    {{finalOutcomeType_${index}}},
    {{finalStopReason_${index}}},
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )`)

  const params = {}
  supervisionRows.forEach((item, index) => {
    params[`visualSupervisionRecordId_${index}`] = item.visualSupervisionRecordId
    params[`openid_${index}`] = item.openid
    params[`sessionId_${index}`] = item.sessionId
    params[`visualCallBatchId_${index}`] = item.visualCallBatchId
    params[`visualAdmissionRecordId_${index}`] = item.visualAdmissionRecordId
    params[`adoptedByEvidence_${index}`] = item.adoptedByEvidence
    params[`correctedByQuestion_${index}`] = item.correctedByQuestion
    params[`deniedByRuntime_${index}`] = item.deniedByRuntime
    params[`deniedByOutcomeCompetition_${index}`] = item.deniedByOutcomeCompetition
    params[`questionCorrectionScope_${index}`] = item.questionCorrectionScope
    params[`finalOutcomeType_${index}`] = item.finalOutcomeType
    params[`finalStopReason_${index}`] = item.finalStopReason
  })

  await models.$runSQL(
    `
      INSERT INTO visual_supervision_records (
        visual_supervision_record_id,
        _openid,
        session_id,
        visual_call_batch_id,
        visual_admission_record_id,
        adopted_by_evidence,
        corrected_by_question,
        denied_by_runtime,
        denied_by_outcome_competition,
        question_correction_scope,
        final_outcome_type,
        final_stop_reason,
        created_at,
        updated_at
      ) VALUES ${values.join(', ')}
      ON DUPLICATE KEY UPDATE
        _openid = VALUES(_openid),
        visual_call_batch_id = VALUES(visual_call_batch_id),
        adopted_by_evidence = VALUES(adopted_by_evidence),
        corrected_by_question = VALUES(corrected_by_question),
        denied_by_runtime = VALUES(denied_by_runtime),
        denied_by_outcome_competition = VALUES(denied_by_outcome_competition),
        question_correction_scope = VALUES(question_correction_scope),
        final_outcome_type = VALUES(final_outcome_type),
        final_stop_reason = VALUES(final_stop_reason),
        updated_at = CURRENT_TIMESTAMP
    `,
    params
  )
}

async function replaceProblemRankings(sessionId, rankings = []) {
  await models.$runSQL(
    'DELETE FROM diagnosis_problem_rankings WHERE diagnosis_id = {{diagnosisId}}',
    { diagnosisId: sessionId }
  )

  const list = (Array.isArray(rankings) ? rankings : []).filter(item => item?.problemKey)
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{problemKey_${index}}},
    {{problemCn_${index}}},
    '',
    {{hostCompatibility_${index}}},
    {{supportScore_${index}}},
    {{evidenceCount_${index}}},
    {{weightedScore_${index}}},
    {{rankNo_${index}}},
    0
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`problemKey_${index}`] = item.problemKey
    params[`problemCn_${index}`] = item.problemCn || item.problemKey
    params[`hostCompatibility_${index}`] = Number(item.hostCompatibility || 0)
    params[`supportScore_${index}`] = Number(item.totalEvidence || 0)
    params[`evidenceCount_${index}`] = 0
    params[`weightedScore_${index}`] = Number(item.finalScore || 0)
    params[`rankNo_${index}`] = Number(item.rankNo || index + 1)
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_problem_rankings (
        diagnosis_id,
        problem_key,
        problem_cn,
        problem_type,
        host_compatibility,
        symptom_support_score,
        evidence_count,
        weighted_score,
        rank_no,
        is_decisive
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function appendFollowUpQuestions(sessionId, round, questions = []) {
  const list = (Array.isArray(questions) ? questions : []).filter(
    item => item?.questionKey && item?.targetSymptomKey
  )
  if (!list.length) return

  const values = list.map((item, index) => `(
    {{diagnosisId}},
    {{questionOrder_${index}}},
    {{questionKey_${index}}},
    {{questionText_${index}}},
    {{rationale_${index}}},
    0,
    0,
    'pending'
  )`)

  const params = { diagnosisId: sessionId }
  list.forEach((item, index) => {
    params[`questionOrder_${index}`] = Number(index + 1)
    params[`questionKey_${index}`] = item.targetSymptomKey
    params[`questionText_${index}`] = item.text || item.questionText || ''
    params[`rationale_${index}`] = JSON.stringify({
      questionKey: item.questionKey || '',
      targetSymptomKey: item.targetSymptomKey || '',
      questionGroupKey: item.questionGroupKey || '',
      round: Number(round || 1)
    })
  })

  await models.$runSQL(
    `
      INSERT INTO diagnosis_follow_ups (
        diagnosis_id,
        question_order,
        symptom_key,
        question_text,
        rationale,
        information_gain,
        asked,
        status
      ) VALUES ${values.join(', ')}
    `,
    params
  )
}

async function markFollowUpAnswers(sessionId, answers = []) {
  const list = (Array.isArray(answers) ? answers : []).filter(item => item?.questionKey && item?.optionKey)
  for (const answer of list) {
    const optionKey = String(answer.optionKey || '').toLowerCase()
    const status = optionKey === 'yes'
      ? 'confirmed'
      : optionKey === 'no'
        ? 'rejected'
        : 'skipped'

    const answerValue = optionKey === 'yes' ? 'yes' : optionKey === 'no' ? 'no' : 'unknown'

    const followUp = await models.$runSQL(
      `
        SELECT id, symptom_key, rationale
        FROM diagnosis_follow_ups
        WHERE diagnosis_id = {{diagnosisId}}
        ORDER BY id ASC
      `,
      {
        diagnosisId: sessionId
      }
    )

    const matchedRow = (followUp?.data?.executeResultList || []).find(row => {
      const rationale = safeJsonParse(row.rationale, {}) || {}
      return String(rationale.questionKey || '').trim() === String(answer.questionKey || '').trim()
    })

    if (!matchedRow?.symptom_key) {
      continue
    }

    await models.$runSQL(
      `
        UPDATE diagnosis_follow_ups
        SET
          asked = 1,
          answer_value = {{answerValue}},
          answer_confidence = 1,
          status = {{status}},
          answered_at = CURRENT_TIMESTAMP
        WHERE diagnosis_id = {{diagnosisId}}
          AND symptom_key = {{symptomKey}}
          AND asked = 0
        ORDER BY id DESC
        LIMIT 1
      `,
      {
        diagnosisId: sessionId,
        symptomKey: matchedRow.symptom_key,
        answerValue,
        status
      }
    )
  }
}

async function validateFollowUpAnswerOwnership(sessionId, answers = [], answerRound = 1) {
  const normalizedAnswers = (Array.isArray(answers) ? answers : [])
    .map(item => String(item?.questionKey || '').trim())
    .filter(Boolean)

  if (!normalizedAnswers.length) {
    return {
      ok: false,
      reason: 'missing_answers',
      invalidQuestionKeys: []
    }
  }

  const result = await models.$runSQL(
    `
      SELECT symptom_key, rationale, asked
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    { diagnosisId: sessionId }
  )

  const allowed = new Set()
  for (const row of result?.data?.executeResultList || []) {
    const round = readRoundFromRationale(row.rationale)
    const rationale = safeJsonParse(row.rationale, {}) || {}
    const questionKey = String(rationale.questionKey || '').trim()
    if (
      round === Number(answerRound || 1) &&
      questionKey &&
      Number(row.asked || 0) === 0
    ) {
      allowed.add(questionKey)
    }
  }

  const invalidQuestionKeys = normalizedAnswers.filter(key => !allowed.has(key))

  return {
    ok: invalidQuestionKeys.length === 0,
    reason: invalidQuestionKeys.length ? 'question_not_in_session_round' : '',
    invalidQuestionKeys
  }
}

async function getSessionState(openid, sessionId) {
  const sessionResult = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        session_id,
        user_plant_id,
        plant_id,
        plant_genus,
        plant_family,
        plant_category,
        current_plant_identity_id,
        current_identity_resolution_status,
        current_route_primary_action,
        current_round_id,
        current_round_index,
        latest_visual_call_batch_id,
        outcome_type,
        session_status,
        needs_follow_up,
        follow_up_round,
        runtime_snapshot_json,
        created_at,
        updated_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: sessionId, openid }
  )

  const session = sessionResult?.data?.executeResultList?.[0]
  if (!session) return null
  const runtimeSnapshot = safeJsonParse(session.runtime_snapshot_json, {}) || {}
  const persistedObservedEvidenceSet = await getObservedEvidenceSetBySession(sessionId, openid)
  const [persistedQuestionQueue, persistedStopStateBundle] = await Promise.all([
    getLatestQueueBySession(sessionId, openid),
    getLatestStopStateBySession(sessionId, openid)
  ])

  const followUpResult = await models.$runSQL(
    `
      SELECT
        symptom_key,
        status,
        asked,
        rationale,
        question_order,
        answer_value
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY id ASC
    `,
    { diagnosisId: sessionId }
  )

  const askedQuestionKeys = []
  const unknownStreakByGroup = {}
  let maxRound = 1

  for (const row of followUpResult?.data?.executeResultList || []) {
    const rationale = safeJsonParse(row.rationale, {}) || {}
    const questionKey = String(rationale.questionKey || row.symptom_key || '').trim()
    if (Number(row.asked || 0) === 1 && questionKey) {
      askedQuestionKeys.push(questionKey)
    }
    const groupKey = rationale.questionGroupKey || '__default__'
    const round = Number(rationale.round || 1)
    if (round > maxRound) maxRound = round

    const answered = Number(row.asked || 0) === 1
    if (!answered) continue

    if (String(row.status || '').toLowerCase() === 'skipped') {
      unknownStreakByGroup[groupKey] = Number(unknownStreakByGroup[groupKey] || 0) + 1
    } else {
      unknownStreakByGroup[groupKey] = 0
    }
  }

  return {
    sessionId,
    userPlantId: session.user_plant_id || null,
    plantId: normalizeStoredNullableText(session.plant_id, null),
    plantContext: {
      userPlantId: session.user_plant_id || null,
      plantId: normalizeStoredNullableText(session.plant_id, null),
      plantIdentityId: normalizeStoredNullableText(session.current_plant_identity_id, ''),
      identityResolutionStatus: normalizeStoredNullableText(session.current_identity_resolution_status, ''),
      latestVisualCallBatchId: resolveLatestVisualCallBatchId(
        session.latest_visual_call_batch_id,
        runtimeSnapshot
      ),
      genus: session.plant_genus || '',
      family: session.plant_family || '',
      category: session.plant_category || ''
    },
    runtimeSnapshot,
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary: runtimeSnapshot?.visualAggregateSummary || null,
    shadowCompareSummary:
      runtimeSnapshot?.shadowCompareSummary ||
      runtimeSnapshot?.visualAggregateSummary?.shadowCompareSummary ||
      null,
    questionQueue: persistedQuestionQueue || runtimeSnapshot?.questionQueue || null,
    stopState: persistedStopStateBundle?.stopState || runtimeSnapshot?.stopState || null,
    outputEligibility:
      persistedStopStateBundle?.outputEligibility ||
      runtimeSnapshot?.outputEligibility ||
      null,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : [],
    observedEvidenceSet:
      persistedObservedEvidenceSet.length
        ? persistedObservedEvidenceSet
        : normalizePublicObservedEvidenceSet(runtimeSnapshot?.observedEvidenceSet),
    plantIdentityId: normalizeStoredNullableText(session.current_plant_identity_id, ''),
    identityResolutionStatus: normalizeStoredNullableText(session.current_identity_resolution_status, ''),
    routePrimaryAction: normalizeStoredNullableText(session.current_route_primary_action, ''),
    currentRoundId: normalizeStoredNullableText(session.current_round_id, ''),
    currentRoundIndex: Number(session.current_round_index || 0),
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      session.latest_visual_call_batch_id,
      runtimeSnapshot
    ),
    outcomeType: normalizeStoredNullableText(session.outcome_type, ''),
    sessionStatus: normalizeStoredNullableText(session.session_status, ''),
    askedQuestionKeys: Array.from(new Set(askedQuestionKeys)),
    unknownCountByGroup: unknownStreakByGroup,
    nextRound: Math.max(maxRound + 1, Number(session.follow_up_round || 1) + 1),
    hasPendingFollowUp: Number(session.needs_follow_up || 0) === 1
  }
}

async function getObservedSymptomsBySession(sessionId) {
  const result = await models.$runSQL(
    `
      SELECT symptom_key, symptom_cn, confidence, evidence_source
      FROM diagnosis_symptom_observations
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY confidence DESC, id ASC
    `,
    { diagnosisId: sessionId }
  )

  return (result?.data?.executeResultList || []).map(row => ({
    symptomKey: row.symptom_key,
    symptomCn: row.symptom_cn || row.symptom_key,
    confidence: Number(row.confidence || 0),
    source: row.evidence_source || 'history'
  }))
}

async function getObservedEvidenceSetBySession(sessionId, openid = '') {
  const conditions = ['session_id = {{sessionId}}']
  const params = { sessionId }

  if (String(openid || '').trim()) {
    conditions.push('_openid = {{openid}}')
    params.openid = String(openid || '')
  }

  const result = await models.$runSQL(
    `
      SELECT
        observed_evidence_set_id,
        evidence_key,
        evidence_type,
        symptom_key,
        symptom_cn,
        confidence,
        source_type,
        current_status,
        target_layer,
        parent_evidence_key,
        source_record_id,
        origin_visual_call_batch_id,
        superseded_by_batch_id,
        independence_group_ids_json,
        conflict_evidence_keys_json,
        conflict_level,
        conflict_resolved,
        first_seen_stage,
        last_updated_at,
        entered_runtime,
        entered_explanation,
        is_key_evidence
      FROM observed_evidence_set
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_key_evidence DESC, confidence DESC, created_at ASC, observed_evidence_set_id ASC
    `,
    params
  )

  return normalizePublicObservedEvidenceSet(result?.data?.executeResultList || [])
}

async function getFollowUpSnapshotRows(sessionId) {
  const result = await models.$runSQL(
    `
      SELECT
        question_order,
        question_text,
        answer_value,
        status
      FROM diagnosis_follow_ups
      WHERE diagnosis_id = {{diagnosisId}}
      ORDER BY question_order ASC, id ASC
    `,
    { diagnosisId: sessionId }
  )

  return (result?.data?.executeResultList || []).map(row => ({
    questionOrder: Number(row.question_order || 0),
    questionText: row.question_text || '',
    answerValue: row.answer_value || '',
    status: row.status || 'pending'
  }))
}

async function saveFinalDiagnosisSnapshot({
  sessionId,
  openid,
  plantContext,
  response
} = {}) {
  const followUps = await getFollowUpSnapshotRows(sessionId)
  const snapshot = buildSnapshotPayload({
    sessionId,
    plantContext,
    response,
    followUps
  })

  try {
    await models.$runSQL(
      `
        INSERT INTO diagnosis_result_snapshots (
          diagnosis_id,
          _openid,
          snapshot_json,
          diagnosis_engine_version,
          data_bundle_version,
          question_system_version,
          result_explanation_version,
          legacy_adapter_version
        ) VALUES (
          {{diagnosisId}},
          {{openid}},
          {{snapshotJson}},
          {{diagnosisEngineVersion}},
          {{dataBundleVersion}},
          {{questionSystemVersion}},
          {{resultExplanationVersion}},
          {{legacyAdapterVersion}}
        )
        ON DUPLICATE KEY UPDATE
          snapshot_json = VALUES(snapshot_json),
          diagnosis_engine_version = VALUES(diagnosis_engine_version),
          data_bundle_version = VALUES(data_bundle_version),
          question_system_version = VALUES(question_system_version),
          result_explanation_version = VALUES(result_explanation_version),
          legacy_adapter_version = VALUES(legacy_adapter_version),
          updated_at = CURRENT_TIMESTAMP
      `,
      {
        diagnosisId: sessionId,
        openid,
        snapshotJson: JSON.stringify(snapshot),
        diagnosisEngineVersion: versionMetadata.diagnosisEngineVersion,
        dataBundleVersion: versionMetadata.dataBundleVersion,
        questionSystemVersion: versionMetadata.questionSystemVersion,
        resultExplanationVersion: versionMetadata.resultExplanationVersion,
        legacyAdapterVersion: versionMetadata.legacyAdapterVersion
      }
    )
  } catch (error) {
    console.warn('写入 diagnosis_result_snapshots 失败（已降级忽略）:', error.message)
  }
}

async function getFinalDiagnosisSnapshot(openid, sessionId) {
  try {
    const result = await models.$runSQL(
      `
        SELECT snapshot_json
        FROM diagnosis_result_snapshots
        WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
        LIMIT 1
      `,
      { diagnosisId: sessionId, openid }
    )

    const snapshotText = result?.data?.executeResultList?.[0]?.snapshot_json
    const snapshot = safeJsonParse(snapshotText, null)
    return snapshot && typeof snapshot === 'object' ? snapshot : null
  } catch (error) {
    console.warn('读取 diagnosis_result_snapshots 失败（已降级忽略）:', error.message)
    return null
  }
}

async function listDiagnosisHistory(openid, { userPlantId = null, plantId = null, page = 1, pageSize = 20 } = {}) {
  const limit = Math.max(1, Number(pageSize || 20))
  const currentPage = Math.max(1, Number(page || 1))
  const offset = (currentPage - 1) * limit

  const conditions = ['_openid = {{openid}}']
  const params = { openid, limit, offset }
  const resolvedUserPlantId = userPlantId || plantId || null

  if (resolvedUserPlantId) {
    conditions.push('user_plant_id = {{userPlantId}}')
    params.userPlantId = Number(resolvedUserPlantId)
  }

  const whereSql = conditions.join(' AND ')

  const [listResult, countResult] = await Promise.all([
    models.$runSQL(
      `
        SELECT
          diagnosis_id,
          user_plant_id,
          plant_id,
          current_round_index,
        follow_up_round,
        current_plant_identity_id,
        latest_visual_call_batch_id,
        outcome_type,
        outcome_payload_json,
        final_problem_cn,
        top_problem_key,
        health_status,
          created_at
        FROM diagnosis_sessions
        WHERE ${whereSql}
        ORDER BY created_at DESC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      params
    ),
    models.$runSQL(
      `SELECT COUNT(*) AS total FROM diagnosis_sessions WHERE ${whereSql}`,
      params
    )
  ])

  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)
  const rows = listResult?.data?.executeResultList || []
  const problemKeys = Array.from(
    new Set(
      rows
        .map(row => fromProblemId(normalizeStoredNullableText(row.top_problem_key, '')))
        .filter(Boolean)
    )
  )
  const problems = await getProblemsByKeys(problemKeys)
  const problemMap = new Map(problems.map(item => [item.problemKey, item]))

  const items = rows.map(row => {
    const normalizedPlantCatalogId = normalizeStoredNullableText(row.plant_id, null)
    const normalizedPlantIdentityId = normalizeStoredNullableText(row.current_plant_identity_id, '')
    const normalizedBatchId = normalizeStoredNullableText(row.latest_visual_call_batch_id, null)
    const normalizedOutcomeType = normalizeStoredNullableText(row.outcome_type, '')
    const outcomePayload = safeJsonParse(row.outcome_payload_json, {}) || {}
    const normalizedFinalProblemCn = normalizeStoredNullableText(row.final_problem_cn, null)
    const normalizedTopProblemKey = normalizeStoredNullableText(row.top_problem_key, null)
    const internalProblemKey = fromProblemId(normalizedTopProblemKey || '')
    const problemMeta = internalProblemKey ? problemMap.get(internalProblemKey) : null
    const normalizedProblemDisplayName = normalizeStoredNullableText(problemMeta?.displayNameCn, null)
    const normalizedSeverityHint = mapSeverityHintToLevel(problemMeta?.severityHintCn)
    const historyRound = Math.max(
      1,
      Number(row.current_round_index || 0),
      Number(row.follow_up_round || 0)
    )

    return {
      historyId: row.diagnosis_id,
      resultId: toResultId(row.diagnosis_id, historyRound),
      plantId: row.user_plant_id || normalizedPlantCatalogId || null,
      userPlantId: row.user_plant_id || null,
      plantCatalogId: normalizedPlantCatalogId,
      plantIdentityId: normalizedPlantIdentityId,
      latestVisualCallBatchId: normalizedBatchId,
      outcomeType: normalizedOutcomeType,
      nonProblematicType:
        normalizedOutcomeType === 'non_problematic'
          ? normalizeStoredNullableText(outcomePayload?.nonProblematicType, '')
          : '',
      nonProblematicLabel:
        normalizedOutcomeType === 'non_problematic'
          ? normalizeStoredNullableText(outcomePayload?.nonProblematicLabel, '')
          : '',
      createdAt: row.created_at,
      summary: {
        problemId:
          normalizedOutcomeType === 'problematic'
            ? toPublicProblemId(normalizedTopProblemKey)
            : '',
        displayName:
          normalizedOutcomeType === 'problematic'
            ? (normalizedFinalProblemCn || normalizedProblemDisplayName || normalizedTopProblemKey || '待确认')
            : normalizedOutcomeType === 'non_problematic'
              ? '暂未见明显问题'
              : normalizedOutcomeType === 'uncertain'
                ? '暂不能稳定判断'
                : '待确认',
        severity:
          !normalizedOutcomeType
            ? 'low'
            : normalizedOutcomeType === 'uncertain'
            ? 'low'
            : normalizedOutcomeType === 'non_problematic'
              ? 'low'
              : normalizedSeverityHint === 'high'
                ? 'high'
                : row.health_status === 'danger'
                  ? 'high'
                  : normalizedSeverityHint || 'medium'
      }
    }
  })

  return {
    items,
    page: currentPage,
    pageSize: limit,
    hasMore: offset + items.length < total
  }
}

async function getResultById(openid, { resultId = '', sessionId = '' } = {}) {
  const parsed = resultId ? fromResultId(resultId) : { sessionId: '', round: null }
  const finalSessionId = sessionId || parsed.sessionId || resultId
  if (!finalSessionId) return null

  const snapshot = await getFinalDiagnosisSnapshot(openid, finalSessionId)
  const persistedObservedEvidenceSet = await getObservedEvidenceSetBySession(finalSessionId, openid)
  const [persistedQuestionQueue, persistedStopStateBundle] = await Promise.all([
    getLatestQueueBySession(finalSessionId, openid),
    getLatestStopStateBySession(finalSessionId, openid)
  ])
  if (snapshot) {
    const observedSymptoms = Array.isArray(snapshot?.observedSymptoms) && snapshot.observedSymptoms.length
      ? snapshot.observedSymptoms
      : await getObservedSymptomsBySession(finalSessionId)
    const observedEvidenceSet = persistedObservedEvidenceSet.length
      ? persistedObservedEvidenceSet
      : normalizePublicObservedEvidenceSet(snapshot?.observedEvidenceSet)
    return {
      resultId: resultId || toResultId(finalSessionId, parsed.round || 1),
      diagnosisSessionId: finalSessionId,
      plantId: snapshot?.plantContext?.userPlantId || snapshot?.plantContext?.plantId || '',
      userPlantId: snapshot?.plantContext?.userPlantId || null,
      plantCatalogId: snapshot?.plantContext?.plantId || null,
      plantIdentityId: snapshot?.plantContext?.plantIdentityId || '',
      latestVisualCallBatchId: resolveLatestVisualCallBatchId(snapshot),
      stage: 'final',
      status: 'closed',
      outcomeType: snapshot?.outcomeType || '',
      nonProblematicType: snapshot?.nonProblematicType || '',
      nonProblematicLabel: snapshot?.nonProblematicLabel || '',
      observedSymptoms,
      observedEvidenceSet,
      routePrimaryAction: snapshot?.routePrimaryAction || '',
      identityResolutionStatus: snapshot?.identityResolutionStatus || '',
      visualBatchTrace: snapshot?.visualBatchTrace || null,
      visualAggregateSummary: snapshot?.visualAggregateSummary || null,
      shadowCompareSummary:
        snapshot?.shadowCompareSummary ||
        snapshot?.visualAggregateSummary?.shadowCompareSummary ||
        null,
      questionQueue: persistedQuestionQueue || snapshot?.questionQueue || null,
      stopState: persistedStopStateBundle?.stopState || snapshot?.stopState || null,
      outputEligibility:
        persistedStopStateBundle?.outputEligibility ||
        snapshot?.outputEligibility ||
        null,
      diagnosticTrace: Array.isArray(snapshot?.diagnosticTrace)
        ? snapshot.diagnosticTrace
        : [],
      finalResult: snapshot.finalResult || null,
      explanation: snapshot.explanation || {},
      contributingFactors: Array.isArray(snapshot.contributingFactors) ? snapshot.contributingFactors : [],
      intermediateStates: Array.isArray(snapshot.intermediateStates) ? snapshot.intermediateStates : [],
      confidenceLevel: snapshot.confidenceLevel || 'normal',
      needHumanReview: Boolean(snapshot.needHumanReview),
      nextSteps: Array.isArray(snapshot.nextSteps) ? snapshot.nextSteps : [],
      whatToAvoid: Array.isArray(snapshot.whatToAvoid) ? snapshot.whatToAvoid : [],
      followUps: Array.isArray(snapshot.askedQuestions) ? snapshot.askedQuestions : [],
      versionMetadata: snapshot.versionMetadata || {},
      timeline: {
        createdAt: ''
      }
    }
  }

  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        user_plant_id,
        plant_id,
        current_plant_identity_id,
        latest_visual_call_batch_id,
        outcome_type,
        outcome_payload_json,
        current_route_primary_action,
        current_identity_resolution_status,
        runtime_snapshot_json,
        final_problem_key,
        final_problem_cn,
        ai_summary,
        treatment,
        prevention,
        created_at
      FROM diagnosis_sessions
      WHERE diagnosis_id = {{diagnosisId}} AND _openid = {{openid}}
      LIMIT 1
    `,
    { diagnosisId: finalSessionId, openid }
  )

  const row = result?.data?.executeResultList?.[0]
  if (!row) return null
  const runtimeSnapshot = safeJsonParse(row.runtime_snapshot_json, {}) || {}

  return {
    resultId: resultId || toResultId(finalSessionId, parsed.round || 1),
    diagnosisSessionId: row.diagnosis_id,
    plantId: row.user_plant_id || normalizeStoredNullableText(row.plant_id, null),
    userPlantId: row.user_plant_id || null,
    plantCatalogId: normalizeStoredNullableText(row.plant_id, null),
    plantIdentityId: normalizeStoredNullableText(row.current_plant_identity_id, ''),
    latestVisualCallBatchId: resolveLatestVisualCallBatchId(
      row.latest_visual_call_batch_id,
      runtimeSnapshot
    ),
    outcomeType: normalizeStoredNullableText(row.outcome_type, ''),
    observedEvidenceSet:
      persistedObservedEvidenceSet.length
        ? persistedObservedEvidenceSet
        : normalizePublicObservedEvidenceSet(runtimeSnapshot?.observedEvidenceSet),
    routePrimaryAction: normalizeStoredNullableText(row.current_route_primary_action, ''),
    identityResolutionStatus: normalizeStoredNullableText(row.current_identity_resolution_status, ''),
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary: runtimeSnapshot?.visualAggregateSummary || null,
    shadowCompareSummary:
      runtimeSnapshot?.shadowCompareSummary ||
      runtimeSnapshot?.visualAggregateSummary?.shadowCompareSummary ||
      null,
    questionQueue: persistedQuestionQueue || runtimeSnapshot?.questionQueue || null,
    stopState: persistedStopStateBundle?.stopState || runtimeSnapshot?.stopState || null,
    outputEligibility:
      persistedStopStateBundle?.outputEligibility ||
      runtimeSnapshot?.outputEligibility ||
      null,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : [],
    finalResult: {
      problemId:
        normalizeStoredNullableText(row.outcome_type, '') === 'problematic'
          ? toPublicProblemId(normalizeStoredNullableText(row.final_problem_key, ''))
          : '',
      displayName:
        normalizeStoredNullableText(row.outcome_type, '') === 'non_problematic'
          ? '暂未见明显问题'
          : normalizeStoredNullableText(row.outcome_type, '') === 'uncertain'
            ? '暂不能稳定判断'
            : normalizeStoredNullableText(row.final_problem_cn, null) ||
              normalizeStoredNullableText(row.final_problem_key, null) ||
              '待确认',
      summary: row.ai_summary || '',
      severity:
        ['uncertain', 'non_problematic'].includes(normalizeStoredNullableText(row.outcome_type, ''))
          ? 'low'
          : 'medium',
      urgency:
        normalizeStoredNullableText(row.outcome_type, '') === 'non_problematic'
          ? 'low'
          : 'medium'
    },
    explanation: {
      whyItHappens: row.ai_summary || '',
      whatToCheckNext: '',
      firstAid: row.treatment || '',
      avoid: row.prevention || ''
    },
    contributingFactors: [],
    intermediateStates: [],
    versionMetadata: {},
    timeline: {
      createdAt: row.created_at
    }
  }
}

async function saveDiagnosisFeedback(openid, { resultId, feedback } = {}) {
  const parsed = fromResultId(resultId || '')
  const diagnosisId = parsed.sessionId || resultId

  try {
    await models.$runSQL(
      `
        INSERT INTO diagnosis_feedback (
          _openid,
          diagnosis_id,
          is_helpful,
          is_accurate,
          note
        ) VALUES (
          {{openid}},
          {{diagnosisId}},
          {{isHelpful}},
          {{isAccurate}},
          {{note}}
        )
      `,
      {
        openid,
        diagnosisId,
        isHelpful: feedback?.isHelpful ? 1 : 0,
        isAccurate: feedback?.isAccurate ? 1 : 0,
        note: feedback?.note || ''
      }
    )
  } catch (error) {
    console.warn('写入 diagnosis_feedback 失败（已降级忽略）:', error.message)
  }

  return { ok: true }
}

module.exports = {
  buildSessionId,
  upsertDiagnosisSession,
  replaceObservedEvidenceSet,
  replaceObservedSymptoms,
  upsertVisualSupervisionRecords,
  replaceProblemRankings,
  appendFollowUpQuestions,
  markFollowUpAnswers,
  validateFollowUpAnswerOwnership,
  getSessionState,
  getObservedEvidenceSetBySession,
  getObservedSymptomsBySession,
  getFinalDiagnosisSnapshot,
  listDiagnosisHistory,
  getResultById,
  saveFinalDiagnosisSnapshot,
  saveDiagnosisFeedback
}
