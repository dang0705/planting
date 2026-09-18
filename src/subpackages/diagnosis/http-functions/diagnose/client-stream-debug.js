import { parseNestedNode } from './client-stream-events.js'

function isDebugObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function findNestedDebugValue(source, keys, maxDepth = 5) {
  const queue = [{ value: source, depth: 0 }]
  const visited = new Set()
  const keySet = new Set(keys)

  while (queue.length) {
    const current = queue.shift()
    const value = parseNestedNode(current?.value)
    if (!isDebugObject(value) || visited.has(value)) {
      continue
    }
    visited.add(value)

    for (const key of keySet) {
      const candidate = parseNestedNode(value[key])
      if (isDebugObject(candidate) || (Array.isArray(candidate) && candidate.length)) {
        return candidate
      }
    }
    if (current.depth >= maxDepth) {
      continue
    }
    Object.values(value).forEach(child => {
      const parsedChild = parseNestedNode(child)
      if (isDebugObject(parsedChild)) {
        queue.push({ value: parsedChild, depth: current.depth + 1 })
      } else if (Array.isArray(parsedChild)) {
        parsedChild.forEach(item => {
          const parsedItem = parseNestedNode(item)
          if (isDebugObject(parsedItem)) {
            queue.push({ value: parsedItem, depth: current.depth + 1 })
          }
        })
      }
    })
  }
  return null
}

const DEBUG_USAGE_KEYS = ['tokenUsage', 'visualUsage', 'usageSummary', 'aiUsage', 'usage']
const DEBUG_MODEL_DATA_KEYS = ['modelBusinessData', 'model_return_business_data', 'aiDebug']
const DEBUG_EVIDENCE_KEYS = [
  'finalVisualEvidenceData',
  'visualAggregateSummary',
  'visualAggregateResult'
]

function readValue(sources, keys) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue
    }
    for (const key of keys) {
      if (source[key] === undefined || source[key] === null || source[key] === '') {
        continue
      }
      const number = Number(source[key])
      if (Number.isFinite(number)) {
        return number
      }
    }
  }
  return null
}

export function buildFrontendTokenUsageSummary(usage = null) {
  if (!isDebugObject(usage)) {
    return null
  }
  const promptDetails =
    usage.promptTokensDetails || usage.inputTokensDetails || usage.prompt_tokens_details || {}
  const completionDetails =
    usage.completionTokensDetails ||
    usage.outputTokensDetails ||
    usage.completion_tokens_details ||
    {}
  const items = Array.isArray(usage.items) ? usage.items : []
  const sumItems = keys => {
    const values = items.map(item => readValue([item], keys)).filter(value => value !== null)
    return values.length ? values.reduce((sum, value) => sum + value, 0) : null
  }
  const inputKeys = ['inputTokens', 'promptTokens', 'input_tokens', 'prompt_tokens']
  const outputKeys = ['outputTokens', 'completionTokens', 'output_tokens', 'completion_tokens']
  const cachedKeys = [
    'cachedTokens',
    'promptCacheHitTokens',
    'cacheReadInputTokens',
    'cached_input_tokens',
    'prompt_cache_hit_tokens',
    'cache_read_input_tokens'
  ]
  const cacheCreationKeys = [
    'cacheCreationTokens',
    'promptCacheCreationInputTokens',
    'cacheCreationInputTokens',
    'cache_creation_tokens',
    'prompt_cache_creation_input_tokens',
    'cache_creation_input_tokens'
  ]
  const cacheMissKeys = [
    'cacheMissTokens',
    'promptCacheMissTokens',
    'cacheMissInputTokens',
    'cache_miss_tokens',
    'prompt_cache_miss_tokens',
    'cache_miss_input_tokens'
  ]
  const inputTokens = readValue([usage], inputKeys) ?? sumItems(inputKeys)
  const outputTokens = readValue([usage], outputKeys) ?? sumItems(outputKeys)
  const cachedTokens = readValue([usage, promptDetails], cachedKeys) ?? sumItems(cachedKeys)
  const cacheCreationTokens =
    readValue([usage, promptDetails], cacheCreationKeys) ?? sumItems(cacheCreationKeys)
  const cacheMissTokens =
    readValue([usage, promptDetails], cacheMissKeys) ?? sumItems(cacheMissKeys)
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      readValue([usage], ['totalTokens', 'total_tokens', 'totalTokenCount', 'total_token_count']) ??
      (inputTokens !== null && outputTokens !== null ? inputTokens + outputTokens : null),
    cachedTokens,
    cacheCreationTokens,
    cacheMissTokens,
    reasoningTokens: readValue([usage, completionDetails], ['reasoningTokens', 'reasoning_tokens']),
    providerPromptTextTokens: readValue(
      [usage, promptDetails],
      ['providerPromptTextTokens', 'textTokens', 'text_tokens']
    ),
    providerPromptImageTokens: readValue(
      [usage, promptDetails],
      ['providerPromptImageTokens', 'imageTokens', 'image_tokens']
    )
  }
}

function isUsableUsage(usage) {
  const summary = buildFrontendTokenUsageSummary(usage)
  return Boolean(summary && Object.values(summary).some(value => value !== null))
}

export function resolveDebugUsage(...sources) {
  for (const source of sources) {
    const usage = findNestedDebugValue(source, DEBUG_USAGE_KEYS)
    if (isUsableUsage(usage)) {
      return usage
    }
  }
  return null
}

export function resolveDebugArray(...sources) {
  for (const source of sources) {
    const data = findNestedDebugValue(source, DEBUG_MODEL_DATA_KEYS)
    if (Array.isArray(data) && data.length) {
      return data
    }
  }
  return []
}

export function resolveDebugEvidence(...sources) {
  for (const source of sources) {
    const evidence = findNestedDebugValue(source, DEBUG_EVIDENCE_KEYS)
    if (isDebugObject(evidence) || Array.isArray(evidence)) {
      return evidence
    }
  }
  return null
}

export function collectFrontendVisualNodeDebug(payloadItem = {}) {
  const usage = resolveDebugUsage(payloadItem)
  const resolvedModelBusinessData = resolveDebugArray(payloadItem)
  const modelBusinessData = resolvedModelBusinessData.length ? resolvedModelBusinessData : null
  if (usage) {
    // 前端诊断调试日志：保留 token 输入、输出、总量和缓存用量，禁止删除。
    console.log('[诊断 start][token 用量]', buildFrontendTokenUsageSummary(usage))
  }
  if (modelBusinessData) {
    // 前端诊断调试日志：保留模型返回的业务数据，禁止删除。
    console.log('[诊断 start][模型业务数据]', modelBusinessData)
  }
  return { usage, modelBusinessData }
}

export function logFrontendVisualPrompt(payloadItem = {}) {
  // 前端诊断调试日志：只打印模型本次实际生效的完整格式化字符串 prompt，禁止改成对象或摘要。
  // 该日志不包含图片地址；图片仍由后端按 HTTP(S) URL 传输，禁止在此恢复 Base64 图片。
  console.log('[诊断 start][模型调用prompt]', String(payloadItem?.promptText || ''))
}

function resolveDebugPromptText(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') {
      continue
    }
    const promptText = String(source?.modelPromptText || '')
    if (promptText.trim()) {
      return promptText
    }
  }
  return ''
}

export function logFrontendDiagnosisDone(
  data = null,
  diagnosisDebug = null,
  { fallbackUsage = null, fallbackModelBusinessData = [], fallbackEvidence = null } = {}
) {
  const response = data && typeof data === 'object' ? data : null
  if (!response) {
    return
  }
  const usage = resolveDebugUsage(diagnosisDebug, response) || fallbackUsage
  const resolvedModelBusinessData = resolveDebugArray(diagnosisDebug, response)
  const modelBusinessData = resolvedModelBusinessData.length
    ? resolvedModelBusinessData
    : fallbackModelBusinessData
  const finalVisualEvidenceData = resolveDebugEvidence(diagnosisDebug, response) || fallbackEvidence
  const modelPromptText = resolveDebugPromptText(diagnosisDebug, response)
  // 前端仅从最终 done 响应打印本次实际 prompt，避免依赖可能被合并或丢失的中间 SSE 节点。
  // 该模型 prompt 日志绝对禁止去除；只打印完整字符串，不打印节点对象或图片数据。
  if (modelPromptText) {
    logFrontendVisualPrompt({ promptText: modelPromptText })
  }
  // 前端诊断调试日志：保留 start 接口最终业务响应和可用的模型审计数据，禁止删除。
  console.log('[诊断 start][完成响应]', {
    response,
    tokenUsage: buildFrontendTokenUsageSummary(usage),
    modelBusinessData,
    finalVisualEvidenceData
  })
  if (usage) {
    // 前端诊断调试日志：保留 start 接口最终 token 消耗，包含输入、输出和缓存，禁止删除。
    console.log('[诊断 start][token 用量]', buildFrontendTokenUsageSummary(usage))
  } else {
    // 前端诊断调试日志：明确记录 start 未返回 token，禁止把缺失数据伪装成 null 用量。
    console.log('[诊断 start][token 用量缺失]', {
      responseKeys: Object.keys(response),
      hasDiagnosisDebug: Boolean(diagnosisDebug),
      hasFallbackUsage: Boolean(fallbackUsage)
    })
  }
  // 前端诊断调试日志：保留模型最终返回的视觉业务数据，禁止删除。
  console.log('[诊断 start][模型业务数据]', modelBusinessData)
  // 前端诊断调试日志：保留最终视觉证据数据，禁止删除。
  console.log('[诊断 start][最终视觉证据数据]', finalVisualEvidenceData)
}
