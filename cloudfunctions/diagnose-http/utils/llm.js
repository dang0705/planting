'use strict'

const https = require('https')
const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const { debugLog } = require('./common')
const { buildSymptomLabelerPromptPayload } = require('./symptom-labeler-prompt')
const {
  llm: {
    service = 'hunyuan',
    model,
    modelProfile,
    modelReasoningMode,
    options: llmOptions = {},
    host: endpoint,
    fallbackService = '',
    fallbackModel = '',
    cloudbaseAi = {},
    sse,
    requestTimeoutSec = 8,
    maxImages = 1
  }
} = require('../configs')

const HunyuanClient = tencentcloud.hunyuan.v20230901.Client
const SECRET_ID = process.env.CLOUDBASE_SECRET_ID || ''
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY || ''
const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32 })

let clientInstance = null
let cloudBaseAiAccessTokenCache = null

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeOrgan(value = '', fallback = 'unknown') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return normalized || fallback
}

function normalizeServiceValue(value = '') {
  return normalizeText(value, '').toLowerCase()
}

function isCloudBaseAiOpenAiService(value = '') {
  return [
    'cloudbase_ai_http_openai',
    'cloudbase_qwen_vl',
    'qwen_vl',
    'aliyun_bailian',
    'aliyun-bailian-custom'
  ].includes(normalizeServiceValue(value))
}

function isHunyuanService(value = '') {
  return normalizeServiceValue(value || 'hunyuan') === 'hunyuan'
}

function isKnownCloudBaseOpenAiProvider(value = '') {
  return ['hunyuan', 'hunyuan-exp', 'deepseek'].includes(normalizeServiceValue(value))
}

function normalizePositiveNumber(value, fallback = null) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function normalizeUploadCompression(value = null) {
  if (!value || typeof value !== 'object') {
    return null
  }

  const numberFields = [
    'originalSizeBytes',
    'uploadedSizeBytes',
    'compressionRatio',
    'quality',
    'width',
    'height',
    'targetSizeBytes',
    'minimumQuality'
  ]
  const normalized = {
    source: normalizeText(value.source || '', ''),
    compressed: Boolean(value.compressed),
    preserveImageDetails: Boolean(value.preserveImageDetails),
    doubleConfirmedForHunyuan: Boolean(value.doubleConfirmedForHunyuan)
  }

  for (const field of numberFields) {
    const num = Number(value[field])
    normalized[field] = Number.isFinite(num) && num > 0 ? num : null
  }

  return normalized
}

function normalizeLlmImageInput(item = {}, index = 0) {
  if (typeof item === 'string') {
    const imageRef = normalizeText(item, '')
    return imageRef
      ? {
          imageRef,
          inputSlotType: 'unknown',
          inputSlotLabel: '',
          userDeclaredOrganType: 'unknown',
          inputSlotOrder: index,
          totalImageCount: 1,
          caseSlotSummary: [],
          uploadCompression: null
        }
      : null
  }

  const imageRef = normalizeText(
    item?.imageRef || item?.imageUrl || item?.url || item?.image || '',
    ''
  )
  if (!imageRef) {return null}

  const inputSlotOrder = Number(item?.inputSlotOrder ?? item?.orderIndex ?? index)
  const totalImageCount = Number(item?.totalImageCount)

  return {
    imageRef,
    inputSlotType: normalizeOrgan(
      item?.inputSlotType || item?.slotType || item?.organHint || item?.organ || 'unknown',
      'unknown'
    ),
    inputSlotLabel: normalizeText(item?.inputSlotLabel || item?.slotLabel || '', ''),
    userDeclaredOrganType: normalizeOrgan(
      item?.userDeclaredOrganType || item?.declaredOrganType || item?.userDeclaredOrgan || 'unknown',
      'unknown'
    ),
    inputSlotOrder: Number.isFinite(inputSlotOrder) ? inputSlotOrder : index,
    totalImageCount: Number.isFinite(totalImageCount) ? totalImageCount : 1,
    caseSlotSummary: Array.isArray(item?.caseSlotSummary) ? item.caseSlotSummary : [],
    uploadCompression: normalizeUploadCompression(
      item?.uploadCompression || item?.compression || null
    )
  }
}

function getHunyuanClient() {
  if (clientInstance) {
    return clientInstance
  }

  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('缺少混元调用密钥配置')
  }

  clientInstance = new HunyuanClient({
    credential: {
      secretId: SECRET_ID,
      secretKey: SECRET_KEY
    },
    region: '',
    profile: {
      httpProfile: {
        endpoint,
        reqTimeout: requestTimeoutSec
      }
    }
  })

  return clientInstance
}

function extractUsage(payload) {
  return payload?.Response?.Usage || payload?.Usage || payload?.usage || null
}

function pickUsageNumber(...values) {
  for (const value of values) {
    const numberValue = Number(value)
    if (Number.isFinite(numberValue)) {
      return numberValue
    }
  }
  return null
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  const promptTokens =
    pickUsageNumber(
      usage.PromptTokens,
      usage.prompt_tokens,
      usage.promptTokens,
      usage.InputTokens,
      usage.input_tokens,
      usage.inputTokens
    ) || 0
  const completionTokens =
    pickUsageNumber(
      usage.CompletionTokens,
      usage.completion_tokens,
      usage.completionTokens,
      usage.OutputTokens,
      usage.output_tokens,
      usage.outputTokens
    ) || 0
  const totalTokens =
    pickUsageNumber(
      usage.TotalTokens,
      usage.total_tokens,
      usage.totalTokens,
      usage.TotalTokenCount,
      usage.totalTokenCount
    ) || 0
  const promptTokensDetails =
    usage.prompt_tokens_details ||
    usage.promptTokensDetails ||
    usage.PromptTokensDetails ||
    usage.input_tokens_details ||
    usage.inputTokensDetails ||
    usage.InputTokensDetails ||
    {}
  const promptCacheHitTokens = pickUsageNumber(
    usage.promptCacheHitTokens,
    usage.prompt_cache_hit_tokens,
    usage.cacheHitTokens,
    usage.cache_hit_tokens,
    usage.cachedTokens,
    usage.cached_tokens,
    promptTokensDetails.promptCacheHitTokens,
    promptTokensDetails.prompt_cache_hit_tokens,
    promptTokensDetails.cacheHitTokens,
    promptTokensDetails.cache_hit_tokens,
    promptTokensDetails.cachedTokens,
    promptTokensDetails.cached_tokens
  )
  const promptCacheCreationInputTokens = pickUsageNumber(
    usage.promptCacheCreationInputTokens,
    usage.prompt_cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
    usage.cache_creation_input_tokens,
    promptTokensDetails.promptCacheCreationInputTokens,
    promptTokensDetails.prompt_cache_creation_input_tokens,
    promptTokensDetails.cacheCreationInputTokens,
    promptTokensDetails.cache_creation_input_tokens
  )
  const explicitPromptCacheMissTokens = pickUsageNumber(
    usage.promptCacheMissTokens,
    usage.prompt_cache_miss_tokens,
    usage.cacheMissTokens,
    usage.cache_miss_tokens,
    promptTokensDetails.promptCacheMissTokens,
    promptTokensDetails.prompt_cache_miss_tokens,
    promptTokensDetails.cacheMissTokens,
    promptTokensDetails.cache_miss_tokens
  )
  const promptCacheMetricAvailable = Number(
    promptCacheHitTokens !== null ||
    promptCacheCreationInputTokens !== null ||
    explicitPromptCacheMissTokens !== null
  )
  const resolvedPromptCacheHitTokens = Math.max(0, Number(promptCacheHitTokens || 0))
  const resolvedPromptCacheCreationInputTokens = Math.max(
    0,
    Number(promptCacheCreationInputTokens || 0)
  )
  const resolvedPromptCacheMissTokens = explicitPromptCacheMissTokens !== null
    ? Math.max(0, Number(explicitPromptCacheMissTokens || 0))
    : promptCacheMetricAvailable
      ? Math.max(0, promptTokens - resolvedPromptCacheHitTokens - resolvedPromptCacheCreationInputTokens)
      : 0

  return {
    promptTokens,
    completionTokens,
    outputTokens: completionTokens,
    totalTokens,
    promptCacheHitTokens: resolvedPromptCacheHitTokens,
    promptCacheMissTokens: resolvedPromptCacheMissTokens,
    promptCacheCreationInputTokens: resolvedPromptCacheCreationInputTokens,
    promptCacheMetricAvailable,
    rawUsage:
      usage.rawUsage && typeof usage.rawUsage === 'object'
        ? usage.rawUsage
        : usage
  }
}

function normalizeOpenAiOptions(options = {}) {
  const normalized = {}
  const temperature = Number(options.temperature ?? options.Temperature)
  const topP = Number(options.top_p ?? options.topP ?? options.TopP)
  const seed = Number(options.seed ?? options.Seed)

  if (Number.isFinite(temperature)) {
    normalized.temperature = temperature
  }
  if (Number.isFinite(topP)) {
    normalized.top_p = topP
  }
  if (Number.isFinite(seed)) {
    normalized.seed = seed
  }

  return normalized
}

function extractDeltaContent(payload) {
  return (
    payload?.Response?.Choices?.[0]?.Delta?.Content ||
    payload?.Response?.Choices?.[0]?.Message?.Content ||
    payload?.Choices?.[0]?.Delta?.Content ||
    payload?.Choices?.[0]?.Message?.Content ||
    ''
  )
}

function isFinishPayload(payload) {
  return Boolean(
    payload?.Response?.Choices?.[0]?.FinishReason ||
    payload?.Choices?.[0]?.FinishReason ||
    payload?.done
  )
}

function extractPayloadError(payload) {
  return (
    payload?.Response?.Error?.Message || payload?.error?.message || payload?.Error?.Message || ''
  )
}

function extractOpenAiContent(payload) {
  return String(
    payload?.choices?.[0]?.delta?.content ||
      payload?.choices?.[0]?.message?.content ||
      payload?.Response?.Choices?.[0]?.Delta?.Content ||
      payload?.Response?.Choices?.[0]?.Message?.Content ||
      ''
  )
}

function isCloudBaseAiImageDownloadError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('failed to download multimodal content') ||
    message.includes('download multimodal content') ||
    message.includes('multimodal content') ||
    message.includes('图片下载失败')
  )
}

function safeJsonParse(data) {
  if (data === null || data === undefined) {return null}
  if (typeof data === 'object') {return data}

  const text = String(data).trim()
  if (!text) {return null}

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function requestJsonHttp(url, { headers = {}, body = {}, timeoutMs = 10000 } = {}) {
  const endpointUrl = new URL(url)
  const payload = JSON.stringify(body || {})

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (err, result = null) => {
      if (settled) {return}
      settled = true
      if (err) {
        reject(err)
        return
      }
      resolve(result)
    }

    const req = https.request(
      {
        hostname: endpointUrl.hostname,
        path: `${endpointUrl.pathname}${endpointUrl.search}`,
        method: 'POST',
        agent: HTTP_AGENT,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      res => {
        let rawBody = ''
        res.on('data', chunk => {
          rawBody += chunk.toString()
        })
        res.on('end', () => {
          const json = safeJsonParse(rawBody)
          finish(null, {
            statusCode: res.statusCode,
            headers: res.headers || {},
            rawBody,
            json
          })
        })
        res.on('error', finish)
      }
    )

    req.on('error', finish)
    req.setTimeout(Math.max(1000, Number(timeoutMs || 10000)), () => {
      req.destroy()
      finish(new Error('CloudBase HTTP API 请求超时'))
    })
    req.write(payload)
    req.end()
  })
}

function resolveCloudBaseAiEnvId() {
  return normalizeText(
    cloudbaseAi.envId ||
      process.env.CLOUDBASE_ENV_ID ||
      process.env.TCB_ENV ||
      process.env.SCF_NAMESPACE ||
      '',
    ''
  )
}

function buildCloudBaseGatewayBase() {
  const envId = resolveCloudBaseAiEnvId()
  if (!envId) {
    throw new Error('缺少 CloudBase AI HTTP API 环境 ID 配置')
  }
  return `https://${envId}.api.tcloudbasegateway.com`
}

async function signInCloudBaseAiAnonymously() {
  const now = Date.now()
  if (
    cloudBaseAiAccessTokenCache &&
    cloudBaseAiAccessTokenCache.accessToken &&
    cloudBaseAiAccessTokenCache.expireAt > now + 60000
  ) {
    return cloudBaseAiAccessTokenCache.accessToken
  }

  const deviceId = normalizeText(
    process.env.LLM_CLOUDBASE_AI_DEVICE_ID || '',
    `diagnose-http-qwen-${process.pid || 'pid'}`
  )
  const response = await requestJsonHttp(`${buildCloudBaseGatewayBase()}/auth/v1/signin/anonymously`, {
    headers: {
      'x-device-id': deviceId
    },
    body: {},
    timeoutMs: 10000
  })

  const token = normalizeText(response?.json?.access_token || '', '')
  if (!token) {
    throw new Error(
      `CloudBase HTTP API 匿名登录失败(${response?.statusCode || 0}): ${String(
        response?.rawBody || ''
      ).slice(0, 500)}`
    )
  }

  const expiresIn = Number(response?.json?.expires_in || 7200)
  cloudBaseAiAccessTokenCache = {
    accessToken: token,
    expireAt: now + Math.max(300, Number.isFinite(expiresIn) ? expiresIn : 7200) * 1000
  }
  return token
}

function isRetryableVisionError(error) {
  const message = String(error?.message || error || '').toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('network') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('请求限频') ||
    message.includes('限频') ||
    message.includes('频率限制')
  )
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.max(0, Number(ms || 0))))
}

function pickNonStreamText(res) {
  return String(
    res?.Response?.Choices?.[0]?.Message?.Content || res?.Choices?.[0]?.Message?.Content || ''
  )
}

function safeSerializeLogPayload(res) {
  if (res === null || res === undefined) {
    return res
  }

  if (typeof res === 'string') {
    return res
  }

  const content =
    res?.Response?.Choices?.[0]?.Message?.Content ||
    res?.Choices?.[0]?.Message?.Content ||
    ''

  if (typeof content !== 'string' || !content.trim()) {
    return res
  }

  try {
    return JSON.parse(content)
  } catch {
    return {
      contentPreview: content.slice(0, 1000),
      contentLength: content.length
    }
  }

  /*  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable payload]'
  }*/
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value)
  } catch {
    return '{}'
  }
}

function buildPromptPreview(promptText = '') {
  const lines = String(promptText || '')
    .split('\n')
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8)

  return lines.join(' | ').slice(0, 1200)
}

function buildPromptLogContext(images = []) {
  return (Array.isArray(images) ? images : []).map(item => ({
    inputSlotType: item?.inputSlotType || 'unknown',
    inputSlotLabel: item?.inputSlotLabel || '',
    userDeclaredOrganType: item?.userDeclaredOrganType || 'unknown',
    inputSlotOrder: Number.isFinite(Number(item?.inputSlotOrder))
      ? Number(item.inputSlotOrder)
      : 0,
    totalImageCount: Number.isFinite(Number(item?.totalImageCount))
      ? Number(item.totalImageCount)
      : 1,
    uploadCompression: item?.uploadCompression || null,
    caseSlotSummary: (Array.isArray(item?.caseSlotSummary) ? item.caseSlotSummary : [])
      .map(summaryItem => ({
        inputSlotOrder: Number.isFinite(Number(summaryItem?.inputSlotOrder))
          ? Number(summaryItem.inputSlotOrder)
          : 0,
        inputSlotType: summaryItem?.inputSlotType || 'unknown',
        inputSlotLabel: summaryItem?.inputSlotLabel || ''
      }))
      .slice(0, 6)
  }))
}

function buildOpenAiImageUrlContent(url = '') {
  const item = {
    type: 'image_url',
    image_url: { url }
  }
  const maxPixels = normalizePositiveNumber(cloudbaseAi.imageMaxPixels, null)
  if (maxPixels) {
    item.max_pixels = maxPixels
  }
  return item
}

function splitPromptForOpenAiCache(promptText = '') {
  const text = String(promptText || '').trim()
  const marker = '[Dynamic Task]'
  const markerIndex = text.indexOf(marker)

  if (!text || markerIndex < 0) {
    return {
      staticPromptText: text,
      dynamicPromptText: '',
      cacheMarkerFound: markerIndex >= 0
    }
  }

  return {
    staticPromptText: text.slice(0, markerIndex).trim(),
    dynamicPromptText: text.slice(markerIndex).trim(),
    cacheMarkerFound: true
  }
}

function buildCacheableOpenAiTextContent(text = '') {
  return {
    type: 'text',
    text,
    cache_control: { type: 'ephemeral' }
  }
}

function buildOpenAiVisionMessages({ promptText = '', imageContents = [] } = {}) {
  const { staticPromptText, dynamicPromptText, cacheMarkerFound } =
    splitPromptForOpenAiCache(promptText)
  const messages = []
  const normalizedImageContents = Array.isArray(imageContents) ? imageContents.filter(Boolean) : []
  const promptCacheStrategy = {
    enabled: Boolean(staticPromptText),
    type: 'explicit_ephemeral_static_prefix',
    markerFound: cacheMarkerFound ? 1 : 0,
    staticPromptLength: staticPromptText.length,
    dynamicPromptLength: dynamicPromptText.length,
    imageCount: normalizedImageContents.length,
    layout: 'system_static_cache_user_dynamic_then_images'
  }

  if (staticPromptText) {
    messages.push({
      role: 'system',
      content: [buildCacheableOpenAiTextContent(staticPromptText)]
    })
  }

  const userContent = []
  if (dynamicPromptText) {
    userContent.push({ type: 'text', text: dynamicPromptText })
  } else if (!staticPromptText && promptText) {
    userContent.push({ type: 'text', text: String(promptText || '').trim() })
  }
  userContent.push(...normalizedImageContents)

  messages.push({
    role: 'user',
    content: userContent
  })

  return {
    messages,
    promptCacheStrategy
  }
}

async function buildDataUrlOpenAiMessages(messages = []) {
  const normalizedMessages = Array.isArray(messages) ? messages : []
  const result = []

  for (const message of normalizedMessages) {
    if (!Array.isArray(message?.content)) {
      result.push(message)
      continue
    }

    const content = []
    for (const item of message.content) {
      if (item?.type === 'image_url' && item?.image_url?.url) {
        content.push({
          ...item,
          image_url: {
            ...item.image_url,
            url: await fetchImageUrlAsDataUrl(item.image_url.url)
          }
        })
        continue
      }
      content.push(item)
    }

    result.push({
      ...message,
      content
    })
  }

  return result
}

function fetchImageUrlAsDataUrl(imageUrl = '') {
  const normalizedUrl = normalizeText(imageUrl, '')
  if (!normalizedUrl) {
    throw new Error('缺少图片地址')
  }

  if (/^data:image\//i.test(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  if (!/^https?:\/\//i.test(normalizedUrl)) {
    return Promise.resolve(normalizedUrl)
  }

  const endpointUrl = new URL(normalizedUrl)
  const maxBytes = Number(process.env.LLM_IMAGE_DATA_URL_MAX_BYTES || 5 * 1024 * 1024)
  const timeoutMs = Math.max(1000, Number(requestTimeoutSec || 45) * 1000)

  return new Promise((resolve, reject) => {
    let settled = false
    const chunks = []
    let totalBytes = 0
    const finish = (err, result = '') => {
      if (settled) {return}
      settled = true
      if (err) {
        reject(err)
        return
      }
      resolve(result)
    }

    const req = https.get(
      {
        hostname: endpointUrl.hostname,
        path: `${endpointUrl.pathname}${endpointUrl.search}`,
        agent: HTTP_AGENT,
        headers: {
          'User-Agent': 'diagnose-http-visual-model'
        }
      },
      res => {
        const statusCode = Number(res.statusCode || 0)
        const contentType = String(res.headers['content-type'] || 'image/jpeg').split(';')[0]
        if (statusCode < 200 || statusCode >= 300) {
          res.resume()
          finish(new Error(`图片下载失败(${statusCode})`))
          return
        }

        res.on('data', chunk => {
          totalBytes += chunk.length
          if (totalBytes > maxBytes) {
            req.destroy()
            finish(new Error(`图片过大，无法转为模型 data URL: ${totalBytes} > ${maxBytes}`))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const imageBuffer = Buffer.concat(chunks)
          if (!imageBuffer.length) {
            finish(new Error('图片下载为空'))
            return
          }
          const mimeType = /^image\//i.test(contentType) ? contentType : 'image/jpeg'
          finish(null, `data:${mimeType};base64,${imageBuffer.toString('base64')}`)
        })
        res.on('error', finish)
      }
    )

    req.on('error', finish)
    req.setTimeout(timeoutMs, () => {
      req.destroy()
      finish(new Error('图片下载超时'))
    })
  })
}

async function buildLLMDiagnoseRequest(images = []) {
  const contents = []
  const openAiImageContents = []
  const normalizedImages = Array.isArray(images)
    ? images.map((item, index) => normalizeLlmImageInput(item, index)).filter(Boolean)
    : []
  const selectedImages = normalizedImages.slice(0, Math.max(1, Number(maxImages || 1)))

  for (const image of selectedImages) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image.imageRef } })
    openAiImageContents.push(buildOpenAiImageUrlContent(image.imageRef))
  }

  const promptPayload = await buildSymptomLabelerPromptPayload({
    imageContext: selectedImages[0] || normalizedImages[0] || null
  })
  contents.push({ Type: 'text', Text: promptPayload.promptText })
  const openAiPayload = buildOpenAiVisionMessages({
    promptText: promptPayload.promptText,
    imageContents: openAiImageContents
  })
  return {
    messages: [{ Role: 'user', Contents: contents }],
    openAiMessages: openAiPayload.messages,
    promptCacheStrategy: openAiPayload.promptCacheStrategy,
    promptText: promptPayload.promptText,
    promptDebugMeta: promptPayload.debugMeta || {},
    normalizedImages,
    selectedImages
  }
}

function buildPayload(messages, stream, modelName = model) {
  return {
    Model: modelName,
    Messages: messages,
    Stream: Boolean(stream),
    ...llmOptions
  }
}

function buildCloudBaseAiEndpoint() {
  const configuredBaseUrl = normalizeText(cloudbaseAi.baseUrl || '', '')
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, '')
  }

  const envId = resolveCloudBaseAiEnvId()
  const provider = normalizeText(cloudbaseAi.provider || '', 'aliyun-bailian-custom')
  const providerPath = provider.replace(/^\/+|\/+$/g, '')
  const endpointStyle = normalizeServiceValue(cloudbaseAi.endpointStyle || '')
  const useOpenAiProviderStyle =
    endpointStyle === 'openai' ||
    (!endpointStyle && isKnownCloudBaseOpenAiProvider(providerPath))

  if (!envId) {
    throw new Error('缺少 CloudBase AI HTTP API 环境 ID 配置')
  }

  const suffix = useOpenAiProviderStyle ? 'v1/chat/completions' : 'chat/completions'
  return `https://${envId}.api.tcloudbasegateway.com/v1/ai/${providerPath}/${suffix}`
}

async function buildCloudBaseAiAuthorization() {
  const apiKey = normalizeText(
    cloudbaseAi.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.CLOUDBASE_AI_API_KEY ||
      process.env.CLOUDBASE_AI_ACCESS_TOKEN ||
      '',
    ''
  )

  if (apiKey) {
    return `Bearer ${apiKey}`
  }

  return `Bearer ${await signInCloudBaseAiAnonymously()}`
}

function buildCloudBaseAiPayload(messages, stream) {
  const payload = {
    model,
    messages,
    stream: Boolean(stream),
    ...normalizeOpenAiOptions(llmOptions)
  }

  const maxTokens = normalizePositiveNumber(cloudbaseAi.maxTokens, null)
  if (maxTokens && !payload.max_tokens) {
    payload.max_tokens = maxTokens
  }

  if (stream) {
    payload.stream_options = {
      include_usage: true,
      ...llmOptions.stream_options || llmOptions.StreamOptions
    }
  }

  return payload
}

function summarizeCloudBaseAiPayload(payload = {}, body = '') {
  const messages = Array.isArray(payload?.messages) ? payload.messages : []
  let imageUrlCount = 0
  let dataUrlImageCount = 0

  for (const message of messages) {
    const content = Array.isArray(message?.content) ? message.content : []
    for (const part of content) {
      if (part?.type !== 'image_url') {continue}
      const imageUrl = String(part?.image_url?.url || '').trim()
      if (!imageUrl) {continue}
      if (imageUrl.startsWith('data:')) {
        dataUrlImageCount += 1
      } else {
        imageUrlCount += 1
      }
    }
  }

  return {
    model: normalizeText(payload?.model || '', model),
    stream: Boolean(payload?.stream),
    messageCount: messages.length,
    imageCount: imageUrlCount + dataUrlImageCount,
    imageUrlCount,
    dataUrlImageCount,
    payloadBytes: Buffer.byteLength(String(body || ''))
  }
}

async function requestCloudBaseAiOpenAi(payload, { onText, timeoutMs = null } = {}) {
  const timingStartedAt = Date.now()
  const endpointUrl = new URL(buildCloudBaseAiEndpoint())
  const body = JSON.stringify(payload)
  const stream = Boolean(payload?.stream)
  const authStartedAt = Date.now()
  const authorization = await buildCloudBaseAiAuthorization()
  const authorizationMs = Date.now() - authStartedAt
  const resolvedTimeoutMs = Math.max(
    1000,
    Number(timeoutMs || 0) > 0
      ? Number(timeoutMs)
      : Math.max(1, Number(requestTimeoutSec || 45)) * 1000
  )
  const requestPayloadSummary = summarizeCloudBaseAiPayload(payload, body)

  return new Promise((resolve, reject) => {
    const requestStartedAt = Date.now()
    let fullText = ''
    let usage = null
    let rawBody = ''
    let lineBuffer = ''
    let finished = false
    let responseBytes = 0
    let firstByteMs = null
    let statusCode = 0

    const buildHttpTiming = (extra = {}) => ({
      provider: 'cloudbase_ai_openai',
      endpointHost: endpointUrl.hostname,
      ...requestPayloadSummary,
      ok: Number(!extra.error),
      statusCode,
      authorizationMs,
      setupMs: Math.max(0, requestStartedAt - timingStartedAt),
      firstByteMs,
      responseBodyBytes: responseBytes || Buffer.byteLength(String(rawBody || '')),
      requestMs: Math.max(0, Date.now() - requestStartedAt),
      totalMs: Math.max(0, Date.now() - timingStartedAt),
      timeoutMs: resolvedTimeoutMs,
      promptTokens: Number(extra?.usage?.promptTokens || usage?.promptTokens || 0),
      completionTokens: Number(extra?.usage?.completionTokens || usage?.completionTokens || 0),
      totalTokens: Number(extra?.usage?.totalTokens || usage?.totalTokens || 0),
      promptCacheHitTokens: Number(
        extra?.usage?.promptCacheHitTokens || usage?.promptCacheHitTokens || 0
      ),
      promptCacheMissTokens: Number(
        extra?.usage?.promptCacheMissTokens || usage?.promptCacheMissTokens || 0
      ),
      error: extra.error ? String(extra.error || '').slice(0, 240) : ''
    })

    const finish = (err, result = null) => {
      if (finished) {return}
      finished = true
      const httpTiming = buildHttpTiming({
        error: err ? String(err?.message || err || '') : '',
        usage: result?.usage || usage || null
      })

      if (err) {
        err.partialText = fullText
        err.httpTiming = httpTiming
        console.warn('diagnose-http qwen http timing:', httpTiming)
        reject(err)
        return
      }

      console.log('diagnose-http qwen http timing:', httpTiming)
      resolve({
        ...(result || { text: fullText, usage }),
        httpTiming
      })
    }

    const processDataLine = line => {
      const trimmed = String(line || '').trim()
      if (!trimmed || !trimmed.startsWith('data:')) {
        return
      }

      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') {
        return
      }

      const parsed = safeJsonParse(data)
      if (!parsed) {
        return
      }

      const payloadError = extractPayloadError(parsed)
      if (payloadError) {
        finish(new Error(payloadError))
        return
      }

      const delta = extractOpenAiContent(parsed)
      if (delta) {
        fullText += delta
        if (typeof onText === 'function') {
          onText(delta, fullText)
        }
      }

      const currentUsage = normalizeUsage(extractUsage(parsed))
      if (currentUsage) {
        usage = currentUsage
      }
    }

    const req = https.request(
      {
        hostname: endpointUrl.hostname,
        path: `${endpointUrl.pathname}${endpointUrl.search}`,
        method: 'POST',
        agent: HTTP_AGENT,
        headers: {
          Authorization: authorization,
          'Content-Type': 'application/json',
          Accept: stream ? 'text/event-stream' : 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      },
      res => {
        statusCode = Number(res.statusCode || 0)
        res.on('data', chunk => {
          if (firstByteMs === null) {
            firstByteMs = Math.max(0, Date.now() - requestStartedAt)
          }
          responseBytes += Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk || ''))
          const text = chunk.toString()
          rawBody += text

          if (!stream) {
            return
          }

          lineBuffer += text
          const lines = lineBuffer.split(/\r?\n/)
          lineBuffer = lines.pop() || ''
          for (const line of lines) {
            processDataLine(line)
          }
        })

        res.on('end', () => {
          if (stream) {
            if (lineBuffer.trim()) {
              processDataLine(lineBuffer)
            }

            if (res.statusCode >= 400) {
              finish(new Error(`CloudBase AI 请求失败(${res.statusCode}): ${rawBody.slice(0, 500)}`))
              return
            }

            if (!fullText) {
              finish(new Error('CloudBase AI 返回空响应'))
              return
            }

            if (usage) {
              console.log('diagnose-http usageToken:', usage)
            }
            finish(null, { text: fullText, usage })
            return
          }

          if (res.statusCode >= 400) {
            finish(new Error(`CloudBase AI 请求失败(${res.statusCode}): ${rawBody.slice(0, 500)}`))
            return
          }

          const parsed = safeJsonParse(rawBody)
          const payloadError = extractPayloadError(parsed)
          if (payloadError) {
            finish(new Error(payloadError))
            return
          }

          const text = extractOpenAiContent(parsed)
          const responseUsage = normalizeUsage(extractUsage(parsed))
          if (responseUsage) {
            console.log('diagnose-http usageToken:', responseUsage)
          }
          finish(null, { text, usage: responseUsage })
        })

        res.on('error', finish)
      }
    )

    req.on('error', finish)
    req.setTimeout(resolvedTimeoutMs, () => {
      req.destroy()
      const error = new Error('CloudBase AI 请求超时')
      error.code = 'cloudbase_ai_timeout'
      error.timeoutMs = resolvedTimeoutMs
      finish(error)
    })
    req.write(body)
    req.end()
  })
}

async function callCloudBaseAiOpenAiNonStream(messages, options = {}) {
  return requestCloudBaseAiOpenAi(buildCloudBaseAiPayload(messages, false), options)
}

async function callCloudBaseAiOpenAiStream(messages, { onText, timeoutMs = null } = {}) {
  return requestCloudBaseAiOpenAi(buildCloudBaseAiPayload(messages, true), { onText, timeoutMs })
}

async function callHunyuanVisionNonStream(messages, { modelName = model } = {}) {
  const client = getHunyuanClient()
  const maxAttempts = 4
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await client.ChatCompletions(buildPayload(messages, false, modelName))
      console.log('diagnose-http hunyuan non-stream raw response:', safeSerializeLogPayload(res))
      const errorMessage = extractPayloadError(res)

      if (errorMessage) {
        throw new Error(errorMessage)
      }

      const usage = normalizeUsage(extractUsage(res))
      if (usage) {
        console.log('diagnose-http usageToken:', usage)
      }

      if (attempt > 1) {
        console.warn('diagnose-http hunyuan non-stream recovered after retry:', { attempt })
      }

      return {
        text: pickNonStreamText(res),
        usage
      }
    } catch (error) {
      lastError = error
      const retryable = isRetryableVisionError(error)

      if (attempt >= maxAttempts || !retryable) {
        console.error('diagnose-http hunyuan non-stream final failure:', {
          attempt,
          maxAttempts,
          retryable,
          reason: String(error?.message || error || '')
        })
        break
      }

      console.warn('diagnose-http hunyuan non-stream retry:', {
        attempt,
        nextAttempt: attempt + 1,
        reason: String(error?.message || error || '')
      })
      await wait(Math.min(5000, 1200 * (2 ** (attempt - 1))))
    }
  }

  throw lastError
}

function callHunyuanVisionStream(messages, { onText, modelName = model } = {}) {
  const client = getHunyuanClient()

  return new Promise((resolve, reject) => {
    let finished = false
    let fullText = ''
    let usage = null
    const timeout = setTimeout(() => {
      if (finished) {return}
      finished = true
      reject(new Error('混元请求超时'))
    }, 45000)

    const finish = (err, text) => {
      if (finished) {return}
      finished = true
      clearTimeout(timeout)

      if (err) {
        err.partialText = fullText
        reject(err)
        return
      }

      if (usage) {
        console.log('diagnose-http usageToken:', usage)
      }
      resolve({
        text,
        usage
      })
    }

    client.ChatCompletions(buildPayload(messages, true, modelName)).then(
      res => {
        if (!res || typeof res.on !== 'function') {
          console.log(
            'diagnose-http hunyuan stream fallback raw response:',
            safeSerializeLogPayload(res)
          )
          const responseUsage = normalizeUsage(extractUsage(res))
          if (responseUsage) {
            usage = responseUsage
          }
          finish(null, pickNonStreamText(res))
          return
        }

        res.on('message', message => {
          console.log('diagnose-http hunyuan stream raw message:', safeSerializeLogPayload(message))
          const parsed = safeJsonParse(message)
          console.log(
            'diagnose-http hunyuan stream parsed message:',
            safeSerializeLogPayload(parsed)
          )
          if (!parsed) {return}

          const payloadError = extractPayloadError(parsed)
          if (payloadError) {
            finish(new Error(payloadError))
            return
          }

          const delta = extractDeltaContent(parsed)
          if (delta) {
            fullText += delta
            if (typeof onText === 'function') {
              onText(delta, fullText)
            }
          }

          const currentUsage = normalizeUsage(extractUsage(parsed))
          if (currentUsage) {
            usage = currentUsage
          }

          if (isFinishPayload(parsed)) {
            finish(null, fullText)
          }
        })

        res.on('error', err => finish(err))
        res.on('end', () => finish(null, fullText))
      },
      err => finish(err)
    )
  })
}

async function callLLMDiagnose(
  images = [],
  {
    onText,
    timeoutMs = null,
    disableFallback = false,
    disableImageDataUrlFallback = false
  } = {}
) {
  const startedAt = Date.now()
  const requestBuildStartedAt = Date.now()
  const requestPayload = await buildLLMDiagnoseRequest(images)
  const requestBuildMs = Date.now() - requestBuildStartedAt
  const {
    messages,
    openAiMessages,
    promptCacheStrategy = null,
    promptText,
    promptDebugMeta = {},
    normalizedImages = [],
    selectedImages = []
  } = requestPayload

  console.log(
    `diagnose-http prompt image-context ${safeJsonStringify({
      service,
      model,
      modelProfile,
      modelReasoningMode,
      imageCount: selectedImages.length,
      totalInputImages: normalizedImages.length,
      imageLengths: selectedImages.map(item => String(item?.imageRef || '').length),
      imagePrefixes: selectedImages.map(item => String(item?.imageRef || '').slice(0, 32)),
      imageUploadCompression: selectedImages.map(item => item?.uploadCompression || null),
      promptCacheStrategy,
      selectedImageContexts: buildPromptLogContext(selectedImages)
    })}`
  )
  console.log(
    `diagnose-http prompt pool-debug ${safeJsonStringify({
      ...promptDebugMeta,
      promptLength: String(promptText || '').length,
      promptPreview: buildPromptPreview(promptText)
    })}`
  )
  console.log('diagnose-http symptom prompt:', promptText)
  console.log('diagnose-http symptom prompt meta:', {
    service,
    model,
    modelProfile,
    modelReasoningMode,
    promptLength: promptText.length,
    promptCacheStrategy,
    hasImage: selectedImages.length > 0,
    imageCount: selectedImages.length,
    totalInputImages: normalizedImages.length,
    imageLengths: selectedImages.map(item => String(item?.imageRef || '').length),
    imagePrefixes: selectedImages.map(item => String(item?.imageRef || '').slice(0, 32)),
    imageUploadCompression: selectedImages.map(item => item?.uploadCompression || null),
    slotTypes: selectedImages.map(item => item?.inputSlotType || 'unknown'),
    slotLabels: selectedImages.map(item => item?.inputSlotLabel || ''),
    declaredOrgans: selectedImages.map(item => item?.userDeclaredOrganType || 'unknown')
  })
  const promptAudit = {
    service,
    model,
    modelProfile,
    modelReasoningMode,
    promptText,
    promptLength: String(promptText || '').length,
    promptPreview: buildPromptPreview(promptText),
    promptDebugMeta,
    promptCacheStrategy,
    imageContext: {
      imageCount: selectedImages.length,
      totalInputImages: normalizedImages.length,
      selectedImageContexts: buildPromptLogContext(selectedImages),
      imageLengths: selectedImages.map(item => String(item?.imageRef || '').length),
      imagePrefixes: selectedImages.map(item => String(item?.imageRef || '').slice(0, 32)),
      imageUploadCompression: selectedImages.map(item => item?.uploadCompression || null),
      slotTypes: selectedImages.map(item => item?.inputSlotType || 'unknown'),
      slotLabels: selectedImages.map(item => item?.inputSlotLabel || ''),
      declaredOrgans: selectedImages.map(item => item?.userDeclaredOrganType || 'unknown')
    }
  }

  const shouldUseStream = Boolean(sse && typeof onText === 'function')
  const activeService = normalizeServiceValue(service)
  const fallbackServiceName = normalizeServiceValue(fallbackService)
  const fallbackModelName = normalizeText(fallbackModel || '', 'hunyuan-vision-1.5-instruct')
  const buildLlmTiming = (extra = {}) => ({
    service,
    model,
    modelProfile,
    modelReasoningMode,
    requestBuildMs,
    totalMs: Math.max(0, Date.now() - startedAt),
    ...extra
  })
  const logLlmTiming = timing => {
    console.log('diagnose-http visual llm timing:', timing)
  }

  const callPrimary = async () => {
    if (isCloudBaseAiOpenAiService(activeService)) {
      const callCloudBaseQwen = messagesForCall =>
        shouldUseStream
          ? callCloudBaseAiOpenAiStream(messagesForCall, { onText, timeoutMs })
          : callCloudBaseAiOpenAiNonStream(messagesForCall, { timeoutMs })

      try {
        const result = await callCloudBaseQwen(openAiMessages)
        return {
          ...result,
          imageInputTransport: 'url'
        }
      } catch (error) {
        if (!isCloudBaseAiImageDownloadError(error)) {
          throw error
        }
        if (disableImageDataUrlFallback) {
          throw error
        }

        console.warn('diagnose-http qwen image_url download failed, retry with data_url:', {
          service,
          model,
          reason: String(error?.message || error || '').slice(0, 500)
        })
        const dataUrlMessages = await buildDataUrlOpenAiMessages(openAiMessages)
        const result = await callCloudBaseQwen(dataUrlMessages)
        return {
          ...result,
          imageInputTransport: 'data_url_fallback'
        }
      }
    }

    return shouldUseStream
      ? callHunyuanVisionStream(messages, { onText })
      : callHunyuanVisionNonStream(messages)
  }

  const callFallback = async (reason) => {
    if (!isHunyuanService(fallbackServiceName)) {
      throw reason
    }

    console.warn('diagnose-http primary visual model failed, fallback to hunyuan:', {
      service,
      model,
      fallbackService,
      fallbackModel: fallbackModelName,
      reason: String(reason?.message || reason || '')
    })

    const fallbackStartedAt = Date.now()
    const result = shouldUseStream
      ? await callHunyuanVisionStream(messages, { onText, modelName: fallbackModelName })
      : await callHunyuanVisionNonStream(messages, { modelName: fallbackModelName })
    const llmTiming = buildLlmTiming({
      fallback: 1,
      fallbackService: fallbackServiceName,
      fallbackModel: fallbackModelName,
      fallbackCallMs: Math.max(0, Date.now() - fallbackStartedAt),
      primaryError: String(reason?.message || reason || '').slice(0, 240),
      httpTiming: result?.httpTiming || null
    })
    logLlmTiming(llmTiming)

    return {
      text: result?.text || '',
      usage: result?.usage || null,
      llmTiming,
      promptAudit: {
        ...promptAudit,
        service: fallbackServiceName,
        model: fallbackModelName,
        fallbackFrom: {
          service,
          model,
          reason: String(reason?.message || reason || '')
        }
      },
      adapterMetaOverride: {
        source_model_provider: fallbackServiceName,
        source_model_name: fallbackModelName,
        source_model_reasoning_mode: 'fallback'
      }
    }
  }

  if (!shouldUseStream) {
    const primaryStartedAt = Date.now()
    try {
      const result = await callPrimary()
      const llmTiming = buildLlmTiming({
        primaryCallMs: Math.max(0, Date.now() - primaryStartedAt),
        imageInputTransport: result?.imageInputTransport || '',
        httpTiming: result?.httpTiming || null
      })
      logLlmTiming(llmTiming)
      return {
        text: result?.text || '',
        usage: result?.usage || null,
        llmTiming,
        promptAudit: {
          ...promptAudit,
          imageInputTransport: result?.imageInputTransport || ''
        }
      }
    } catch (error) {
      if (!isHunyuanService(activeService) && !disableFallback) {
        return callFallback(error)
      }
      throw error
    }
  }

  const primaryStartedAt = Date.now()
  try {
    const result = await callPrimary()
    const llmTiming = buildLlmTiming({
      primaryCallMs: Math.max(0, Date.now() - primaryStartedAt),
      imageInputTransport: result?.imageInputTransport || '',
      httpTiming: result?.httpTiming || null
    })
    logLlmTiming(llmTiming)
    return {
      text: result?.text || '',
      usage: result?.usage || null,
      llmTiming,
      promptAudit: {
        ...promptAudit,
        imageInputTransport: result?.imageInputTransport || ''
      }
    }
  } catch (error) {
    if (!isHunyuanService(activeService) && !disableFallback) {
      return callFallback(error)
    }

    debugLog('混元流式失败，尝试回退非流式:', error.message)
    if (error.partialText) {
      const llmTiming = buildLlmTiming({
        primaryCallMs: Math.max(0, Date.now() - primaryStartedAt),
        partialText: 1,
        primaryError: String(error?.message || error || '').slice(0, 240),
        httpTiming: error?.httpTiming || null
      })
      logLlmTiming(llmTiming)
      return {
        text: error.partialText,
        usage: null,
        llmTiming,
        promptAudit
      }
    }

    const fallbackStartedAt = Date.now()
    const fullText = await callHunyuanVisionNonStream(messages)
    const text = fullText?.text || ''
    if (text && typeof onText === 'function') {
      onText(text, text)
    }
    const llmTiming = buildLlmTiming({
      fallback: 1,
      fallbackService: 'hunyuan',
      fallbackCallMs: Math.max(0, Date.now() - fallbackStartedAt),
      primaryError: String(error?.message || error || '').slice(0, 240),
      httpTiming: fullText?.httpTiming || null
    })
    logLlmTiming(llmTiming)
    return {
      text,
      usage: fullText?.usage || null,
      llmTiming,
      promptAudit
    }
  }
}

module.exports = {
  callLLMDiagnose
}
