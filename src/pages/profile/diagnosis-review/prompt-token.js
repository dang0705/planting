import { calculateLlmTokenCost, formatCnyTokenCost } from '@/constants/llm-pricing.js'

export function resolveHunyuanModel(row = null) {
  const modelProvider = String(
    row?.llmSourceModelProvider || row?.hunyuanPromptAudit?.modelProvider || ''
  ).trim()
  const modelName = String(
    row?.llmSourceModelName || row?.hunyuanPromptAudit?.modelName || ''
  ).trim()
  if (modelProvider && modelName) {
    return `${modelProvider}/${modelName}`
  }
  return modelName || modelProvider || '未记录模型'
}

export function resolvePromptVersion(row = null) {
  const version = String(
    row?.llmPromptVersion || row?.llmPrompt?.version || row?.hunyuanPromptAudit?.promptVersion || ''
  ).trim()
  return version || '无版本'
}

export function resolveFullPromptText(row = null) {
  return String(
    row?.llmPromptText ||
      row?.llmPrompt?.promptText ||
      row?.hunyuanPromptAudit?.promptText ||
      row?.llmPromptAudit?.promptText ||
      ''
  ).trim()
}

export function resolvePromptTokens(row = null) {
  const usage = row?.usage || row?.hunyuanPromptAudit?.usage || row?.llmPromptAudit?.usage || {}
  const promptTokens = Number(
    row?.promptTokens ?? row?.llmPromptTokens?.prompt ?? usage?.promptTokens ?? 0
  )
  const completionTokens = Number(
    row?.completionTokens ?? row?.llmPromptTokens?.completion ?? usage?.completionTokens ?? 0
  )
  const totalTokens = Number(
    row?.totalTokens ??
      row?.llmPromptTokens?.total ??
      usage?.totalTokens ??
      promptTokens + completionTokens
  )
  return {
    prompt: Number.isFinite(promptTokens) ? promptTokens : 0,
    completion: Number.isFinite(completionTokens) ? completionTokens : 0,
    total: Number.isFinite(totalTokens) ? totalTokens : 0
  }
}

export function hasPromptTokenMetrics(row = null) {
  const tokens = resolvePromptTokens(row)
  return (
    Number(tokens.prompt || 0) > 0 ||
    Number(tokens.completion || 0) > 0 ||
    Number(tokens.total || 0) > 0
  )
}

export function normalizePromptCacheStatus(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  if (normalized === 'hit' || normalized === 'cache_hit') {
    return 'hit'
  }
  if (normalized === 'miss' || normalized === 'cache_miss') {
    return 'miss'
  }
  return 'unknown'
}

export function resolvePromptCacheStatus(row = null) {
  const usage = row?.usage || row?.hunyuanPromptAudit?.usage || row?.llmPromptAudit?.usage || {}
  const statusSource =
    row?.promptCacheStatus ||
    row?.qwenCacheStatus ||
    row?.hunyuanPromptAudit?.promptCacheStatus ||
    row?.hunyuanPromptAudit?.qwenCacheStatus ||
    row?.llmPromptAudit?.promptCacheStatus ||
    row?.llmPromptAudit?.qwenCacheStatus ||
    usage?.promptCacheStatus ||
    usage?.qwenCacheStatus ||
    null
  const rawStatus =
    statusSource && typeof statusSource === 'object' ? statusSource : { status: statusSource }
  const promptTokens = Number(
    rawStatus?.promptTokens ??
      row?.promptTokens ??
      usage?.promptTokens ??
      resolvePromptTokens(row).prompt ??
      0
  )
  const outputTokens = Number(
    rawStatus?.outputTokens ??
      row?.outputTokens ??
      row?.completionTokens ??
      usage?.outputTokens ??
      usage?.completionTokens ??
      resolvePromptTokens(row).completion ??
      0
  )
  const hitTokens = Number(
    rawStatus?.promptCacheHitTokens ?? row?.promptCacheHitTokens ?? usage?.promptCacheHitTokens ?? 0
  )
  const creationTokens = Number(
    rawStatus?.promptCacheCreationInputTokens ??
      row?.promptCacheCreationInputTokens ??
      usage?.promptCacheCreationInputTokens ??
      0
  )
  const explicitMissTokens = Number(
    rawStatus?.promptCacheMissTokens ??
      row?.promptCacheMissTokens ??
      usage?.promptCacheMissTokens ??
      NaN
  )
  const rawStatusText = normalizePromptCacheStatus(rawStatus?.status || '')
  const metricAvailable = Boolean(
    Number(
      rawStatus?.metricAvailable ??
        row?.promptCacheMetricAvailable ??
        usage?.promptCacheMetricAvailable ??
        0
    ) || rawStatusText !== 'unknown'
  )
  const missTokens = Number.isFinite(explicitMissTokens)
    ? Math.max(0, explicitMissTokens)
    : metricAvailable
      ? Math.max(0, promptTokens - Math.max(0, hitTokens) - Math.max(0, creationTokens))
      : 0
  const fallbackStatus = metricAvailable ? (Number(hitTokens || 0) > 0 ? 'hit' : 'miss') : 'unknown'
  const status = normalizePromptCacheStatus(rawStatus?.status || fallbackStatus)
  const hitRatio = promptTokens > 0 ? Number((Math.max(0, hitTokens) / promptTokens).toFixed(4)) : 0

  return {
    status,
    statusLabelCn:
      rawStatus?.statusLabelCn ||
      (status === 'hit' ? '命中缓存' : status === 'miss' ? '未命中缓存' : '未知'),
    promptCacheHitTokens: Math.max(0, Number(hitTokens || 0)),
    promptCacheMissTokens: missTokens,
    promptCacheCreationInputTokens: Math.max(0, Number(creationTokens || 0)),
    outputTokens: Math.max(0, Number(outputTokens || 0)),
    promptTokens: Math.max(0, Number(promptTokens || 0)),
    hitRatio,
    metricAvailable: metricAvailable ? 1 : 0
  }
}

export function hasPromptCacheMetrics(row = null) {
  const status = resolvePromptCacheStatus(row)
  return (
    Number(status.metricAvailable || 0) > 0 ||
    Number(status.promptCacheHitTokens || 0) > 0 ||
    Number(status.promptCacheMissTokens || 0) > 0 ||
    Number(status.promptCacheCreationInputTokens || 0) > 0
  )
}

export function resolvePromptCacheBadgeClass(row = null) {
  const status = resolvePromptCacheStatus(row).status
  return ['prompt-cache-badge', `prompt-cache-badge-${status}`]
}

export function formatPromptCacheHitRatio(row = null) {
  const ratio = resolvePromptCacheStatus(row).hitRatio
  return `${Math.round(Number(ratio || 0) * 1000) / 10}%`
}

export function formatPromptCacheSummary(row = null) {
  const status = resolvePromptCacheStatus(row)
  return [
    status.statusLabelCn,
    `hit ${status.promptCacheHitTokens}`,
    `miss ${status.promptCacheMissTokens}`,
    `create ${status.promptCacheCreationInputTokens}`,
    `ratio ${formatPromptCacheHitRatio(row)}`
  ].join(' ')
}

export function resolvePromptTokenCost(row = null) {
  const cacheStatus = resolvePromptCacheStatus(row)
  return calculateLlmTokenCost(
    {
      ...resolvePromptTokens(row),
      promptCacheHitTokens: cacheStatus.promptCacheHitTokens,
      promptCacheCreationInputTokens: cacheStatus.promptCacheCreationInputTokens
    },
    row
  )
}

export function formatPromptTokenCost(row = null) {
  const cost = resolvePromptTokenCost(row)
  const parts = [
    formatCnyTokenCost(cost.totalCost),
    `in ${formatCnyTokenCost(cost.inputCost)}`,
    `out ${formatCnyTokenCost(cost.outputCost)}`
  ]
  if (cost.pricing?.cacheSupported) {
    parts.push(
      `base ${formatCnyTokenCost(cost.uncachedInputCost)}`,
      `hit ${formatCnyTokenCost(cost.cacheHitInputCost)}`,
      `create ${formatCnyTokenCost(cost.cacheCreationInputCost)}`
    )
  }
  return parts.join(' · ')
}

export function formatPromptSnippet(value = '') {
  const text = String(value || '').trim()
  if (!text) {
    return '无 prompt'
  }
  if (text.length <= 120) {
    return text
  }
  return `${text.slice(0, 117)}...`
}
