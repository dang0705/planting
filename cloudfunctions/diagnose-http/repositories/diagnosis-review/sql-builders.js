'use strict'

const { table } = require('../../db/table-helper')
const {
  INTERNAL_REVIEW_OPENID_PREFIXES,
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
  MINI_PROGRAM_CLIENT_PLATFORMS,
  SESSION_ID_COLLATION,
  normalizeKeyword,
  normalizeOutcomeFilter
} = require('./normalizers')

function buildHumanManualSourceClause(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  const conditions = [`NOT (${safeAlias}._openid <=> NULL)`, `${safeAlias}._openid <> ''`]

  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    conditions.push(`${safeAlias}._openid NOT LIKE {{internalReviewPrefix_${index}}}`)
  })

  return conditions.join(' AND ')
}

function buildClientPlatformSql(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `LOWER(TRIM(COALESCE(${buildSafeJsonText(
    `${safeAlias}.runtime_snapshot_json`,
    '$.clientContext.platform',
    ''
  )}, '')))`
}

function buildLikelyManualOpenIdClause(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `${safeAlias}._openid REGEXP {{likelyMiniProgramOpenIdPattern}}`
}

function buildSafeJsonText(jsonExpr = '', jsonPath = '', fallback = '') {
  const safePath = String(jsonPath || '').trim().replace(/'/g, "\\'")
  const safeFallback = String(fallback || '').trim()

  return `CASE WHEN JSON_VALID(${jsonExpr}) THEN NULLIF(JSON_UNQUOTE(JSON_EXTRACT(${jsonExpr}, '${safePath}')), 'null') ELSE '${safeFallback}' END`
}

const EMPTY_REVIEW_SUMMARY = Object.freeze({
  total: 0,
  manualCount: 0,
  batchCount: 0,
  legacyCount: 0,
  finalizedCount: 0,
  pendingCount: 0,
  problematicCount: 0,
  nonProblematicCount: 0,
  uncertainCount: 0,
  otherOutcomeCount: 0
})

function buildStoredReviewSourceSql(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `LOWER(TRIM(COALESCE(
    ${buildSafeJsonText(`${safeAlias}.runtime_snapshot_json`, '$.reviewSourceType', '')},
    ${buildSafeJsonText(`${safeAlias}.runtime_snapshot_json`, '$.clientContext.reviewSourceType', '')},
    ''
  )))`
}

function buildManualPlatformGuardClause(alias = 'sessions') {
  const reviewSourceSql = buildStoredReviewSourceSql(alias)
  const clientPlatformSql = buildClientPlatformSql(alias)
  const likelyManualOpenIdClause = buildLikelyManualOpenIdClause(alias)
  const miniProgramPlatforms = Array.from(MINI_PROGRAM_CLIENT_PLATFORMS)
    .map(platform => `'${platform}'`)
    .join(', ')
  return `(${reviewSourceSql} = 'manual' OR ${clientPlatformSql} IN (${miniProgramPlatforms}) OR ${likelyManualOpenIdClause})`
}

function buildManualListPlatformGuardClause(alias = 'sessions') {
  return buildLikelyManualOpenIdClause(alias)
}

function buildReviewSourceEvidenceSql(alias = 'sessions') {
  const reviewSourceSql = buildStoredReviewSourceSql(alias)
  const clientPlatformSql = buildClientPlatformSql(alias)
  const likelyManualOpenIdClause = buildLikelyManualOpenIdClause(alias)
  const miniProgramPlatforms = Array.from(MINI_PROGRAM_CLIENT_PLATFORMS)
    .map(platform => `'${platform}'`)
    .join(', ')
  return `CASE
    WHEN ${reviewSourceSql} = 'batch' THEN 'batch_table'
    WHEN ${reviewSourceSql} = 'manual' THEN 'platform_tagged'
    WHEN ${clientPlatformSql} IN (${miniProgramPlatforms}) THEN 'platform_tagged'
    WHEN ${likelyManualOpenIdClause} THEN 'openid_inferred_manual'
    ELSE 'openid_inferred_legacy'
  END`
}

function buildDiagnosisReviewQuery({ outcomeType = 'all', keyword = '' } = {}) {
  const safeOutcomeType = normalizeOutcomeFilter(outcomeType)
  const safeKeyword = normalizeKeyword(keyword)
  const sessionConditions = []
  const batchConditions = []
  const params = {}

  if (safeOutcomeType !== 'all') {
    sessionConditions.push('sessions.outcome_type = {{outcomeType}}')
    batchConditions.push('sessions.outcome_type = {{outcomeType}}')
    params.outcomeType = safeOutcomeType
  }

  if (safeKeyword) {
    sessionConditions.push(`(
      sessions.diagnosis_id LIKE {{keywordLike}}
      OR sessions.latest_visual_call_batch_id LIKE {{keywordLike}}
      OR sessions.final_problem_cn LIKE {{keywordLike}}
      OR sessions.final_problem_key LIKE {{keywordLike}}
      OR sessions.ai_summary LIKE {{keywordLike}}
    )`)
    batchConditions.push(`(
      sessions.diagnosis_id LIKE {{keywordLike}}
      OR sessions.latest_visual_call_batch_id LIKE {{keywordLike}}
      OR sessions.final_problem_cn LIKE {{keywordLike}}
      OR sessions.final_problem_key LIKE {{keywordLike}}
      OR sessions.ai_summary LIKE {{keywordLike}}
      OR batch.sample_label LIKE {{keywordLike}}
      OR batch.sample_file_name LIKE {{keywordLike}}
      OR batch.answer_path_signature LIKE {{keywordLike}}
    )`)
    params.keywordLike = `%${safeKeyword}%`
  }

  INTERNAL_REVIEW_OPENID_PREFIXES.forEach((prefix, index) => {
    params[`internalReviewPrefix_${index}`] = `${prefix}%`
  })
  params.likelyMiniProgramOpenIdPattern = LIKELY_MINI_PROGRAM_OPENID_PATTERN

  return {
    manualWhereClause: sessionConditions.length ? `WHERE ${sessionConditions.join(' AND ')}` : '',
    batchWhereClause: batchConditions.length ? `WHERE ${batchConditions.join(' AND ')}` : '',
    params,
    safeOutcomeType,
    safeKeyword
  }
}
function buildDiagnosisReviewBaseColumns({ alias = 'sessions' } = {}) {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `
      ${safeAlias}.diagnosis_id,
      ${safeAlias}._openid,
      ${safeAlias}.user_plant_id,
      ${safeAlias}.plant_id,
      ${safeAlias}.current_plant_identity_id,
      ${safeAlias}.latest_visual_call_batch_id,
      ${safeAlias}.outcome_type,
      ${safeAlias}.outcome_payload_json,
      ${safeAlias}.current_route_primary_action,
      ${safeAlias}.current_identity_resolution_status,
      ${safeAlias}.runtime_snapshot_json,
      ${safeAlias}.final_problem_key,
      ${safeAlias}.final_problem_cn,
      ${safeAlias}.ai_summary,
      ${safeAlias}.session_status,
      ${safeAlias}.follow_up_round,
      ${safeAlias}.current_round_index,
      ${safeAlias}.created_at,
      ${safeAlias}.updated_at`
}

function buildDiagnosisReviewImageSummaryProjection() {
  return `
      '' AS preview_visual_raw_image_record_id,
      '' AS preview_image_ref,
      '' AS replay_image_ref,
      0 AS image_count,
      '' AS llm_source_model_provider,
      '' AS llm_source_model_name,
      '' AS llm_prompt_version,
      '' AS llm_prompt_text,
      0 AS llm_prompt_length,
      '' AS llm_prompt_preview,
      NULL AS llm_prompt_debug_meta_json,
      NULL AS llm_prompt_image_context_json,
      NULL AS llm_usage_json`
}

function buildDiagnosisReviewQuestionCountDefaults() {
  return `
      0 AS question_total_count,
      0 AS question_asked_count,
      0 AS question_answered_count,
      0 AS question_invalidated_count,
      0 AS question_active_count`
}

function escapeSqlString(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .split('\0')
    .join('')
}

function toSqlText(value, { nullable = false } = {}) {
  if (value === null || value === undefined || value === '') {
    return nullable ? 'NULL' : "''"
  }
  return `'${escapeSqlString(value)}'`
}

function toSqlNumber(value, fallback = 0) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) {
    return String(fallback)
  }
  return String(normalized)
}

function toSqlDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'NULL'
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `'${year}-${month}-${day} ${hours}:${minutes}:${seconds}'`
}

function buildManualDiagnosisReviewSelectLite({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualListPlatformGuardClause('sessions')

  return `
    SELECT
      ${buildDiagnosisReviewBaseColumns({ alias: 'sessions' })},
      ${buildDiagnosisReviewImageSummaryProjection()},
      ${buildDiagnosisReviewQuestionCountDefaults()},
      0 AS feedback_count,
      NULL AS latest_feedback_is_helpful,
      NULL AS latest_feedback_is_accurate,
      '' AS latest_feedback_note,
      NULL AS latest_feedback_created_at,
      'manual' AS review_source_type,
      '' AS client_platform,
      'openid_inferred_manual' AS review_source_evidence,
      '' AS batch_source,
      '' AS batch_sample_label,
      '' AS batch_sample_file_name,
      '' AS batch_sample_absolute_path,
      '' AS batch_answer_path_signature,
      '' AS batch_generated_at
    FROM ${table('diagnosis_sessions')} AS sessions
    ${manualWhereClause}
    ${manualWhereClause ? 'AND' : 'WHERE'} NOT EXISTS (
      SELECT 1
      FROM ${table('diagnosis_batch_reviews')} AS batch
      WHERE batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id
    )
    AND ${humanManualSourceClause}
    AND ${manualPlatformGuardClause}
  `
}

function buildBatchDiagnosisReviewSelectLite({ batchWhereClause = '' } = {}) {
  const clientPlatformSql = buildClientPlatformSql('sessions')

  return `
    SELECT
      ${buildDiagnosisReviewBaseColumns({ alias: 'sessions' })},
      ${buildDiagnosisReviewImageSummaryProjection()},
      ${buildDiagnosisReviewQuestionCountDefaults()},
      0 AS feedback_count,
      NULL AS latest_feedback_is_helpful,
      NULL AS latest_feedback_is_accurate,
      '' AS latest_feedback_note,
      NULL AS latest_feedback_created_at,
      'batch' AS review_source_type,
      ${clientPlatformSql} AS client_platform,
      'batch_table' AS review_source_evidence,
      batch.batch_source AS batch_source,
      batch.sample_label AS batch_sample_label,
      batch.sample_file_name AS batch_sample_file_name,
      batch.sample_absolute_path AS batch_sample_absolute_path,
      batch.answer_path_signature AS batch_answer_path_signature,
      batch.batch_generated_at AS batch_generated_at
    FROM ${table('diagnosis_batch_reviews')} AS batch
    INNER JOIN ${table('diagnosis_sessions')} AS sessions
      ON sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
    ${batchWhereClause}
  `
}

function buildLegacyDiagnosisReviewSelectLite({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualPlatformGuardClause('sessions')
  const clientPlatformSql = buildClientPlatformSql('sessions')

  return `
    SELECT
      ${buildDiagnosisReviewBaseColumns({ alias: 'sessions' })},
      ${buildDiagnosisReviewImageSummaryProjection()},
      ${buildDiagnosisReviewQuestionCountDefaults()},
      0 AS feedback_count,
      NULL AS latest_feedback_is_helpful,
      NULL AS latest_feedback_is_accurate,
      '' AS latest_feedback_note,
      NULL AS latest_feedback_created_at,
      'legacy' AS review_source_type,
      ${clientPlatformSql} AS client_platform,
      'openid_inferred_legacy' AS review_source_evidence,
      '' AS batch_source,
      '' AS batch_sample_label,
      '' AS batch_sample_file_name,
      '' AS batch_sample_absolute_path,
      '' AS batch_answer_path_signature,
      '' AS batch_generated_at
    FROM ${table('diagnosis_sessions')} AS sessions
    ${manualWhereClause}
    ${manualWhereClause ? 'AND' : 'WHERE'} NOT EXISTS (
      SELECT 1
      FROM ${table('diagnosis_batch_reviews')} AS batch
      WHERE batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id
    )
    AND ${humanManualSourceClause}
    AND NOT ${manualPlatformGuardClause}
  `
}

function buildManualDiagnosisReviewSummarySelect({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualListPlatformGuardClause('sessions')

  return `
    SELECT sessions.outcome_type, 'manual' AS source_type
    FROM ${table('diagnosis_sessions')} AS sessions
    ${manualWhereClause}
    ${manualWhereClause ? 'AND' : 'WHERE'} NOT EXISTS (
      SELECT 1
      FROM ${table('diagnosis_batch_reviews')} AS batch
      WHERE batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id
    )
    AND ${humanManualSourceClause}
    AND ${manualPlatformGuardClause}
  `
}

function buildBatchDiagnosisReviewSummarySelect({ batchWhereClause = '' } = {}) {
  return `
    SELECT sessions.outcome_type, 'batch' AS source_type
    FROM ${table('diagnosis_batch_reviews')} AS batch
    INNER JOIN ${table('diagnosis_sessions')} AS sessions
      ON sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
    ${batchWhereClause}
  `
}

function buildLegacyDiagnosisReviewSummarySelect({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualPlatformGuardClause('sessions')

  return `
    SELECT sessions.outcome_type, 'legacy' AS source_type
    FROM ${table('diagnosis_sessions')} AS sessions
    ${manualWhereClause}
    ${manualWhereClause ? 'AND' : 'WHERE'} NOT EXISTS (
      SELECT 1
      FROM ${table('diagnosis_batch_reviews')} AS batch
      WHERE batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id
    )
    AND ${humanManualSourceClause}
    AND NOT ${manualPlatformGuardClause}
  `
}

function buildInClause(values = []) {
  const uniqueValues = [...new Set(
    Array.isArray(values)
      ? values.map(item => String(item || '').trim()).filter(Boolean)
      : []
  )]
  if (!uniqueValues.length) {return ''}
  return uniqueValues.map(value => toSqlText(value)).join(', ')
}

function buildCollatedInClause(values = []) {
  const inClause = buildInClause(values)
  if (!inClause) {return ''}
  return inClause
    .split(', ')
    .map(value => `CONVERT(${value} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}`)
    .join(', ')
}

module.exports = {
  EMPTY_REVIEW_SUMMARY,
  buildHumanManualSourceClause,
  buildClientPlatformSql,
  buildLikelyManualOpenIdClause,
  buildSafeJsonText,
  buildStoredReviewSourceSql,
  buildManualPlatformGuardClause,
  buildManualListPlatformGuardClause,
  buildReviewSourceEvidenceSql,
  buildDiagnosisReviewQuery,
  buildDiagnosisReviewBaseColumns,
  buildDiagnosisReviewImageSummaryProjection,
  buildDiagnosisReviewQuestionCountDefaults,
  escapeSqlString,
  toSqlText,
  toSqlNumber,
  toSqlDateTime,
  buildManualDiagnosisReviewSelectLite,
  buildBatchDiagnosisReviewSelectLite,
  buildLegacyDiagnosisReviewSelectLite,
  buildManualDiagnosisReviewSummarySelect,
  buildBatchDiagnosisReviewSummarySelect,
  buildLegacyDiagnosisReviewSummarySelect,
  buildInClause,
  buildCollatedInClause
}
