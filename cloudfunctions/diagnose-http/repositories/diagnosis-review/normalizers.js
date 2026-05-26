'use strict'

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
      effectValue: normalizeReviewNullableNumber(
        item?.effectValue ?? item?.effect_value ?? item?.effectValue ?? item?.score_delta
      ),
      reason: String(item?.reason || item?.reasonCn || item?.reason_cn || '').trim()
    }))
    .filter(item => item.problemKey && item.effectValue !== null && item.effectValue !== 0)
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

function normalizeSourceFilter(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized || !ALLOWED_SOURCE_FILTERS.has(normalized)) {
    return 'all'
  }
  return normalized
}
function normalizePageBounds({ page = 1, pageSize = 20 } = {}) {
  const safePage = normalizePageNumber(page)
  const safePageSize = normalizePageSize(pageSize)
  return {
    safePage,
    safePageSize,
    offset: (safePage - 1) * safePageSize
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

module.exports = {
  ALLOWED_OUTCOME_FILTERS,
  ALLOWED_SOURCE_FILTERS,
  SESSION_ID_COLLATION,
  INTERNAL_REVIEW_OPENID_PREFIXES,
  MINI_PROGRAM_CLIENT_PLATFORMS,
  LIKELY_MINI_PROGRAM_OPENID_PATTERN,
  normalizeOutcomeFilter,
  normalizePageNumber,
  normalizePageSize,
  normalizeKeyword,
  normalizeReviewText,
  normalizeReviewNullableNumber,
  normalizeReviewDirectProblemAdjustments,
  pickReviewUsageNumber,
  resolveReviewPromptTokenDetails,
  normalizeReviewLlmUsage,
  normalizeSourceFilter,
  normalizePageBounds,
  safeStringify
}
