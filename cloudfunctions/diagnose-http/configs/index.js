const crypto = require('crypto')
const https = require('https')
const {
  TOKENHUB_PROVIDER,
  OPENAI_CHAT_COMPLETIONS_PROTOCOL,
  CLOUDBASE_PROVIDER,
  adaptOpenAiVisionMessages,
  assertAliyunExplicitCacheRequestContract,
  buildTokenHubPromptCacheKey,
  buildTokenHubSessionAffinityId,
  resolveOpenAiVisionProvider,
  resolveProviderRuntimeConfig,
  staticPrefixHash
} = require('./provider-registry')

const CLOUDBASE_HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32 })
const DEFAULT_VISUAL_OUTPUT_MAX_TOKENS = 480

function envText(name, conservative = '') {
  const value = String(process.env[name] || '').trim()
  return value || conservative
}

function envNumber(name, conservative) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : conservative
}

function envBoolean(name, conservative = false) {
  const raw = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  if (!raw) {
    return conservative
  }
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false
  }
  return conservative
}

function buildCloudBaseAiEndpoint({ envId = '', cloudbaseAi = {}, service = '' } = {}) {
  return resolveOpenAiVisionProvider(service || cloudbaseAi.provider).endpoint({
    envId,
    cloudbaseAi
  })
}

function positiveNumber(value, conservative = null) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : conservative
}

function pickOptionNumber(...values) {
  return values.map(Number).find(Number.isFinite) ?? null
}

function normalizeOpenAiOptions(options = {}) {
  const output = {}
  for (const [target, values] of Object.entries({
    temperature: [options.temperature, options.Temperature],
    top_p: [options.top_p, options.topP, options.TopP],
    seed: [options.seed, options.Seed]
  })) {
    const number = pickOptionNumber(...values)
    if (number !== null) {
      output[target] = number
    }
  }
  return output
}

function buildTokenHubVisionMessages({ model = '', messages = [], promptCacheStrategy = {} } = {}) {
  return adaptOpenAiVisionMessages({
    provider: TOKENHUB_PROVIDER,
    model,
    messages,
    promptCacheStrategy
  })
}

/**
 * 缓存前缀契约（严禁自行变更）：除非先征得用户明确同意，`[Dynamic Task]` 前的固定文本、
 * 固定前缀格式、文本顺序及其作为唯一 system 消息的布局不得变化；动态任务和图片必须留在
 * `[Dynamic Task]` 后的 user 消息。百炼依赖这段稳定前缀建立和命中缓存，改动会增加输入 token。
 */
function buildOpenAiVisionMessages({ promptText = '', imageContents = [] } = {}) {
  const marker = '[Dynamic Task]'
  const value = String(promptText || '').trim()
  const index = value.indexOf(marker)
  const staticText = index < 0 ? value : value.slice(0, index).trim()
  const dynamicText = index < 0 ? '' : value.slice(index).trim()
  const images = (Array.isArray(imageContents) ? imageContents : []).filter(Boolean)
  // 模型图片输入契约：仅允许 HTTP(S) URL，严禁在此或调用链恢复 Base64/data URL，
  // 否则图片会被编码进提示词并放大输入 token。
  for (const image of images) {
    if (image?.type !== 'image_url') {
      continue
    }
    if (!/^https?:\/\//i.test(String(image?.image_url?.url || '').trim())) {
      throw new Error('视觉诊断图片必须使用可访问的 HTTP(S) URL，不接受 Base64')
    }
  }
  const messages = staticText
    ? [
        {
          role: 'system',
          content: [{ type: 'text', text: staticText, cache_control: { type: 'ephemeral' } }]
        }
      ]
    : []
  const content = dynamicText
    ? [{ type: 'text', text: dynamicText }, ...images]
    : staticText
      ? images
      : [{ type: 'text', text: value }, ...images]
  messages.push({ role: 'user', content })
  return {
    messages,
    promptCacheStrategy: {
      enabled: Boolean(staticText),
      type: 'explicit_ephemeral_static_prefix',
      markerFound: Number(index >= 0),
      staticPromptLength: staticText.length,
      dynamicPromptLength: dynamicText.length,
      staticPrefixHash: crypto.createHash('sha1').update(staticText, 'utf8').digest('hex'),
      dynamicTailHash: crypto.createHash('sha1').update(dynamicText, 'utf8').digest('hex'),
      imageCount: images.length,
      layout: 'system_static_cache_user_dynamic_then_images'
    }
  }
}

function cloudbaseImageInputError(message) {
  return Object.assign(new Error(message), { code: 'cloudbase_anthropic_image_input_error' })
}

function isCloudbaseImageInputError(error) {
  return error?.code === 'cloudbase_anthropic_image_input_error'
}

function cloudbasePrimaryAnthropicImage(item) {
  const url = String(item?.image_url?.url || '').trim()
  // Anthropic 请求也只能保留远端 URL；严禁转换为 Base64/data URL 传给模型。
  if (!/^https?:\/\//i.test(url)) {
    throw cloudbaseImageInputError('视觉诊断图片必须使用可访问的 HTTP(S) URL，不接受 Base64')
  }
  return { type: 'image', source: { type: 'url', url } }
}

async function buildCloudbaseAnthropicPayload({
  model = '',
  messages = [],
  stream = false,
  llmOptions = {},
  cloudbaseAi = {}
} = {}) {
  const system = []
  const requestMessages = []
  for (const message of messages) {
    const content = (Array.isArray(message?.content) ? message.content : []).map(item =>
      item?.type === 'image_url' ? cloudbasePrimaryAnthropicImage(item) : item
    )
    if (message?.role === 'system') {
      system.push(...content)
    } else {
      requestMessages.push({ role: message?.role || 'user', content })
    }
  }
  const payload = {
    model,
    system,
    messages: requestMessages,
    // 视觉调用只返回紧凑 JSON；限制输出上限，避免空字段和重复依据吞掉两图的输出额度。
    max_tokens: positiveNumber(cloudbaseAi.maxTokens, DEFAULT_VISUAL_OUTPUT_MAX_TOKENS),
    stream: Boolean(stream)
  }
  if (cloudbaseAi.enableThinking !== true) {
    payload.thinking = { type: 'disabled' }
  }
  for (const [name, values] of Object.entries({
    temperature: [llmOptions.temperature, llmOptions.Temperature],
    top_p: [llmOptions.top_p, llmOptions.topP, llmOptions.TopP]
  })) {
    const value = pickOptionNumber(...values)
    if (value !== null) {
      payload[name] = value
    }
  }
  return payload
}

function requestCloudBaseJson(url, { headers = {}, body = {}, timeoutMs = 10000 } = {}) {
  const target = new URL(url)
  const raw = JSON.stringify(body)
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        agent: CLOUDBASE_HTTP_AGENT,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(raw)
        }
      },
      response => {
        let responseBody = ''
        response.on('data', chunk => {
          responseBody += chunk.toString()
        })
        response.on('end', () => {
          try {
            resolve({ statusCode: response.statusCode, json: JSON.parse(responseBody) })
          } catch {
            resolve({ statusCode: response.statusCode, json: null })
          }
        })
        response.on('error', reject)
      }
    )
    request.on('error', reject)
    request.setTimeout(Math.max(1000, Number(timeoutMs)), () =>
      request.destroy(new Error('CloudBase HTTP API 请求超时'))
    )
    request.end(raw)
  })
}

function buildCloudBaseAiPayload({
  model = '',
  messages = [],
  stream = false,
  llmOptions = {},
  cloudbaseAi = {},
  service = ''
} = {}) {
  const provider = resolveOpenAiVisionProvider(service || cloudbaseAi.provider)
  if (provider.protocol !== OPENAI_CHAT_COMPLETIONS_PROTOCOL) {
    throw new Error(`provider_protocol_requires_messages_transport:${provider.id}`)
  }
  const adapted = adaptOpenAiVisionMessages({ provider: provider.id, model, messages })
  if (provider.id === 'aliyun_bailian') {
    // 发送前强制复核百炼最终请求体；不满足官方显式缓存结构就拒绝调用，避免静默退化为无缓存请求。
    assertAliyunExplicitCacheRequestContract({ model, messages: adapted.messages })
  }
  const payload = {
    model,
    messages: adapted.messages,
    stream: Boolean(stream),
    ...normalizeOpenAiOptions(llmOptions)
  }
  const promptCacheKey = provider.capabilities.cache.promptCacheKey
    ? buildTokenHubPromptCacheKey({
        providerId: provider.id,
        model,
        staticPrefixHash: staticPrefixHash(adapted.messages)
      })
    : ''
  if (promptCacheKey) {
    payload.prompt_cache_key = promptCacheKey
  }
  const maxTokens = positiveNumber(cloudbaseAi.maxTokens)
  if (maxTokens && provider.capabilities.request.maxTokens && !payload.max_tokens) {
    payload.max_tokens = maxTokens
  }
  if (
    provider.capabilities.request.enableThinking &&
    String(model).toLowerCase().includes('qwen3.5')
  ) {
    payload.enable_thinking = cloudbaseAi.enableThinking === true
  }
  if (stream) {
    payload.stream_options = {
      include_usage: true,
      ...(llmOptions.stream_options || llmOptions.StreamOptions)
    }
  }
  return payload
}

const requestedProvider = envText(
  'LLM_PROVIDER_NAME',
  envText('LLM_CLOUDBASE_AI_PROVIDER', CLOUDBASE_PROVIDER)
)
const activeOpenAiProvider = resolveOpenAiVisionProvider(requestedProvider)
const legacyModelProfile = envText('LLM_MODEL_PROFILE', '')
const providerRuntime = resolveProviderRuntimeConfig({
  provider: activeOpenAiProvider.id,
  environment: process.env,
  genericModel: envText('LLM_MODEL', ''),
  legacyModelProfile
})
const tokenhubRuntime = resolveProviderRuntimeConfig({
  provider: TOKENHUB_PROVIDER,
  environment: process.env
})
const cloudbaseRuntime = resolveProviderRuntimeConfig({
  provider: 'cloudbase',
  environment: process.env
})
const aliyunBailianRuntime = resolveProviderRuntimeConfig({
  provider: 'aliyun_bailian',
  environment: process.env
})

module.exports = {
  buildCloudBaseAiEndpoint,
  buildCloudBaseAiPayload,
  buildCloudbaseAnthropicPayload,
  buildOpenAiVisionMessages,
  buildTokenHubPromptCacheKey,
  buildTokenHubSessionAffinityId,
  buildTokenHubVisionMessages,
  isCloudbaseImageInputError,
  requestCloudBaseJson,
  llm: {
    host: envText('LLM_HOST', 'hunyuan.tencentcloudapi.com'),
    providerId: activeOpenAiProvider.id,
    modelId: providerRuntime.model,
    modelIdentity: providerRuntime.modelIdentity,
    modelProfile: legacyModelProfile,
    modelReasoningMode: envText('LLM_MODEL_REASONING_MODE', 'fast'),
    model: providerRuntime.model,
    service: activeOpenAiProvider.id,
    conservativeService: envText('LLM_CONSERVATIVE_SERVICE', ''),
    conservativeModel: envText('LLM_CONSERVATIVE_MODEL', 'hunyuan-vision-1.5-instruct'),
    shadowService: envText('LLM_SHADOW_SERVICE', ''),
    shadowModel: envText('LLM_SHADOW_MODEL', ''),
    requestTimeoutSec: envNumber('LLM_REQUEST_TIMEOUT_SEC', 45),
    maxImages: 1,
    sse: envBoolean('LLM_SSE', true),
    cloudbaseAi: {
      envId: envText('CLOUDBASE_AI_ENV_ID', envText('CLOUDBASE_ENV_ID', envText('TCB_ENV', ''))),
      provider: activeOpenAiProvider.id,
      providerRequestedName: requestedProvider,
      apiKey: cloudbaseRuntime.credential.value,
      apiKeySource: cloudbaseRuntime.credential.source,
      tokenhubApiKey: tokenhubRuntime.credential.value,
      tokenhubApiKeySource: tokenhubRuntime.credential.source,
      aliyunBailianApiKey: aliyunBailianRuntime.credential.value,
      aliyunBailianApiKeySource: aliyunBailianRuntime.credential.source,
      baseUrl: cloudbaseRuntime.baseUrl,
      aliyunBailianBaseUrl: aliyunBailianRuntime.baseUrl,
      endpointStyle: envText('LLM_CLOUDBASE_AI_ENDPOINT_STYLE', ''),
      imageMaxPixels: envNumber('LLM_CLOUDBASE_AI_IMAGE_MAX_PIXELS', 1638400),
      maxTokens: envNumber('LLM_CLOUDBASE_AI_MAX_TOKENS', DEFAULT_VISUAL_OUTPUT_MAX_TOKENS),
      enableThinking: envBoolean('LLM_QWEN_3_5_ENABLE_THINKING', false)
    },
    hfAutotrain: {
      endpoint: envText('HF_AUTOTRAIN_ENDPOINT', ''),
      apiKey: envText('HF_AUTOTRAIN_API_KEY', ''),
      timeoutMs: envNumber('HF_AUTOTRAIN_TIMEOUT_MS', 60000),
      topK: envNumber('HF_AUTOTRAIN_TOP_K', 3),
      modelName: envText('HF_AUTOTRAIN_MODEL_NAME', 'henglidadi/symptoms')
    },
    options: {
      TopP: 0.1,
      Temperature: 0.1,
      Seed: 42
    }
  }
}
