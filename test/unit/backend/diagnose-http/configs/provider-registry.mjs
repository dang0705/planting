import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const configPath = require.resolve('../../../../../cloudfunctions/diagnose-http/configs/index.js')
const environmentNames = [
  'LLM_PROVIDER_NAME',
  'LLM_CLOUDBASE_AI_PROVIDER',
  'LLM_MODEL',
  'LLM_MODEL_PROFILE',
  'LLM_SERVICE',
  'LLM_QWEN_3_5_PLUS_SERVICE',
  'LLM_TOKENHUB_MODEL',
  'LLM_CLOUDBASE_AI_MODEL',
  'LLM_ALIYUN_BAILIAN_MODEL',
  'LLM_FAST_MODEL',
  'LLM_QWEN_VL_FAST_MODEL',
  'LLM_QWEN_3_5_PLUS_MODEL',
  'LLM_DEEP_THINKING_MODEL',
  'TOKENHUB_API_KEY',
  'CLOUDBASE_AI_API_KEY',
  'CLOUDBASE_AI_ACCESS_TOKEN',
  'LLM_ALIYUN_BAILIAN_API_KEY',
  'DASHSCOPE_API_KEY',
  'LLM_ALIYUN_BAILIAN_BASE_URL'
]
const originalEnvironment = Object.fromEntries(
  environmentNames.map(name => [name, process.env[name]])
)

function loadLlm(environment = {}) {
  for (const name of environmentNames) {
    delete process.env[name]
  }
  Object.assign(process.env, environment)
  delete require.cache[configPath]
  return require(configPath).llm
}

try {
  const { buildCloudBaseAiEndpoint } = require(configPath)
  const {
    listOpenAiVisionProviders,
    supportsExplicitPromptCache
  } = require('../../../../../cloudfunctions/diagnose-http/configs/provider-registry.js')

  assert.deepEqual(
    listOpenAiVisionProviders().map(provider => provider.id),
    ['tokenhub', 'cloudbase', 'aliyun_bailian']
  )
  assert.equal(listOpenAiVisionProviders()[1].protocol, 'openai_chat_completions')
  assert.equal(supportsExplicitPromptCache('aliyun_bailian'), true)

  const defaultLlm = loadLlm()
  assert.equal(defaultLlm.providerId, 'cloudbase')
  assert.equal(defaultLlm.service, 'cloudbase')
  assert.equal(defaultLlm.modelId, 'qwen3.5-flash')
  assert.equal(defaultLlm.modelIdentity, 'cloudbase:qwen3.5-flash')
  assert.equal(Object.hasOwn(defaultLlm, 'modelProfiles'), false)
  assert.equal(
    buildCloudBaseAiEndpoint({ envId: 'cloud1-test', cloudbaseAi: defaultLlm.cloudbaseAi }),
    'https://cloud1-test.api.tcloudbasegateway.com/v1/ai/aliyun-bailian-custom/chat/completions'
  )

  const {
    createCloudBaseAiOpenAiClient
  } = require('../../../../../cloudfunctions/diagnose-http/utils/cloudbase-ai-openai-contract.js')
  const {
    buildCacheFirstVisualPrompt
  } = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-cache-contract.js')
  const {
    VISUAL_OUTPUT_SCHEMA_TEXT
  } = require('../../../../../cloudfunctions/diagnose-http/utils/visual-contract.js')
  const {
    STATIC_READING_DISCIPLINE_TEXT,
    STATIC_ROUTE_CATALOG_TEXT,
    STATIC_VISUAL_WORKFLOW_RULES
  } = require('../../../../../cloudfunctions/diagnose-http/utils/visual-prompt-static-rules.js')
  const buildProductionStaticPrompt = dynamicTaskText =>
    buildCacheFirstVisualPrompt({
      taskLine: '【角色】你是植物图片的结构化可见证据标注助手。',
      schemaText: VISUAL_OUTPUT_SCHEMA_TEXT,
      ruleText: STATIC_VISUAL_WORKFLOW_RULES,
      evidenceDirectoryText: STATIC_ROUTE_CATALOG_TEXT,
      dynamicTaskText
    })
  const fullInitialStaticPrompt = buildProductionStaticPrompt('诊断配置为综合；判读轮次为首次。')
  const pestFollowupStaticPrompt = buildProductionStaticPrompt('诊断配置为虫害；判读轮次为追问。')
  assert.match(fullInitialStaticPrompt.staticPrefix, /【判读纪律】/)
  assert.match(fullInitialStaticPrompt.staticPrefix, /1\. 先核对对象、位置、形态/)
  assert.ok(STATIC_READING_DISCIPLINE_TEXT.length >= 300)
  assert.ok(fullInitialStaticPrompt.staticPrefix.length >= 1800)
  // 百炼显式缓存按模型 Token 判断；当前前缀需保留超过 1024 Token 的安全余量，
  // 但仍必须低于旧版固定前缀长度，避免为缓存无边界膨胀输入。
  assert.ok(fullInitialStaticPrompt.staticPrefix.length < 3500)
  assert.ok(
    fullInitialStaticPrompt.staticPrefix.indexOf('【静态判读纪律与输出一致性】') <
      fullInitialStaticPrompt.promptText.indexOf('[Dynamic Task]')
  )
  assert.equal(
    fullInitialStaticPrompt.staticPrefix.includes('诊断配置为综合；判读轮次为首次。'),
    false
  )
  assert.equal(
    pestFollowupStaticPrompt.staticPrefix.includes('诊断配置为虫害；判读轮次为追问。'),
    false
  )
  assert.equal(fullInitialStaticPrompt.staticPrefix, pestFollowupStaticPrompt.staticPrefix)
  assert.equal(fullInitialStaticPrompt.staticPrefixHash, pestFollowupStaticPrompt.staticPrefixHash)

  const cloudbaseClient = createCloudBaseAiOpenAiClient({
    model: defaultLlm.model,
    service: 'cloudbase',
    cloudbaseAi: {
      apiKey: 'unit-cloudbase-key',
      envId: 'cloud1-test',
      imageFetcher: async () => ({ mediaType: 'image/jpeg', base64: 'ZmFrZS1pbWFnZQ==' })
    }
  })
  const cloudbaseVision = cloudbaseClient.buildVisionMessages({
    promptText: 'static-prefix\n[Dynamic Task]\nruntime-tail',
    imageContents: [
      { type: 'image_url', image_url: { url: 'https://example.test/plant-image.jpg' } }
    ]
  })
  const cloudbasePayload = await cloudbaseClient.buildPayload(cloudbaseVision.messages, true)
  assert.deepEqual(cloudbasePayload.messages[0], {
    role: 'system',
    content: [{ type: 'text', text: 'static-prefix', cache_control: { type: 'ephemeral' } }]
  })
  assert.equal(cloudbasePayload.messages[1].content[0].text, '[Dynamic Task]\nruntime-tail')
  assert.deepEqual(cloudbasePayload.messages[1].content[1], {
    type: 'image_url',
    image_url: { url: 'https://example.test/plant-image.jpg' }
  })
  assert.equal(cloudbasePayload.stream, true)
  assert.equal(cloudbasePayload.enable_thinking, false)
  assert.deepEqual(cloudbasePayload.stream_options, { include_usage: true })
  assert.throws(
    () =>
      cloudbaseClient.buildVisionMessages({
        promptText: 'static-prefix',
        imageContents: [{ type: 'image_url', image_url: { url: 'data:text/plain;base64,AA==' } }]
      }),
    /HTTP\(S\).*Base64/
  )

  const https = require('node:https')
  const originalHttpsRequest = https.request
  const originalHttpsGet = https.get
  const requestBodies = []
  const requestOptions = []
  const createMockRequest = (options, callback) => {
    const request = new EventEmitter()
    request.setTimeout = () => {}
    request.destroy = error => request.emit('error', error)
    request.end = body => {
      const payload = JSON.parse(body)
      requestBodies.push(payload)
      requestOptions.push(options)
      const response = new EventEmitter()
      response.statusCode = 200
      process.nextTick(() => {
        callback(response)
        if (!payload.stream) {
          response.emit(
            'data',
            Buffer.from(
              '{"choices":[{"message":{"content":"openai non-stream"}}],"usage":{"prompt_tokens":6003,"completion_tokens":18,"prompt_tokens_details":{"cached_tokens":6003}}}'
            )
          )
        } else {
          response.emit(
            'data',
            Buffer.from(
              'data: {"choices":[{"delta":{"content":"{"}}]}\n\n'
            )
          )
          response.emit(
            'data',
            Buffer.from(
              'data: {"usage":{"prompt_tokens":6003,"completion_tokens":18,"prompt_tokens_details":{"cached_tokens":6003}}}\n\n'
            )
          )
        }
        response.emit('end')
      })
    }
    return request
  }
  try {
    https.request = createMockRequest
    https.get = (options, callback) => {
      const request = new EventEmitter()
      request.setTimeout = () => {}
      request.destroy = error => request.emit('error', error)
      process.nextTick(() => {
        const response = new EventEmitter()
        response.statusCode = 200
        response.headers = { 'content-type': 'image/jpeg' }
        response.resume = () => {}
        callback(response)
        response.emit('data', Buffer.from('fallback-image'))
        response.emit('end')
      })
      return request
    }
    const deltas = []
    const streamResult = await cloudbaseClient.callStream(cloudbaseVision.messages, {
      onText: delta => deltas.push(delta)
    })
    assert.equal(streamResult.imageInputTransport, 'url')
    assert.deepEqual(deltas, ['{'])
    assert.equal(streamResult.usage.promptCacheHitTokens, 6003)
    assert.equal(requestOptions[0].path, '/v1/ai/aliyun-bailian-custom/chat/completions')
    assert.equal(requestOptions[0].headers['anthropic-version'], undefined)
    assert.deepEqual(requestBodies[0].messages[0].content[0].cache_control, { type: 'ephemeral' })
    assert.equal(requestBodies[0].messages[1].content[1].type, 'image_url')

    const nonStreamResult = await cloudbaseClient.callNonStream(cloudbaseVision.messages)
    assert.equal(nonStreamResult.text, 'openai non-stream')
    assert.equal(nonStreamResult.usage.promptCacheHitTokens, 6003)

  } finally {
    https.request = originalHttpsRequest
    https.get = originalHttpsGet
  }

  const cloudbaseLlm = loadLlm({ LLM_PROVIDER_NAME: 'cloudbase' })
  assert.equal(cloudbaseLlm.providerId, 'cloudbase')
  assert.equal(cloudbaseLlm.modelId, 'qwen3.5-flash')
  assert.equal(cloudbaseLlm.modelIdentity, 'cloudbase:qwen3.5-flash')
  assert.equal(
    buildCloudBaseAiEndpoint({ envId: 'cloud1-test', cloudbaseAi: cloudbaseLlm.cloudbaseAi }),
    'https://cloud1-test.api.tcloudbasegateway.com/v1/ai/aliyun-bailian-custom/chat/completions'
  )
  for (const tokenhubService of ['TokenHub', 'TOKENHUB']) {
    assert.equal(
      buildCloudBaseAiEndpoint({
        envId: 'cloud1-test',
        service: tokenhubService,
        cloudbaseAi: { provider: 'cloudbase' }
      }),
      'https://tokenhub.tencentmaas.com/v1/chat/completions'
    )
  }
  const cloudbaseBaseUrl = 'https://cloud1-test.api.tcloudbasegateway.com/v1/ai/cloudbase'
  for (const [baseUrl, expected] of [
    [cloudbaseBaseUrl, `${cloudbaseBaseUrl}/chat/completions`],
    [`${cloudbaseBaseUrl}/chat/completions/`, `${cloudbaseBaseUrl}/chat/completions`],
    [`${cloudbaseBaseUrl}/v1/messages/`, `${cloudbaseBaseUrl}/v1/messages/chat/completions`]
  ]) {
    assert.equal(
      buildCloudBaseAiEndpoint({
        envId: 'cloud1-test',
        service: 'cloudbase',
        cloudbaseAi: { baseUrl }
      }),
      expected
    )
  }
  assert.equal(
    buildCloudBaseAiEndpoint({
      envId: 'cloud1-test',
      service: 'cloudbase',
      cloudbaseAi: { baseUrl: 'https://example.test/v1' }
    }),
    'https://example.test/v1/chat/completions'
  )
  assert.throws(
    () => buildCloudBaseAiEndpoint({ service: 'cloudbase', cloudbaseAi: {} }),
    /缺少 CloudBase AI HTTP API 环境 ID 配置/
  )

  const cloudbaseCompatibilityLlm = loadLlm({ LLM_CLOUDBASE_AI_PROVIDER: 'cloudbase' })
  assert.equal(cloudbaseCompatibilityLlm.providerId, 'cloudbase')

  const aliyunLlm = loadLlm({
    LLM_PROVIDER_NAME: 'aliyun_bailian',
    LLM_ALIYUN_BAILIAN_API_KEY: 'unit-aliyun-primary-key',
    DASHSCOPE_API_KEY: 'unit-aliyun-fallback-key',
    LLM_ALIYUN_BAILIAN_BASE_URL: 'https://bailian.example.test/compatible-mode/v1',
    LLM_ALIYUN_BAILIAN_MODEL: 'shared-vision-model'
  })
  assert.equal(aliyunLlm.providerId, 'aliyun_bailian')
  assert.equal(aliyunLlm.modelId, 'shared-vision-model')
  assert.equal(aliyunLlm.modelIdentity, 'aliyun_bailian:shared-vision-model')
  assert.equal(aliyunLlm.cloudbaseAi.aliyunBailianApiKey, 'unit-aliyun-primary-key')
  assert.equal(
    buildCloudBaseAiEndpoint({ cloudbaseAi: aliyunLlm.cloudbaseAi }),
    'https://bailian.example.test/compatible-mode/v1/chat/completions'
  )
  const aliyunFallbackLlm = loadLlm({
    LLM_PROVIDER_NAME: 'aliyun_bailian',
    DASHSCOPE_API_KEY: 'unit-aliyun-fallback-key'
  })
  assert.equal(aliyunFallbackLlm.cloudbaseAi.aliyunBailianApiKey, 'unit-aliyun-fallback-key')

  const ignoredLegacyProviderLlm = loadLlm({
    LLM_QWEN_3_5_PLUS_SERVICE: 'cloudbase',
    LLM_SERVICE: 'cloudbase'
  })
  assert.equal(ignoredLegacyProviderLlm.providerId, 'cloudbase')

  const tokenhubLegacyModelLlm = loadLlm({
    LLM_PROVIDER_NAME: 'tokenhub',
    LLM_MODEL_PROFILE: 'qwen_3_5_plus',
    LLM_QWEN_3_5_PLUS_MODEL: 'shared-vision-model'
  })
  assert.equal(tokenhubLegacyModelLlm.providerId, 'tokenhub')
  assert.equal(tokenhubLegacyModelLlm.modelIdentity, 'tokenhub:shared-vision-model')
  const cloudbaseLegacyModelLlm = loadLlm({
    LLM_PROVIDER_NAME: 'cloudbase',
    LLM_MODEL_PROFILE: 'qwen_3_5_plus',
    LLM_QWEN_3_5_PLUS_MODEL: 'shared-vision-model'
  })
  assert.equal(cloudbaseLegacyModelLlm.providerId, 'cloudbase')
  assert.equal(cloudbaseLegacyModelLlm.modelIdentity, 'cloudbase:shared-vision-model')

  const tokenhubScopedModelLlm = loadLlm({
    LLM_PROVIDER_NAME: 'tokenhub',
    LLM_MODEL: 'generic-model',
    LLM_TOKENHUB_MODEL: 'tokenhub-scoped-model'
  })
  assert.equal(tokenhubScopedModelLlm.modelIdentity, 'tokenhub:tokenhub-scoped-model')
  assert.throws(
    () => loadLlm({ LLM_PROVIDER_NAME: 'not-a-provider' }),
    /unsupported_openai_vision_provider/
  )

  console.log('provider registry configuration tests passed')
} finally {
  for (const name of environmentNames) {
    if (originalEnvironment[name] === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = originalEnvironment[name]
    }
  }
  delete require.cache[configPath]
}
