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
    listOpenAiVisionProviders
  } = require('../../../../../cloudfunctions/diagnose-http/configs/provider-registry.js')

  assert.deepEqual(
    listOpenAiVisionProviders().map(provider => provider.id),
    ['tokenhub', 'cloudbase', 'aliyun_bailian']
  )
  assert.equal(listOpenAiVisionProviders()[1].protocol, 'anthropic_messages')

  const defaultLlm = loadLlm()
  assert.equal(defaultLlm.providerId, 'cloudbase')
  assert.equal(defaultLlm.service, 'cloudbase')
  assert.equal(defaultLlm.modelId, 'qwen3.5-flash')
  assert.equal(defaultLlm.modelIdentity, 'cloudbase:qwen3.5-flash')
  assert.equal(Object.hasOwn(defaultLlm, 'modelProfiles'), false)
  assert.equal(
    buildCloudBaseAiEndpoint({ envId: 'cloud1-test', cloudbaseAi: defaultLlm.cloudbaseAi }),
    'https://cloud1-test.api.tcloudbasegateway.com/v1/ai/cloudbase/v1/messages'
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
  assert.match(fullInitialStaticPrompt.staticPrefix, /【静态判读纪律与输出一致性】/)
  assert.match(fullInitialStaticPrompt.staticPrefix, /1\. 先辨认当前图片中能够复核的对象/)
  assert.ok(STATIC_READING_DISCIPLINE_TEXT.length >= 1200)
  assert.ok(fullInitialStaticPrompt.staticPrefix.length >= 3600)
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
    cloudbaseAi: { apiKey: 'unit-cloudbase-key', envId: 'cloud1-test' }
  })
  const cloudbaseVision = cloudbaseClient.buildVisionMessages({
    promptText: 'static-prefix\n[Dynamic Task]\nruntime-tail',
    imageContents: [
      { type: 'image_url', image_url: { url: 'https://example.test/plant-image.jpg' } }
    ]
  })
  const cloudbasePayload = await cloudbaseClient.buildPayload(cloudbaseVision.messages, true)
  assert.deepEqual(cloudbasePayload.system[0], {
    type: 'text',
    text: 'static-prefix',
    cache_control: { type: 'ephemeral' }
  })
  assert.equal(cloudbasePayload.messages[0].content[0].text, '[Dynamic Task]\nruntime-tail')
  assert.deepEqual(cloudbasePayload.messages[0].content[1], {
    type: 'image',
    source: { type: 'url', url: 'https://example.test/plant-image.jpg' }
  })
  for (const key of ['prompt_cache_key', 'stream_options', 'enable_thinking']) {
    assert.equal(Object.hasOwn(cloudbasePayload, key), false)
  }
  await assert.rejects(
    () =>
      cloudbaseClient.buildPayload(
        cloudbaseClient.buildVisionMessages({
          promptText: 'static-prefix',
          imageContents: [{ type: 'image_url', image_url: { url: 'data:text/plain;base64,AA==' } }]
        }).messages,
        false
      ),
    /MIME 类型不支持/
  )

  const https = require('node:https')
  const originalHttpsRequest = https.request
  const originalHttpsGet = https.get
  const requestBodies = []
  const requestOptions = []
  let scenario = 'success'
  const createMockRequest = (options, callback) => {
    const request = new EventEmitter()
    request.setTimeout = () => {}
    request.destroy = error => request.emit('error', error)
    request.end = body => {
      const payload = JSON.parse(body)
      requestBodies.push(payload)
      requestOptions.push(options)
      const image = payload.messages[0]?.content.find(item => item.type === 'image')
      const shouldFailUrl = scenario === 'url_failure' && image?.source?.type === 'url'
      const response = new EventEmitter()
      response.statusCode = shouldFailUrl ? 400 : 200
      process.nextTick(() => {
        callback(response)
        if (shouldFailUrl) {
          response.emit('data', Buffer.from('{"error":{"message":"failed to download image"}}'))
        } else if (!payload.stream) {
          response.emit(
            'data',
            Buffer.from(
              '{"content":[{"type":"text","text":"anthropic non-stream"}],"usage":{"input_tokens":6003,"output_tokens":18,"cache_creation_input_tokens":6003}}'
            )
          )
        } else {
          response.emit(
            'data',
            Buffer.from(
              'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"hidden"}}\n\n'
            )
          )
          response.emit(
            'data',
            Buffer.from(
              'data: {"type":"content_block_delta","delta":{"type":"signature_delta","signature":"hidden"}}\n\n'
            )
          )
          response.emit(
            'data',
            Buffer.from(
              'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"{"}}\n\n'
            )
          )
          response.emit(
            'data',
            Buffer.from(
              'data: {"type":"message_delta","usage":{"input_tokens":6003,"output_tokens":18,"cache_read_input_tokens":6003}}\n\n'
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
    assert.equal(requestOptions[0].path, '/v1/ai/cloudbase/v1/messages')
    assert.equal(requestOptions[0].headers['anthropic-version'], '2023-06-01')
    assert.deepEqual(requestBodies[0].system[0].cache_control, { type: 'ephemeral' })
    assert.equal(requestBodies[0].messages[0].content[1].source.type, 'url')

    const nonStreamResult = await cloudbaseClient.callNonStream(cloudbaseVision.messages)
    assert.equal(nonStreamResult.text, 'anthropic non-stream')
    assert.equal(nonStreamResult.usage.promptCacheCreationInputTokens, 6003)

    scenario = 'url_failure'
    const fallbackRequestIndex = requestBodies.length
    const fallbackResult = await cloudbaseClient.callStream(cloudbaseVision.messages)
    assert.equal(fallbackResult.imageInputTransport, 'anthropic_base64_fallback')
    assert.equal(requestBodies[fallbackRequestIndex].messages[0].content[1].source.type, 'url')
    assert.equal(
      requestBodies[fallbackRequestIndex + 1].messages[0].content[1].source.type,
      'base64'
    )
    assert.equal(
      requestBodies[fallbackRequestIndex + 1].messages[0].content[1].source.media_type,
      'image/jpeg'
    )
    assert.equal(
      Buffer.from(
        requestBodies[fallbackRequestIndex + 1].messages[0].content[1].source.data,
        'base64'
      ).length,
      14
    )
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
    'https://cloud1-test.api.tcloudbasegateway.com/v1/ai/cloudbase/v1/messages'
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
  for (const baseUrl of [
    cloudbaseBaseUrl,
    `${cloudbaseBaseUrl}/chat/completions/`,
    `${cloudbaseBaseUrl}/v1/messages/`
  ]) {
    assert.equal(
      buildCloudBaseAiEndpoint({
        envId: 'cloud1-test',
        service: 'cloudbase',
        cloudbaseAi: { baseUrl }
      }),
      `${cloudbaseBaseUrl}/v1/messages`
    )
  }
  assert.equal(
    buildCloudBaseAiEndpoint({
      envId: 'cloud1-test',
      service: 'cloudbase',
      cloudbaseAi: { baseUrl: 'https://example.test/v1' }
    }),
    'https://example.test/v1'
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
