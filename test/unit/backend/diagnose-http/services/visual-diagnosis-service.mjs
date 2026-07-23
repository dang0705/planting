import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module, { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseLLMVisualResult
} = require('../../../../../cloudfunctions/diagnose-http/utils/diagnosis-parser.js')
const {
  attachDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/services/visual-mode-route-service.js')
const {
  buildSpecificPestQuestionPackage
} = require('../../../../../cloudfunctions/diagnose-http/app/pest-question-package.js')

for (const symptomKey of ['silver_scarring', 'silver_streaks']) {
  const parsed = parseLLMVisualResult(
    JSON.stringify({
      normalized_organ: 'leaf',
      image_quality_grade: 'good',
      analyzability: 'high',
      capture_region: 'leaf_upper_surface',
      region_ref: 'leaf_upper_surface',
      mode_candidates: [],
      symptom_candidates: [
        {
          symptom_key: symptomKey,
          strength_level: 'strong',
          confidence_band: 'high'
        }
      ],
      out_of_pool_symptom_candidates: [],
      route_hints: []
    }),
    { diagnosisProfile: 'pest' }
  )
  const candidate = {
    ...parsed.symptom_candidates[0],
    primary_support_image_id: 'img_silver',
    primary_capture_region: 'leaf_upper_surface'
  }
  assert.equal(candidate.admission_readiness, 'ready')
  const routed = attachDiagnosisModeRoute({
    diagnosisProfile: 'pest',
    aggregateResult: {
      aggregate_analyzability: 'high',
      aggregated_symptom_candidates: [candidate],
      admission_records: [
        {
          object_type: 'symptom',
          object_key: symptomKey,
          admission_result: 'formally_admitted',
          entered_runtime: 1,
          visual_normalized_image_result_id: `normalized_${symptomKey}`,
          candidate
        }
      ]
    },
    successfulResults: [
      {
        imageId: 'img_silver',
        normalizedResult: parsed
      }
    ]
  }).diagnosis_mode_route_result

  assert.equal(routed.nextAction, 'direct_result')
  assert.deepEqual(routed.directMatches, [])
  assert.deepEqual(
    routed.confirmationCandidates.map(item => item.modeKey),
    ['thrips']
  )
  const hiddenPrefilledEvidence = routed.confirmationCandidates.flatMap(routeCandidate =>
    routeCandidate.matchedEvidence.map(evidence => ({
      ...evidence,
      diagnosisMode: routeCandidate.modeKey,
      routeEvidenceRole: 'confirmation_support'
    }))
  )
  const questionPackage = buildSpecificPestQuestionPackage({
    candidateModes: ['thrips'],
    hiddenPrefilledEvidence
  })
  assert.deepEqual(
    hiddenPrefilledEvidence.map(item => item.evidenceKey),
    [symptomKey]
  )
  assert.equal(
    questionPackage.packageQuestions.some(
      item => item.questionKey === 'q_specific_pest__thrips_silver_scarring'
    ),
    false
  )
}

const rawUploadCompression = {
  source: 'client_upload_before_cloud_storage',
  compressed: true,
  resized: true,
  originalSizeBytes: 4194304,
  uploadedSizeBytes: 409600,
  compressionRatio: 0.098,
  quality: 68,
  width: 1536,
  height: 1056,
  sourceWidth: 3635,
  sourceHeight: 2467,
  sourcePixelCount: 8967545,
  outputPixelCount: 1622016,
  maxPixels: 1638400,
  pixelAlignment: 32,
  estimatedQwenVisualTokens: 1584,
  targetSizeBytes: 471859,
  minimumQuality: 68,
  preserveImageDetails: false,
  doubleConfirmedForHunyuan: true
}
const sqlCalls = []
let adapterInput = null
let adapterOptions = null
let uploadCompression = null
const streamedContent = [' ', '{', '"normalized_organ"']
const adapterMeta = {
  source_model_provider: 'cloudbase_qwen_vl',
  source_model_name: 'qwen3.5-plus',
  adapter_name: 'unit_qwen_adapter',
  model_version: 'unit',
  prompt_version: 'unit'
}
const visualAdapter = {
  getAdapterMeta: override => ({ ...adapterMeta, ...override }),
  async analyzeImage(input, options = {}) {
    adapterInput = input
    adapterOptions = options
    const { onText } = options
    for (const chunk of streamedContent) {
      onText?.(chunk, chunk)
    }
    return {
      adapterMeta,
      normalizedResult: {
        normalized_organ: 'leaf',
        image_quality_grade: 'good',
        analyzability: 'high',
        capture_region: 'leaf_upper_surface',
        region_ref: 'leaf_upper_surface',
        mode_candidates: [],
        symptom_candidates: [],
        out_of_pool_symptom_candidates: [],
        route_hints: []
      },
      rawStructuredOutput: { normalized_organ: 'leaf' },
      rawTextOutput: '{"normalized_organ":"leaf"}',
      llmPromptAudit: {
        imageContext: {
          selectedImageContexts: [{ uploadCompression: input.uploadCompression }]
        }
      },
      llmUsage: {
        promptTokens: 1200,
        completionTokens: 48,
        totalTokens: 1248,
        promptCacheHitTokens: 900,
        promptCacheCreationInputTokens: 0,
        promptCacheMissTokens: 300
      }
    }
  }
}

const originalLoad = Module._load
Module._load = function loadVisualServiceWithStubs(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        async $runSQL(sql, bindings) {
          sqlCalls.push({ sql, bindings })
          return []
        }
      }
    }
  }
  if (request === '../configs') {
    return {
      llm: {
        service: 'cloudbase_qwen_vl',
        model: 'qwen3.5-plus',
        shadowService: '',
        shadowModel: ''
      }
    }
  }
  if (request === './visual-adapters') {
    return { getVisualAdapter: () => visualAdapter }
  }
  if (request === '../repositories/out-of-pool-proxy-mapping-repository') {
    return { listAuditedOutOfPoolProxyMappings: async () => [] }
  }
  if (request === '../repositories/symptom-repository') {
    return { getPromptSymptomDictionary: async () => [] }
  }
  return originalLoad.call(this, request, parent, isMain)
}

try {
  const servicePath =
    require.resolve('../../../../../cloudfunctions/diagnose-http/services/visual-diagnosis-service.js')
  const requestNormalizerPath =
    require.resolve('../../../../../cloudfunctions/diagnose-http/app/request-normalizers.js')
  delete require.cache[requestNormalizerPath]
  delete require.cache[servicePath]
  const { resolveVisualImageInputs } = require(requestNormalizerPath)
  const { analyzeAndPersistVisualBatch } = require(servicePath)
  const imageInputs = resolveVisualImageInputs({
    images: [
      {
        imageRef: 'https://example.test/pixel-budget.jpg',
        inputSlotType: 'leaf',
        uploadCompression: rawUploadCompression
      }
    ]
  })
  uploadCompression = imageInputs[0].uploadCompression
  const visualEvents = []
  const batchResult = await analyzeAndPersistVisualBatch({
    sessionId: 'diag_pixel_trace_1',
    openid: 'openid_pixel_trace_1',
    imageInputs,
    onVisualEvent: (event, payload) => visualEvents.push({ event, payload })
  })
  const eventNames = visualEvents.map(item => item.event)
  assert.deepEqual(eventNames.slice(0, 4), [
    'visual_input_ready',
    'visual_model_started',
    'visual_model_response_started',
    'visual_model_complete'
  ])
  const firstContentEvents = visualEvents.filter(
    item => item.event === 'visual_model_response_started'
  )
  assert.equal(firstContentEvents.length, 1)
  assert.deepEqual(firstContentEvents[0].payload, {
    sessionId: 'diag_pixel_trace_1',
    visualCallBatchId: firstContentEvents[0].payload.visualCallBatchId,
    imageCount: 1
  })
  assert.doesNotMatch(JSON.stringify(firstContentEvents[0].payload), /normalized_organ|content|chunk/)
  assert.deepEqual(batchResult.usageSummary, {
    imageCount: 1,
    inputTokens: 1200,
    outputTokens: 48,
    totalTokens: 1248,
    cachedTokens: 900,
    cacheCreationTokens: 0,
    cacheMissTokens: 300,
    reasoningTokens: null,
    providerPromptTextTokens: null,
    providerPromptImageTokens: null,
    items: [
      {
        imageIndex: 0,
        imageId: null,
        inputTokens: 1200,
        outputTokens: 48,
        totalTokens: 1248,
        reasoningTokens: null,
        cachedTokens: 900,
        cacheCreationTokens: 0,
        cacheMissTokens: 300,
        providerPromptTextTokens: null,
        providerPromptImageTokens: null
      }
    ]
  })
  assert.equal(batchResult.aiDebug.length, 1)
  assert.equal(batchResult.aiDebug[0].formattedPrompt, '')
  assert.equal(batchResult.aiDebug[0].rawTextOutput, '{"normalized_organ":"leaf"}')
  assert.deepEqual(batchResult.aiDebug[0].rawStructuredOutput, { normalized_organ: 'leaf' })
} finally {
  Module._load = originalLoad
}

assert.deepEqual(adapterInput.uploadCompression, uploadCompression)
assert.equal(adapterOptions.sessionId, 'diag_pixel_trace_1')
const adapterSource = fs.readFileSync(
  require.resolve('../../../../../cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js'),
  'utf8'
)
const llmSource = fs.readFileSync(
  require.resolve('../../../../../cloudfunctions/diagnose-http/utils/llm.js'),
  'utf8'
)
assert.match(adapterSource, /callLLMDiagnose\(\[imageRuntimeInput\], \{ onText, sessionId \}\)/)
assert.match(llmSource, /cloudBaseClient\.callStream\(messages, \{ onText, timeoutMs, sessionId \}\)/)
const rawImageInsert = sqlCalls.find(item =>
  item.sql.includes('INSERT INTO visual_raw_image_records')
)
assert.ok(rawImageInsert)
const persistedRawStructuredOutput = JSON.parse(rawImageInsert.bindings.rawStructuredOutput)
assert.deepEqual(persistedRawStructuredOutput.upload_compression, uploadCompression)
assert.deepEqual(
  persistedRawStructuredOutput.llm_prompt.imageContext.selectedImageContexts[0].uploadCompression,
  uploadCompression
)

console.log('visual diagnosis service compact evidence tests passed')
