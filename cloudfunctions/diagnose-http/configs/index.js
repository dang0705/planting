const crypto = require('crypto')
const http = require('http')
const https = require('https')
const {
  TOKENHUB_PROVIDER,
  OPENAI_CHAT_COMPLETIONS_PROTOCOL,
  CLOUDBASE_PROVIDER,
  adaptOpenAiVisionMessages,
  buildTokenHubPromptCacheKey,
  buildTokenHubSessionAffinityId,
  resolveOpenAiVisionProvider,
  resolveProviderRuntimeConfig,
  staticPrefixHash
} = require('./provider-registry')

const CLOUDBASE_HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32 })
const CLOUDBASE_ANTHROPIC_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp'
])

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

function buildOpenAiVisionMessages({ promptText = '', imageContents = [] } = {}) {
  const marker = '[Dynamic Task]'
  const value = String(promptText || '').trim()
  const index = value.indexOf(marker)
  const staticText = index < 0 ? value : value.slice(0, index).trim()
  const dynamicText = index < 0 ? '' : value.slice(index).trim()
  const images = Array.isArray(imageContents) ? imageContents.filter(Boolean) : []
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

function cloudbaseImageMaxBytes(cloudbaseAi = {}) {
  return positiveNumber(
    cloudbaseAi.imageDataMaxBytes || process.env.LLM_IMAGE_DATA_URL_MAX_BYTES,
    5 * 1024 * 1024
  )
}

function cloudbaseImageMimeType(value = '') {
  const mimeType = String(value || '')
    .trim()
    .split(';')[0]
    .toLowerCase()
  return CLOUDBASE_ANTHROPIC_IMAGE_MEDIA_TYPES.has(mimeType) ? mimeType : ''
}

function cloudbaseDataUrlImage(url = '', maxBytes = cloudbaseImageMaxBytes()) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(String(url || ''))
  if (!match || match[2].length % 4 === 1) {
    throw cloudbaseImageInputError('CloudBase Anthropic 图片 data URL 无效')
  }
  const mediaType = cloudbaseImageMimeType(match[1])
  if (!mediaType) {
    throw cloudbaseImageInputError('CloudBase Anthropic 图片 MIME 类型不支持')
  }
  const data = match[2]
  if (!data || Buffer.from(data, 'base64').length > maxBytes) {
    throw cloudbaseImageInputError('CloudBase Anthropic 图片超过大小限制')
  }
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } }
}

function cloudbasePrimaryAnthropicImage(item, maxBytes) {
  const url = String(item?.image_url?.url || '').trim()
  if (/^data:/i.test(url)) {
    return cloudbaseDataUrlImage(url, maxBytes)
  }
  if (!/^https?:\/\//i.test(url)) {
    throw cloudbaseImageInputError('CloudBase Anthropic 图片 URL 无效')
  }
  return { type: 'image', source: { type: 'url', url } }
}

function downloadCloudbaseImageAsBase64(url = '', { maxBytes, timeoutMs } = {}) {
  if (/^data:/i.test(String(url || '').trim())) {
    return Promise.resolve(cloudbaseDataUrlImage(url, maxBytes))
  }
  let target
  try {
    target = new URL(url)
  } catch {
    return Promise.reject(cloudbaseImageInputError('CloudBase Anthropic 图片 URL 无效'))
  }
  const transport = target.protocol === 'https:' ? https : target.protocol === 'http:' ? http : null
  if (!transport) {
    return Promise.reject(cloudbaseImageInputError('CloudBase Anthropic 图片 URL 协议不支持'))
  }
  return new Promise((resolve, reject) => {
    let done = false
    const finish = (error, result) => {
      if (done) {
        return
      }
      done = true
      if (error) {
        reject(error)
      } else {
        resolve(result)
      }
    }
    const request = transport.get(
      {
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        ...(target.protocol === 'https:' ? { agent: CLOUDBASE_HTTP_AGENT } : {})
      },
      response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume()
          finish(
            cloudbaseImageInputError(`CloudBase Anthropic 图片下载失败(${response.statusCode})`)
          )
          return
        }
        const mediaType = cloudbaseImageMimeType(response.headers['content-type'])
        if (!mediaType) {
          response.resume()
          finish(cloudbaseImageInputError('CloudBase Anthropic 图片 MIME 类型不支持'))
          return
        }
        const chunks = []
        let size = 0
        response.on('data', chunk => {
          size += chunk.length
          if (size > maxBytes) {
            request.destroy(cloudbaseImageInputError('CloudBase Anthropic 图片超过大小限制'))
          } else {
            chunks.push(chunk)
          }
        })
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          if (!buffer.length) {
            finish(cloudbaseImageInputError('CloudBase Anthropic 图片下载为空'))
          } else {
            finish(null, {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') }
            })
          }
        })
        response.on('error', () =>
          finish(cloudbaseImageInputError('CloudBase Anthropic 图片下载失败'))
        )
      }
    )
    request.on('error', () => finish(cloudbaseImageInputError('CloudBase Anthropic 图片下载失败')))
    request.setTimeout(Math.max(1000, Number(timeoutMs || 10000)), () =>
      request.destroy(cloudbaseImageInputError('CloudBase Anthropic 图片下载超时'))
    )
  })
}

async function buildCloudbaseAnthropicPayload({
  model = '',
  messages = [],
  stream = false,
  llmOptions = {},
  cloudbaseAi = {},
  base64Fallback = false
} = {}) {
  const maxBytes = cloudbaseImageMaxBytes(cloudbaseAi)
  const system = []
  const requestMessages = []
  for (const message of messages) {
    const content = await Promise.all(
      (Array.isArray(message?.content) ? message.content : []).map(item =>
        item?.type !== 'image_url'
          ? item
          : base64Fallback
            ? downloadCloudbaseImageAsBase64(item.image_url?.url, {
                maxBytes,
                timeoutMs: cloudbaseAi.imageDownloadTimeoutMs
              })
            : cloudbasePrimaryAnthropicImage(item, maxBytes)
      )
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
    max_tokens: positiveNumber(cloudbaseAi.maxTokens, 800),
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
      maxTokens: envNumber('LLM_CLOUDBASE_AI_MAX_TOKENS', 800),
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
