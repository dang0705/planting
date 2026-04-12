'use strict'

const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const { debugLog } = require('./common')
const { buildSymptomLabelerPrompt } = require('./symptom-labeler-prompt')
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
  return message.includes('timeout') || message.includes('timed out') || message.includes('network')
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

async function buildLLMDiagnoseMessages(images = []) {
  const contents = []
  const normalizedImages = Array.isArray(images)
    ? images.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const selectedImages = normalizedImages.slice(0, Math.max(1, Number(maxImages || 1)))

  for (const image of selectedImages) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image } })
  }

  const prompt = await buildSymptomLabelerPrompt()
  contents.push({ Type: 'text', Text: prompt })
  return [{ Role: 'user', Contents: contents }]
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
  const maxAttempts = 2
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

      return pickNonStreamText(res)
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
      resolve(text)
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
  const normalizedImages = Array.isArray(images)
    ? images.map(item => String(item || '').trim()).filter(Boolean)
    : []
  const selectedImages = normalizedImages.slice(0, Math.max(1, Number(maxImages || 1)))
  const messages = await buildLLMDiagnoseMessages(selectedImages)
  const promptText = messages?.[0]?.Contents?.find(item => item.Type === 'text')?.Text || ''
  console.log('diagnose-http symptom prompt:', promptText)
  console.log('diagnose-http symptom prompt meta:', {
    model,
    modelProfile,
    modelReasoningMode,
    promptLength: promptText.length,
    hasImage: selectedImages.length > 0,
    imageCount: selectedImages.length,
    totalInputImages: normalizedImages.length,
    imageLengths: selectedImages.map(item => String(item || '').length),
    imagePrefixes: selectedImages.map(item => String(item || '').slice(0, 32))
  })

  const shouldUseStream = Boolean(sse && typeof onText === 'function')

  if (!shouldUseStream) {
    return callHunyuanVisionNonStream(messages)
  }

  try {
    return await callHunyuanVisionStream(messages, { onText })
  } catch (error) {
    debugLog('混元流式失败，尝试回退非流式:', error.message)
    if (error.partialText) {
      return error.partialText
    }

    const fullText = await callHunyuanVisionNonStream(messages)
    if (fullText && typeof onText === 'function') {
      onText(fullText, fullText)
    }
    return fullText
  }
}

module.exports = {
  callLLMDiagnose
}
