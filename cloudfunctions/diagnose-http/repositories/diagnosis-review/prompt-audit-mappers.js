'use strict'

const { safeJsonParse } = require('../../utils/stored-value')
const { normalizeReviewLlmUsage, safeStringify } = require('./normalizers')
const {
  canonicalizeReviewSymptomCandidates,
  canonicalizeReviewVisualPayload
} = require('./symptom-canonicalizer')

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

module.exports = {
  normalizeVisualLlmAudit,
  resolveLlmPromptAuditFromRawStructuredOutput,
  normalizeReviewPromptColumns,
  resolveReplayPreviewImage,
  redactLargeVisualValues,
  parseVisualRawStructuredPayload,
  mapVisualRawReviewRow
}
