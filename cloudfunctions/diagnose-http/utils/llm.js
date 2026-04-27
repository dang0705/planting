'use strict'

const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const { debugLog } = require('./common')
const { buildSymptomLabelerPromptPayload } = require('./symptom-labeler-prompt')
const {
  llm: {
    model,
    modelProfile,
    modelReasoningMode,
    options: llmOptions = {},
    host: endpoint,
    sse,
    requestTimeoutSec = 8,
    maxImages = 1
  }
} = require('../configs')

const HunyuanClient = tencentcloud.hunyuan.v20230901.Client
const SECRET_ID = process.env.CLOUDBASE_SECRET_ID || ''
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY || ''

let clientInstance = null

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeOrgan(value = '', fallback = 'unknown') {
  const normalized = normalizeText(value, fallback).toLowerCase()
  return normalized || fallback
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
  if (!imageRef) return null

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

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return null
  }

  return {
    promptTokens:
      Number(
        usage.PromptTokens ?? usage.prompt_tokens ?? usage.InputTokens ?? usage.input_tokens ?? 0
      ) || 0,
    completionTokens:
      Number(
        usage.CompletionTokens ??
          usage.completion_tokens ??
          usage.OutputTokens ??
          usage.output_tokens ??
          0
      ) || 0,
    totalTokens:
      Number(
        usage.TotalTokens ??
          usage.total_tokens ??
          usage.TotalTokenCount ??
          usage.totalTokenCount ??
          0
      ) || 0
  }
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

function safeJsonParse(data) {
  if (data === null || data === undefined) return null
  if (typeof data === 'object') return data

  const text = String(data).trim()
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
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

async function buildLLMDiagnoseRequest(images = []) {
  const contents = []
  const normalizedImages = Array.isArray(images)
    ? images.map((item, index) => normalizeLlmImageInput(item, index)).filter(Boolean)
    : []
  const selectedImages = normalizedImages.slice(0, Math.max(1, Number(maxImages || 1)))

  for (const image of selectedImages) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image.imageRef } })
  }

  const promptPayload = await buildSymptomLabelerPromptPayload({
    imageContext: selectedImages[0] || normalizedImages[0] || null
  })
  contents.push({ Type: 'text', Text: promptPayload.promptText })
  return {
    messages: [{ Role: 'user', Contents: contents }],
    promptText: promptPayload.promptText,
    promptDebugMeta: promptPayload.debugMeta || {},
    normalizedImages,
    selectedImages
  }
}

function buildPayload(messages, stream) {
  return {
    Model: model,
    Messages: messages,
    Stream: !!stream,
    ...llmOptions
  }
}

async function callHunyuanVisionNonStream(messages) {
  const client = getHunyuanClient()
  const maxAttempts = 4
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await client.ChatCompletions(buildPayload(messages, false))
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

function callHunyuanVisionStream(messages, { onText } = {}) {
  const client = getHunyuanClient()

  return new Promise((resolve, reject) => {
    let finished = false
    let fullText = ''
    let usage = null
    const timeout = setTimeout(() => {
      if (finished) return
      finished = true
      reject(new Error('混元请求超时'))
    }, 45000)

    const finish = (err, text) => {
      if (finished) return
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

    client.ChatCompletions(buildPayload(messages, true)).then(
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
          if (!parsed) return

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

async function callLLMDiagnose(images = [], { onText } = {}) {
  const requestPayload = await buildLLMDiagnoseRequest(images)
  const {
    messages,
    promptText,
    promptDebugMeta = {},
    normalizedImages = [],
    selectedImages = []
  } = requestPayload

  console.log(
    `diagnose-http prompt image-context ${safeJsonStringify({
      model,
      modelProfile,
      modelReasoningMode,
      imageCount: selectedImages.length,
      totalInputImages: normalizedImages.length,
      imageLengths: selectedImages.map(item => String(item?.imageRef || '').length),
      imagePrefixes: selectedImages.map(item => String(item?.imageRef || '').slice(0, 32)),
      imageUploadCompression: selectedImages.map(item => item?.uploadCompression || null),
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
    model,
    modelProfile,
    modelReasoningMode,
    promptLength: promptText.length,
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
    model,
    modelProfile,
    modelReasoningMode,
    promptText,
    promptLength: String(promptText || '').length,
    promptPreview: buildPromptPreview(promptText),
    promptDebugMeta,
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

  if (!shouldUseStream) {
    const result = await callHunyuanVisionNonStream(messages)
    return {
      text: result?.text || '',
      usage: result?.usage || null,
      promptAudit
    }
  }

  try {
    const result = await callHunyuanVisionStream(messages, { onText })
    return {
      text: result?.text || '',
      usage: result?.usage || null,
      promptAudit
    }
  } catch (error) {
    debugLog('混元流式失败，尝试回退非流式:', error.message)
    if (error.partialText) {
      return {
        text: error.partialText,
        usage: null,
        promptAudit
      }
    }

    const fullText = await callHunyuanVisionNonStream(messages)
    const text = fullText?.text || ''
    if (text && typeof onText === 'function') {
      onText(text, text)
    }
    return {
      text,
      usage: fullText?.usage || null,
      promptAudit
    }
  }
}

module.exports = {
  callLLMDiagnose
}
