'use strict'

const TRACE_TEXT_LIMIT = 9000
const TRACE_SHORT_TEXT_LIMIT = 360
const SENSITIVE_QUERY_PARAM_PATTERN =
  /([?&](?:access_token|api[_-]?key|authorization|credential|key|secret|signature|sign|token)=)[^&#\s]*/gi
const BEARER_TOKEN_PATTERN = /(bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const AUTHORIZATION_ASSIGNMENT_PATTERN = /\b(authorization)\s*[:=]\s*([^\s,;]+)/gi
const RUNTIME_SECRET_PATTERN =
  /\b((?:ALIYUN|CLOUDBASE|DASHSCOPE|OPENAI|TENCENTCLOUD|TOKENHUB)_[A-Z0-9_]*(?:TOKEN|SECRET|KEY)[A-Z0-9_]*)\s*[:=]\s*([^\s,;]+)/gi
const DATA_URL_PATTERN = /(data:image\/[^;,]+;base64,)[A-Za-z0-9+/=]+/gi

function text(value = '') {
  return String(value ?? '').trim()
}

function firstText(...values) {
  return values.map(text).find(Boolean) || ''
}

function redactSensitiveText(value = '') {
  return text(value)
    .replace(DATA_URL_PATTERN, '$1[REDACTED_IMAGE_DATA]')
    .replace(SENSITIVE_QUERY_PARAM_PATTERN, '$1[REDACTED]')
    .replace(BEARER_TOKEN_PATTERN, '$1[REDACTED]')
    .replace(AUTHORIZATION_ASSIGNMENT_PATTERN, '$1=[REDACTED]')
    .replace(RUNTIME_SECRET_PATTERN, '$1=[REDACTED]')
}

function traceText(value = '', limit = TRACE_TEXT_LIMIT) {
  const normalized = redactSensitiveText(value)
  return {
    text: normalized.slice(0, limit),
    char_length: normalized.length,
    truncated: Number(normalized.length > limit)
  }
}

function shortText(value = '') {
  return traceText(value, TRACE_SHORT_TEXT_LIMIT).text
}

function numericOrNull(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeTraceUsage(usage = null) {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  return {
    input_tokens: numericOrNull(usage.promptTokens ?? usage.inputTokens),
    output_tokens: numericOrNull(usage.completionTokens ?? usage.outputTokens),
    total_tokens: numericOrNull(usage.totalTokens),
    cached_input_tokens: numericOrNull(
      usage.promptCacheHitTokens ?? usage.cachedTokens ?? usage.cacheReadInputTokens
    ),
    cache_creation_input_tokens: numericOrNull(
      usage.promptCacheCreationInputTokens ?? usage.cacheCreationInputTokens
    ),
    cache_miss_input_tokens: numericOrNull(usage.promptCacheMissTokens ?? usage.cacheMissTokens),
    reasoning_tokens: numericOrNull(usage.reasoningTokens),
    provider_prompt_text_tokens: numericOrNull(usage.providerPromptTextTokens),
    provider_prompt_image_tokens: numericOrNull(usage.providerPromptImageTokens),
    cache_metric_available: numericOrNull(usage.promptCacheMetricAvailable)
  }
}

function summarizeCandidates(candidates = [], fields = []) {
  return (Array.isArray(candidates) ? candidates : []).slice(0, 8).map(candidate => {
    const summary = {}
    for (const field of fields) {
      const value = candidate?.[field]
      if (typeof value === 'string') {
        summary[field] = shortText(value)
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        summary[field] = value
      }
    }
    return summary
  })
}

function buildVisualModelSuccessTrace({
  imageRuntimeInput = {},
  visualCallBatchId = '',
  sessionId = '',
  llmResult = null,
  adapterMeta = {},
  rawTextOutput = '',
  rawStructuredOutput = null,
  normalizedResult = null,
  timing = {}
} = {}) {
  const promptAudit = llmResult && typeof llmResult === 'object' ? llmResult.promptAudit || {} : {}
  const traceId = [text(visualCallBatchId), text(imageRuntimeInput?.imageId)]
    .filter(Boolean)
    .join(':')
  const conservativeFallback = Boolean(promptAudit.conservativeFrom)
  const effectiveProvider = conservativeFallback
    ? firstText(adapterMeta.source_model_provider, promptAudit.service, promptAudit.providerId)
    : firstText(promptAudit.providerId, promptAudit.service, adapterMeta.source_model_provider)
  const effectiveModel = conservativeFallback
    ? firstText(adapterMeta.source_model_name, promptAudit.model, promptAudit.modelId)
    : firstText(promptAudit.model, promptAudit.modelId, adapterMeta.source_model_name)
  const model = {
    provider_id: effectiveProvider,
    service: conservativeFallback
      ? firstText(adapterMeta.source_model_provider, promptAudit.service)
      : firstText(promptAudit.service, adapterMeta.source_model_provider),
    model: effectiveModel,
    model_id: effectiveModel,
    model_identity: conservativeFallback
      ? [effectiveProvider, effectiveModel].filter(Boolean).join(':')
      : firstText(
          promptAudit.modelIdentity,
          [effectiveProvider, effectiveModel].filter(Boolean).join(':')
        ),
    model_profile: firstText(promptAudit.modelProfile, adapterMeta.source_model_profile),
    reasoning_mode: firstText(
      promptAudit.modelReasoningMode,
      adapterMeta.source_model_reasoning_mode
    ),
    image_input_transport: firstText(promptAudit.imageInputTransport),
    conservative_fallback: Number(conservativeFallback)
  }
  const parsed =
    rawStructuredOutput && typeof rawStructuredOutput === 'object' ? rawStructuredOutput : {}
  const normalized =
    normalizedResult && typeof normalizedResult === 'object' ? normalizedResult : {}
  const usage = normalizeTraceUsage(llmResult?.usage)
  const promptCache =
    promptAudit?.promptCacheStrategy && typeof promptAudit.promptCacheStrategy === 'object'
      ? promptAudit.promptCacheStrategy
      : null

  return {
    trace_version: 'visual_model_success_v1',
    event: 'visual_model_call_succeeded',
    trace_id: traceId,
    session_id: shortText(sessionId),
    visual_call_batch_id: shortText(visualCallBatchId),
    image_id: shortText(imageRuntimeInput?.imageId),
    request_context: {
      diagnosis_profile: shortText(imageRuntimeInput?.diagnosisProfile),
      input_slot_type: shortText(imageRuntimeInput?.inputSlotType),
      input_slot_order: Number(imageRuntimeInput?.inputSlotOrder || 0),
      user_declared_organ_type: shortText(imageRuntimeInput?.userDeclaredOrganType),
      capture_region: shortText(imageRuntimeInput?.captureRegion)
    },
    model,
    usage,
    // 诊断审计打印：保留百炼显式缓存请求结构及其创建/命中证据，禁止删除。
    prompt_cache: promptCache,
    prompt_input: traceText(promptAudit.promptText),
    model_return: traceText(rawTextOutput),
    model_return_business_data: parsed,
    parsed_visual_summary: {
      normalized_organ: shortText(parsed.normalized_organ),
      image_quality_grade: shortText(parsed.image_quality_grade),
      analyzability: shortText(parsed.analyzability),
      capture_region: shortText(parsed.capture_region),
      symptom_candidates: summarizeCandidates(parsed.symptom_candidates, [
        'symptom_key',
        'confidence_band',
        'strength_level',
        'region_ref'
      ]),
      visual_discriminators: summarizeCandidates(parsed.visual_discriminators, [
        'dimension_key',
        'value_key',
        'confidence_band',
        'region_ref'
      ]),
      mode_candidates: summarizeCandidates(parsed.mode_candidates, [
        'mode',
        'confidence',
        'region_ref'
      ])
    },
    normalized_visual_summary: {
      normalized_organ: shortText(normalized.normalized_organ),
      model_detected_organ: shortText(normalized.model_detected_organ),
      organ_conflict_flag: Number(normalized.organ_conflict_flag || 0),
      symptom_candidates: summarizeCandidates(normalized.symptom_candidates, [
        'symptom_key',
        'confidence_band',
        'strength_level',
        'region_ref'
      ]),
      visual_discriminators: summarizeCandidates(normalized.visual_discriminators, [
        'dimension_key',
        'value_key',
        'confidence_band',
        'region_ref'
      ]),
      mode_candidates: summarizeCandidates(normalized.mode_candidates, [
        'mode',
        'confidence',
        'region_ref'
      ])
    },
    timing: {
      llm_ms: Number(timing.llmMs || 0),
      parse_ms: Number(timing.parseMs || 0),
      normalize_ms: Number(timing.normalizeMs || 0)
    }
  }
}

function logVisualModelSuccessTrace(input = {}, logger = console) {
  const trace = buildVisualModelSuccessTrace(input)
  const correlation = {
    trace_version: trace.trace_version,
    trace_id: trace.trace_id,
    session_id: trace.session_id,
    visual_call_batch_id: trace.visual_call_batch_id,
    image_id: trace.image_id
  }
  // 诊断审计打印：保留模型标识、token 输入/输出/缓存用量和解析后的业务数据，禁止删除。
  logger.log(
    `diagnose-http visual model success trace: ${JSON.stringify({ ...correlation, event: trace.event, request_context: trace.request_context, model: trace.model, usage: trace.usage, prompt_cache: trace.prompt_cache, model_return_business_data: trace.model_return_business_data, parsed_visual_summary: trace.parsed_visual_summary, normalized_visual_summary: trace.normalized_visual_summary, timing: trace.timing })}`
  )
  // 诊断审计打印：保留模型实际收到的提示词，便于按 trace_id 回放，禁止删除。
  logger.log(
    `diagnose-http visual model prompt input: ${JSON.stringify({ ...correlation, prompt_input: trace.prompt_input })}`
  )
  // 诊断审计打印：保留模型原始文本返回，便于核对业务解析前的内容，禁止删除。
  logger.log(
    `diagnose-http visual model raw return: ${JSON.stringify({ ...correlation, model_return: trace.model_return })}`
  )
  return trace
}

module.exports = {
  buildVisualModelSuccessTrace,
  logVisualModelSuccessTrace,
  redactSensitiveText
}
