'use strict'

const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const { debugLog } = require('./common')
const { buildSymptomLabelerPrompt } = require('./symptom-labeler-prompt')
const {
  llm: { model, options: llmOptions = {}, host: endpoint, sse }
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
        endpoint
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
  const content = res.Choices?.[0]?.Message?.Content || ''
  return typeof content === 'string' ? JSON.parse(content) : content

  /*  try {
    return JSON.stringify(payload)
  } catch {
    return '[unserializable payload]'
  }*/
}

async function buildLLMDiagnoseMessages(image) {
  const contents = []

  if (image) {
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

  return pickNonStreamText(res)
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

async function callLLMDiagnose(image, { onText } = {}) {
  const messages = await buildLLMDiagnoseMessages(image)
  const promptText = messages?.[0]?.Contents?.find(item => item.Type === 'text')?.Text || ''
  // console.log('diagnose-http symptom prompt:', promptText)

  if (!sse) {
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
