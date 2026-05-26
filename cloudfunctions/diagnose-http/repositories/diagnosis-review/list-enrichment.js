'use strict'

const { models } = require('/opt/utils/cloudbase')
const { table } = require('../../db/table-helper')
const {
  SESSION_ID_COLLATION,
  normalizeKeyword,
  normalizeOutcomeFilter,
  normalizeSourceFilter,
  normalizePageBounds
} = require('./normalizers')
const {
  EMPTY_REVIEW_SUMMARY,
  buildDiagnosisReviewQuery,
  buildDiagnosisReviewBaseColumns,
  buildDiagnosisReviewImageSummaryProjection,
  buildDiagnosisReviewQuestionCountDefaults,
  buildHumanManualSourceClause,
  buildManualListPlatformGuardClause,
  buildManualPlatformGuardClause,
  buildClientPlatformSql,
  buildManualDiagnosisReviewSelectLite,
  buildBatchDiagnosisReviewSelectLite,
  buildLegacyDiagnosisReviewSelectLite,
  buildManualDiagnosisReviewSummarySelect,
  buildBatchDiagnosisReviewSummarySelect,
  buildLegacyDiagnosisReviewSummarySelect,
  buildCollatedInClause,
  buildInClause
} = require('./sql-builders')
const { mapDiagnosisReviewRow } = require('./row-mapper')
const {
  createReviewTimingLogger,
  settleOptionalReviewSection,
  stripDiagnosisReviewListPayload,
  withTimeout
} = require('./review-performance')

const LIST_QUERY_TIMEOUT_MS = 2800
const LIST_SUMMARY_TIMEOUT_MS = 1200
const LIST_ENRICHMENT_TIMEOUT_MS = 1200

function buildUnifiedDiagnosisReviewListQuery({
  outcomeType = 'all',
  keyword = '',
  sourceType = 'all'
} = {}) {
  const safeOutcomeType = normalizeOutcomeFilter(outcomeType)
  const safeKeyword = normalizeKeyword(keyword)
  const safeSourceType = normalizeSourceFilter(sourceType)
  const conditions = []
  const params = {}
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualListPlatformGuardClause = buildManualListPlatformGuardClause('sessions')
  const legacyPlatformGuardClause = buildManualPlatformGuardClause('sessions')
  const clientPlatformSql = buildClientPlatformSql('sessions')

  if (safeOutcomeType !== 'all') {
    conditions.push('sessions.outcome_type = {{outcomeType}}')
    params.outcomeType = safeOutcomeType
  }

  if (safeKeyword) {
    conditions.push(`(
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

  if (safeSourceType === 'batch') {
    conditions.push('!(batch.diagnosis_id <=> NULL)')
  } else if (safeSourceType === 'manual') {
    conditions.push(`batch.diagnosis_id <=> NULL AND ${humanManualSourceClause} AND ${manualListPlatformGuardClause}`)
  } else if (safeSourceType === 'legacy') {
    conditions.push(`batch.diagnosis_id <=> NULL AND ${humanManualSourceClause} AND NOT ${legacyPlatformGuardClause}`)
  } else {
    conditions.push(`(!(batch.diagnosis_id <=> NULL) OR (${humanManualSourceClause}))`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return {
    params: {
      ...params,
      internalReviewPrefix_0: 'dev_terminal_%',
      internalReviewPrefix_1: 'anon_dev_%',
      likelyMiniProgramOpenIdPattern: '^o[A-Za-z0-9_-]{10,}$'
    },
    sql: `
      SELECT
        ${buildDiagnosisReviewBaseColumns({ alias: 'sessions' })},
        ${buildDiagnosisReviewImageSummaryProjection()},
        ${buildDiagnosisReviewQuestionCountDefaults()},
        0 AS feedback_count,
        NULL AS latest_feedback_is_helpful,
        NULL AS latest_feedback_is_accurate,
        '' AS latest_feedback_note,
        NULL AS latest_feedback_created_at,
        CASE
          WHEN !(batch.diagnosis_id <=> NULL) THEN 'batch'
          WHEN ${manualListPlatformGuardClause} THEN 'manual'
          ELSE 'legacy'
        END AS review_source_type,
        ${clientPlatformSql} AS client_platform,
        CASE
          WHEN !(batch.diagnosis_id <=> NULL) THEN 'batch_table'
          WHEN ${manualListPlatformGuardClause} THEN 'openid_inferred_manual'
          ELSE 'openid_inferred_legacy'
        END AS review_source_evidence,
        COALESCE(batch.batch_source, '') AS batch_source,
        COALESCE(batch.sample_label, '') AS batch_sample_label,
        COALESCE(batch.sample_file_name, '') AS batch_sample_file_name,
        COALESCE(batch.sample_absolute_path, '') AS batch_sample_absolute_path,
        COALESCE(batch.answer_path_signature, '') AS batch_answer_path_signature,
        batch.batch_generated_at AS batch_generated_at
      FROM ${table('diagnosis_sessions')} AS sessions
      LEFT JOIN ${table('diagnosis_batch_reviews')} AS batch
        ON batch.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
      ${whereClause}
    `
  }
}

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
  const inClause = buildInClause(sessionIds)
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
      WHERE session_id IN (${inClause})
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

  const timing = createReviewTimingLogger('diagnosis-review list', {
    sessionCount: sessionIds.length
  })
  const degradedSections = []
  const [visualResult, questionResult] = await Promise.all([
    settleOptionalReviewSection({
      scope: 'diagnosis-review list',
      sectionName: 'visualMap',
      loader: () => loadDiagnosisReviewListVisualRows(sessionIds),
      fallbackValue: new Map(),
      degradedSections,
      timing,
      timeoutMs: LIST_ENRICHMENT_TIMEOUT_MS
    }),
    settleOptionalReviewSection({
      scope: 'diagnosis-review list',
      sectionName: 'questionCounts',
      loader: () => loadDiagnosisReviewListQuestionCounts(sessionIds),
      fallbackValue: new Map(),
      degradedSections,
      timing,
      timeoutMs: LIST_ENRICHMENT_TIMEOUT_MS
    })
  ])
  const visualMap = visualResult.value || new Map()
  const questionMap = questionResult.value || new Map()

  const mappedRows = rows.map(row => {
    const sessionId = String(row?.diagnosis_id || '').trim()
    return {
      ...row,
      ...buildReviewListVisualDefault(),
      ...buildReviewListQuestionCountDefault(),
      ...(visualMap.get(sessionId) || null),
      ...(questionMap.get(sessionId) || null)
    }
  })

  timing.finish({
    degradedSections
  })

  return mappedRows
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
  const { manualWhereClause, batchWhereClause } = buildDiagnosisReviewQuery({ outcomeType, keyword })
  const unifiedListQuery = buildUnifiedDiagnosisReviewListQuery({ outcomeType, keyword, sourceType })
  const unionParts = []
  const timing = createReviewTimingLogger('diagnosis-review list', {
    page: safePage,
    pageSize: safePageSize,
    outcomeType,
    keyword: String(keyword || '').trim(),
    sourceType: safeSourceType
  })

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
      FROM (${unifiedListQuery.sql}) AS review_rows
      ORDER BY created_at DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    {
      ...unifiedListQuery.params,
      limit: safePageSize,
      offset
    }
  ).catch(error => {
    console.error('listDiagnosisReviewSessions list query failed:', error)
    return null
  })

  const [listResult, summaryResult] = await Promise.all([
    withTimeout(() => listTask, LIST_QUERY_TIMEOUT_MS, null),
    withTimeout(() => summaryTask, LIST_SUMMARY_TIMEOUT_MS, EMPTY_REVIEW_SUMMARY)
  ])
  const result = listResult.value || null
  const summary = summaryResult.value || EMPTY_REVIEW_SUMMARY
  timing.mark('list-query-complete', {
    status: listResult.timedOut ? 'timeout' : (result ? 'ok' : 'error'),
    rowCount: Number(result?.data?.executeResultList?.length || 0)
  })
  if (!result) {
    timing.finish({
      degradedSections: ['listQuery']
    })
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
  const items = rawItems.map(item => stripDiagnosisReviewListPayload(mapDiagnosisReviewRow(item)))
  const total = Number(summary.total || 0)
  timing.finish({
    total,
    itemCount: items.length
  })

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
