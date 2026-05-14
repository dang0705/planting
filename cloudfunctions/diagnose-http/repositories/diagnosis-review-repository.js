'use strict'

const { models, getCloudBase } = require('/opt/utils/cloudbase')
const { table } = require('../db/table-helper')
const { toResultId, toProblemId } = require('../mappers/public-id-mapper')
const { buildPublicCoreProcess } = require('../utils/public-core-process')
const {
  safeJsonParse,
  normalizeStoredNullableText
} = require('../utils/stored-value')
const {
  normalizeOutcomeType,
  normalizeDiagnosisRoutePrimaryAction
} = require('../utils/diagnosis-contract')
const {
  getPromptSymptomDictionary
} = require('./symptom-repository')
const {
  getQuestionOptionMappings
} = require('./question-repository')
const {
  buildSyntheticFollowUpOptionMappings
} = require('../utils/synthetic-follow-up')

const ALLOWED_OUTCOME_FILTERS = new Set(['all', 'problematic', 'non_problematic', 'uncertain'])
const ALLOWED_SOURCE_FILTERS = new Set(['all', 'manual', 'batch', 'legacy'])
const SESSION_ID_COLLATION = 'utf8mb4_unicode_ci'
const INTERNAL_REVIEW_OPENID_PREFIXES = ['dev_terminal_', 'anon_dev_']
const MINI_PROGRAM_CLIENT_PLATFORMS = new Set(['wechat-mini-program', 'wechat_mp', 'mini-program'])
const LIKELY_MINI_PROGRAM_OPENID_PATTERN = '^o[A-Za-z0-9_-]{10,}$'

function normalizeOutcomeFilter(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || !ALLOWED_OUTCOME_FILTERS.has(normalized)) {
    return 'all'
  }
  return normalized
}

function normalizePageNumber(value, fallback = 1) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 1) {return fallback}
  return Math.floor(normalized)
}

function normalizePageSize(value, fallback = 20) {
  const normalized = Number(value || 0)
  if (!Number.isFinite(normalized) || normalized < 1) {return fallback}
  return Math.min(100, Math.floor(normalized))
}

function normalizeKeyword(value = '') {
  return String(value || '').trim()
}

function normalizeReviewText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeReviewNullableNumber(value) {
  if (value === null || value === undefined || value === '') {return null}
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

function normalizeReviewDirectProblemAdjustments(value = []) {
  if (!Array.isArray(value)) {return []}
  return value
    .map(item => ({
      problemKey: String(item?.problemKey || item?.problem_key || '').trim(),
      scoreDelta: normalizeReviewNullableNumber(item?.scoreDelta ?? item?.score_delta),
      reason: String(item?.reason || item?.reasonCn || item?.reason_cn || '').trim()
    }))
    .filter(item => item.problemKey && item.scoreDelta !== null && item.scoreDelta !== 0)
}

function pickReviewUsageNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }
  return null
}

function resolveReviewPromptTokenDetails(usage = {}) {
  return usage?.prompt_tokens_details ||
    usage?.promptTokensDetails ||
    usage?.PromptTokensDetails ||
    usage?.input_tokens_details ||
    usage?.inputTokensDetails ||
    usage?.InputTokensDetails ||
    {}
}

function normalizeReviewLlmUsage(usage = null) {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const rawUsage =
    usage.rawUsage && typeof usage.rawUsage === 'object'
      ? usage.rawUsage
      : usage
  const promptTokensDetails = resolveReviewPromptTokenDetails(rawUsage)
  const normalizedPromptTokensDetails = resolveReviewPromptTokenDetails(usage)
  const promptTokens =
    pickReviewUsageNumber(
      usage.promptTokens,
      usage.PromptTokens,
      usage.prompt_tokens,
      usage.InputTokens,
      usage.input_tokens,
      rawUsage.promptTokens,
      rawUsage.PromptTokens,
      rawUsage.prompt_tokens,
      rawUsage.InputTokens,
      rawUsage.input_tokens
    ) || 0
  const completionTokens =
    pickReviewUsageNumber(
      usage.completionTokens,
      usage.CompletionTokens,
      usage.completion_tokens,
      usage.outputTokens,
      usage.OutputTokens,
      usage.output_tokens,
      rawUsage.completionTokens,
      rawUsage.CompletionTokens,
      rawUsage.completion_tokens,
      rawUsage.outputTokens,
      rawUsage.OutputTokens,
      rawUsage.output_tokens
    ) || 0
  const totalTokens =
    pickReviewUsageNumber(
      usage.totalTokens,
      usage.TotalTokens,
      usage.total_tokens,
      usage.TotalTokenCount,
      usage.totalTokenCount,
      rawUsage.totalTokens,
      rawUsage.TotalTokens,
      rawUsage.total_tokens,
      rawUsage.TotalTokenCount,
      rawUsage.totalTokenCount
    ) || 0
  const promptCacheHitTokens = pickReviewUsageNumber(
    usage.promptCacheHitTokens,
    usage.prompt_cache_hit_tokens,
    usage.cacheHitTokens,
    usage.cache_hit_tokens,
    usage.cachedTokens,
    usage.cached_tokens,
    rawUsage.promptCacheHitTokens,
    rawUsage.prompt_cache_hit_tokens,
    rawUsage.cacheHitTokens,
    rawUsage.cache_hit_tokens,
    rawUsage.cachedTokens,
    rawUsage.cached_tokens,
    normalizedPromptTokensDetails.promptCacheHitTokens,
    normalizedPromptTokensDetails.prompt_cache_hit_tokens,
    normalizedPromptTokensDetails.cacheHitTokens,
    normalizedPromptTokensDetails.cache_hit_tokens,
    normalizedPromptTokensDetails.cachedTokens,
    normalizedPromptTokensDetails.cached_tokens,
    promptTokensDetails.promptCacheHitTokens,
    promptTokensDetails.prompt_cache_hit_tokens,
    promptTokensDetails.cacheHitTokens,
    promptTokensDetails.cache_hit_tokens,
    promptTokensDetails.cachedTokens,
    promptTokensDetails.cached_tokens
  )
  const promptCacheCreationInputTokens = pickReviewUsageNumber(
    usage.promptCacheCreationInputTokens,
    usage.prompt_cache_creation_input_tokens,
    rawUsage.promptCacheCreationInputTokens,
    rawUsage.prompt_cache_creation_input_tokens,
    normalizedPromptTokensDetails.promptCacheCreationInputTokens,
    normalizedPromptTokensDetails.prompt_cache_creation_input_tokens,
    normalizedPromptTokensDetails.cacheCreationInputTokens,
    normalizedPromptTokensDetails.cache_creation_input_tokens,
    promptTokensDetails.promptCacheCreationInputTokens,
    promptTokensDetails.prompt_cache_creation_input_tokens,
    promptTokensDetails.cacheCreationInputTokens,
    promptTokensDetails.cache_creation_input_tokens
  )
  const explicitPromptCacheMissTokens = pickReviewUsageNumber(
    usage.promptCacheMissTokens,
    usage.prompt_cache_miss_tokens,
    usage.cacheMissTokens,
    usage.cache_miss_tokens,
    rawUsage.promptCacheMissTokens,
    rawUsage.prompt_cache_miss_tokens,
    rawUsage.cacheMissTokens,
    rawUsage.cache_miss_tokens,
    normalizedPromptTokensDetails.promptCacheMissTokens,
    normalizedPromptTokensDetails.prompt_cache_miss_tokens,
    normalizedPromptTokensDetails.cacheMissTokens,
    normalizedPromptTokensDetails.cache_miss_tokens,
    promptTokensDetails.promptCacheMissTokens,
    promptTokensDetails.prompt_cache_miss_tokens,
    promptTokensDetails.cacheMissTokens,
    promptTokensDetails.cache_miss_tokens
  )
  const metricAvailable = Boolean(
    promptCacheHitTokens !== null ||
    promptCacheCreationInputTokens !== null ||
    explicitPromptCacheMissTokens !== null ||
    Number(usage.promptCacheMetricAvailable || 0)
  )
  const resolvedPromptCacheHitTokens = Math.max(0, Number(promptCacheHitTokens || 0))
  const resolvedPromptCacheCreationInputTokens = Math.max(
    0,
    Number(promptCacheCreationInputTokens || 0)
  )
  const resolvedPromptCacheMissTokens = explicitPromptCacheMissTokens !== null
    ? Math.max(0, Number(explicitPromptCacheMissTokens || 0))
    : metricAvailable
      ? Math.max(0, promptTokens - resolvedPromptCacheHitTokens - resolvedPromptCacheCreationInputTokens)
      : 0
  const cacheHitRatio = promptTokens > 0
    ? Number((resolvedPromptCacheHitTokens / promptTokens).toFixed(4))
    : 0
  const cacheStatus = metricAvailable
    ? (resolvedPromptCacheHitTokens > 0 ? 'hit' : 'miss')
    : 'unknown'

  return {
    promptTokens,
    completionTokens,
    outputTokens: completionTokens,
    totalTokens,
    promptCacheHitTokens: resolvedPromptCacheHitTokens,
    promptCacheMissTokens: resolvedPromptCacheMissTokens,
    promptCacheCreationInputTokens: resolvedPromptCacheCreationInputTokens,
    promptCacheMetricAvailable: metricAvailable ? 1 : 0,
    promptCacheHitRatio: cacheHitRatio,
    promptCacheStatus: {
      status: cacheStatus,
      statusLabelCn:
        cacheStatus === 'hit'
          ? '命中缓存'
          : cacheStatus === 'miss'
            ? '未命中缓存'
            : '未知',
      promptCacheHitTokens: resolvedPromptCacheHitTokens,
      promptCacheMissTokens: resolvedPromptCacheMissTokens,
      promptCacheCreationInputTokens: resolvedPromptCacheCreationInputTokens,
      outputTokens: completionTokens,
      promptTokens,
      totalTokens,
      hitRatio: cacheHitRatio,
      metricAvailable: metricAvailable ? 1 : 0
    }
  }
}

function buildReviewSymptomDisplayNameMap(symptomRows = []) {
  return new Map(
    (Array.isArray(symptomRows) ? symptomRows : [])
      .map(item => {
        const symptomKey = normalizeReviewText(item?.symptomKey || '')
        const displayName = normalizeReviewText(
          item?.displayTextCn || item?.symptomCn || symptomKey,
          symptomKey
        )
        return symptomKey && displayName ? [symptomKey, displayName] : null
      })
      .filter(Boolean)
  )
}

async function loadReviewSymptomDisplayNameMap() {
  try {
    return buildReviewSymptomDisplayNameMap(await getPromptSymptomDictionary())
  } catch (error) {
    console.warn('diagnosis-review canonical symptom names degraded:', error?.message || error)
    return new Map()
  }
}

function canonicalizeReviewSymptomCandidate(candidate = null, displayNameMap = new Map()) {
  if (!candidate || typeof candidate !== 'object' || !displayNameMap.size) {
    return candidate
  }

  const symptomKey = normalizeReviewText(candidate?.symptom_key || candidate?.symptomKey || '')
  const canonicalDisplayName = symptomKey ? normalizeReviewText(displayNameMap.get(symptomKey) || '') : ''
  if (!symptomKey || !canonicalDisplayName) {
    return candidate
  }

  return {
    ...candidate,
    symptom_key: candidate.symptom_key !== undefined ? symptomKey : candidate.symptom_key,
    symptomKey: candidate.symptomKey !== undefined ? symptomKey : candidate.symptomKey,
    display_name_cn:
      candidate.display_name_cn !== undefined || candidate.displayNameCn === undefined
        ? canonicalDisplayName
        : candidate.display_name_cn,
    displayNameCn: candidate.displayNameCn !== undefined ? canonicalDisplayName : candidate.displayNameCn,
    symptom_cn: candidate.symptom_cn !== undefined ? canonicalDisplayName : candidate.symptom_cn,
    symptomCn: candidate.symptomCn !== undefined ? canonicalDisplayName : candidate.symptomCn
  }
}

function canonicalizeReviewSymptomCandidates(candidates = [], displayNameMap = new Map()) {
  return (Array.isArray(candidates) ? candidates : []).map(candidate =>
    canonicalizeReviewSymptomCandidate(candidate, displayNameMap)
  )
}

function canonicalizeReviewVisualPayload(payload = null, displayNameMap = new Map()) {
  if (!payload || typeof payload !== 'object' || !displayNameMap.size) {
    return payload
  }

  if (Array.isArray(payload)) {
    return payload.map(item => canonicalizeReviewVisualPayload(item, displayNameMap))
  }

  const next = { ...payload }
  ;[
    'symptom_candidates',
    'symptomCandidates',
    'aggregated_symptom_candidates',
    'aggregatedSymptomCandidates',
    'observed_symptoms',
    'observedSymptoms'
  ].forEach(key => {
    if (Array.isArray(next[key])) {
      next[key] = canonicalizeReviewSymptomCandidates(next[key], displayNameMap)
    }
  })
  if (next.parsed_result && typeof next.parsed_result === 'object') {
    next.parsed_result = canonicalizeReviewVisualPayload(next.parsed_result, displayNameMap)
  }
  if (next.parsedResult && typeof next.parsedResult === 'object') {
    next.parsedResult = canonicalizeReviewVisualPayload(next.parsedResult, displayNameMap)
  }
  return next
}

function normalizeSourceFilter(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || !ALLOWED_SOURCE_FILTERS.has(normalized)) {
    return 'all'
  }
  return normalized
}

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

function buildSafeJsonNumeric(jsonExpr = '', jsonPath = '', fallback = 0) {
  const safePath = String(jsonPath || '').trim().replace(/'/g, "\\'")
  const safeFallback = Number.isFinite(Number(fallback)) ? Number(fallback) : 0

  return `CASE WHEN JSON_VALID(${jsonExpr}) THEN JSON_EXTRACT(${jsonExpr}, '${safePath}') ELSE ${safeFallback} END`
}

function buildSafeJsonPayload(jsonExpr = '', jsonPath = '') {
  const safePath = String(jsonPath || '').trim().replace(/'/g, "\\'")
  return `CASE WHEN JSON_VALID(${jsonExpr}) THEN JSON_EXTRACT(${jsonExpr}, '${safePath}') ELSE NULL END`
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

function normalizePageBounds({ page = 1, pageSize = 20 } = {}) {
  const safePage = normalizePageNumber(page)
  const safePageSize = normalizePageSize(pageSize)
  return {
    safePage,
    safePageSize,
    offset: (safePage - 1) * safePageSize
  }
}

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

function summarizeQuestionQueue(questionQueue = null) {
  if (!questionQueue || typeof questionQueue !== 'object') {
    return {
      totalItems: 0,
      activeItems: 0,
      askedItems: 0,
      answeredItems: 0,
      invalidatedItems: 0
    }
  }

  const questionItems = Array.isArray(questionQueue?.questionItems)
    ? questionQueue.questionItems
    : []
  const askedItems = questionItems.filter(item => Number(item?.asked || 0) ? 1 : 0).length
  const answeredItems = questionItems.filter(item => Number(item?.answered || 0) ? 1 : 0).length
  const invalidatedItems = questionItems.filter(item => Number(item?.invalidated || 0) ? 1 : 0).length
  const activeItems = questionItems.filter(item => {
    const status = String(item?.status || '').trim().toLowerCase()
    return Number(item?.asked || 0) && !Number(item?.answered || 0) && !Number(item?.invalidated || 0) && status !== 'answered' && status !== 'invalidated'
  }).length

  return {
    totalItems: questionItems.length,
    activeItems: Number(questionQueue?.activeItemCount || activeItems || 0),
    askedItems: Number(questionQueue?.askedItemCount || askedItems || 0),
    answeredItems: Number(questionQueue?.answeredItemCount || answeredItems || 0),
    invalidatedItems: Number(questionQueue?.invalidatedItemCount || invalidatedItems || 0)
  }
}

function summarizeQuestionCountByDbFields(row = {}) {
  if (!row || typeof row !== 'object') {
    return {
      totalItems: 0,
      activeItems: 0,
      askedItems: 0,
      answeredItems: 0,
      invalidatedItems: 0
    }
  }

  const hasDbSummary =
    row.question_total_count !== undefined ||
    row.question_asked_count !== undefined ||
    row.question_answered_count !== undefined ||
    row.question_invalidated_count !== undefined ||
    row.question_active_count !== undefined

  if (!hasDbSummary) {
    return null
  }

  return {
    totalItems: Number(row.question_total_count || 0),
    activeItems: Number(row.question_active_count || 0),
    askedItems: Number(row.question_asked_count || 0),
    answeredItems: Number(row.question_answered_count || 0),
    invalidatedItems: Number(row.question_invalidated_count || 0)
  }
}

function resolveQuestionCountSummary(row = {}, runtimeSnapshot = null) {
  const dbSummary = summarizeQuestionCountByDbFields(row)
  const queueSummary = summarizeQuestionQueue(runtimeSnapshot?.questionQueue || runtimeSnapshot || null)
  if (!dbSummary) {return queueSummary}

  return {
    totalItems: Math.max(Number(dbSummary.totalItems || 0), Number(queueSummary.totalItems || 0)),
    activeItems: Math.max(Number(dbSummary.activeItems || 0), Number(queueSummary.activeItems || 0)),
    askedItems: Math.max(Number(dbSummary.askedItems || 0), Number(queueSummary.askedItems || 0)),
    answeredItems: Math.max(Number(dbSummary.answeredItems || 0), Number(queueSummary.answeredItems || 0)),
    invalidatedItems: Math.max(Number(dbSummary.invalidatedItems || 0), Number(queueSummary.invalidatedItems || 0))
  }
}

function buildSymptomClassRuntimeReviewPayload(symptomClassRuntime = null) {
  if (!symptomClassRuntime || typeof symptomClassRuntime !== 'object') {
    return null
  }

  return {
    primaryClass: symptomClassRuntime?.primaryClass && typeof symptomClassRuntime.primaryClass === 'object'
      ? {
          classKey: String(symptomClassRuntime.primaryClass?.classKey || '').trim(),
          classNameCn: String(symptomClassRuntime.primaryClass?.classNameCn || '').trim()
        }
      : null,
    secondaryClasses: Array.isArray(symptomClassRuntime?.secondaryClasses)
      ? symptomClassRuntime.secondaryClasses
          .map(item => ({
            classKey: String(item?.classKey || '').trim(),
            classNameCn: String(item?.classNameCn || '').trim()
          }))
          .filter(item => item.classKey)
      : [],
    currentClassKey: String(symptomClassRuntime?.currentClassKey || '').trim(),
    currentGroupKey: String(symptomClassRuntime?.currentGroupKey || '').trim(),
    classScores: Array.isArray(symptomClassRuntime?.classScores) ? symptomClassRuntime.classScores : [],
    classSwitchHistory: Array.isArray(symptomClassRuntime?.classSwitchHistory)
      ? symptomClassRuntime.classSwitchHistory
      : [],
    classGateDecision: symptomClassRuntime?.classGateDecision &&
      typeof symptomClassRuntime.classGateDecision === 'object'
      ? symptomClassRuntime.classGateDecision
      : null
  }
}

function normalizeVisualLlmAudit(row = {}) {
  const promptText = String(row.llm_prompt_text || '').trim()
  const usage = normalizeReviewLlmUsage(safeJsonParse(row.llm_usage_json, null))
  const promptDebugMeta = safeJsonParse(row.llm_prompt_debug_meta_json, null)
  const imageContext = safeJsonParse(row.llm_prompt_image_context_json, null)
  const promptLength = Number(row.llm_prompt_length || 0) || promptText.length || 0

  if (!promptText && !usage && !promptDebugMeta && !imageContext) {
    return null
  }

  return {
    sourceModelProvider: String(row.llm_source_model_provider || row.source_model_provider || '').trim(),
    sourceModelName: String(row.llm_source_model_name || row.source_model_name || '').trim(),
    promptVersion: String(row.llm_prompt_version || row.prompt_version || '').trim(),
    promptText,
    promptLength,
    promptPreview: String(row.llm_prompt_preview || '').trim(),
    promptDebugMeta: promptDebugMeta && typeof promptDebugMeta === 'object' ? promptDebugMeta : null,
    imageContext: imageContext && typeof imageContext === 'object' ? imageContext : null,
    usage,
    promptCacheStatus: usage?.promptCacheStatus || null,
    qwenCacheStatus: usage?.promptCacheStatus || null
    }
}

function safeStringify(value) {
  if (value === null || value === undefined) {return null}
  if (typeof value === 'string') {return value}
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

function resolveLlmPromptAuditFromRawStructuredOutput(rawStructuredOutput = null) {
  const parsed =
    rawStructuredOutput && typeof rawStructuredOutput === 'object'
      ? rawStructuredOutput
      : safeJsonParse(rawStructuredOutput, null)
  if (!parsed || typeof parsed !== 'object') {return null}

  const prompt = parsed?.llm_prompt && typeof parsed.llm_prompt === 'object' ? parsed.llm_prompt : null
  const usage = parsed?.llm_usage && typeof parsed.llm_usage === 'object' ? parsed.llm_usage : null
  const promptDebugMeta = parsed?.llm_prompt_debug_meta || prompt?.promptDebugMeta || null
  const imageContext = parsed?.llm_prompt_image_context || prompt?.imageContext || null
  const sourceModelProvider = parsed?.source_model_provider || parsed?.provider || null
  const sourceModelName = parsed?.source_model_name || parsed?.model || parsed?.model_name || null
  const promptVersion = parsed?.prompt_version || parsed?.promptVersion || prompt?.version || ''

  return {
    sourceModelProvider:
      sourceModelProvider && typeof sourceModelProvider === 'string'
        ? String(sourceModelProvider).trim()
        : '',
    sourceModelName:
      sourceModelName && typeof sourceModelName === 'string'
        ? String(sourceModelName).trim()
        : '',
    promptVersion:
      typeof promptVersion === 'string' ? promptVersion.trim() : '',
    promptText:
      prompt?.promptText && typeof prompt.promptText === 'string' ? prompt.promptText.trim() : '',
    promptLength:
      Number(prompt?.promptLength || 0) || 0,
    promptPreview:
      prompt?.promptPreview && typeof prompt.promptPreview === 'string'
        ? prompt.promptPreview.trim()
        : '',
    promptDebugMeta: safeJsonParse(safeStringify(promptDebugMeta), null),
    imageContext: safeJsonParse(safeStringify(imageContext), null),
    usage
  }
}

function normalizeReviewPromptColumns(row = {}, { promptAudit = null } = {}) {
  const sourceRow = row && typeof row === 'object' ? row : {}
  const audit = promptAudit && typeof promptAudit === 'object' ? promptAudit : null
  const llmSourceModelProvider = String(
    sourceRow.llm_source_model_provider || audit?.sourceModelProvider || ''
  ).trim()
  const llmSourceModelName = String(
    sourceRow.llm_source_model_name || audit?.sourceModelName || ''
  ).trim()
  const llmPromptVersion = String(
    sourceRow.llm_prompt_version || sourceRow.prompt_version || audit?.promptVersion || ''
  ).trim()
  const llmPromptText = String(
    sourceRow.llm_prompt_text || audit?.promptText || ''
  ).trim()
  const llmPromptPreview = String(
    sourceRow.llm_prompt_preview || audit?.promptPreview || ''
  ).trim()
  const promptLengthCandidate = Number(
    sourceRow.llm_prompt_length ||
      audit?.promptLength ||
      llmPromptText.length ||
      0
  )
  const llmPromptDebugMetaJson = sourceRow.llm_prompt_debug_meta_json ??
    safeStringify(audit?.promptDebugMeta)
  const llmPromptImageContextJson = sourceRow.llm_prompt_image_context_json ??
    safeStringify(audit?.imageContext)
  const llmUsageJson = sourceRow.llm_usage_json ??
    safeStringify(audit?.usage)

  return {
    ...sourceRow,
    llm_source_model_provider: llmSourceModelProvider,
    llm_source_model_name: llmSourceModelName,
    llm_prompt_version: llmPromptVersion,
    llm_prompt_text: llmPromptText,
    llm_prompt_length: Number.isFinite(promptLengthCandidate) ? promptLengthCandidate : 0,
    llm_prompt_preview: llmPromptPreview,
    llm_prompt_debug_meta_json: llmPromptDebugMetaJson,
    llm_prompt_image_context_json: llmPromptImageContextJson,
    llm_usage_json: llmUsageJson
  }
}

function buildDiagnosisReviewImageProjection(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `
      (
        SELECT visual_raw_image_record_id
        FROM ${table('visual_raw_image_records')}
        WHERE session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY input_slot_order ASC, created_at ASC
        LIMIT 1
      ) AS preview_visual_raw_image_record_id,
      '' AS preview_image_ref,
      (
        SELECT COALESCE(
          ${buildSafeJsonText('raw_structured_output', '$.diagnosis_review_replay_image_ref', '')},
          ${buildSafeJsonText('raw_structured_output', '$.out_of_pool_replay_image_ref', '')},
          ''
        )
        FROM ${table('visual_raw_image_records')}
        WHERE session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY input_slot_order ASC, created_at ASC
        LIMIT 1
      ) AS replay_image_ref,
      (
        SELECT COUNT(*)
        FROM ${table('visual_raw_image_records')}
        WHERE session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
      ) AS image_count`
}

function _buildDiagnosisReviewLlmProjection(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `
      (
        SELECT raw.source_model_provider
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_source_model_provider,
      (
        SELECT raw.source_model_name
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_source_model_name,
      (
        SELECT raw.prompt_version
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_version,
      (
        SELECT ${buildSafeJsonText('raw.raw_structured_output', '$.llm_prompt.promptText', '')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_text,
      (
        SELECT COALESCE(${buildSafeJsonNumeric('raw.raw_structured_output', '$.llm_prompt.promptLength', 0)}, 0)
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_length,
      (
        SELECT ${buildSafeJsonText('raw.raw_structured_output', '$.llm_prompt.promptPreview', '')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_preview,
      (
        SELECT ${buildSafeJsonPayload('raw.raw_structured_output', '$.llm_prompt.promptDebugMeta')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_debug_meta_json,
      (
        SELECT ${buildSafeJsonPayload('raw.raw_structured_output', '$.llm_prompt.imageContext')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_prompt_image_context_json,
      (
        SELECT ${buildSafeJsonPayload('raw.raw_structured_output', '$.llm_usage')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS llm_usage_json,
      (
        SELECT ${buildSafeJsonPayload('raw.raw_structured_output', '$')}
        FROM ${table('visual_raw_image_records')} AS raw
        WHERE raw.session_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ORDER BY raw.input_slot_order ASC, raw.created_at ASC
        LIMIT 1
      ) AS raw_structured_output`
}

function buildDiagnosisReviewQuestionCountProjection(alias = 'sessions') {
  const safeAlias = String(alias || 'sessions').trim() || 'sessions'
  return `
      (
        SELECT COUNT(*)
        FROM ${table('diagnosis_follow_ups')}
        WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
      ) AS question_total_count,
      (
        SELECT COUNT(*)
        FROM ${table('diagnosis_follow_ups')}
        WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          AND COALESCE(asked, 0) = 1
      ) AS question_asked_count,
      (
        SELECT COUNT(*)
        FROM ${table('diagnosis_follow_ups')}
        WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          AND (
            LOWER(TRIM(COALESCE(status, ''))) = 'answered'
            OR (COALESCE(asked, 0) = 1 AND COALESCE(answer_value, '') <> '')
          )
      ) AS question_answered_count,
      (
        SELECT COUNT(*)
        FROM ${table('diagnosis_follow_ups')}
        WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          AND (
            LOWER(TRIM(COALESCE(status, ''))) = 'invalidated'
          )
      ) AS question_invalidated_count,
      (
        SELECT COUNT(*)
        FROM ${table('diagnosis_follow_ups')}
        WHERE diagnosis_id COLLATE ${SESSION_ID_COLLATION} = ${safeAlias}.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          AND COALESCE(asked, 0) = 1
          AND LOWER(TRIM(COALESCE(status, ''))) NOT IN ('answered', 'invalidated')
      ) AS question_active_count`
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

function resolveReplayPreviewImage(row = {}) {
  const replayImageRef = String(row.replay_image_ref || '').trim()
  if (replayImageRef) {
    return {
      previewImageRef: '',
      hasReplayImage: 1,
      imageState: 'replay'
    }
  }

  const previewImageRef = String(row.preview_image_ref || '').trim()
  if (previewImageRef) {
    return {
      previewImageRef,
      hasReplayImage: 0,
      imageState: 'direct'
    }
  }

  return {
    previewImageRef: '',
    hasReplayImage: 0,
    imageState: 'missing'
  }
}

function parseCloudStorageUrlToFileId(imageRef = '') {
  const normalized = String(imageRef || '').trim()
  if (!normalized || !/^https?:\/\//i.test(normalized)) {return ''}

  try {
    const url = new URL(normalized)
    const host = String(url.hostname || '').trim()
    const match = host.match(/^(.+?)-(\d+)\.tcb\.qcloud\.la$/i)
    if (!match) {return ''}

    const bucketPrefix = match[1]
    const appId = match[2]
    const envId = process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || ''
    const pathname = decodeURIComponent(url.pathname || '').replace(/^\/+/, '')
    if (!envId || !bucketPrefix || !appId || !pathname) {return ''}

    return `cloud://${envId}.${bucketPrefix}-${appId}/${pathname}`
  } catch {
    return ''
  }
}

function isFreshCloudStorageSignedUrl(imageRef = '', maxAge = 3600) {
  const normalized = String(imageRef || '').trim()
  if (!parseCloudStorageUrlToFileId(normalized)) {return true}

  try {
    const url = new URL(normalized)
    const signedAt = Number(url.searchParams.get('t') || 0)
    if (!Number.isFinite(signedAt) || signedAt <= 0) {return false}

    const now = Math.floor(Date.now() / 1000)
    const allowedAge = Math.max(60, Number(maxAge || 3600))
    return signedAt >= now - allowedAge && signedAt <= now + allowedAge
  } catch {
    return false
  }
}

async function refreshCloudStorageImageUrl(imageRef = '', maxAge = 3600) {
  const fileId = parseCloudStorageUrlToFileId(imageRef)
  if (!fileId) {return ''}

  const result = await getCloudBase().getTempFileURL({
    fileList: [fileId],
    maxAge: Number(maxAge || 3600)
  })
  const file = result?.fileList?.[0] || null
  if (String(file?.code || '').toUpperCase() !== 'SUCCESS') {
    return ''
  }
  const refreshedUrl = String(file?.tempFileURL || file?.download_url || '').trim()
  return isFreshCloudStorageSignedUrl(refreshedUrl, maxAge) ? refreshedUrl : ''
}

function toPublicProblemId(problemKey = '') {
  const normalized = String(problemKey || '').trim()
  if (!normalized) {return ''}
  return toProblemId(normalized)
}

function resolveDisplayName({
  outcomeType = '',
  finalProblemCn = '',
  finalProblemKey = '',
  outcomePayload = {}
} = {}) {
  if (outcomeType === 'non_problematic') {
    return normalizeStoredNullableText(outcomePayload?.nonProblematicLabel, '') || '暂未见明显问题'
  }

  if (outcomeType === 'uncertain') {
    return '暂不能稳定判断'
  }

  return (
    normalizeStoredNullableText(finalProblemCn, '') ||
    normalizeStoredNullableText(finalProblemKey, '') ||
    '待进一步确认'
  )
}

function normalizeFeedbackFlag(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  return Number(value) ? 1 : 0
}

function buildFeedbackSummary(row = {}) {
  const feedbackCount = Number(row.feedback_count || 0)
  const latestFeedback = feedbackCount
    ? {
        isHelpful: normalizeFeedbackFlag(row.latest_feedback_is_helpful),
        isAccurate: normalizeFeedbackFlag(row.latest_feedback_is_accurate),
        note: String(row.latest_feedback_note || '').trim(),
        createdAt: String(row.latest_feedback_created_at || '').trim()
      }
    : null

  return {
    feedbackCount,
    hasFeedback: feedbackCount > 0 ? 1 : 0,
    latestFeedback
  }
}

function redactLargeVisualValues(value, depth = 0) {
  if (depth > 8) {return '[depth_omitted]'}
  if (typeof value === 'string') {
    if (/^data:image\//i.test(value)) {
      return '[data_image_omitted]'
    }
    return value.length > 6000 ? `${value.slice(0, 6000)}...[truncated]` : value
  }
  if (Array.isArray(value)) {
    return value.map(item => redactLargeVisualValues(item, depth + 1))
  }
  if (!value || typeof value !== 'object') {
    return value
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      /image_ref|replay_image/i.test(key) && typeof nestedValue === 'string'
        ? redactLargeVisualValues(nestedValue, depth + 1)
        : redactLargeVisualValues(nestedValue, depth + 1)
    ])
  )
}

function parseVisualRawStructuredPayload(row = {}) {
  const fullPayload = String(row.raw_structured_output || '').trim()
  if (fullPayload) {
    return safeJsonParse(fullPayload, {}) || {}
  }

  const tailPayload = String(row.raw_structured_tail || '').trim()
  if (!tailPayload) {
    return {}
  }

  const wrappedTailPayload = tailPayload.startsWith('{')
    ? tailPayload
    : `{${tailPayload}`
  return safeJsonParse(wrappedTailPayload, {}) || {}
}

function mapVisualRawReviewRow(row = {}, displayNameMap = new Map()) {
  const structuredPayload = parseVisualRawStructuredPayload(row)
  const promptAudit = resolveLlmPromptAuditFromRawStructuredOutput(structuredPayload)
  const normalizedRow = normalizeReviewPromptColumns(row, { promptAudit })
  const structuredOutput = canonicalizeReviewVisualPayload(
    redactLargeVisualValues(structuredPayload),
    displayNameMap
  )
  const parsedResult = structuredOutput?.parsed_result || structuredOutput?.parsedResult || null

  return {
    visualRawImageRecordId: String(row.visual_raw_image_record_id || '').trim(),
    visualCallBatchId: String(row.visual_call_batch_id || '').trim(),
    inputSlotType: String(row.input_slot_type || '').trim(),
    inputSlotOrder: Number(row.input_slot_order || 0),
    inputSlotLabel: String(row.input_slot_label || '').trim(),
    sourceModelProvider: String(row.source_model_provider || '').trim(),
    sourceModelName: String(row.source_model_name || row.model_name || row.model_version || '').trim(),
    promptVersion: String(row.prompt_version || '').trim(),
    llmPromptAudit: normalizeVisualLlmAudit(normalizedRow),
    rawTextOutput: String(row.raw_text_output || '').slice(0, 6000),
    rawStructuredOutput: structuredOutput,
    modelParsedResult: parsedResult,
    normalizedTopkSymptoms: canonicalizeReviewSymptomCandidates(
      safeJsonParse(row.topk_symptoms_json, []),
      displayNameMap
    ),
    normalizedPatternCandidates: safeJsonParse(row.pattern_candidates_json, {}),
    normalizedRouteHints: safeJsonParse(row.route_hints_json, []),
    primaryOrganType: String(row.primary_organ_type || '').trim(),
    organSource: String(row.organ_source || '').trim()
  }
}

function mapDiagnosisFollowUpReviewRow(row = {}) {
  const rationale = safeJsonParse(row.rationale, {}) || {}
  const roundIndex = Math.max(1, Number(rationale.r || rationale.round || 1))
  const optionKey = String(row.answer_value || '').trim()
  const rationaleOptionText = (Array.isArray(rationale?.opts) ? rationale.opts : [])
    .map(item => ({
      optionKey: String(item?.k || item?.optionKey || '').trim(),
      optionText: String(item?.t || item?.text || '').trim()
    }))
    .find(item => item.optionKey === optionKey)?.optionText || ''

  return {
    id: Number(row.id || 0),
    diagnosisId: String(row.diagnosis_id || '').trim(),
    questionOrder: Number(row.question_order || 0),
    roundIndex,
    questionKey: String(row.symptom_key || '').trim(),
    targetSymptomKey: String(row.target_symptom_key || rationale.tsk || '').trim(),
    targetDimension: String(row.target_dimension || rationale.td || '').trim(),
    routingScope: String(row.routing_scope || rationale.rs || '').trim(),
    questionRole: String(row.question_role || rationale.qr || '').trim(),
    questionCategory: String(row.question_role || rationale.qr || '').trim(),
    effectMode: String(row.effect_mode || rationale.em || '').trim(),
    questionGroupKey: String(row.question_group_key || rationale.qg || '').trim(),
    questionText: String(row.question_text || row.question_text_user_cn || row.question_text_cn || '').trim(),
    optionKey,
    optionText: String(rationaleOptionText || row.option_text_user_cn || row.option_text_cn || row.answer_value || '').trim(),
    optionValue:
      row.option_value === null || row.option_value === undefined || row.option_value === ''
        ? null
        : Number(row.option_value),
    mapsToSymptomKey: String(row.maps_to_symptom_key || '').trim(),
    answerEffect: String(row.answer_effect_cn || '').trim(),
    resolvedMapsToSymptomKey: String(row.resolved_maps_to_symptom_key || row.maps_to_symptom_key || '').trim(),
    resolvedOptionValue: normalizeReviewNullableNumber(row.resolved_option_value ?? row.option_value),
    resolvedAssociationStrength: normalizeReviewNullableNumber(row.resolved_association_strength),
    resolvedAnswerEffect: String(row.resolved_answer_effect_cn || row.answer_effect_cn || '').trim(),
    resolvedDirectProblemAdjustments: normalizeReviewDirectProblemAdjustments(
      safeJsonParse(row.resolved_direct_problem_adjustments_json, [])
    ),
    resolvedEffectSource: String(row.resolved_effect_source || '').trim(),
    answerConfidence:
      row.answer_confidence === null || row.answer_confidence === undefined || row.answer_confidence === ''
        ? null
        : Number(row.answer_confidence),
    status: String(row.status || '').trim(),
    asked: Number(row.asked || 0) ? 1 : 0,
    rationale,
    createdAt: String(row.created_at || '').trim(),
    answeredAt: String(row.answered_at || '').trim()
  }
}

function indexSyntheticFollowUpOptionMappings(optionMappings = []) {
  const map = new Map()
  for (const item of Array.isArray(optionMappings) ? optionMappings : []) {
    const questionKey = String(item?.questionKey || '').trim()
    const optionKey = String(item?.optionKey || '').trim()
    if (!questionKey || !optionKey) {continue}
    map.set(`${questionKey}::${optionKey}`, item)
  }
  return map
}

function applySyntheticFollowUpReviewFallback(row = {}, syntheticMappingIndex = new Map()) {
  const questionKey = String(row?.symptom_key || '').trim()
  const optionKey = String(row?.answer_value || '').trim()
  if (!questionKey || !optionKey) {return row}

  const mapping = syntheticMappingIndex.get(`${questionKey}::${optionKey}`)
  if (!mapping) {return row}

  const next = { ...row }
  const resolvedDirectProblemAdjustments = normalizeReviewDirectProblemAdjustments(
    mapping.directProblemAdjustments
  )
  next.resolved_direct_problem_adjustments_json = JSON.stringify(resolvedDirectProblemAdjustments)
  next.resolved_effect_source = String(mapping.dataStatus || mapping.reviewStatus || 'resolved').trim()
  next.resolved_maps_to_symptom_key = String(mapping.mapsToSymptomKey || next.maps_to_symptom_key || '').trim()
  next.resolved_option_value = normalizeReviewNullableNumber(mapping.value)
  next.resolved_association_strength = normalizeReviewNullableNumber(mapping.associationStrength)
  next.resolved_answer_effect_cn = String(mapping.answerEffectCn || next.answer_effect_cn || '').trim()
  if (!String(next.option_text_cn || '').trim()) {
    next.option_text_cn = mapping.optionTextCn || mapping.optionTextUserCn || optionKey
  }
  if (!String(next.option_text_user_cn || '').trim()) {
    next.option_text_user_cn = mapping.optionTextUserCn || mapping.optionTextCn || optionKey
  }
  if (
    next.option_value === null ||
    next.option_value === undefined ||
    next.option_value === ''
  ) {
    next.option_value = mapping.value
  }
  if (!String(next.maps_to_symptom_key || '').trim()) {
    next.maps_to_symptom_key = mapping.mapsToSymptomKey || ''
  }
  if (!String(next.answer_effect_cn || '').trim()) {
    next.answer_effect_cn = mapping.answerEffectCn || ''
  }
  return next
}

function normalizeAdviceText(value = '') {
  return String(value || '').trim()
}

function normalizeReviewProblemKey(value = '') {
  const normalized = normalizeAdviceText(value)
  if (!normalized) {return ''}
  if (!normalized.startsWith('p_')) {return normalized}

  try {
    const { fromProblemId } = require('../mappers/public-id-mapper')
    return fromProblemId(normalized) || normalized
  } catch {
    return normalized
  }
}

function pickAdviceTextFromItems(items = []) {
  for (const item of Array.isArray(items) ? items : []) {
    const text = typeof item === 'string'
      ? normalizeAdviceText(item)
      : normalizeAdviceText(item?.text || item?.title || item?.label || '')
    if (text) {return text}
  }
  return ''
}

function normalizeReviewAdviceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => {
      const text = typeof item === 'string'
        ? normalizeAdviceText(item)
        : normalizeAdviceText(item?.text || item?.title || item?.label || '')
      if (!text) {return null}
      return {
        stepId: normalizeAdviceText(item?.stepId || item?.id || `raw_${index + 1}`),
        text,
        type: normalizeAdviceText(item?.type || '')
      }
    })
    .filter(Boolean)
}

function buildRawStoredAdviceForReview(row = {}, runtimeSnapshot = {}) {
  const rawExplanation = runtimeSnapshot?.explanation || runtimeSnapshot?.resultExplanation || {}
  const rawNextSteps = normalizeReviewAdviceItems(runtimeSnapshot?.nextSteps || [])
  const rawWhatToAvoid = (Array.isArray(runtimeSnapshot?.whatToAvoid) ? runtimeSnapshot.whatToAvoid : [])
    .map(item => typeof item === 'string' ? normalizeAdviceText(item) : normalizeAdviceText(item?.text || item?.title || item?.label || ''))
    .filter(Boolean)
  const treatment = normalizeAdviceText(
    row.treatment ||
      runtimeSnapshot?.treatmentText ||
      runtimeSnapshot?.treatment ||
      rawExplanation?.firstAid ||
      pickAdviceTextFromItems(rawNextSteps)
  )
  const prevention = normalizeAdviceText(
    row.prevention ||
      runtimeSnapshot?.preventionText ||
      runtimeSnapshot?.prevention ||
      rawExplanation?.avoid ||
      rawWhatToAvoid[0] ||
      ''
  )
  const explanation = {
    whyItHappens: normalizeAdviceText(rawExplanation?.whyItHappens || ''),
    whatToCheckNext: normalizeAdviceText(rawExplanation?.whatToCheckNext || ''),
    firstAid: normalizeAdviceText(rawExplanation?.firstAid || treatment),
    avoid: normalizeAdviceText(rawExplanation?.avoid || prevention),
    reassurance: normalizeAdviceText(rawExplanation?.reassurance || '')
  }
  const hasAny = Boolean(
    treatment ||
      prevention ||
      explanation.whyItHappens ||
      explanation.whatToCheckNext ||
      explanation.firstAid ||
      explanation.avoid ||
      rawNextSteps.length ||
      rawWhatToAvoid.length
  )

  return {
    source: 'raw_snapshot_or_session',
    hasAny,
    explanation,
    nextSteps: rawNextSteps,
    whatToAvoid: rawWhatToAvoid,
    treatment,
    prevention,
    trustLevel: 'audit_only',
    displayPolicy: 'do_not_show_as_governed_advice'
  }
}

function buildProblematicReviewAdviceFallback(problemKey = '') {
  const firstAid = '当前结果暂未匹配到已审核的处理建议。建议先保持养护条件稳定，观察问题是否扩大或重复出现，再结合人工复核结果决定具体处理。'
  const avoid = '不要在缺少已审核处理建议时直接大幅调整浇水、施肥、修剪或用药。'

  return {
    source: 'governance_fallback',
    hasAny: true,
    explanation: {
      whyItHappens: problemKey
        ? `当前问题 ${problemKey} 缺少可用于用户端展示的已审核解释。`
        : '当前问题缺少可用于用户端展示的已审核解释。',
      whatToCheckNext: '请优先核对该结果是否已有 audited explanation 或 audited problem action 字段。',
      firstAid,
      avoid,
      reassurance: '这是治理兜底文案，用于避免把未审核旧建议当作正式处理建议展示。'
    },
    nextSteps: [
      {
        stepId: 'advice_governance_fallback',
        text: firstAid,
        type: 'governance_fallback'
      }
    ],
    whatToAvoid: [avoid]
  }
}

function buildGovernedReviewExplanation(problem = null, explanationRow = null) {
  if (!problem) {return null}

  return {
    whyItHappens:
      explanationRow?.whyItHappensCn ||
      problem?.userDefinitionCn ||
      problem?.definition ||
      '',
    whatToCheckNext: explanationRow?.whatToCheckNextCn || '',
    firstAid:
      explanationRow?.firstAidCn ||
      problem?.userActionCn ||
      problem?.defaultAction ||
      '',
    avoid:
      explanationRow?.avoidCn ||
      problem?.userPreventionCn ||
      problem?.defaultPrevention ||
      '',
    reassurance: explanationRow?.reassuranceCn || ''
  }
}

async function resolveDiagnosisReviewActionAdviceGovernance({ row = {}, runtimeSnapshot = {}, mapped = {} } = {}) {
  const rawStoredAdvice = buildRawStoredAdviceForReview(row, runtimeSnapshot)
  if (mapped?.outcomeType !== 'problematic') {
    return {
      applies: false,
      outcomeType: mapped?.outcomeType || '',
      problemKey: '',
      rawStoredAdvice,
      governedAdvice: null,
      displayRecommendation: 'not_applicable'
    }
  }

  const problemKey = normalizeReviewProblemKey(mapped?.problemKey || row.final_problem_key || row.top_problem_key || '')
  if (!problemKey) {
    return {
      applies: true,
      outcomeType: 'problematic',
      problemKey: '',
      rawStoredAdvice,
      governedAdvice: buildProblematicReviewAdviceFallback(''),
      displayRecommendation: 'show_governed_advice_only'
    }
  }

  const {
    getProblemsByKeys,
    getExplanationsByProblemKeys
  } = require('./problem-repository')
  const [problems, explanations] = await Promise.all([
    getProblemsByKeys([problemKey]),
    getExplanationsByProblemKeys([problemKey])
  ])
  const problem = problems.find(item => item.problemKey === problemKey) || null
  const explanationRow = explanations.find(item => item.problemKey === problemKey) || null
  const governedExplanation = buildGovernedReviewExplanation(problem, explanationRow)

  if (!governedExplanation) {
    return {
      applies: true,
      outcomeType: 'problematic',
      problemKey,
      rawStoredAdvice,
      governedAdvice: buildProblematicReviewAdviceFallback(problemKey),
      displayRecommendation: 'show_governed_advice_only'
    }
  }

  const nextSteps = governedExplanation.firstAid
    ? [
        {
          stepId: 'advice_1',
          text: governedExplanation.firstAid,
          type: explanationRow ? 'audited_explanation' : 'problem_fallback'
        }
      ]
    : []
  const whatToAvoid = governedExplanation.avoid ? [governedExplanation.avoid] : []

  return {
    applies: true,
    outcomeType: 'problematic',
    problemKey,
    rawStoredAdvice,
    governedAdvice: {
      source: explanationRow ? 'audited_explanation' : 'problem_fallback',
      hasAny: Boolean(governedExplanation.firstAid || governedExplanation.avoid || nextSteps.length || whatToAvoid.length),
      explanation: governedExplanation,
      nextSteps,
      whatToAvoid
    },
    displayRecommendation: 'show_governed_advice_only'
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
  const routePrimaryAction = normalizeDiagnosisRoutePrimaryAction(
    row.current_route_primary_action || runtimeSnapshot?.routePrimaryAction || '',
    ''
  )
  const displayName = resolveDisplayName({
    outcomeType: normalizedOutcomeType,
    finalProblemCn: row.final_problem_cn || '',
    finalProblemKey: row.final_problem_key || '',
    outcomePayload
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
      questionCountSummary
    }
  }
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

function _buildManualDiagnosisReviewSelect({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualPlatformGuardClause('sessions')
  const clientPlatformSql = buildClientPlatformSql('sessions')
  const reviewSourceEvidenceSql = buildReviewSourceEvidenceSql('sessions')
  return `
    SELECT
      sessions.diagnosis_id,
      sessions._openid,
      sessions.user_plant_id,
      sessions.plant_id,
      sessions.current_plant_identity_id,
      sessions.latest_visual_call_batch_id,
      sessions.outcome_type,
      sessions.outcome_payload_json,
      sessions.current_route_primary_action,
      sessions.current_identity_resolution_status,
      sessions.runtime_snapshot_json,
      sessions.final_problem_key,
      sessions.final_problem_cn,
      sessions.ai_summary,
      sessions.session_status,
      sessions.follow_up_round,
      sessions.current_round_index,
      sessions.created_at,
      sessions.updated_at,
      ${buildDiagnosisReviewImageProjection('sessions')},
      ${buildDiagnosisReviewQuestionCountProjection('sessions')},
      0 AS feedback_count,
      NULL AS latest_feedback_is_helpful,
      NULL AS latest_feedback_is_accurate,
      '' AS latest_feedback_note,
      NULL AS latest_feedback_created_at,
      'manual' AS review_source_type,
      ${clientPlatformSql} AS client_platform,
      ${reviewSourceEvidenceSql} AS review_source_evidence,
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

function _buildBatchDiagnosisReviewSelect({ batchWhereClause = '' } = {}) {
  const clientPlatformSql = buildClientPlatformSql('sessions')
  return `
    SELECT
      sessions.diagnosis_id,
      sessions._openid,
      sessions.user_plant_id,
      sessions.plant_id,
      sessions.current_plant_identity_id,
      sessions.latest_visual_call_batch_id,
      sessions.outcome_type,
      sessions.outcome_payload_json,
      sessions.current_route_primary_action,
      sessions.current_identity_resolution_status,
      sessions.runtime_snapshot_json,
      sessions.final_problem_key,
      sessions.final_problem_cn,
      sessions.ai_summary,
      sessions.session_status,
      sessions.follow_up_round,
      sessions.current_round_index,
      sessions.created_at,
      sessions.updated_at,
      ${buildDiagnosisReviewImageProjection('sessions')},
      ${buildDiagnosisReviewQuestionCountProjection('sessions')},
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

function _buildLegacyDiagnosisReviewSelect({ manualWhereClause = '' } = {}) {
  const humanManualSourceClause = buildHumanManualSourceClause('sessions')
  const manualPlatformGuardClause = buildManualPlatformGuardClause('sessions')
  const clientPlatformSql = buildClientPlatformSql('sessions')
  return `
    SELECT
      sessions.diagnosis_id,
      sessions._openid,
      sessions.user_plant_id,
      sessions.plant_id,
      sessions.current_plant_identity_id,
      sessions.latest_visual_call_batch_id,
      sessions.outcome_type,
      sessions.outcome_payload_json,
      sessions.current_route_primary_action,
      sessions.current_identity_resolution_status,
      sessions.runtime_snapshot_json,
      sessions.final_problem_key,
      sessions.final_problem_cn,
      sessions.ai_summary,
      sessions.session_status,
      sessions.follow_up_round,
      sessions.current_round_index,
      sessions.created_at,
      sessions.updated_at,
      ${buildDiagnosisReviewImageProjection('sessions')},
      ${buildDiagnosisReviewQuestionCountProjection('sessions')},
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

async function listDiagnosisReviewImageRows(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        visual_raw_image_record_id,
        input_slot_type,
        input_slot_order,
        input_slot_label,
        COALESCE(NULLIF(image_ref, '[inline_data_url]'), '') AS preview_image_ref,
        COALESCE(
          ${buildSafeJsonText('raw_structured_output', '$.diagnosis_review_replay_image_ref', '')},
          ${buildSafeJsonText('raw_structured_output', '$.out_of_pool_replay_image_ref', '')},
          ''
        ) AS replay_image_ref
      FROM ${table('visual_raw_image_records')}
      WHERE session_id COLLATE ${SESSION_ID_COLLATION} = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}
      ORDER BY input_slot_order ASC, created_at ASC
      LIMIT 5
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  return result?.data?.executeResultList || []
}

function isDataImageUrl(value = '') {
  return /^data:image\//i.test(String(value || '').trim())
}

async function _fetchImageAsDataUrl(imageUrl = '') {
  const normalized = String(imageUrl || '').trim()
  if (!normalized) {return ''}
  if (isDataImageUrl(normalized)) {return normalized}

  const response = await fetch(normalized)
  if (!response.ok) {
    throw new Error(`image_fetch_failed:${response.status}`)
  }

  const contentType = String(response.headers.get('content-type') || 'image/jpeg').trim()
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!buffer.length) {
    return ''
  }

  return `data:${contentType};base64,${buffer.toString('base64')}`
}

async function resolveReviewImageRefForDisplay(imageRef = '') {
  const normalized = String(imageRef || '').trim()
  if (!normalized) {return ''}
  if (isDataImageUrl(normalized)) {return normalized}

  const refreshed = await refreshCloudStorageImageUrl(normalized).catch(() => '')
  if (refreshed) {return refreshed}
  if (!parseCloudStorageUrlToFileId(normalized)) {return normalized}
  return isFreshCloudStorageSignedUrl(normalized) ? normalized : ''
}

async function getDiagnosisReviewImages({ diagnosisSessionId = '' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}

  const rows = await listDiagnosisReviewImageRows(safeSessionId)
  if (!rows.length) {return null}

  const previewImageRefs = []

  for (const row of rows) {
    const replayImageRef = String(row.replay_image_ref || '').trim()
    if (replayImageRef) {
      previewImageRefs.push(replayImageRef)
      continue
    }

    const previewImageRef = String(row.preview_image_ref || '').trim()
    if (!previewImageRef) {
      continue
    }

    const resolvedPreviewImageRef = await resolveReviewImageRefForDisplay(previewImageRef)
    if (resolvedPreviewImageRef) {
      previewImageRefs.push(resolvedPreviewImageRef)
    }
  }

  const availablePreviewImageRefs = previewImageRefs
    .map(item => String(item || '').trim())
    .filter(Boolean)

  return {
    diagnosisSessionId: safeSessionId,
    coverImageRef: availablePreviewImageRefs[0] || '',
    previewImageRefs: availablePreviewImageRefs,
    imageCount: rows.length
  }
}

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

async function listDiagnosisReviewFollowUps(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        followups.id,
        followups.diagnosis_id,
        followups.question_order,
        followups.symptom_key,
        followups.question_text,
        followups.rationale,
        followups.asked,
        followups.answer_value,
        followups.answer_confidence,
        followups.status,
        followups.created_at,
        followups.answered_at,
        questions.target_symptom_key,
        questions.target_dimension,
        questions.routing_scope,
        questions.question_role,
        questions.effect_mode,
        questions.question_group_key,
        questions.question_text_cn,
        questions.question_text_user_cn,
        options.option_text_cn,
        options.option_text_user_cn,
        options.maps_to_symptom_key,
        options.value AS option_value,
        options.answer_effect_cn
      FROM ${table('diagnosis_follow_ups')} AS followups
      LEFT JOIN ${table('question_library_v5_real')} AS questions
        ON questions.question_key = followups.symptom_key
      LEFT JOIN ${table('question_option_mapping_v5_real')} AS options
        ON options.question_key = followups.symptom_key
       AND options.option_key = followups.answer_value
      WHERE followups.diagnosis_id = {{diagnosisSessionId}}
      ORDER BY followups.question_order ASC, followups.id ASC
      LIMIT 20
    `,
    { diagnosisSessionId: safeSessionId }
  )

  const rows = result?.data?.executeResultList || []
  const questionKeys = Array.from(
    new Set(rows.map(row => String(row?.symptom_key || '').trim()).filter(Boolean))
  )
  const [auditedOptionMappings, symptomDictionary] = await Promise.all([
    questionKeys.length ? getQuestionOptionMappings(questionKeys) : [],
    getPromptSymptomDictionary()
  ])
  const resolvedMappingIndex = indexSyntheticFollowUpOptionMappings([
    ...auditedOptionMappings,
    ...buildSyntheticFollowUpOptionMappings(questionKeys, symptomDictionary)
  ])

  return rows
    .map(row => applySyntheticFollowUpReviewFallback(row, resolvedMappingIndex))
    .map(mapDiagnosisFollowUpReviewRow)
}

async function listDiagnosisReviewAnswerEvents(diagnosisSessionId = '') {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return []}

  const result = await models.$runSQL(
    `
      SELECT
        id,
        event_id,
        diagnosis_id,
        answer_revision_before,
        answer_revision_after,
        dirty_question_key,
        dirty_round_index,
        event_type,
        question_row_id,
        question_key,
        question_text,
        question_round_index,
        previous_option_key,
        previous_status,
        previous_asked,
        new_option_key,
        new_status,
        new_asked,
        reason,
        created_at
      FROM ${table('diagnosis_follow_up_answer_events')}
      WHERE diagnosis_id = {{diagnosisSessionId}}
      ORDER BY created_at ASC, id ASC
      LIMIT 100
    `,
    { diagnosisSessionId: safeSessionId }
  )

  return (result?.data?.executeResultList || []).map(row => ({
    id: Number(row.id || 0),
    eventId: String(row.event_id || '').trim(),
    diagnosisId: String(row.diagnosis_id || '').trim(),
    answerRevisionBefore: Number(row.answer_revision_before || 0),
    answerRevisionAfter: Number(row.answer_revision_after || 0),
    dirtyQuestionKey: String(row.dirty_question_key || '').trim(),
    dirtyRoundIndex: Number(row.dirty_round_index || 0),
    eventType: String(row.event_type || '').trim(),
    questionRowId: Number(row.question_row_id || 0),
    questionKey: String(row.question_key || '').trim(),
    questionText: String(row.question_text || '').trim(),
    questionRoundIndex: Number(row.question_round_index || 0),
    previousOptionKey: String(row.previous_option_key || '').trim(),
    previousStatus: String(row.previous_status || '').trim(),
    previousAsked: Number(row.previous_asked || 0) ? 1 : 0,
    newOptionKey: String(row.new_option_key || '').trim(),
    newStatus: String(row.new_status || '').trim(),
    newAsked: Number(row.new_asked || 0) ? 1 : 0,
    reason: String(row.reason || '').trim(),
    createdAt: String(row.created_at || '').trim()
  }))
}

async function getDiagnosisReviewDetail({ diagnosisSessionId = '', sourceType: _sourceType = 'all' } = {}) {
  const safeSessionId = String(diagnosisSessionId || '').trim()
  if (!safeSessionId) {return null}

  const result = await models.$runSQL(
    `
      SELECT
        sessions.diagnosis_id,
        sessions._openid,
        sessions.user_plant_id,
        sessions.plant_id,
        sessions.current_plant_identity_id,
        sessions.latest_visual_call_batch_id,
        sessions.outcome_type,
        sessions.outcome_payload_json,
        sessions.current_route_primary_action,
        sessions.current_identity_resolution_status,
        sessions.runtime_snapshot_json,
        sessions.final_problem_key,
        sessions.final_problem_cn,
        sessions.ai_summary,
        sessions.session_status,
        sessions.follow_up_round,
        sessions.current_round_index,
        (
          SELECT COUNT(*)
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
        ) AS feedback_count,
        (
          SELECT feedback.is_helpful
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_is_helpful,
        (
          SELECT feedback.is_accurate
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_is_accurate,
        (
          SELECT feedback.note
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_note,
        (
          SELECT feedback.created_at
          FROM ${table('diagnosis_feedback')} AS feedback
          WHERE feedback.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION}
          ORDER BY feedback.created_at DESC
          LIMIT 1
        ) AS latest_feedback_created_at,
        sessions.created_at,
        sessions.updated_at,
        ${buildDiagnosisReviewImageSummaryProjection()},
        ${buildDiagnosisReviewQuestionCountDefaults()},
        ${buildClientPlatformSql('sessions')} AS client_platform,
        ${buildReviewSourceEvidenceSql('sessions')} AS review_source_evidence
      FROM ${table('diagnosis_sessions')} AS sessions
      WHERE sessions.diagnosis_id COLLATE ${SESSION_ID_COLLATION} = CONVERT({{diagnosisSessionId}} USING utf8mb4) COLLATE ${SESSION_ID_COLLATION}
      LIMIT 1
    `,
    {
      diagnosisSessionId: safeSessionId,
      likelyMiniProgramOpenIdPattern: LIKELY_MINI_PROGRAM_OPENID_PATTERN
    }
  )

  const row = result?.data?.executeResultList?.[0]
  if (!row) {return null}

  const [
    batchRecord,
    visualRawRecords,
    followUpRecords,
    answerRevisionEvents,
    visualAggregateSummary,
    visualListEnrichment,
    questionCountEnrichment
  ] = await Promise.all([
    getDiagnosisBatchReviewRecord(safeSessionId),
    listDiagnosisReviewVisualRawRecords(safeSessionId),
    listDiagnosisReviewFollowUps(safeSessionId),
    listDiagnosisReviewAnswerEvents(safeSessionId),
    getLatestVisualAggregateSummary({
      diagnosisSessionId: safeSessionId,
      visualCallBatchId: row.latest_visual_call_batch_id || ''
    }),
    loadDiagnosisReviewListVisualRows([safeSessionId]),
    loadDiagnosisReviewListQuestionCounts([safeSessionId])
  ])
  const enrichedRow = {
    ...row,
    ...buildReviewListVisualDefault(),
    ...buildReviewListQuestionCountDefault(),
    ...(visualListEnrichment.get(safeSessionId) || null),
    ...(questionCountEnrichment.get(safeSessionId) || null)
  }
  const primaryVisualPromptAudit =
    visualRawRecords?.[0]?.llmPromptAudit ||
    resolveLlmPromptAuditFromRawStructuredOutput(visualRawRecords?.[0]?.rawStructuredOutput)
  const visualPromptColumns = normalizeReviewPromptColumns(
    enrichedRow,
    { promptAudit: primaryVisualPromptAudit }
  )
  const runtimeSnapshot = safeJsonParse(enrichedRow.runtime_snapshot_json, {}) || {}
  const symptomClassRuntime =
    runtimeSnapshot?.symptomClassRuntime ||
    await resolveSymptomClassFromVisualCandidates(visualAggregateSummary)
  const storedReviewSourceType = String(
    runtimeSnapshot?.reviewSourceType ||
      runtimeSnapshot?.clientContext?.reviewSourceType ||
      ''
  ).trim().toLowerCase()
  const clientPlatform = String(
    runtimeSnapshot?.clientContext?.platform || ''
  ).trim().toLowerCase()
  const isLikelyManualOpenId = new RegExp(LIKELY_MINI_PROGRAM_OPENID_PATTERN).test(
    String(row._openid || '').trim()
  )
  const reviewSourceType = batchRecord
    ? 'batch'
    : storedReviewSourceType === 'manual' ||
        MINI_PROGRAM_CLIENT_PLATFORMS.has(clientPlatform) ||
        isLikelyManualOpenId
      ? 'manual'
      : 'legacy'
  const reviewSourceEvidence = batchRecord
    ? 'batch_table'
    : storedReviewSourceType === 'manual' || MINI_PROGRAM_CLIENT_PLATFORMS.has(clientPlatform)
      ? 'platform_tagged'
      : isLikelyManualOpenId
        ? 'openid_inferred_manual'
      : 'openid_inferred_legacy'
  const previewImageRef = String(enrichedRow.preview_image_ref || '').trim()

  const mapped = mapDiagnosisReviewRow({
    ...enrichedRow,
    ...visualPromptColumns,
    preview_visual_raw_image_record_id: enrichedRow.preview_visual_raw_image_record_id || '',
    replay_image_ref: enrichedRow.replay_image_ref || '',
    preview_image_ref: previewImageRef,
    image_count: enrichedRow.image_count || 0,
    review_source_type: reviewSourceType,
    client_platform: clientPlatform,
    review_source_evidence: reviewSourceEvidence,
    batch_source: batchRecord?.batch_source || '',
    batch_sample_label: batchRecord?.sample_label || '',
    batch_sample_file_name: batchRecord?.sample_file_name || '',
    batch_sample_absolute_path: batchRecord?.sample_absolute_path || '',
    batch_answer_path_signature: batchRecord?.answer_path_signature || '',
    batch_generated_at: batchRecord?.batch_generated_at || ''
  })
  const actionAdviceGovernance = await resolveDiagnosisReviewActionAdviceGovernance({
    row: enrichedRow,
    runtimeSnapshot,
    mapped
  })
  const coreProcess = buildPublicCoreProcess({
    latestVisualCallBatchId:
      normalizeStoredNullableText(row.latest_visual_call_batch_id, null) ||
      runtimeSnapshot?.latestVisualCallBatchId ||
      null,
    visualBatchTrace: runtimeSnapshot?.visualBatchTrace || null,
    visualAggregateSummary: visualAggregateSummary || runtimeSnapshot?.visualAggregateSummary || null,
    shadowCompareSummary:
      visualAggregateSummary?.shadow_compare_summary ||
      visualAggregateSummary?.shadowCompareSummary ||
      runtimeSnapshot?.shadowCompareSummary ||
      null,
    observedSymptoms: Array.isArray(runtimeSnapshot?.observedSymptoms)
      ? runtimeSnapshot.observedSymptoms
      : [],
    observedEvidenceSet: Array.isArray(runtimeSnapshot?.observedEvidenceSet)
      ? runtimeSnapshot.observedEvidenceSet
      : [],
    symptomClass: symptomClassRuntime || null,
    derivedEvidenceSet: Array.isArray(runtimeSnapshot?.derivedEvidenceSet)
      ? runtimeSnapshot.derivedEvidenceSet
      : [],
    diagnosisDirections: Array.isArray(runtimeSnapshot?.diagnosisDirections)
      ? runtimeSnapshot.diagnosisDirections
      : [],
    careBaselineSummary: runtimeSnapshot?.careBaselineSummary || null,
    environmentDeviationHints: Array.isArray(runtimeSnapshot?.environmentDeviationHints)
      ? runtimeSnapshot.environmentDeviationHints
      : [],
    routePrimaryAction:
      row.current_route_primary_action || runtimeSnapshot?.routePrimaryAction || '',
    routeDecision: runtimeSnapshot?.routeDecision || runtimeSnapshot?.metrics?.routeDecision || null,
    questionQueue: runtimeSnapshot?.questionQueue || null,
    stopReason: runtimeSnapshot?.stopReason || runtimeSnapshot?.stopState?.stopReason || '',
    stopState: runtimeSnapshot?.stopState || null,
    outputEligibility: runtimeSnapshot?.outputEligibility || null,
    diagnosticTrace: Array.isArray(runtimeSnapshot?.diagnosticTrace)
      ? runtimeSnapshot.diagnosticTrace
      : []
  })

  return {
    ...mapped,
    symptomClass: buildSymptomClassRuntimeReviewPayload(symptomClassRuntime),
    coreProcess,
    actionAdviceGovernance,
    visualRawRecords,
    followUpRecords,
    answerRevisionEvents,
    followUpAnswerEvents: answerRevisionEvents,
    firstRoundQuestions: followUpRecords.filter(item => Number(item?.roundIndex || 1) <= 1),
    batchReviewMeta:
      batchRecord || mapped?.reviewSourceType === 'batch'
        ? {
            batchSource: String(batchRecord?.batch_source || mapped?.batchReviewMeta?.batchSource || '').trim(),
            sampleLabel: String(batchRecord?.sample_label || mapped?.batchReviewMeta?.sampleLabel || '').trim(),
            sampleFileName: String(batchRecord?.sample_file_name || mapped?.batchReviewMeta?.sampleFileName || '').trim(),
            sampleAbsolutePath: String(batchRecord?.sample_absolute_path || mapped?.batchReviewMeta?.sampleAbsolutePath || '').trim(),
            answerPathSignature: String(batchRecord?.answer_path_signature || mapped?.batchReviewMeta?.answerPathSignature || '').trim(),
            answerPathJson: safeJsonParse(batchRecord?.answer_path_json, []),
            roundsUsed: Number(batchRecord?.rounds_used || 0),
            questionCount: Number(batchRecord?.question_count || 0),
            observedEvidenceCount: Number(batchRecord?.observed_evidence_count || 0),
            diagnosisDirectionLabels: safeJsonParse(batchRecord?.diagnosis_direction_labels_json, []),
            batchGeneratedAt: String(batchRecord?.batch_generated_at || mapped?.batchReviewMeta?.batchGeneratedAt || '').trim()
      }
        : null
  }
}

async function upsertDiagnosisBatchReviews({ records = [], batchSource = 'plant-sample-combination-audit' } = {}) {
  const safeRecords = (Array.isArray(records) ? records : [])
    .map(item => ({
      diagnosisSessionId: String(item?.diagnosisSessionId || item?.diagnosis_id || '').trim(),
      sourceSchema: String(item?.sourceSchema || item?.source_schema || '').trim(),
      batchGeneratedAt: item?.batchGeneratedAt || item?.batch_generated_at || null,
      sampleLabel: String(item?.sampleLabel || item?.label || item?.sample_label || '').trim(),
      sampleFileName: String(item?.sampleFileName || item?.fileName || item?.sample_file_name || '').trim(),
      sampleAbsolutePath: String(item?.sampleAbsolutePath || item?.absolutePath || item?.sample_absolute_path || '').trim(),
      answerPathSignature: String(item?.answerPathSignature || item?.answer_path_signature || '').trim(),
      answerPathJson: JSON.stringify(Array.isArray(item?.answerPath) ? item.answerPath : []),
      roundsUsed: Number(item?.roundsUsed || item?.rounds_used || 0),
      questionCount: Number(item?.questionCount || item?.question_count || 0),
      observedEvidenceCount: Number(item?.observedEvidenceCount || item?.observed_evidence_count || 0),
      diagnosisDirectionLabelsJson: JSON.stringify(
        Array.isArray(item?.diagnosisDirectionLabels || item?.diagnosis_direction_labels)
          ? item?.diagnosisDirectionLabels || item?.diagnosis_direction_labels
          : []
      )
    }))
    .filter(item => item.diagnosisSessionId)

  if (!safeRecords.length) {
    return {
      upsertedCount: 0
    }
  }

  const valuesClause = safeRecords
    .map(item => {
      return `(
        ${toSqlText(item.diagnosisSessionId)},
        ${toSqlText(batchSource)},
        ${toSqlText(item.sourceSchema)},
        ${toSqlDateTime(item.batchGeneratedAt)},
        ${toSqlText(item.sampleLabel)},
        ${toSqlText(item.sampleFileName)},
        ${toSqlText(item.sampleAbsolutePath, { nullable: true })},
        ${toSqlText(item.answerPathSignature, { nullable: true })},
        ${toSqlText(item.answerPathJson, { nullable: true })},
        ${toSqlNumber(item.roundsUsed, 0)},
        ${toSqlNumber(item.questionCount, 0)},
        ${toSqlNumber(item.observedEvidenceCount, 0)},
        ${toSqlText(item.diagnosisDirectionLabelsJson, { nullable: true })}
      )`
    })
    .join(',\n')

  await models.$runSQL(
    `
      INSERT INTO ${table('diagnosis_batch_reviews')} (
        diagnosis_id,
        batch_source,
        source_schema,
        batch_generated_at,
        sample_label,
        sample_file_name,
        sample_absolute_path,
        answer_path_signature,
        answer_path_json,
        rounds_used,
        question_count,
        observed_evidence_count,
        diagnosis_direction_labels_json
      ) VALUES
      ${valuesClause}
      ON DUPLICATE KEY UPDATE
        batch_source = VALUES(batch_source),
        source_schema = VALUES(source_schema),
        batch_generated_at = VALUES(batch_generated_at),
        sample_label = VALUES(sample_label),
        sample_file_name = VALUES(sample_file_name),
        sample_absolute_path = VALUES(sample_absolute_path),
        answer_path_signature = VALUES(answer_path_signature),
        answer_path_json = VALUES(answer_path_json),
        rounds_used = VALUES(rounds_used),
        question_count = VALUES(question_count),
        observed_evidence_count = VALUES(observed_evidence_count),
        diagnosis_direction_labels_json = VALUES(diagnosis_direction_labels_json),
        updated_at = CURRENT_TIMESTAMP
    `,
    {}
  )

  return {
    upsertedCount: safeRecords.length
  }
}

module.exports = {
  listDiagnosisReviewSessions,
  getDiagnosisReviewImages,
  getDiagnosisReviewDetail,
  upsertDiagnosisBatchReviews
}
