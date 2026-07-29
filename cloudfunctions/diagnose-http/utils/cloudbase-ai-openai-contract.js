'use strict'

const https = require('https')
const {
  buildCloudBaseAiEndpoint,
  buildCloudBaseAiPayload,
  buildCloudbaseAnthropicPayload,
  buildOpenAiVisionMessages,
  isCloudbaseImageInputError,
  requestCloudBaseJson,
  buildTokenHubSessionAffinityId
} = require('../configs')
const {
  ANTHROPIC_MESSAGES_PROTOCOL,
  adaptOpenAiVisionMessages,
  resolveOpenAiVisionProvider,
  resolveProviderCredential
} = require('../configs/provider-registry')

const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 32 })
let accessTokenCache = null

function text(value = '', conservative = '') {
  return String(value || '').trim() || conservative
}

function positiveNumber(value, conservative = null) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : conservative
}

function pickNumber(...values) {
  for (const value of values) {
    const number = Number(value)
    if (Number.isFinite(number)) {
      return number
    }
  }
  return null
}

function compactKey(value = '') {
  return String(value).replaceAll('_', '').toLowerCase()
}

function pickAliasNumber(sources, aliases) {
  return pickNumber(
    ...sources.flatMap(source =>
      Object.entries(source || {})
        .filter(([key]) => aliases.includes(compactKey(key)))
        .map(([, value]) => value)
    )
  )
}

function pickAliasObject(source, aliases) {
  return (
    Object.entries(source || {})
      .filter(([key]) => aliases.includes(compactKey(key)))
      .map(([, value]) => value)
      .find(value => value && typeof value === 'object') || {}
  )
}

function safeJsonParse(value) {
  if (value === null || value === undefined || typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value).trim())
  } catch {
    return null
  }
}

function extractUsage(payload) {
  return payload?.Response?.Usage || payload?.Usage || payload?.usage || null
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null
  }
  const promptTokens = pickAliasNumber([usage], ['prompttokens', 'inputtokens']) ?? 0
  const completionTokenValue = pickAliasNumber([usage], ['completiontokens', 'outputtokens'])
  const completionTokens = completionTokenValue ?? 0
  const totalTokens = pickAliasNumber([usage], ['totaltokens', 'totaltokencount']) ?? 0
  const promptDetails = pickAliasObject(usage, ['prompttokensdetails', 'inputtokensdetails'])
  const completionDetails = pickAliasObject(usage, [
    'completiontokensdetails',
    'outputtokensdetails'
  ])
  const reasoningTokenValue = pickAliasNumber([completionDetails], ['reasoningtokens'])
  const providerPromptTextTokenValue = pickAliasNumber([promptDetails], ['texttokens'])
  const providerPromptImageTokenValue = pickAliasNumber([promptDetails], ['imagetokens'])
  const promptCacheHitTokens = pickAliasNumber(
    [usage, promptDetails],
    ['promptcachehittokens', 'cachehittokens', 'cachereadinputtokens', 'cachedtokens']
  )
  const promptCacheCreationInputTokens = pickAliasNumber(
    [usage, promptDetails],
    ['promptcachecreationinputtokens', 'cachecreationinputtokens']
  )
  const explicitPromptCacheMissTokens = pickAliasNumber(
    [usage, promptDetails],
    ['promptcachemisstokens', 'cachemisstokens']
  )
  const metricAvailable = Number(
    promptCacheHitTokens !== null ||
      promptCacheCreationInputTokens !== null ||
      explicitPromptCacheMissTokens !== null
  )
  const cachedTokens = Math.max(0, Number(promptCacheHitTokens || 0))
  const cacheCreationTokens = Math.max(0, Number(promptCacheCreationInputTokens || 0))
  const cacheMissTokens =
    explicitPromptCacheMissTokens !== null
      ? Math.max(0, explicitPromptCacheMissTokens)
      : metricAvailable
        ? Math.max(0, promptTokens - cachedTokens - cacheCreationTokens)
        : 0
  const reasoningTokens = reasoningTokenValue === null ? null : Math.max(0, reasoningTokenValue)
  return {
    promptTokens,
    completionTokens,
    outputTokens: completionTokens,
    reasoningTokens,
    visibleCompletionTokens:
      completionTokenValue === null || reasoningTokens === null
        ? null
        : Math.max(0, completionTokens - reasoningTokens),
    providerPromptTextTokens:
      providerPromptTextTokenValue === null ? null : Math.max(0, providerPromptTextTokenValue),
    providerPromptImageTokens:
      providerPromptImageTokenValue === null ? null : Math.max(0, providerPromptImageTokenValue),
    totalTokens,
    promptCacheHitTokens: cachedTokens,
    promptCacheMissTokens: cacheMissTokens,
    promptCacheCreationInputTokens: cacheCreationTokens,
    promptCacheMetricAvailable: metricAvailable,
    rawUsage: usage.rawUsage && typeof usage.rawUsage === 'object' ? usage.rawUsage : usage
  }
}

function hasRemoteImage(messages = []) {
  return messages.some(message =>
    (message?.content || []).some(item => /^https?:\/\//i.test(text(item?.image_url?.url)))
  )
}

function hasDataUrlImage(messages = []) {
  return messages.some(message =>
    (message?.content || []).some(item => /^data:/i.test(text(item?.image_url?.url)))
  )
}

function anthropicText(payload = {}) {
  return (Array.isArray(payload.content) ? payload.content : [])
    .filter(item => item?.type === 'text')
    .map(item => text(item.text))
    .join('')
}

function cloudbaseMessagesError(value, statusCode = 0) {
  const payload = safeJsonParse(value)
  const message = text(
    payload?.Response?.Error?.Message || payload?.error?.message || payload?.Error?.Message || value
  )
  if (isImageDownloadError(message)) {
    return new Error('CloudBase Anthropic 图片下载失败')
  }
  return new Error(`CloudBase AI 请求失败(${Number(statusCode || 0)})`)
}

function createCloudBaseAiOpenAiClient({
  model = '',
  service = '',
  llmOptions = {},
  cloudbaseAi = {},
  requestTimeoutSec = 45
} = {}) {
  const provider = resolveOpenAiVisionProvider(service || cloudbaseAi.provider)
  const providerId = provider.id
  const modelId = text(model)
  const modelIdentity = `${providerId}:${modelId}`
  const usesAnthropicMessages = provider.protocol === ANTHROPIC_MESSAGES_PROTOCOL
  const endpoint = () =>
    buildCloudBaseAiEndpoint({ envId: envId(), cloudbaseAi, service: providerId })
  const envId = () =>
    text(
      cloudbaseAi.envId ||
        process.env.CLOUDBASE_ENV_ID ||
        process.env.TCB_ENV ||
        process.env.SCF_NAMESPACE
    )
  const authorization = async () => {
    const credential = resolveProviderCredential({ provider: providerId, cloudbaseAi })
    if (credential.value) {
      return `Bearer ${credential.value}`
    }
    if (!credential.allowAnonymousSignin) {
      throw new Error(credential.missingMessage)
    }
    const now = Date.now()
    if (accessTokenCache?.accessToken && accessTokenCache.expireAt > now + 60000) {
      return `Bearer ${accessTokenCache.accessToken}`
    }
    const result = await requestCloudBaseJson(
      `https://${envId()}.api.tcloudbasegateway.com/auth/v1/signin/anonymously`,
      {
        headers: {
          'x-device-id': text(
            process.env.LLM_CLOUDBASE_AI_DEVICE_ID,
            `diagnose-http-qwen-${process.pid || 'pid'}`
          )
        },
        body: {}
      }
    )
    const accessToken = text(result?.json?.access_token)
    if (!accessToken) {
      throw new Error(`CloudBase HTTP API 匿名登录失败(${result?.statusCode || 0})`)
    }
    accessTokenCache = {
      accessToken,
      expireAt: now + Math.max(300, positiveNumber(result?.json?.expires_in, 7200)) * 1000
    }
    return `Bearer ${accessToken}`
  }
  const buildImageContent = url => ({ type: 'image_url', image_url: { url } })
  const buildPayload = (messages, stream, base64Fallback = false) =>
    usesAnthropicMessages
      ? buildCloudbaseAnthropicPayload({
          model,
          messages,
          stream,
          llmOptions,
          cloudbaseAi,
          base64Fallback
        })
      : buildCloudBaseAiPayload({
          model,
          messages,
          stream,
          llmOptions,
          cloudbaseAi,
          service: providerId
        })
  const buildVisionMessages = options =>
    adaptOpenAiVisionMessages({
      provider: providerId,
      model: modelId,
      ...buildOpenAiVisionMessages(options)
    })
  const send = async (payload, { onText, timeoutMs = null, sessionId = '' } = {}) => {
    const startedAt = Date.now()
    const target = new URL(endpoint())
    const body = JSON.stringify(payload)
    const auth = await authorization()
    const sessionAffinityId = provider.capabilities.sessionAffinity
      ? buildTokenHubSessionAffinityId(sessionId)
      : ''
    const stream = Boolean(payload.stream)
    const resolvedTimeout = Math.max(1000, Number(timeoutMs || requestTimeoutSec * 1000))
    return new Promise((resolve, reject) => {
      let finished = false
      let raw = ''
      let pending = ''
      let fullText = ''
      let usage = null
      let firstByteMs = null
      let firstContentMs = null
      let responseStatus = 0
      const finish = (error, result = null) => {
        if (finished) {
          return
        }
        finished = true
        const currentUsage = result?.usage || usage
        const httpTiming = {
          provider: provider.httpTimingProvider,
          providerId,
          modelId,
          modelIdentity,
          endpointUrl: target.toString(),
          endpointHost: target.hostname,
          model: payload.model,
          stream,
          statusCode: Number(responseStatus || 0),
          firstByteMs,
          firstContentMs: error ? null : firstContentMs,
          requestMs: Date.now() - startedAt,
          promptTokens: Number(currentUsage?.promptTokens || 0),
          completionTokens: Number(currentUsage?.completionTokens || 0),
          reasoningTokens: currentUsage?.reasoningTokens ?? null,
          visibleCompletionTokens: currentUsage?.visibleCompletionTokens ?? null,
          error: error ? text(error?.message || error).slice(0, 240) : ''
        }
        if (error) {
          error.partialText = fullText
          error.httpTiming = httpTiming
          error.providerId = providerId
          error.modelId = modelId
          error.modelIdentity = modelIdentity
          reject(error)
        } else {
          resolve({ ...(result || { text: fullText, usage }), httpTiming })
        }
      }
      const processLine = line => {
        const value = text(line)
        if (!value.startsWith('data:')) {
          return
        }
        const parsed = safeJsonParse(value.slice(5))
        if (!parsed) {
          return
        }
        const errorMessage =
          parsed?.Response?.Error?.Message || parsed?.error?.message || parsed?.Error?.Message
        if (errorMessage) {
          return finish(
            usesAnthropicMessages
              ? cloudbaseMessagesError(parsed, responseStatus)
              : new Error(errorMessage)
          )
        }
        const delta = usesAnthropicMessages
          ? parsed?.type === 'content_block_delta' && parsed?.delta?.type === 'text_delta'
            ? text(parsed.delta.text)
            : ''
          : text(
              parsed?.choices?.[0]?.delta?.content ||
                parsed?.choices?.[0]?.message?.content ||
                parsed?.Response?.Choices?.[0]?.Delta?.Content
            )
        if (delta) {
          if (firstContentMs === null) {
            firstContentMs = Date.now() - startedAt
          }
          fullText += delta
          if (typeof onText === 'function') {
            onText(delta, fullText)
          }
        }
        usage = normalizeUsage(extractUsage(parsed)) || usage
      }
      const req = https.request(
        {
          hostname: target.hostname,
          path: `${target.pathname}${target.search}`,
          method: 'POST',
          agent: HTTP_AGENT,
          headers: {
            Authorization: auth,
            'Content-Type': 'application/json',
            Accept: stream ? 'text/event-stream' : 'application/json',
            'Content-Length': Buffer.byteLength(body),
            ...(usesAnthropicMessages ? { 'anthropic-version': provider.anthropicVersion } : {}),
            ...(sessionAffinityId ? { 'X-Session-ID': sessionAffinityId } : {})
          }
        },
        response => {
          responseStatus = response.statusCode
          response.on('data', chunk => {
            if (firstByteMs === null) {
              firstByteMs = Date.now() - startedAt
            }
            raw += chunk.toString()
            if (!stream) {
              return
            }
            pending += chunk.toString()
            const lines = pending.split(/\r?\n/)
            pending = lines.pop() || ''
            lines.forEach(processLine)
          })
          response.on('end', () => {
            if (responseStatus >= 400) {
              return finish(
                usesAnthropicMessages
                  ? cloudbaseMessagesError(raw, responseStatus)
                  : new Error(
                      `${provider.logLabel} 请求失败(${responseStatus}): ${raw.slice(0, 500)}`
                    )
              )
            }
            if (stream) {
              if (pending.trim()) {
                processLine(pending)
              }
              return fullText
                ? finish(null, { text: fullText, usage })
                : finish(new Error(`${provider.logLabel} 返回空响应`))
            }
            const parsed = safeJsonParse(raw)
            const errorMessage =
              parsed?.Response?.Error?.Message || parsed?.error?.message || parsed?.Error?.Message
            if (errorMessage) {
              return finish(
                usesAnthropicMessages
                  ? cloudbaseMessagesError(parsed, responseStatus)
                  : new Error(errorMessage)
              )
            }
            finish(null, {
              text: usesAnthropicMessages
                ? anthropicText(parsed)
                : text(
                    parsed?.choices?.[0]?.message?.content ||
                      parsed?.Response?.Choices?.[0]?.Message?.Content
                  ),
              usage: normalizeUsage(extractUsage(parsed))
            })
          })
          response.on('error', finish)
        }
      )
      req.on('error', finish)
      req.setTimeout(resolvedTimeout, () =>
        req.destroy(
          Object.assign(new Error(`${provider.logLabel} 请求超时`), {
            code: provider.timeoutCode,
            timeoutMs: resolvedTimeout
          })
        )
      )
      req.end(body)
    })
  }
  const request = async (messages, stream, options) => {
    const initialPayload = await buildPayload(messages, stream)
    try {
      return {
        ...(await send(initialPayload, options)),
        imageInputTransport:
          usesAnthropicMessages && hasDataUrlImage(messages) ? 'anthropic_base64_fallback' : 'url'
      }
    } catch (error) {
      if (!usesAnthropicMessages || !hasRemoteImage(messages) || !isImageDownloadError(error)) {
        throw error
      }
      const fallbackPayload = await buildPayload(messages, stream, true)
      return {
        ...(await send(fallbackPayload, options)),
        imageInputTransport: 'anthropic_base64_fallback'
      }
    }
  }
  return {
    buildImageContent,
    buildVisionMessages,
    buildPayload,
    providerId,
    modelId,
    modelIdentity,
    resolveAuthorization: authorization,
    callNonStream: (messages, options) => request(messages, false, options),
    callStream: (messages, options) => request(messages, true, options),
    isImageDownloadError,
    isImageInputError: isCloudbaseImageInputError
  }
}

function isImageDownloadError(error) {
  return /download multimodal content|multimodal content|图片下载失败|(?:image|图片).*(?:download|fetch)|(?:download|fetch).*(?:image|图片)/i.test(
    text(error?.message || error)
  )
}

module.exports = {
  normalizeUsage,
  buildCloudBaseAiPayload,
  buildOpenAiVisionMessages,
  createCloudBaseAiOpenAiClient
}
