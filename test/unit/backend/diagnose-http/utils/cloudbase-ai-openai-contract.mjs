import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const repoRoot = process.cwd()
const configPath = require.resolve('../../../../../cloudfunctions/diagnose-http/configs/index.js')
for (const name of [
  'LLM_PROVIDER_NAME',
  'LLM_CLOUDBASE_AI_PROVIDER',
  'LLM_MODEL',
  'LLM_MODEL_PROFILE',
  'LLM_TOKENHUB_MODEL',
  'LLM_CLOUDBASE_AI_MODEL',
  'LLM_ALIYUN_BAILIAN_MODEL',
  'LLM_FAST_MODEL',
  'LLM_QWEN_VL_FAST_MODEL',
  'LLM_QWEN_3_5_PLUS_MODEL',
  'LLM_DEEP_THINKING_MODEL'
]) {
  delete process.env[name]
}
delete require.cache[configPath]
const {
  buildCloudbaseAnthropicPayload,
  buildTokenHubPromptCacheKey,
  buildTokenHubSessionAffinityId
} = require(configPath)
const { llm } = require(configPath)
const {
  normalizeUsage,
  buildCloudBaseAiPayload,
  buildOpenAiVisionMessages,
  createCloudBaseAiOpenAiClient
} = require('../../../../../cloudfunctions/diagnose-http/utils/cloudbase-ai-openai-contract.js')

const tokenhubClientWithoutKey = createCloudBaseAiOpenAiClient({
  service: 'tokenhub',
  cloudbaseAi: { tokenhubApiKey: '' }
})
await assert.rejects(() => tokenhubClientWithoutKey.resolveAuthorization(), /TOKENHUB_API_KEY/)
const tokenhubClient = createCloudBaseAiOpenAiClient({
  service: 'tokenhub',
  cloudbaseAi: { tokenhubApiKey: 'tokenhub-contract-key' }
})
assert.equal(await tokenhubClient.resolveAuthorization(), 'Bearer tokenhub-contract-key')
const tokenhubImageClient = createCloudBaseAiOpenAiClient({
  model: llm.model,
  service: 'TokenHub',
  cloudbaseAi: { imageMaxPixels: 1638400 }
})
assert.deepEqual(tokenhubImageClient.buildImageContent('https://example.test/tokenhub-image.jpg'), {
  type: 'image_url',
  image_url: { url: 'https://example.test/tokenhub-image.jpg' }
})
const aliyunImageClient = createCloudBaseAiOpenAiClient({
  model: llm.model,
  service: 'aliyun_bailian',
  cloudbaseAi: { imageMaxPixels: 1638400, aliyunBailianApiKey: 'unit-aliyun-key' }
})
assert.deepEqual(aliyunImageClient.buildImageContent('https://example.test/aliyun-image.jpg'), {
  type: 'image_url',
  image_url: { url: 'https://example.test/aliyun-image.jpg' }
})
const aliyunClientWithoutKey = createCloudBaseAiOpenAiClient({
  service: 'aliyun_bailian',
  cloudbaseAi: { apiKey: 'unit-cloudbase-key', tokenhubApiKey: 'unit-tokenhub-key' }
})
await assert.rejects(
  () => aliyunClientWithoutKey.resolveAuthorization(),
  /LLM_ALIYUN_BAILIAN_API_KEY/
)
assert.equal(await aliyunImageClient.resolveAuthorization(), 'Bearer unit-aliyun-key')
assert.match(
  fs.readFileSync(
    path.join(repoRoot, 'cloudfunctions/diagnose-http/services/visual-adapters/index.js'),
    'utf8'
  ),
  /isOpenAiVisionProvider\(normalizedService\)/
)

const actualProfilePayload = buildCloudBaseAiPayload({
  model: llm.model,
  service: 'tokenhub',
  messages: [{ role: 'user', content: [] }],
  cloudbaseAi: llm.cloudbaseAi,
  llmOptions: llm.options
})
assert.equal(actualProfilePayload.model, llm.model)
assert.deepEqual(actualProfilePayload.messages, [{ role: 'user', content: [] }])
assert.equal(actualProfilePayload.stream, false)
assert.equal(actualProfilePayload.enable_thinking, false)
assert.equal(actualProfilePayload.max_tokens, 800)
assert.equal(Object.hasOwn(actualProfilePayload, 'prompt_cache_key'), false)
assert.equal(Object.hasOwn(actualProfilePayload, 'thinking'), false)

const experimentPayload = buildCloudBaseAiPayload({
  model: 'qwen3.5-plus',
  service: 'tokenhub',
  messages: [],
  cloudbaseAi: { enableThinking: true, maxTokens: 640 }
})
assert.equal(experimentPayload.enable_thinking, true)
assert.equal(experimentPayload.max_tokens, 640)

const nonQwenPayload = buildCloudBaseAiPayload({
  model: 'hunyuan-vision-1.5-instruct',
  service: 'tokenhub',
  messages: [],
  cloudbaseAi: { enableThinking: false }
})
assert.equal(Object.hasOwn(nonQwenPayload, 'enable_thinking'), false)
assert.throws(
  () => buildCloudBaseAiPayload({ model: llm.model, service: 'cloudbase' }),
  /provider_protocol_requires_messages_transport:cloudbase/
)

const completionUsage = normalizeUsage({
  prompt_tokens: 4227,
  completion_tokens: 1774,
  total_tokens: 6001,
  completion_tokens_details: { reasoning_tokens: 1280 },
  prompt_tokens_details: { cached_tokens: 3000, text_tokens: 1724, image_tokens: 2503 }
})
assert.equal(completionUsage.completionTokens, 1774)
assert.equal(completionUsage.outputTokens, 1774)
assert.equal(completionUsage.reasoningTokens, 1280)
assert.equal(completionUsage.visibleCompletionTokens, 494)
assert.equal(completionUsage.promptCacheHitTokens, 3000)
assert.equal(completionUsage.providerPromptTextTokens, 1724)
assert.equal(completionUsage.providerPromptImageTokens, 2503)
assert.equal(completionUsage.rawUsage.completion_tokens, 1774)

const outputUsage = normalizeUsage({
  input_tokens: 100,
  output_tokens: 30,
  output_tokens_details: { reasoning_tokens: 40 }
})
assert.equal(outputUsage.reasoningTokens, 40)
assert.equal(outputUsage.visibleCompletionTokens, 0)

const anthropicCacheUsage = normalizeUsage({
  input_tokens: 6003,
  output_tokens: 18,
  cache_creation_input_tokens: 6003,
  cache_read_input_tokens: 6003
})
assert.equal(anthropicCacheUsage.promptCacheCreationInputTokens, 6003)
assert.equal(anthropicCacheUsage.promptCacheHitTokens, 6003)

const legacyUsage = normalizeUsage({ PromptTokens: 10, CompletionTokens: 8, TotalTokens: 18 })
assert.equal(legacyUsage.reasoningTokens, null)
assert.equal(legacyUsage.visibleCompletionTokens, null)
assert.equal(legacyUsage.completionTokens, 8)
assert.equal(legacyUsage.outputTokens, 8)
assert.equal(legacyUsage.providerPromptTextTokens, null)
assert.equal(legacyUsage.providerPromptImageTokens, null)

const uploadCompressionSource = fs.readFileSync(
  path.join(repoRoot, 'cloudfunctions/diagnose-http/utils/upload-compression.js'),
  'utf8'
)
assert.match(
  uploadCompressionSource,
  /sourceWidth sourceHeight sourcePixelCount outputPixelCount maxPixels/
)
assert.match(uploadCompressionSource, /estimatedQwenVisualTokens/)
assert.match(uploadCompressionSource, /resized: Boolean\(value\.resized\)/)

for (const relativePath of [
  'cloudfunctions/diagnose-http/app/request-normalizers.js',
  'cloudfunctions/diagnose-http/services/visual-diagnosis-service.js',
  'cloudfunctions/diagnose-http/utils/llm.js'
]) {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')
  assert.match(
    source,
    /require\('\.\.\/utils\/upload-compression'\)|require\('\.\/upload-compression'\)/
  )
}

const cachePrompt = buildOpenAiVisionMessages({
  promptText: 'static-prefix\n[Dynamic Task]\nruntime-tail',
  imageContents: [{ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } }]
})
assert.equal(cachePrompt.messages[0].role, 'system')
assert.deepEqual(cachePrompt.messages[0].content[0].cache_control, { type: 'ephemeral' })
assert.equal(cachePrompt.messages[0].content[0].text, 'static-prefix')
assert.equal(cachePrompt.messages[1].content[0].text, '[Dynamic Task]\nruntime-tail')
assert.deepEqual(cachePrompt.messages[1].content[1], {
  type: 'image_url',
  image_url: { url: 'https://example.test/image.jpg' }
})
assert.equal(cachePrompt.promptCacheStrategy.markerFound, 1)
const cloudbaseAnthropicDefaultPayload = await buildCloudbaseAnthropicPayload({
  model: llm.model,
  messages: cachePrompt.messages
})
assert.deepEqual(cloudbaseAnthropicDefaultPayload.thinking, { type: 'disabled' })
assert.equal(Object.hasOwn(cloudbaseAnthropicDefaultPayload, 'enable_thinking'), false)
assert.deepEqual(cloudbaseAnthropicDefaultPayload.system[0].cache_control, { type: 'ephemeral' })
assert.deepEqual(cloudbaseAnthropicDefaultPayload.messages[0].content[1], {
  type: 'image',
  source: { type: 'url', url: 'https://example.test/image.jpg' }
})
const cloudbaseAnthropicEnabledPayload = await buildCloudbaseAnthropicPayload({
  model: llm.model,
  messages: cachePrompt.messages,
  cloudbaseAi: { enableThinking: true }
})
assert.equal(Object.hasOwn(cloudbaseAnthropicEnabledPayload, 'thinking'), false)
assert.equal(Object.hasOwn(cloudbaseAnthropicEnabledPayload, 'enable_thinking'), false)
const expectedStaticPrefixHash = crypto
  .createHash('sha1')
  .update('static-prefix', 'utf8')
  .digest('hex')
const expectedDynamicTailHash = crypto
  .createHash('sha1')
  .update('[Dynamic Task]\nruntime-tail', 'utf8')
  .digest('hex')
assert.equal(cachePrompt.promptCacheStrategy.staticPrefixHash, expectedStaticPrefixHash)
assert.equal(cachePrompt.promptCacheStrategy.dynamicTailHash, expectedDynamicTailHash)
assert.equal(
  buildTokenHubPromptCacheKey({
    providerId: 'tokenhub',
    model: llm.model,
    staticPrefixHash: 'b838a350206716fc4620c80a0a78784d259f2ecd'
  }),
  `diagnose_visual_static_v1:tokenhub:${llm.model}:b838a350206716fc4620c80a0a78784d259f2ecd`
)
assert.equal(buildTokenHubSessionAffinityId(''), '')
const sessionAffinityA = buildTokenHubSessionAffinityId('diag_session_alpha')
assert.equal(sessionAffinityA, buildTokenHubSessionAffinityId('diag_session_alpha'))
assert.notEqual(sessionAffinityA, buildTokenHubSessionAffinityId('diag_session_beta'))
assert.match(sessionAffinityA, /^[a-f0-9]{64}$/)
assert.doesNotMatch(sessionAffinityA, /diag_session_alpha/)
const tokenhubCacheClient = createCloudBaseAiOpenAiClient({
  model: llm.model,
  service: 'TokenHub',
  cloudbaseAi: llm.cloudbaseAi
})
const tokenhubCachePrompt = tokenhubCacheClient.buildVisionMessages({
  promptText: 'static-prefix\n[Dynamic Task]\nruntime-tail',
  imageContents: [{ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } }]
})
const expectedTokenHubCacheKey = buildTokenHubPromptCacheKey({
  providerId: 'tokenhub',
  model: llm.model,
  staticPrefixHash: expectedStaticPrefixHash
})
assert.equal(Object.hasOwn(tokenhubCachePrompt.messages[0].content[0], 'cache_control'), false)
assert.equal(tokenhubCachePrompt.promptCacheStrategy.staticPrefixHash, expectedStaticPrefixHash)
assert.equal(tokenhubCachePrompt.promptCacheStrategy.dynamicTailHash, expectedDynamicTailHash)
assert.equal(tokenhubCachePrompt.promptCacheStrategy.providerId, 'tokenhub')
assert.equal(tokenhubCachePrompt.promptCacheStrategy.modelId, llm.model)
assert.equal(tokenhubCachePrompt.promptCacheStrategy.modelIdentity, `tokenhub:${llm.model}`)
assert.equal(tokenhubCachePrompt.promptCacheStrategy.cacheKeyConfigured, true)
assert.match(tokenhubCachePrompt.promptCacheStrategy.cacheKeyFingerprint, /^[a-f0-9]{16}$/)
assert.equal(Object.hasOwn(tokenhubCachePrompt.promptCacheStrategy, 'promptCacheKey'), false)
const aliyunCachePrompt = aliyunImageClient.buildVisionMessages({
  promptText: 'static-prefix\n[Dynamic Task]\nruntime-tail',
  imageContents: [{ type: 'image_url', image_url: { url: 'https://example.test/image.jpg' } }]
})
for (const providerPrompt of [aliyunCachePrompt]) {
  assert.equal(providerPrompt.promptCacheStrategy.staticPrefixHash, expectedStaticPrefixHash)
  assert.equal(providerPrompt.promptCacheStrategy.dynamicTailHash, expectedDynamicTailHash)
  assert.equal(
    providerPrompt.messages[0].content[0].text,
    tokenhubCachePrompt.messages[0].content[0].text
  )
  assert.equal(
    providerPrompt.messages[1].content[0].text,
    tokenhubCachePrompt.messages[1].content[0].text
  )
  assert.deepEqual(
    providerPrompt.messages[1].content[1],
    tokenhubCachePrompt.messages[1].content[1]
  )
}
assert.equal(aliyunCachePrompt.promptCacheStrategy.modelIdentity, `aliyun_bailian:${llm.model}`)
assert.equal(Object.hasOwn(aliyunCachePrompt.messages[0].content[0], 'cache_control'), false)
assert.equal(aliyunCachePrompt.promptCacheStrategy.cacheMetadata, 'none')
const tokenhubStreamPayload = buildCloudBaseAiPayload({
  model: llm.model,
  service: 'tokenhub',
  messages: cachePrompt.messages,
  stream: true,
  cloudbaseAi: llm.cloudbaseAi,
  llmOptions: llm.options
})
assert.equal(Object.hasOwn(tokenhubStreamPayload.messages[0].content[0], 'cache_control'), false)
assert.equal(tokenhubStreamPayload.prompt_cache_key, expectedTokenHubCacheKey)
assert.equal(tokenhubStreamPayload.stream, true)
assert.deepEqual(tokenhubStreamPayload.stream_options, { include_usage: true })
const tokenhubDynamicPayload = tokenhubCacheClient.buildPayload(
  tokenhubCacheClient.buildVisionMessages({
    promptText: 'static-prefix\n[Dynamic Task]\nanother-runtime-tail',
    imageContents: [
      { type: 'image_url', image_url: { url: 'https://example.test/another-image.jpg' } }
    ]
  }).messages,
  true
)
assert.equal(
  tokenhubCacheClient.buildPayload(tokenhubCachePrompt.messages, true).prompt_cache_key,
  expectedTokenHubCacheKey
)
assert.equal(tokenhubDynamicPayload.prompt_cache_key, expectedTokenHubCacheKey)
const aliyunCachePayload = aliyunImageClient.buildPayload(cachePrompt.messages, true)
assert.equal(Object.hasOwn(aliyunCachePayload, 'prompt_cache_key'), false)
assert.equal(Object.hasOwn(aliyunCachePayload.messages[0].content[0], 'cache_control'), false)
assert.equal(Object.hasOwn(aliyunCachePayload, 'enable_thinking'), false)
assert.equal(Object.hasOwn(aliyunCachePayload, 'thinking'), false)

const https = require('node:https')
const originalHttpsRequest = https.request
const originalDateNow = Date.now
let now = 1000
let streamScenario = 'content'
const requestBodies = []
const requestOptions = []

function createMockRequest(callback) {
  const request = new EventEmitter()
  request.setTimeout = () => {}
  request.destroy = error => request.emit('error', error)
  request.end = body => {
    requestBodies.push(body)
    const startedAt = now
    const response = new EventEmitter()
    response.statusCode = 200
    callback(response)
    now = startedAt + 10
    if (streamScenario === 'non_stream') {
      response.emit('data', Buffer.from('{"choices":[{"message":{"content":"non-stream text"}}]}'))
      now = startedAt + 20
      response.emit('end')
      return
    }
    response.emit('data', Buffer.from('data: {"choices":[{"delta":{}}]}\n\n'))
    if (streamScenario === 'content') {
      now = startedAt + 45
      response.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"{"}}]}\n\n'))
    }
    now = startedAt + 50
    response.emit('data', Buffer.from('data: {"usage":{"prompt_tokens":12}}\n\n'))
    now = startedAt + 60
    response.emit('end')
  }
  return request
}

try {
  Date.now = () => now
  https.request = (options, callback) => {
    requestOptions.push(options)
    return createMockRequest(callback)
  }
  const timingClient = createCloudBaseAiOpenAiClient({
    model: llm.model,
    service: 'TokenHub',
    cloudbaseAi: { tokenhubApiKey: 'unit-tokenhub-key' }
  })
  const streamTimingResult = await timingClient.callStream([{ role: 'user', content: [] }])
  assert.equal(streamTimingResult.httpTiming.providerId, 'tokenhub')
  assert.equal(streamTimingResult.httpTiming.modelId, llm.model)
  assert.equal(streamTimingResult.httpTiming.modelIdentity, `tokenhub:${llm.model}`)
  assert.equal(streamTimingResult.httpTiming.firstByteMs, 10)
  assert.equal(streamTimingResult.httpTiming.firstContentMs, 45)
  assert.equal(Object.hasOwn(JSON.parse(requestBodies[0]), 'prompt_cache_key'), false)
  assert.equal(Object.hasOwn(requestOptions[0].headers, 'X-Session-ID'), false)

  const sessionRequestIndex = requestOptions.length
  await timingClient.callStream(tokenhubCachePrompt.messages, { sessionId: 'diag_session_alpha' })
  await timingClient.callStream(tokenhubCachePrompt.messages, { sessionId: 'diag_session_alpha' })
  await timingClient.callStream(tokenhubCachePrompt.messages, { sessionId: 'diag_session_beta' })
  const sameSessionHeader = requestOptions[sessionRequestIndex].headers['X-Session-ID']
  assert.equal(requestOptions[sessionRequestIndex + 1].headers['X-Session-ID'], sameSessionHeader)
  assert.notEqual(
    requestOptions[sessionRequestIndex + 2].headers['X-Session-ID'],
    sameSessionHeader
  )
  for (const requestIndex of [
    sessionRequestIndex,
    sessionRequestIndex + 1,
    sessionRequestIndex + 2
  ]) {
    assert.equal(JSON.parse(requestBodies[requestIndex]).prompt_cache_key, expectedTokenHubCacheKey)
    assert.doesNotMatch(JSON.stringify(requestOptions[requestIndex].headers), /diag_session_/)
    assert.doesNotMatch(JSON.stringify(requestBodies[requestIndex]), /diag_session_/)
  }

  const noSessionRequestIndex = requestOptions.length
  await timingClient.callStream(tokenhubCachePrompt.messages)
  assert.equal(
    JSON.parse(requestBodies[noSessionRequestIndex]).prompt_cache_key,
    expectedTokenHubCacheKey
  )
  assert.equal(Object.hasOwn(requestOptions[noSessionRequestIndex].headers, 'X-Session-ID'), false)

  const aliyunRequestIndex = requestOptions.length
  const aliyunResult = await aliyunImageClient.callStream(aliyunCachePrompt.messages, {
    sessionId: 'diag_session_alpha'
  })
  assert.equal(aliyunResult.httpTiming.provider, 'aliyun_bailian_openai')
  assert.equal(aliyunResult.httpTiming.providerId, 'aliyun_bailian')
  assert.equal(aliyunResult.httpTiming.modelId, llm.model)
  assert.equal(aliyunResult.httpTiming.modelIdentity, `aliyun_bailian:${llm.model}`)
  assert.equal(requestOptions[aliyunRequestIndex].hostname, 'dashscope.aliyuncs.com')
  assert.equal(requestOptions[aliyunRequestIndex].path, '/compatible-mode/v1/chat/completions')
  assert.equal(requestOptions[aliyunRequestIndex].headers.Authorization, 'Bearer unit-aliyun-key')
  assert.equal(Object.hasOwn(requestOptions[aliyunRequestIndex].headers, 'X-Session-ID'), false)
  assert.equal(
    Object.hasOwn(JSON.parse(requestBodies[aliyunRequestIndex]), 'prompt_cache_key'),
    false
  )
  assert.equal(
    Object.hasOwn(
      JSON.parse(requestBodies[aliyunRequestIndex]).messages[0].content[0],
      'cache_control'
    ),
    false
  )

  streamScenario = 'usage_only'
  now = 2000
  let usageOnlyError = null
  await assert.rejects(
    () => timingClient.callStream([{ role: 'user', content: [] }]),
    error => {
      usageOnlyError = error
      return true
    }
  )
  assert.equal(usageOnlyError.httpTiming.firstByteMs, 10)
  assert.equal(usageOnlyError.httpTiming.firstContentMs, null)
  assert.equal(usageOnlyError.providerId, 'tokenhub')
  assert.equal(usageOnlyError.modelId, llm.model)
  assert.equal(usageOnlyError.modelIdentity, `tokenhub:${llm.model}`)

  streamScenario = 'non_stream'
  now = 3000
  const nonStreamTimingResult = await timingClient.callNonStream([{ role: 'user', content: [] }])
  assert.equal(nonStreamTimingResult.httpTiming.firstByteMs, 10)
  assert.equal(nonStreamTimingResult.httpTiming.firstContentMs, null)
} finally {
  https.request = originalHttpsRequest
  Date.now = originalDateNow
}

console.log('cloudbase ai openai contract tests passed')
