'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const { safeJsonParse } = require('../../utils/stored-value')
const {
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
  SESSION_ID_COLLATION
} = require('./normalizers')
const {
  loadReviewSymptomDisplayNameMap,
  canonicalizeReviewVisualPayload
} = require('./symptom-canonicalizer')
const { mapVisualRawReviewRow } = require('./prompt-audit-mappers')

async function getDiagnosisBatchReviewRecord(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}

  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        batch_source,
        sample_label,
        sample_file_name,
        sample_absolute_path,
        answer_path_signature,
        answer_path_json,
        rounds_used,
        question_count,
        observed_evidence_count,
        diagnosis_direction_labels_json,
        batch_generated_at
      FROM ${table('diagnosis_batch_reviews')}
      WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}
      LIMIT 1
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  return result?.data?.executeResultList?.[0] || null
}

async function listDiagnosisReviewVisualRawRecords(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        raw.visual_raw_image_record_id,
        raw.visual_call_batch_id,
        raw.input_slot_type,
        raw.input_slot_order,
        raw.input_slot_label,
        raw.source_model_provider,
        raw.source_model_name,
        raw.model_name,
        raw.model_version,
        raw.prompt_version,
        raw.source_model_provider AS llm_source_model_provider,
        raw.source_model_name AS llm_source_model_name,
        raw.prompt_version AS llm_prompt_version,
        '' AS llm_prompt_text,
        0 AS llm_prompt_length,
        '' AS llm_prompt_preview,
        NULL AS llm_prompt_debug_meta_json,
        NULL AS llm_prompt_image_context_json,
        NULL AS llm_usage_json,
        LEFT(raw.raw_text_output, 6000) AS raw_text_output,
        '' AS raw_structured_output,
        CASE
          WHEN LOCATE('"llm_prompt"', raw.raw_structured_output) > 0
          THEN SUBSTRING(
            raw.raw_structured_output,
            LOCATE('"llm_prompt"', raw.raw_structured_output),
            64000
          )
          ELSE ''
        END AS raw_structured_tail,
        normalized.primary_organ_type,
        normalized.organ_source,
        normalized.topk_symptoms_json,
        normalized.pattern_candidates_json,
        normalized.route_hints_json
      FROM ${table('visual_raw_image_records')} AS raw
      LEFT JOIN ${table('visual_normalized_image_results')} AS normalized
        ON normalized.visual_raw_image_record_id = raw.visual_raw_image_record_id
      WHERE raw.session_id = {{diagnosisSessionId}}
      ORDER BY raw.input_slot_order ASC, raw.created_at ASC
      LIMIT 5
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  const displayNameMap = await loadReviewSymptomDisplayNameMap()
  return (result?.data?.executeResultList || []).map(row =>
    mapVisualRawReviewRow(row, displayNameMap)
  )
}

async function getLatestVisualAggregateSummary({ diagnosisSessionId = '', visualCallBatchId = '' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  const safeBatchId = String(visualCallBatchId || '').trim()
  if (!safeSessionId && !safeBatchId) {return null}

  const result = await models.$runSQL(
    `
      SELECT aggregate_summary_json
      FROM ${table('visual_call_aggregate_results')}
      WHERE
        (${safeSessionId ? 'session_id COLLATE ' + SESSION_ID_COLLATION + ' = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ' + SESSION_ID_COLLATION : '0 = 1'})
        OR (${safeBatchId ? 'visual_call_batch_id COLLATE ' + SESSION_ID_COLLATION + ' = CONVERT({{visualCallBatchId}} USING utf8mb4) COLLATE ' + SESSION_ID_COLLATION : '0 = 1'})
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      diagnosisSessionId: safeSessionId,
      visualCallBatchId: safeBatchId
    }
  )

  const aggregateSummary = safeJsonParse(result?.data?.executeResultList?.[0]?.aggregate_summary_json, null)
  return canonicalizeReviewVisualPayload(aggregateSummary, await loadReviewSymptomDisplayNameMap())
}

function extractAggregateSymptomCandidates(aggregateSummary = null) {
  const candidates = Array.isArray(aggregateSummary?.aggregated_symptom_candidates)
    ? aggregateSummary.aggregated_symptom_candidates
    : []
  return candidates
    .map(item => ({
      symptomKey: String(item?.symptom_key || '').trim(),
      symptomCn: String(item?.display_name_cn || item?.symptom_cn || '').trim(),
      confidenceBand: String(item?.confidence_band || '').trim(),
      primarySupportScore: Number(item?.primary_support_score || 0)
    }))
    .filter(item => item.symptomKey)
}

async function resolveSymptomClassFromVisualCandidates(aggregateSummary = null) {
  const candidates = extractAggregateSymptomCandidates(aggregateSummary)
  if (!candidates.length) {return null}

  const symptomKeys = candidates.map(item => item.symptomKey)
  const valuesClause = symptomKeys
    .map((_, index) => `{{symptomKey_${index}}}`)
    .join(', ')
  const params = Object.fromEntries(symptomKeys.map((symptomKey, index) => [`symptomKey_${index}`, symptomKey]))
  const result = await models.$runSQL(
    `
      SELECT
        symptom_key,
        symptom_cn,
        class_key,
        class_name_cn,
        mapping_strength,
        is_primary,
        question_activation_allowed,
        effective_question_activation_v1
      FROM ${table('symptom_class_mapping')}
      WHERE symptom_key IN (${valuesClause})
      ORDER BY is_primary DESC, mapping_strength DESC
      LIMIT 20
    `,
    params
  )
  const mappings = result?.data?.executeResultList || []
  if (!mappings.length) {return null}

  const scoreByClass = new Map()
  mappings.forEach(mapping => {
    const candidate = candidates.find(item => item.symptomKey === mapping.symptom_key) || null
    const classKey = String(mapping.class_key || '').trim()
    if (!classKey) {return}
    const score = Number(mapping.mapping_strength || 0) * Math.max(1, Number(candidate?.primarySupportScore || 1))
    const existing = scoreByClass.get(classKey)
    if (!existing || score > existing.score) {
      scoreByClass.set(classKey, {
        classKey,
        classNameCn: String(mapping.class_name_cn || '').trim(),
        score,
        sourceSymptomKey: String(mapping.symptom_key || '').trim(),
        sourceSymptomCn: String(mapping.symptom_cn || candidate?.symptomCn || '').trim()
      })
    }
  })

  const classScores = Array.from(scoreByClass.values()).sort((left, right) => right.score - left.score)
  const primaryClass = classScores[0] || null
  if (!primaryClass) {return null}

  return {
    currentClassKey: primaryClass.classKey,
    currentGroupKey: '',
    primaryClass: {
      classKey: primaryClass.classKey,
      classNameCn: primaryClass.classNameCn
    },
    secondaryClasses: classScores.slice(1).map(item => ({
      classKey: item.classKey,
      classNameCn: item.classNameCn
    })),
    classScores,
    classSwitchHistory: [],
    classGateDecision: {
      decision: 'visual_candidate_review_fallback',
      reason: 'runtime_snapshot_symptom_class_missing',
      sourceSymptomKey: primaryClass.sourceSymptomKey,
      sourceSymptomCn: primaryClass.sourceSymptomCn
    }
  }
}

module.exports = {
  getDiagnosisBatchReviewRecord,
  listDiagnosisReviewVisualRawRecords,
  getLatestVisualAggregateSummary,
  extractAggregateSymptomCandidates,
  resolveSymptomClassFromVisualCandidates
}
