'use strict'

const https = require('https')
const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const { debugLog } = require('./common')
const { buildSymptomLabelerPromptPayload } = require('./symptom-labeler-prompt')
const { normalizeUsage, createCloudBaseAiOpenAiClient } = require('./cloudbase-ai-openai-contract')
const { normalizeUploadCompression } = require('./upload-compression')
const { isOpenAiVisionProvider } = require('../configs/provider-registry')
const {
  llm: {
    service = 'hunyuan',
    providerId = service,
    model,
    modelId = model,
    modelIdentity = `${providerId}:${modelId}`,
    modelProfile,
    modelReasoningMode,
    options: llmOptions = {},
    host: endpoint,
    conservativeService = '',
    conservativeModel = '',
    cloudbaseAi = {},
    sse,
    requestTimeoutSec = 8,
    maxImages = 1
  }
} = require('../configs')

const HunyuanClient = tencentcloud.hunyuan.v20230901.Client
const SECRET_ID = process.env.CLOUDBASE_SECRET_ID || ''
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY || ''
const IMAGE_HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 8 })
const cloudBaseClient = isOpenAiVisionProvider(providerId)
  ? createCloudBaseAiOpenAiClient({
      model,
      service: providerId,
      llmOptions,
      cloudbaseAi,
      requestTimeoutSec
    })
  : null
let hunyuanClient = null

function text(value = '', conservative = '') {
  return String(value || '').trim() || conservative
}

function serviceName(value = '') {
  return text(value).toLowerCase()
}

function normalizeImage(item = {}, index = 0) {
  const source = typeof item === 'string' ? { imageRef: item } : item
  const imageRef = text(source?.imageRef || source?.imageUrl || source?.url || source?.image)
  if (!imageRef) {
    return null
  }
  const inputSlotOrder = Number(source?.inputSlotOrder ?? source?.orderIndex ?? index)
  const totalImageCount = Number(source?.totalImageCount)
  return {
    imageRef,
    inputSlotType: serviceName(
      source?.inputSlotType || source?.slotType || source?.organHint || source?.organ || 'unknown'
    ),
    inputSlotLabel: text(source?.inputSlotLabel || source?.slotLabel),
    userDeclaredOrganType: serviceName(
      source?.userDeclaredOrganType ||
        source?.declaredOrganType ||
        source?.userDeclaredOrgan ||
        'unknown'
    ),
    inputSlotOrder: Number.isFinite(inputSlotOrder) ? inputSlotOrder : index,
    totalImageCount: Number.isFinite(totalImageCount) ? totalImageCount : 1,
    caseSlotSummary: Array.isArray(source?.caseSlotSummary) ? source.caseSlotSummary : [],
    uploadCompression: normalizeUploadCompression(source?.uploadCompression || source?.compression)
  }
}

function getHunyuanClient() {
  if (hunyuanClient) {
    return hunyuanClient
  }
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('缺少混元调用密钥配置')
  }
  hunyuanClient = new HunyuanClient({
    credential: { secretId: SECRET_ID, secretKey: SECRET_KEY },
    region: '',
    profile: { httpProfile: { endpoint, reqTimeout: requestTimeoutSec } }
  })
  return hunyuanClient
}

function extractUsage(payload) {
  return payload?.Response?.Usage || payload?.Usage || payload?.usage || null
}

function extractError(payload) {
  return (
    payload?.Response?.Error?.Message || payload?.error?.message || payload?.Error?.Message || ''
  )
}

function extractText(payload) {
  return String(
    payload?.Response?.Choices?.[0]?.Message?.Content ||
      payload?.Choices?.[0]?.Message?.Content ||
      ''
  )
}

function safeParse(value) {
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value || ''))
  } catch {
    return null
  }
}

function retryable(error) {
  return /timeout|timed out|network|rate limit|too many requests|请求限频|限频|频率限制/i.test(
    text(error?.message || error)
  )
}

function buildHunyuanPayload(messages, stream, modelName = model) {
  return { Model: modelName, Messages: messages, Stream: Boolean(stream), ...llmOptions }
}

async function callHunyuanNonStream(messages, { modelName = model } = {}) {
  let lastError = null
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await getHunyuanClient().ChatCompletions(
        buildHunyuanPayload(messages, false, modelName)
      )
      const errorMessage = extractError(response)
      if (errorMessage) {
        throw new Error(errorMessage)
      }
      return { text: extractText(response), usage: normalizeUsage(extractUsage(response)) }
    } catch (error) {
      lastError = error
      if (attempt >= 4 || !retryable(error)) {
        break
      }
      await new Promise(resolve => setTimeout(resolve, Math.min(5000, 1200 * 2 ** (attempt - 1))))
    }
  }
  throw lastError
}

function callHunyuanStream(messages, { onText, modelName = model } = {}) {
  return new Promise((resolve, reject) => {
    let finished = false
    let fullText = ''
    let usage = null
    const timeout = setTimeout(() => finish(new Error('混元请求超时')), 45000)
    const finish = (error, resultText = fullText) => {
      if (finished) {
        return
      }
      finished = true
      clearTimeout(timeout)
      if (error) {
        error.partialText = fullText
        reject(error)
      } else {
        resolve({ text: resultText, usage })
      }
    }
    getHunyuanClient()
      .ChatCompletions(buildHunyuanPayload(messages, true, modelName))
      .then(response => {
        if (!response || typeof response.on !== 'function') {
          usage = normalizeUsage(extractUsage(response))
          finish(null, extractText(response))
          return
        }
        response.on('message', message => {
          const payload = safeParse(message)
          if (!payload) {
            return
          }
          const errorMessage = extractError(payload)
          if (errorMessage) {
            return finish(new Error(errorMessage))
          }
          const delta = String(
            payload?.Response?.Choices?.[0]?.Delta?.Content ||
              payload?.Choices?.[0]?.Delta?.Content ||
              ''
          )
          if (delta) {
            fullText += delta
            if (typeof onText === 'function') {
              onText(delta, fullText)
            }
          }
          usage = normalizeUsage(extractUsage(payload)) || usage
          if (payload?.Response?.Choices?.[0]?.FinishReason || payload?.done) {
            finish()
          }
        })
        response.on('error', finish)
        response.on('end', () => finish())
      }, finish)
  })
}

async function buildRequest(images = []) {
  const normalizedImages = (Array.isArray(images) ? images : []).map(normalizeImage).filter(Boolean)
  const selectedImages = normalizedImages.slice(0, Math.max(1, Number(maxImages || 1)))
  const prompt = await buildSymptomLabelerPromptPayload({
    imageContext: selectedImages[0] || normalizedImages[0] || null
  })
  const hunyuanContents = selectedImages.map(image => ({
    Type: 'image_url',
    ImageUrl: { Url: image.imageRef }
  }))
  hunyuanContents.push({ Type: 'text', Text: prompt.promptText })
  const openAi = cloudBaseClient.buildVisionMessages({
    promptText: prompt.promptText,
    imageContents: selectedImages.map(image => cloudBaseClient.buildImageContent(image.imageRef))
  })
  return {
    messages: [{ Role: 'user', Contents: hunyuanContents }],
    openAiMessages: openAi.messages,
    promptCacheStrategy: openAi.promptCacheStrategy,
    promptText: prompt.promptText,
    promptDebugMeta: prompt.debugMeta || {},
    normalizedImages,
    selectedImages
  }
}

function promptImageContext(images = []) {
  return images.map(image => ({
    inputSlotType: image.inputSlotType,
    inputSlotLabel: image.inputSlotLabel,
    userDeclaredOrganType: image.userDeclaredOrganType,
    inputSlotOrder: image.inputSlotOrder,
    totalImageCount: image.totalImageCount,
    uploadCompression: image.uploadCompression,
    caseSlotSummary: image.caseSlotSummary.slice(0, 6)
  }))
}

function fetchImageAsDataUrl(imageUrl = '') {
  const value = text(imageUrl)
  if (!value) {
    return Promise.reject(new Error('缺少图片地址'))
  }
  if (/^data:image\//i.test(value) || !/^https?:\/\//i.test(value)) {
    return Promise.resolve(value)
  }
  const target = new URL(value)
  const maxBytes = Number(process.env.LLM_IMAGE_DATA_URL_MAX_BYTES || 5 * 1024 * 1024)
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    const request = https.get(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        agent: IMAGE_HTTP_AGENT
      },
      response => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          response.resume()
          reject(new Error(`图片下载失败(${response.statusCode})`))
          return
        }
        response.on('data', chunk => {
          size += chunk.length
          if (size > maxBytes) {
            request.destroy(new Error(`图片过大，无法转为模型 data URL: ${size} > ${maxBytes}`))
          } else {
            chunks.push(chunk)
          }
        })
        response.on('end', () => {
          const buffer = Buffer.concat(chunks)
          if (!buffer.length) {
            reject(new Error('图片下载为空'))
            return
          }
          const mimeType = text(response.headers['content-type'], 'image/jpeg').split(';')[0]
          resolve(`data:${mimeType};base64,${buffer.toString('base64')}`)
        })
        response.on('error', reject)
      }
    )
    request.on('error', reject)
    request.setTimeout(Math.max(1000, requestTimeoutSec * 1000), () => {
      request.destroy(new Error('图片下载超时'))
    })
  })
}

async function buildDataUrlMessages(messages = []) {
  return Promise.all(
    messages.map(async message => ({
      ...message,
      content: Array.isArray(message?.content)
        ? await Promise.all(
            message.content.map(async item =>
              item?.type === 'image_url'
                ? {
                    ...item,
                    image_url: {
                      ...item.image_url,
                      url: await fetchImageAsDataUrl(item.image_url?.url)
                    }
                  }
                : item
            )
          )
        : message?.content
    }))
  )
}

function buildPromptAudit(request) {
  const promptText = String(request.promptText || '')
  return {
    service,
    providerId,
    modelId,
    modelIdentity,
    model,
    modelProfile,
    modelReasoningMode,
    promptText,
    promptLength: promptText.length,
    promptPreview: promptText
      .split('\n')
      .map(text)
      .filter(Boolean)
      .slice(0, 8)
      .join(' | ')
      .slice(0, 1200),
    promptDebugMeta: request.promptDebugMeta,
    promptCacheStrategy: request.promptCacheStrategy,
    imageContext: {
      imageCount: request.selectedImages.length,
      totalInputImages: request.normalizedImages.length,
      selectedImageContexts: promptImageContext(request.selectedImages),
      slotTypes: request.selectedImages.map(item => item.inputSlotType),
      declaredOrgans: request.selectedImages.map(item => item.userDeclaredOrganType)
    }
  }
}

async function callLLMDiagnose(
  images = [],
  {
    onText,
    timeoutMs = null,
    sessionId = '',
    disableConservative = false,
    disableImageDataUrlConservative = false
  } = {}
) {
  const startedAt = Date.now()
  const requestStartedAt = Date.now()
  const request = await buildRequest(images)
  const requestBuildMs = Date.now() - requestStartedAt
  const promptAudit = buildPromptAudit(request)
  const stream = Boolean(sse && typeof onText === 'function')
  const activeService = serviceName(providerId)
  const conservativeServiceName = serviceName(conservativeService)
  const conservativeModelName = text(conservativeModel, 'hunyuan-vision-1.5-instruct')
  const timing = extra => ({
    service,
    providerId,
    modelId,
    modelIdentity,
    model,
    modelProfile,
    modelReasoningMode,
    requestBuildMs,
    totalMs: Date.now() - startedAt,
    ...extra
  })
  const primaryCall = async () => {
    if (!isOpenAiVisionProvider(activeService)) {
      return stream
        ? callHunyuanStream(request.messages, { onText })
        : callHunyuanNonStream(request.messages)
    }
    const call = messages =>
      stream
        ? cloudBaseClient.callStream(messages, { onText, timeoutMs, sessionId })
        : cloudBaseClient.callNonStream(messages, { timeoutMs, sessionId })
    try {
      const result = await call(request.openAiMessages)
      return { ...result, imageInputTransport: result.imageInputTransport || 'url' }
    } catch (error) {
      if (
        cloudBaseClient.providerId === 'cloudbase' ||
        !cloudBaseClient.isImageDownloadError(error) ||
        disableImageDataUrlConservative
      ) {
        throw error
      }
      const messages = await buildDataUrlMessages(request.openAiMessages)
      return { ...(await call(messages)), imageInputTransport: 'data_url_conservative' }
    }
  }
  const conservativeCall = async error => {
    if (conservativeServiceName !== 'hunyuan') {
      throw error
    }
    const callStartedAt = Date.now()
    const result = stream
      ? await callHunyuanStream(request.messages, { onText, modelName: conservativeModelName })
      : await callHunyuanNonStream(request.messages, { modelName: conservativeModelName })
    return {
      text: result.text,
      usage: result.usage,
      llmTiming: timing({
        conservative: 1,
        conservativeService: conservativeServiceName,
        conservativeModel: conservativeModelName,
        conservativeCallMs: Date.now() - callStartedAt,
        primaryError: text(error?.message || error).slice(0, 240)
      }),
      promptAudit: {
        ...promptAudit,
        service: conservativeServiceName,
        model: conservativeModelName,
        conservativeFrom: { service, model, reason: text(error?.message || error) }
      },
      adapterMetaOverride: {
        source_model_provider: conservativeServiceName,
        source_model_name: conservativeModelName,
        source_model_reasoning_mode: 'conservative'
      }
    }
  }
  const primaryStartedAt = Date.now()
  try {
    const result = await primaryCall()
    return {
      text: result.text || '',
      usage: result.usage || null,
      llmTiming: timing({
        primaryCallMs: Date.now() - primaryStartedAt,
        imageInputTransport: result.imageInputTransport || '',
        httpTiming: result.httpTiming || null
      }),
      promptAudit: { ...promptAudit, imageInputTransport: result.imageInputTransport || '' }
    }
  } catch (error) {
    if (cloudBaseClient?.isImageInputError(error)) {
      throw error
    }
    if (activeService !== 'hunyuan' && !disableConservative) {
      return conservativeCall(error)
    }
    if (!stream) {
      throw error
    }
    debugLog('混元流式失败，尝试回退非流式:', error.message)
    if (error.partialText) {
      return {
        text: error.partialText,
        usage: null,
        llmTiming: timing({ primaryError: text(error.message).slice(0, 240), partialText: 1 }),
        promptAudit
      }
    }
    const result = await callHunyuanNonStream(request.messages)
    if (result.text && typeof onText === 'function') {
      onText(result.text, result.text)
    }
    return {
      text: result.text,
      usage: result.usage,
      llmTiming: timing({
        conservative: 1,
        conservativeService: 'hunyuan',
        primaryError: text(error.message).slice(0, 240)
      }),
      promptAudit
    }
  }
}

module.exports = { callLLMDiagnose }
