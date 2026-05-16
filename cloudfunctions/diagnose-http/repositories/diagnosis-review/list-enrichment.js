'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const {
  SESSION_ID_COLLATION,
  normalizeSourceFilter,
  normalizePageBounds
} = require('./normalizers')
const {
  EMPTY_REVIEW_SUMMARY,
  buildDiagnosisReviewQuery,
  buildManualDiagnosisReviewSelectLite,
  buildBatchDiagnosisReviewSelectLite,
  buildLegacyDiagnosisReviewSelectLite,
  buildManualDiagnosisReviewSummarySelect,
  buildBatchDiagnosisReviewSummarySelect,
  buildLegacyDiagnosisReviewSummarySelect,
  buildCollatedInClause
} = require('./sql-builders')
const { mapDiagnosisReviewRow } = require('./row-mapper')

function buildReviewListQuestionCountDefault() {
  return {
    question_total_count: 0,
    question_asked_count: 0,
    question_answered_count: 0,
    question_invalidated_count: 0,
    question_active_count: 0
  }
}

async function loadDiagnosisReviewListQuestionCounts(sessionIds = []) {
  const inClause = buildCollatedInClause(sessionIds)
  if (!inClause) {return new Map()}

  const result = await models.$runSQL(
    `
      SELECT
        diagnosis_id,
        COUNT(*) AS question_total_count,
        SUM(CASE WHEN COALESCE(asked, 0) = 1 THEN 1 ELSE 0 END) AS question_asked_count,
        SUM(CASE WHEN (
          LOWER(TRIM(COALESCE(status, ''))) = 'answered'
          OR (COALESCE(asked, 0) = 1 AND COALESCE(answer_value, '') <> '')
        ) THEN 1 ELSE 0 END) AS question_answered_count,
        SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'invalidated' THEN 1 ELSE 0 END) AS question_invalidated_count,
        SUM(CASE WHEN COALESCE(asked, 0) = 1
          AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('answered', 'invalidated')
        THEN 1 ELSE 0 END) AS question_active_count
      FROM ${table('diagnosis_follow_ups')}
      WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} IN (${inClause})
      GROUP BY diagnosis_id
    `,
    {}
  )

  return new Map(
    (result?.data?.executeResultList || []).map(row => [
      String(row.diagnosis_id || '').trim(),
      {
        question_total_count: Number(row.question_total_count || 0),
        question_asked_count: Number(row.question_asked_count || 0),
        question_answered_count: Number(row.question_answered_count || 0),
        question_invalidated_count: Number(row.question_invalidated_count || 0),
        question_active_count: Number(row.question_active_count || 0)
      }
    ])
  )
}

function buildReviewListVisualDefault() {
  return {
    preview_visual_raw_image_record_id: '',
    preview_image_ref: '',
    replay_image_ref: '',
    image_count: 0,
    llm_source_model_provider: '',
    llm_source_model_name: '',
    llm_prompt_version: '',
    llm_prompt_text: '',
    llm_prompt_length: 0,
    llm_prompt_preview: '',
    llm_prompt_debug_meta_json: null,
    llm_prompt_image_context_json: null,
    llm_usage_json: null
  }
}

async function loadDiagnosisReviewListVisualRows(sessionIds = []) {
  const inClause = buildCollatedInClause(sessionIds)
  if (!inClause) {return new Map()}

  const result = await models.$runSQL(
    `
      SELECT
        session_id,
        visual_raw_image_record_id,
        '' AS preview_image_ref,
        '' AS replay_image_ref,
        source_model_provider AS llm_source_model_provider,
        source_model_name AS llm_source_model_name,
        prompt_version AS llm_prompt_version,
        '' AS llm_prompt_text,
        0 AS llm_prompt_length,
        '' AS llm_prompt_preview,
        NULL AS llm_prompt_debug_meta_json,
        NULL AS llm_prompt_image_context_json,
        NULL AS llm_usage_json
      FROM ${table('visual_raw_image_records')}
      WHERE session_id COLLATE ${SESSION_ID_COLLATION} IN (${inClause})
      ORDER BY session_id ASC, input_slot_order ASC, created_at ASC
    `,
    {}
  )

  const visualMap = new Map()
  for (const row of result?.data?.executeResultList || []) {
    const sessionId = String(row.session_id || '').trim()
    if (!sessionId) {continue}

    const current = visualMap.get(sessionId) || {
      ...buildReviewListVisualDefault(),
      image_count: 0,
      hasFirstRow: false
    }
    current.image_count += 1

    if (!current.hasFirstRow) {
      current.preview_visual_raw_image_record_id = String(row.visual_raw_image_record_id || '').trim()
      current.preview_image_ref = String(row.preview_image_ref || '').trim()
      current.replay_image_ref = String(row.replay_image_ref || '').trim()
      current.llm_source_model_provider = String(row.llm_source_model_provider || '').trim()
      current.llm_source_model_name = String(row.llm_source_model_name || '').trim()
      current.llm_prompt_version = String(row.llm_prompt_version || '').trim()
      current.llm_prompt_text = String(row.llm_prompt_text || '').trim()
      current.llm_prompt_length = Number(row.llm_prompt_length || 0)
      current.llm_prompt_preview = String(row.llm_prompt_preview || '').trim()
      current.llm_prompt_debug_meta_json = row.llm_prompt_debug_meta_json ?? null
      current.llm_prompt_image_context_json = row.llm_prompt_image_context_json ?? null
      current.llm_usage_json = row.llm_usage_json ?? null
      current.hasFirstRow = true
    }

    visualMap.set(sessionId, current)
  }

  for (const [sessionId, item] of visualMap.entries()) {
    const { hasFirstRow: _hasFirstRow, ...publicItem } = item
    visualMap.set(sessionId, publicItem)
  }
  return visualMap
}

async function enrichDiagnosisReviewListRows(rows = []) {
  const sessionIds = rows.map(row => String(row?.diagnosis_id || '').trim()).filter(Boolean)
  if (!sessionIds.length) {return rows}

  const [visualMap, questionMap] = await Promise.all([
    loadDiagnosisReviewListVisualRows(sessionIds).catch(error => {
      console.error('diagnosis review list visual enrichment failed:', error)
      return new Map()
    }),
    loadDiagnosisReviewListQuestionCounts(sessionIds).catch(error => {
      console.error('diagnosis review list question enrichment failed:', error)
      return new Map()
    })
  ])

  return rows.map(row => {
    const sessionId = String(row?.diagnosis_id || '').trim()
    return {
      ...row,
      ...buildReviewListVisualDefault(),
      ...buildReviewListQuestionCountDefault(),
      ...(visualMap.get(sessionId) || null),
      ...(questionMap.get(sessionId) || null)
    }
  })
}

async function summarizeDiagnosisReviewSessions({
  outcomeType = 'all',
  keyword = '',
  sourceType = 'all'
} = {}) {
  const safeSourceType = normalizeSourceFilter(sourceType)
  const { manualWhereClause, batchWhereClause, params } = buildDiagnosisReviewQuery({ outcomeType, keyword })
  const unionParts = []

  if (safeSourceType === 'all' || safeSourceType === 'manual') {
    unionParts.push(`
      SELECT outcome_type, 'manual' AS source_type
      FROM (${buildManualDiagnosisReviewSummarySelect({ manualWhereClause })}) AS manual_rows
    `)
  }

  if (safeSourceType === 'legacy') {
    unionParts.push(`
      SELECT outcome_type, 'legacy' AS source_type
      FROM (${buildLegacyDiagnosisReviewSummarySelect({ manualWhereClause })}) AS legacy_rows
    `)
  }

  if (safeSourceType === 'all' || safeSourceType === 'batch') {
    unionParts.push(`
      SELECT outcome_type, 'batch' AS source_type
      FROM (${buildBatchDiagnosisReviewSummarySelect({ batchWhereClause })}) AS batch_rows
    `)
  }

  if (!unionParts.length) {
    return {
      total: 0,
      finalizedCount: 0,
      pendingCount: 0,
      problematicCount: 0,
      nonProblematicCount: 0,
      uncertainCount: 0,
      otherOutcomeCount: 0
    }
  }

  const result = await models.$runSQL(
    `
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN source_type = 'manual' THEN 1 ELSE 0 END) AS manual_count,
        SUM(CASE WHEN source_type = 'batch' THEN 1 ELSE 0 END) AS batch_count,
        SUM(CASE WHEN source_type = 'legacy' THEN 1 ELSE 0 END) AS legacy_count,
        SUM(CASE WHEN outcome_type IN ('problematic', 'non_problematic', 'uncertain') THEN 1 ELSE 0 END) AS finalized_count,
        SUM(CASE WHEN outcome_type <=> NULL OR outcome_type = '' OR outcome_type NOT IN ('problematic', 'non_problematic', 'uncertain') THEN 1 ELSE 0 END) AS pending_count,
        SUM(CASE WHEN outcome_type = 'problematic' THEN 1 ELSE 0 END) AS problematic_count,
        SUM(CASE WHEN outcome_type = 'non_problematic' THEN 1 ELSE 0 END) AS non_problematic_count,
        SUM(CASE WHEN outcome_type = 'uncertain' THEN 1 ELSE 0 END) AS uncertain_count,
        SUM(CASE WHEN NOT (outcome_type <=> NULL) AND outcome_type <> '' AND outcome_type NOT IN ('problematic', 'non_problematic', 'uncertain') THEN 1 ELSE 0 END) AS other_outcome_count
      FROM (
        ${unionParts.join('\nUNION ALL\n')}
      ) AS review_rows
    `,
    params
  )

  const row = result?.data?.executeResultList?.[0] || {}
  return {
    total: Number(row.total || 0),
    manualCount: Number(row.manual_count || 0),
    batchCount: Number(row.batch_count || 0),
    legacyCount: Number(row.legacy_count || 0),
    finalizedCount: Number(row.finalized_count || 0),
    pendingCount: Number(row.pending_count || 0),
    problematicCount: Number(row.problematic_count || 0),
    nonProblematicCount: Number(row.non_problematic_count || 0),
    uncertainCount: Number(row.uncertain_count || 0),
    otherOutcomeCount: Number(row.other_outcome_count || 0)
  }
}

async function listDiagnosisReviewSessions({
  page = 1,
  pageSize = 20,
  outcomeType = 'all',
  keyword = '',
  sourceType = 'all'
} = {}) {
  const { safePage, safePageSize, offset } = normalizePageBounds({ page, pageSize })
  const safeSourceType = normalizeSourceFilter(sourceType)
  const { manualWhereClause, batchWhereClause, params } = buildDiagnosisReviewQuery({ outcomeType, keyword })
  const unionParts = []

  if (safeSourceType === 'all' || safeSourceType === 'manual') {
    unionParts.push(buildManualDiagnosisReviewSelectLite({ manualWhereClause }))
  }

  if (safeSourceType === 'legacy') {
    unionParts.push(buildLegacyDiagnosisReviewSelectLite({ manualWhereClause }))
  }

  if (safeSourceType === 'all' || safeSourceType === 'batch') {
    unionParts.push(buildBatchDiagnosisReviewSelectLite({ batchWhereClause }))
  }

  if (!unionParts.length) {
    return {
      items: [],
      page: safePage,
      pageSize: safePageSize,
      total: 0,
      hasMore: false,
      summary: {
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
      }
    }
  }

  const summaryTask = summarizeDiagnosisReviewSessions({ outcomeType, keyword, sourceType }).catch(error => {
    console.error('listDiagnosisReviewSessions summary aggregation failed:', error)
    return EMPTY_REVIEW_SUMMARY
  })

  const listTask = models.$runSQL(
    `
      SELECT *
      FROM (
        ${unionParts.join('\nUNION ALL\n')}
      ) AS review_rows
      ORDER BY created_at DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    {
      ...params,
      limit: safePageSize,
      offset
    }
  ).catch(error => {
    console.error('listDiagnosisReviewSessions list query failed:', error)
    return null
  })

  const [result, summary] = await Promise.all([listTask, summaryTask])
  if (!result) {
    return {
      items: [],
      page: safePage,
      pageSize: safePageSize,
      total: 0,
      hasMore: false,
      summary
    }
  }

  const rawItems = await enrichDiagnosisReviewListRows(result?.data?.executeResultList || [])
  const items = rawItems.map(item => mapDiagnosisReviewRow(item))
  const total = Number(summary.total || 0)

  return {
    items,
    page: safePage,
    pageSize: safePageSize,
    total,
    hasMore: offset + items.length < total,
    summary
  }
}

module.exports = {
  buildReviewListQuestionCountDefault,
  loadDiagnosisReviewListQuestionCounts,
  buildReviewListVisualDefault,
  loadDiagnosisReviewListVisualRows,
  enrichDiagnosisReviewListRows,
  summarizeDiagnosisReviewSessions,
  listDiagnosisReviewSessions
}
