/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildVisualModelSuccessTrace,
  logVisualModelSuccessTrace
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-model-success-trace.js')

const records = []
const trace = logVisualModelSuccessTrace(
  {
    imageRuntimeInput: {
      imageId: 'image_leaf_01',
      imageRef: 'https://storage.example.test/leaf.jpg?token=image-secret',
      diagnosisProfile: 'full',
      inputSlotType: 'leaf',
      inputSlotOrder: 1,
      userDeclaredOrganType: 'leaf',
      captureRegion: 'leaf_upper_surface'
    },
    visualCallBatchId: 'visbatch_unit_01',
    sessionId: 'diag_unit_01',
    llmResult: {
      promptAudit: {
        providerId: 'aliyun_bailian',
        service: 'aliyun_bailian',
        model: 'qwen3.5-plus',
        modelId: 'qwen3.5-plus',
        modelIdentity: 'aliyun_bailian:qwen3.5-plus',
        promptCacheStrategy: {
          type: 'explicit_ephemeral_static_prefix',
          cacheMetadata: 'cache_control',
          explicitCacheRequestAudit: {
            contractVersion: 'aliyun_bailian_explicit_cache_v1',
            compliant: 1,
            staticPrefixHash: 'unit-prefix-hash'
          }
        },
        promptText:
          '识别叶片症状。图片地址 https://example.test/input?token=prompt-secret Bearer prompt-secret DASHSCOPE_API_KEY=prompt-key dashscope_api_key=lower-key'
      },
      usage: {
        promptTokens: 1200,
        completionTokens: 48,
        totalTokens: 1248,
        promptCacheHitTokens: 900,
        promptCacheCreationInputTokens: 12,
        promptCacheMissTokens: 288,
        reasoningTokens: 8,
        providerPromptTextTokens: 400,
        providerPromptImageTokens: 800,
        promptCacheMetricAvailable: 1
      }
    },
    adapterMeta: {
      source_model_provider: 'aliyun_bailian',
      source_model_name: 'qwen3.5-plus'
    },
    rawTextOutput:
      '{"symptom_candidates":[{"symptom_key":"leaf_yellowing"}],"debug":"Authorization: raw-secret Bearer raw-secret https://example.test/output?token=raw-secret"}',
    rawStructuredOutput: {
      normalized_organ: 'leaf',
      image_quality_grade: 'good',
      analyzability: 'high',
      capture_region: 'leaf_upper_surface',
      symptom_candidates: [
        {
          symptom_key: 'leaf_yellowing',
          confidence_band: 'high',
          strength_level: 'strong',
          region_ref: 'leaf_upper_surface'
        }
      ],
      mode_candidates: [{ mode: 'yellow_leaf', confidence: 0.95, region_ref: 'leaf_upper_surface' }]
    },
    normalizedResult: {
      normalized_organ: 'leaf',
      model_detected_organ: 'leaf',
      organ_conflict_flag: 0,
      symptom_candidates: [
        {
          symptom_key: 'leaf_yellowing',
          confidence_band: 'high',
          strength_level: 'strong',
          region_ref: 'leaf_upper_surface'
        }
      ],
      mode_candidates: [{ mode: 'yellow_leaf', confidence: 0.95, region_ref: 'leaf_upper_surface' }]
    },
    timing: { llmMs: 120, parseMs: 3, normalizeMs: 2 }
  },
  { log: record => records.push(record) }
)

assert.equal(trace.model.provider_id, 'aliyun_bailian')
assert.equal(trace.model.model, 'qwen3.5-plus')
assert.equal(trace.trace_id, 'visbatch_unit_01:image_leaf_01')
assert.equal(records.length, 3)

const readRecord = prefix => {
  const record = records.find(item => item.startsWith(prefix))
  assert.ok(record, `missing log record: ${prefix}`)
  return JSON.parse(record.slice(prefix.length))
}

const summary = readRecord('diagnose-http visual model success trace: ')
const prompt = readRecord('diagnose-http visual model prompt input: ')
const result = readRecord('diagnose-http visual model raw return: ')

assert.equal(summary.model.model_identity, 'aliyun_bailian:qwen3.5-plus')
assert.deepEqual(summary.usage, {
  input_tokens: 1200,
  output_tokens: 48,
  total_tokens: 1248,
  cached_input_tokens: 900,
  cache_creation_input_tokens: 12,
  cache_miss_input_tokens: 288,
  reasoning_tokens: 8,
  provider_prompt_text_tokens: 400,
  provider_prompt_image_tokens: 800,
  cache_metric_available: 1
})
assert.deepEqual(summary.prompt_cache, {
  type: 'explicit_ephemeral_static_prefix',
  cacheMetadata: 'cache_control',
  explicitCacheRequestAudit: {
    contractVersion: 'aliyun_bailian_explicit_cache_v1',
    compliant: 1,
    staticPrefixHash: 'unit-prefix-hash'
  }
})
assert.deepEqual(summary.model_return_business_data, {
  normalized_organ: 'leaf',
  image_quality_grade: 'good',
  analyzability: 'high',
  capture_region: 'leaf_upper_surface',
  symptom_candidates: [
    {
      symptom_key: 'leaf_yellowing',
      confidence_band: 'high',
      strength_level: 'strong',
      region_ref: 'leaf_upper_surface'
    }
  ],
  mode_candidates: [{ mode: 'yellow_leaf', confidence: 0.95, region_ref: 'leaf_upper_surface' }]
})
assert.deepEqual(summary.parsed_visual_summary.mode_candidates, [
  { mode: 'yellow_leaf', confidence: 0.95, region_ref: 'leaf_upper_surface' }
])
assert.match(prompt.prompt_input.text, /token=\[REDACTED\]/)
assert.match(prompt.prompt_input.text, /Bearer \[REDACTED\]/)
assert.match(prompt.prompt_input.text, /DASHSCOPE_API_KEY=\[REDACTED\]/)
assert.match(prompt.prompt_input.text, /dashscope_api_key=\[REDACTED\]/)
assert.match(result.model_return.text, /token=\[REDACTED\]/)
assert.match(result.model_return.text, /Bearer \[REDACTED\]/)
assert.match(result.model_return.text, /Authorization=\[REDACTED\]/)
assert.doesNotMatch(
  JSON.stringify(records),
  /image-secret|prompt-secret|prompt-key|lower-key|raw-secret/
)
assert.doesNotMatch(JSON.stringify(records), /storage\.example\.test\/leaf\.jpg/)

const fallbackTrace = buildVisualModelSuccessTrace({
  imageRuntimeInput: { imageId: 'fallback_image' },
  llmResult: {
    promptAudit: {
      providerId: 'cloudbase',
      service: 'hunyuan',
      modelId: 'qwen3.5-flash',
      model: 'hunyuan-vision-1.5-instruct',
      modelIdentity: 'cloudbase:qwen3.5-flash',
      conservativeFrom: { service: 'cloudbase', model: 'qwen3.5-flash' }
    }
  },
  adapterMeta: {
    source_model_provider: 'hunyuan',
    source_model_name: 'hunyuan-vision-1.5-instruct'
  }
})
assert.equal(fallbackTrace.model.provider_id, 'hunyuan')
assert.equal(fallbackTrace.model.model_id, 'hunyuan-vision-1.5-instruct')
assert.equal(fallbackTrace.model.model_identity, 'hunyuan:hunyuan-vision-1.5-instruct')
assert.equal(fallbackTrace.model.conservative_fallback, 1)

console.log('visual model success trace tests passed data_mode=unit_fake')
