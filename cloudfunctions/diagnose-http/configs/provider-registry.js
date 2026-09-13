'use strict'

const crypto = require('crypto')

const TOKENHUB_PROVIDER = 'tokenhub'
const CLOUDBASE_PROVIDER = 'cloudbase'
const ALIYUN_BAILIAN_PROVIDER = 'aliyun_bailian'
const OPENAI_CHAT_COMPLETIONS_PROTOCOL = 'openai_chat_completions'
const ANTHROPIC_MESSAGES_PROTOCOL = 'anthropic_messages'
const ANTHROPIC_VERSION = '2023-06-01'
const TOKENHUB_CHAT_COMPLETIONS_ENDPOINT = 'https://tokenhub.tencentmaas.com/v1/chat/completions'
const ALIYUN_BAILIAN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'
const LEGACY_MODEL_PROFILE_ENV = Object.freeze({
  fast_vision: 'LLM_FAST_MODEL',
  qwen_vl_fast_vision: 'LLM_QWEN_VL_FAST_MODEL',
  qwen_3_5_plus: 'LLM_QWEN_3_5_PLUS_MODEL',
  deep_thinking_vision: 'LLM_DEEP_THINKING_MODEL'
})

function text(value = '', conservative = '') {
  return String(value || '').trim() || conservative
}

function normalizeProviderName(value = '') {
  return text(value).toLowerCase()
}

function cloudbaseBuiltinMessagesEndpoint(baseUrl = '') {
  try {
    const endpoint = new URL(baseUrl)
    const pathname = endpoint.pathname.replace(/\/+$/, '')
    if (pathname === '/v1/ai/cloudbase' || pathname === '/v1/ai/cloudbase/chat/completions') {
      endpoint.pathname = '/v1/ai/cloudbase/v1/messages'
    } else {
      endpoint.pathname = pathname
    }
    return endpoint.toString()
  } catch {
    return ''
  }
}

function openAiChatEndpoint(baseUrl = '') {
  const normalized = text(baseUrl).replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`
}

function cloudbaseEndpoint({ envId = '', cloudbaseAi = {} } = {}) {
  const configuredBaseUrl = text(cloudbaseAi.baseUrl)
  if (configuredBaseUrl) {
    return (
      cloudbaseBuiltinMessagesEndpoint(configuredBaseUrl) || configuredBaseUrl.replace(/\/+$/, '')
    )
  }
  const resolvedEnvId = text(envId)
  if (!resolvedEnvId) {
    throw new Error('缺少 CloudBase AI HTTP API 环境 ID 配置')
  }
  return `https://${resolvedEnvId}.api.tcloudbasegateway.com/v1/ai/cloudbase/v1/messages`
}

function aliyunBailianEndpoint({ cloudbaseAi = {} } = {}) {
  return openAiChatEndpoint(text(cloudbaseAi.aliyunBailianBaseUrl, ALIYUN_BAILIAN_BASE_URL))
}

const PROVIDER_REGISTRY = Object.freeze({
  [TOKENHUB_PROVIDER]: Object.freeze({
    id: TOKENHUB_PROVIDER,
    aliases: Object.freeze([TOKENHUB_PROVIDER]),
    logLabel: 'TokenHub',
    httpTimingProvider: 'tokenhub_openai',
    protocol: OPENAI_CHAT_COMPLETIONS_PROTOCOL,
    timeoutCode: 'tokenhub_timeout',
    defaultModel: 'qwen3.5-flash',
    endpoint: () => TOKENHUB_CHAT_COMPLETIONS_ENDPOINT,
    credential: Object.freeze({
      configField: 'tokenhubApiKey',
      envNames: Object.freeze(['TOKENHUB_API_KEY']),
      missingMessage: 'TokenHub 未配置 API Key：请设置 TOKENHUB_API_KEY',
      allowAnonymousSignin: false
    }),
    environment: Object.freeze({ model: 'LLM_TOKENHUB_MODEL' }),
    capabilities: Object.freeze({
      imageMaxPixels: false,
      sessionAffinity: true,
      cache: Object.freeze({
        cacheControl: false,
        promptCacheKey: true,
        strategyType: 'tokenhub_prompt_cache_key_static_prefix'
      }),
      request: Object.freeze({ maxTokens: true, enableThinking: true })
    })
  }),
  [CLOUDBASE_PROVIDER]: Object.freeze({
    id: CLOUDBASE_PROVIDER,
    aliases: Object.freeze([
      CLOUDBASE_PROVIDER,
      'cloudbase_ai_http_openai',
      'cloudbase_qwen_vl',
      'qwen_vl'
    ]),
    logLabel: 'CloudBase AI',
    httpTimingProvider: 'cloudbase_ai_anthropic',
    protocol: ANTHROPIC_MESSAGES_PROTOCOL,
    anthropicVersion: ANTHROPIC_VERSION,
    timeoutCode: 'cloudbase_ai_timeout',
    defaultModel: 'qwen3.5-flash',
    endpoint: cloudbaseEndpoint,
    credential: Object.freeze({
      configField: 'apiKey',
      envNames: Object.freeze(['CLOUDBASE_AI_API_KEY', 'CLOUDBASE_AI_ACCESS_TOKEN']),
      missingMessage: '',
      allowAnonymousSignin: true
    }),
    environment: Object.freeze({
      baseUrl: 'LLM_CLOUDBASE_AI_BASE_URL',
      model: 'LLM_CLOUDBASE_AI_MODEL'
    }),
    capabilities: Object.freeze({
      imageMaxPixels: true,
      sessionAffinity: false,
      cache: Object.freeze({
        cacheControl: true,
        promptCacheKey: false,
        strategyType: 'explicit_ephemeral_static_prefix'
      }),
      request: Object.freeze({ maxTokens: true, enableThinking: true })
    })
  }),
  [ALIYUN_BAILIAN_PROVIDER]: Object.freeze({
    id: ALIYUN_BAILIAN_PROVIDER,
    aliases: Object.freeze([ALIYUN_BAILIAN_PROVIDER, 'aliyun-bailian', 'aliyun-bailian-custom']),
    logLabel: '阿里云百炼',
    httpTimingProvider: 'aliyun_bailian_openai',
    protocol: OPENAI_CHAT_COMPLETIONS_PROTOCOL,
    timeoutCode: 'aliyun_bailian_timeout',
    defaultModel: 'qwen3-vl-plus',
    endpoint: aliyunBailianEndpoint,
    credential: Object.freeze({
      configField: 'aliyunBailianApiKey',
      envNames: Object.freeze(['LLM_ALIYUN_BAILIAN_API_KEY', 'DASHSCOPE_API_KEY']),
      missingMessage:
        '阿里云百炼未配置 API Key：请设置 LLM_ALIYUN_BAILIAN_API_KEY 或 DASHSCOPE_API_KEY',
      allowAnonymousSignin: false
    }),
    environment: Object.freeze({
      baseUrl: 'LLM_ALIYUN_BAILIAN_BASE_URL',
      model: 'LLM_ALIYUN_BAILIAN_MODEL'
    }),
    capabilities: Object.freeze({
      // 百炼 OpenAI 兼容接口支持把 max_pixels 放在每个 image_url 内容块的根节点。
      // 此上限与端上压缩共同兜底，且不改变模型图片必须为 HTTPS URL 的传输契约。
      imageMaxPixels: true,
      sessionAffinity: false,
      cache: Object.freeze({
        // qwen3.5-flash 的 OpenAI 兼容接口支持在稳定 system 前缀上建立显式缓存。
        // 这里若设为 false，适配器会主动剥离 cache_control，导致固定前缀无法建立缓存。
        cacheControl: true,
        promptCacheKey: false,
        strategyType: 'explicit_ephemeral_static_prefix'
      }),
      // Qwen3.5 在百炼默认开启思考；诊断结构化抽取必须显式关闭，避免把
      // 原本的快速视觉调用变成长思考请求。
      request: Object.freeze({ maxTokens: true, enableThinking: true })
    })
  })
})

function listOpenAiVisionProviders() {
  return Object.values(PROVIDER_REGISTRY)
}

function getOpenAiVisionProvider(value = '') {
  const normalized = normalizeProviderName(value)
  return listOpenAiVisionProviders().find(provider => provider.aliases.includes(normalized)) || null
}

function resolveOpenAiVisionProvider(value = '') {
  const provider = getOpenAiVisionProvider(value)
  if (!provider) {
    throw new Error(
      `unsupported_openai_vision_provider:${normalizeProviderName(value) || 'unknown'}`
    )
  }
  return provider
}

function isOpenAiVisionProvider(value = '') {
  return Boolean(getOpenAiVisionProvider(value))
}

function supportsExplicitPromptCache(value = '') {
  return Boolean(getOpenAiVisionProvider(value)?.capabilities?.cache?.cacheControl)
}

function readFirstEnvironmentValue(environment = {}, names = []) {
  for (const name of names) {
    const value = text(environment[name])
    if (value) {
      return { value, source: name }
    }
  }
  return { value: '', source: '' }
}

function resolveProviderRuntimeConfig({
  provider: providerValue = '',
  environment = {},
  genericModel = '',
  legacyModelProfile = ''
} = {}) {
  const provider = resolveOpenAiVisionProvider(providerValue)
  const credential = readFirstEnvironmentValue(environment, provider.credential.envNames)
  const baseUrl = provider.environment.baseUrl
    ? text(environment[provider.environment.baseUrl])
    : ''
  const providerModel = provider.environment.model
    ? text(environment[provider.environment.model])
    : ''
  const legacyModel = text(environment[LEGACY_MODEL_PROFILE_ENV[text(legacyModelProfile)]])
  const model = providerModel || text(genericModel) || legacyModel || provider.defaultModel
  return {
    id: provider.id,
    model,
    modelIdentity: `${provider.id}:${model}`,
    baseUrl,
    credential
  }
}

function resolveProviderCredential({ provider: providerValue = '', cloudbaseAi = {} } = {}) {
  const provider = resolveOpenAiVisionProvider(providerValue)
  const value = text(cloudbaseAi[provider.credential.configField])
  return {
    value,
    source: value
      ? text(
          cloudbaseAi[`${provider.credential.configField}Source`],
          provider.credential.configField
        )
      : '',
    allowAnonymousSignin: provider.credential.allowAnonymousSignin,
    missingMessage: provider.credential.missingMessage
  }
}

function staticPrefixHash(messages = []) {
  const systemMessage = Array.isArray(messages)
    ? messages.find(message => message?.role === 'system')
    : null
  const staticText = Array.isArray(systemMessage?.content)
    ? systemMessage.content.find(item => item?.type === 'text')?.text
    : ''
  return text(staticText)
    ? crypto.createHash('sha1').update(String(staticText), 'utf8').digest('hex')
    : ''
}

function explicitCacheContentBlocks(messages = []) {
  return (Array.isArray(messages) ? messages : []).flatMap(message =>
    (Array.isArray(message?.content) ? message.content : []).map((content, contentIndex) => ({
      role: message?.role || '',
      content,
      contentIndex
    }))
  )
}

/**
 * 百炼显式缓存请求契约：Qwen3.5 只支持消息级缓存截断点。
 * 这里仅审计不可泄露的结构、哈希和长度；固定前缀原文仍由既有审计日志保留。
 */
function buildAliyunExplicitCacheRequestAudit({ model = '', messages = [] } = {}) {
  const list = Array.isArray(messages) ? messages : []
  const systemMessages = list.filter(message => message?.role === 'system')
  const userMessage = list.find(message => message?.role === 'user') || null
  const cacheBlocks = explicitCacheContentBlocks(list).filter(
    item => item?.content?.cache_control?.type === 'ephemeral'
  )
  const cacheBlock = cacheBlocks[0]?.content || null
  const staticText = text(cacheBlock?.text)
  const userContent = Array.isArray(userMessage?.content) ? userMessage.content : []
  const imageContent = userContent.filter(item => item?.type === 'image_url')
  const firstImageIndex = userContent.findIndex(item => item?.type === 'image_url')
  const firstUserText = userContent.findIndex(item => item?.type === 'text')
  const issues = []

  if (systemMessages.length !== 1) {
    issues.push('system_message_count_must_be_1')
  }
  if (!Array.isArray(systemMessages[0]?.content)) {
    issues.push('system_content_must_be_array')
  }
  if (cacheBlocks.length !== 1) {
    issues.push('cache_control_marker_count_must_be_1')
  }
  if (!staticText) {
    issues.push('cache_control_text_must_not_be_empty')
  }
  if (!userMessage) {
    issues.push('dynamic_task_user_message_required')
  }
  if (firstImageIndex >= 0 && (firstUserText < 0 || firstUserText > firstImageIndex)) {
    issues.push('dynamic_text_must_precede_images')
  }
  if (imageContent.some(item => !/^https?:\/\//i.test(String(item?.image_url?.url || '').trim()))) {
    issues.push('image_url_must_use_http_or_https')
  }

  return {
    contractVersion: 'aliyun_bailian_explicit_cache_v1',
    providerId: ALIYUN_BAILIAN_PROVIDER,
    modelId: text(model),
    cacheMode: 'explicit',
    qwen35MessageLevelCutoff: Number(String(model).toLowerCase().includes('qwen3.5')),
    systemMessageCount: systemMessages.length,
    systemContentIsArray: Number(Array.isArray(systemMessages[0]?.content)),
    cacheControlMarkerCount: cacheBlocks.length,
    cacheControlType: text(cacheBlock?.cache_control?.type),
    staticPrefixHash: staticPrefixHash(list),
    staticPrefixLength: staticText.length,
    staticPrefixUtf8Bytes: Buffer.byteLength(staticText, 'utf8'),
    dynamicTextPrecedesImages: Number(
      firstImageIndex < 0 || (firstUserText >= 0 && firstUserText < firstImageIndex)
    ),
    imageUrlCount: imageContent.length,
    imageUrlTransport: imageContent.length ? 'url' : 'none',
    compliant: Number(issues.length === 0),
    issues
  }
}

function assertAliyunExplicitCacheRequestContract({ model = '', messages = [] } = {}) {
  const audit = buildAliyunExplicitCacheRequestAudit({ model, messages })
  if (!audit.compliant) {
    throw new Error(`aliyun_explicit_cache_contract_invalid:${audit.issues.join(',')}`)
  }
  return audit
}

function buildTokenHubPromptCacheKey({
  providerId = TOKENHUB_PROVIDER,
  model = '',
  staticPrefixHash: prefixHash = ''
} = {}) {
  const normalizedPrefixHash = text(prefixHash)
  return normalizedPrefixHash
    ? ['diagnose_visual_static_v1', text(providerId), text(model), normalizedPrefixHash].join(':')
    : ''
}

function buildTokenHubSessionAffinityId(sessionId = '') {
  const value = text(sessionId)
  return value
    ? crypto
        .createHash('sha256')
        .update(`diagnose-http-tokenhub-session-v1:${value}`, 'utf8')
        .digest('hex')
    : ''
}

function withoutCacheControl(messages = []) {
  return Array.isArray(messages)
    ? messages.map(message => ({
        ...message,
        content: Array.isArray(message?.content)
          ? message.content.map(item =>
              Object.fromEntries(
                Object.entries(item || {}).filter(([key]) => key !== 'cache_control')
              )
            )
          : message?.content
      }))
    : []
}

function promptCacheKeyFingerprint(value = '') {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16)
}

function adaptOpenAiVisionMessages({
  provider: providerValue = '',
  model = '',
  messages = [],
  promptCacheStrategy = {}
} = {}) {
  const provider = resolveOpenAiVisionProvider(providerValue)
  const cache = provider.capabilities.cache
  const adaptedMessages = cache.cacheControl ? messages : withoutCacheControl(messages)
  const cacheKey = cache.promptCacheKey
    ? buildTokenHubPromptCacheKey({
        providerId: provider.id,
        model,
        staticPrefixHash: staticPrefixHash(adaptedMessages)
      })
    : ''
  return {
    messages: adaptedMessages,
    promptCacheStrategy: {
      ...promptCacheStrategy,
      provider: provider.id,
      providerId: provider.id,
      modelId: model,
      modelIdentity: `${provider.id}:${model}`,
      type: cache.strategyType,
      cacheMetadata: cache.promptCacheKey
        ? 'prompt_cache_key'
        : cache.cacheControl
          ? 'cache_control'
          : 'none',
      cacheKeyConfigured: Boolean(cacheKey),
      ...(provider.id === ALIYUN_BAILIAN_PROVIDER
        ? {
            explicitCacheRequestAudit: assertAliyunExplicitCacheRequestContract({
              model,
              messages: adaptedMessages
            })
          }
        : {}),
      ...(cacheKey ? { cacheKeyFingerprint: promptCacheKeyFingerprint(cacheKey) } : {})
    }
  }
}

module.exports = {
  ALIYUN_BAILIAN_BASE_URL,
  ALIYUN_BAILIAN_PROVIDER,
  ANTHROPIC_MESSAGES_PROTOCOL,
  ANTHROPIC_VERSION,
  CLOUDBASE_PROVIDER,
  LEGACY_MODEL_PROFILE_ENV,
  OPENAI_CHAT_COMPLETIONS_PROTOCOL,
  PROVIDER_REGISTRY,
  TOKENHUB_CHAT_COMPLETIONS_ENDPOINT,
  TOKENHUB_PROVIDER,
  adaptOpenAiVisionMessages,
  assertAliyunExplicitCacheRequestContract,
  buildAliyunExplicitCacheRequestAudit,
  buildTokenHubPromptCacheKey,
  buildTokenHubSessionAffinityId,
  getOpenAiVisionProvider,
  isOpenAiVisionProvider,
  listOpenAiVisionProviders,
  resolveOpenAiVisionProvider,
  resolveProviderCredential,
  resolveProviderRuntimeConfig,
  staticPrefixHash,
  supportsExplicitPromptCache
}
