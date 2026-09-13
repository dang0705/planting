'use strict'

function normalizeVisualDisplayText(value = '') {
  return String(value || '').trim()
}

function buildVisualEventDisplayText(eventName, data = {}) {
  const explicitText = [
    data?.displayText,
    data?.display_text,
    data?.progressText,
    data?.progress_text,
    data?.statusText,
    data?.status_text
  ]
    .map(normalizeVisualDisplayText)
    .find(Boolean)
  if (explicitText) {
    return explicitText
  }

  switch (String(eventName || '').trim()) {
    case 'visual_preparing':
      return '正在准备检查照片。'
    case 'visual_session_created':
      return '已准备好，正在检查照片。'
    case 'visual_input_ready': {
      const imageCount = Number(data?.imageCount || 0)
      return imageCount > 1
        ? `已收到 ${imageCount} 张照片，正在逐张查看。`
        : '已收到照片，正在仔细查看。'
    }
    case 'visual_model_started':
      return '正在查看照片中的可见痕迹。'
    case 'visual_model_response_started':
      return '正在整理检查结果。'
    case 'visual_model_complete':
      return '照片已查看，正在整理结果。'
    case 'visual_decision_ready': {
      const counts = data?.decision?.counts || {}
      const inPoolCount = Math.max(
        Number(counts.symptomCandidates || 0),
        Number(counts.observedSymptoms || 0)
      )
      const outOfPoolCount = Number(counts.outOfPoolSymptomCandidates || 0)
      const visibleAbnormalityCount = inPoolCount + outOfPoolCount
      return visibleAbnormalityCount > 0
        ? `照片检查完成，发现 ${visibleAbnormalityCount} 处需要留意的地方。`
        : '照片检查完成，暂时没有发现明显异常；如仍有疑问，可补拍更清楚的照片。'
    }
    case 'visual_persisted':
      return '照片已检查，正在准备下一步。'
    case 'visual_extraction_complete':
      return '照片检查完成，正在准备问题或结果。'
    default:
      return ''
  }
}

function buildVisualModelBusinessData(aiDebug = []) {
  return (Array.isArray(aiDebug) ? aiDebug : []).map(item => ({
    imageIndex: item?.imageIndex ?? null,
    imageId: item?.imageId || null,
    rawTextOutput: item?.rawTextOutput || '',
    rawStructuredOutput: item?.rawStructuredOutput || null,
    usage: item?.usage || null,
    promptCache: item?.promptCache || item?.promptAudit?.promptCacheStrategy || null
  }))
}

function isDebugObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function findNestedDebugValue(source, keys, maxDepth = 5) {
  const queue = [{ value: source, depth: 0 }]
  const visited = new Set()
  const keySet = new Set(keys)

  while (queue.length) {
    const current = queue.shift()
    const value = current?.value
    if (!isDebugObject(value) || visited.has(value)) {
      continue
    }
    visited.add(value)
    for (const key of keySet) {
      const candidate = value[key]
      if (isDebugObject(candidate) || (Array.isArray(candidate) && candidate.length)) {
        return candidate
      }
    }
    if (current.depth >= maxDepth) {
      continue
    }
    Object.values(value).forEach(child => {
      if (isDebugObject(child)) {
        queue.push({ value: child, depth: current.depth + 1 })
      } else if (Array.isArray(child)) {
        child.forEach(item => {
          if (isDebugObject(item)) {
            queue.push({ value: item, depth: current.depth + 1 })
          }
        })
      }
    })
  }
  return null
}

function buildVisualUsageFromModelBusinessData(modelBusinessData = []) {
  const items = (Array.isArray(modelBusinessData) ? modelBusinessData : [])
    .map((item, imageIndex) => {
      const usage = item?.usage
      if (!isDebugObject(usage)) {
        return null
      }
      const inputTokens = Number(
        usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? 0
      )
      const outputTokens = Number(
        usage.outputTokens ??
          usage.completionTokens ??
          usage.output_tokens ??
          usage.completion_tokens ??
          0
      )
      const cachedTokens = Number(
        usage.cachedTokens ??
          usage.promptCacheHitTokens ??
          usage.cacheReadInputTokens ??
          usage.cached_input_tokens ??
          usage.prompt_cache_hit_tokens ??
          0
      )
      const cacheCreationTokens = Number(
        usage.cacheCreationTokens ??
          usage.promptCacheCreationInputTokens ??
          usage.cacheCreationInputTokens ??
          usage.cache_creation_tokens ??
          usage.prompt_cache_creation_input_tokens ??
          usage.cache_creation_input_tokens ??
          0
      )
      const cacheMissTokens = Number(
        usage.cacheMissTokens ??
          usage.promptCacheMissTokens ??
          usage.cacheMissInputTokens ??
          usage.cache_miss_tokens ??
          usage.prompt_cache_miss_tokens ??
          usage.cache_miss_input_tokens ??
          0
      )
      const cacheMetricAvailable = Number(
        usage.promptCacheMetricAvailable ?? usage.cacheMetricAvailable ?? 0
      )
      return {
        imageIndex: item?.imageIndex ?? imageIndex,
        imageId: item?.imageId || null,
        inputTokens,
        outputTokens,
        totalTokens: Number(usage.totalTokens ?? usage.total_tokens ?? inputTokens + outputTokens),
        cachedTokens,
        cacheCreationTokens,
        cacheMissTokens,
        cacheMetricAvailable,
        cacheEvidenceStatus:
          cacheMetricAvailable !== 1
            ? 'unreported'
            : cachedTokens > 0
              ? 'hit'
              : cacheCreationTokens > 0
                ? 'created'
                : cacheMissTokens > 0
                  ? 'miss'
                  : 'no_cache_activity',
        reasoningTokens: usage.reasoningTokens ?? null,
        providerPromptTextTokens: usage.providerPromptTextTokens ?? null,
        providerPromptImageTokens: usage.providerPromptImageTokens ?? null
      }
    })
    .filter(Boolean)

  if (!items.length) {
    return null
  }
  return {
    imageCount: items.length,
    inputTokens: items.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: items.reduce((sum, item) => sum + item.outputTokens, 0),
    totalTokens: items.reduce((sum, item) => sum + item.totalTokens, 0),
    cachedTokens: items.reduce((sum, item) => sum + item.cachedTokens, 0),
    cacheCreationTokens: items.reduce((sum, item) => sum + item.cacheCreationTokens, 0),
    cacheMissTokens: items.reduce((sum, item) => sum + item.cacheMissTokens, 0),
    cacheMetricAvailable: Number(
      items.length > 0 && items.every(item => item.cacheMetricAvailable === 1)
    ),
    cacheMetricMissingCount: items.filter(item => item.cacheMetricAvailable !== 1).length,
    items
  }
}

function buildVisualDebugPayload(executed = {}, frontendData = {}) {
  const response = executed?.response || {}
  const modelBusinessData =
    (Array.isArray(executed?.aiDebug) && executed.aiDebug.length ? executed.aiDebug : null) ||
    findNestedDebugValue(executed, [
      'aiDebug',
      'modelBusinessData',
      'model_return_business_data'
    ]) ||
    []
  const tokenUsage =
    executed?.visualUsage ||
    executed?.usageSummary ||
    response?.visualUsage ||
    response?.usageSummary ||
    findNestedDebugValue(executed, [
      'tokenUsage',
      'visualUsage',
      'usageSummary',
      'aiUsage',
      'usage'
    ]) ||
    buildVisualUsageFromModelBusinessData(modelBusinessData)
  return {
    tokenUsage: tokenUsage || null,
    modelBusinessData: buildVisualModelBusinessData(modelBusinessData),
    finalVisualEvidenceData:
      frontendData?.visualAggregateSummary ||
      response?.visualAggregateSummary ||
      response?.visualAggregateResult ||
      null
  }
}

module.exports = {
  buildVisualDebugPayload,
  buildVisualEventDisplayText
}
