/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const llmPath = require.resolve('../../../../../cloudfunctions/diagnose-http/utils/llm.js')
let mockedLlmResult = {}
require.cache[llmPath] = {
  id: llmPath,
  filename: llmPath,
  loaded: true,
  exports: { callLLMDiagnose: async () => mockedLlmResult }
}

const adapter = require('../../../../../cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js')
const { _test: adapterTest, analyzeImage } = adapter

const matchingOrgan = adapterTest.resolveOrganDecision(
  { normalized_organ: 'leaf' },
  { inputSlotType: 'leaf' }
)
assert.deepEqual(matchingOrgan, {
  normalized_organ: 'leaf',
  model_detected_organ: 'leaf',
  organ_source: 'merged',
  multi_organ_detected: 0,
  organ_conflict_flag: 0,
  organ_resolution_reason: 'ui_hint_confirmed_by_model'
})

const mismatchedOrgan = adapterTest.resolveOrganDecision(
  { normalized_organ: 'root' },
  { inputSlotType: 'leaf' }
)
assert.equal(mismatchedOrgan.normalized_organ, 'root')
assert.equal(mismatchedOrgan.model_detected_organ, 'root')
assert.equal(mismatchedOrgan.organ_source, 'model_detected')
assert.equal(mismatchedOrgan.organ_conflict_flag, 1)
assert.equal(mismatchedOrgan.organ_resolution_reason, 'model_detected_conflict_with_ui_hint:leaf')

const broadSlotOrgan = adapterTest.resolveOrganDecision(
  { normalized_organ: 'leaf' },
  { inputSlotType: 'whole_plant' }
)
assert.equal(broadSlotOrgan.normalized_organ, 'leaf')
assert.equal(broadSlotOrgan.organ_source, 'model_detected')
assert.equal(broadSlotOrgan.organ_conflict_flag, 0)

const compatibleRootCrown = adapterTest.resolveOrganDecision(
  { normalized_organ: 'root_crown' },
  { inputSlotType: 'root' }
)
assert.equal(compatibleRootCrown.normalized_organ, 'root_crown')
assert.equal(compatibleRootCrown.organ_conflict_flag, 0)

const normalized = adapterTest.normalizeModelVisualResult(
  {
    image_id: 'model_must_not_replace_runtime_id',
    normalized_organ: 'root',
    image_quality_grade: 'good',
    analyzability: 'high',
    capture_region: 'root_crown',
    region_ref: 'root_crown',
    mode_candidates: [{ mode: 'fungus_gnat', confidence: 0.95 }],
    symptom_candidates: [
      {
        symptom_key: 'wet_soil_surface',
        strength_level: 'strong',
        confidence_band: 'high',
        region_ref: 'root_crown'
      }
    ]
  },
  {
    imageId: 'runtime_image_id',
    inputSlotType: 'leaf',
    captureRegion: 'leaf_upper_surface'
  },
  'batch_adapter_contract'
)
assert.equal(normalized.image_id, 'runtime_image_id')
assert.equal(normalized.model_detected_organ, 'root')
assert.equal(normalized.normalized_organ, 'root')
assert.equal(normalized.organ_conflict_flag, 1)
assert.equal(normalized.organ_source, 'model_detected')
assert.equal(normalized.capture_region, 'root_crown')
assert.deepEqual(normalized.mode_candidates, [
  { mode: 'fungus_gnat', confidence: 0.95, region_ref: 'root_crown' }
])
assert.equal(normalized.symptom_candidates[0].region_ref, 'root_crown')

mockedLlmResult = {
  text: JSON.stringify({
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
  }),
  promptAudit: {
    providerId: 'cloudbase',
    service: 'cloudbase',
    model: 'qwen3.5-flash',
    modelId: 'qwen3.5-flash',
    modelIdentity: 'cloudbase:qwen3.5-flash',
    promptText: 'unit visual prompt'
  }
}
const capturedLogs = []
const originalConsoleLog = console.log
let analyzedImage
try {
  console.log = (...args) => capturedLogs.push(args)
  analyzedImage = await analyzeImage(
    {
      imageId: 'runtime_trace_image',
      imageRef: 'https://storage.example.test/leaf.jpg?token=must-not-log',
      inputSlotType: 'leaf',
      captureRegion: 'leaf_upper_surface',
      diagnosisProfile: 'full'
    },
    { visualCallBatchId: 'trace_batch', sessionId: 'trace_session', llmOptions: {} }
  )
} finally {
  console.log = originalConsoleLog
}
assert.equal(analyzedImage.callStatus, 'succeeded')
const traceLog = capturedLogs
  .map(args => String(args[0] || ''))
  .find(entry => entry.startsWith('diagnose-http visual model success trace: '))
assert.ok(traceLog)
const tracePayload = JSON.parse(traceLog.slice('diagnose-http visual model success trace: '.length))
assert.equal(tracePayload.model.model_identity, 'cloudbase:qwen3.5-flash')
assert.equal(
  tracePayload.normalized_visual_summary.symptom_candidates[0].symptom_key,
  'leaf_yellowing'
)
assert.doesNotMatch(JSON.stringify(capturedLogs), /must-not-log/)

console.log('hunyuan visual adapter tests passed data_mode=unit_fake')
