'use strict'

const { debugLog } = require('./common')
const {
  llm: { model, options: llmOptions }
} = require('/opt/configs')
const { diagnosePrompts } = require('../configs/prompts')

const {
  llm: prompt,
  systemPrompts,
  buildIdentifySymptomsUserPrompt,
  buildMatchSymptomPrompt
} = diagnosePrompts

const tencentcloud = require('tencentcloud-sdk-nodejs-hunyuan')
const HunyuanClient = tencentcloud.hunyuan.v20230901.Client

const SECRET_ID = process.env.CLOUDBASE_SECRET_ID || ''
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY || ''

let clientInstance = null

function getHunyuanClient() {
  if (clientInstance) return clientInstance

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
        endpoint: 'hunyuan.tencentcloudapi.com'
      }
    }
  })

  return clientInstance
}

function compactPromptText(input) {
  // Do NOT compact whitespace/newlines. Token usage is dominated by the symptom list
  // and instruction text; whitespace compaction often has negligible impact and
  // makes debugging harder.
  return String(input || '')
}

function buildLLMDiagnoseMessages({ image, systemPrompts: sys, userPrompts: user }) {
  const compactedSystemPrompts = compactPromptText(sys)
  const compactedUserPrompts = compactPromptText(user)

  const contents = []
  if (image) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image } })
  }
  if (compactedUserPrompts) {
    contents.push({ Type: 'text', Text: compactedUserPrompts })
  }

  const messages = []
  if (compactedSystemPrompts) {
    messages.push({ Role: 'system', Content: compactedSystemPrompts })
  }

  messages.push({ Role: 'user', Contents: contents })

  // Keep log for debugging, but it is compacted.
  console.log(compactedSystemPrompts, 'systemPrompts...')
  console.log(compactedUserPrompts, 'userPrompts...')

  return messages
}

function appendVisionPrompt(messages) {
  if (!prompt || !String(prompt).trim()) return
  const userMessage = messages.find(
    message => message?.Role === 'user' && Array.isArray(message?.Contents)
  )
  if (!userMessage) return

  userMessage.Contents.push({
    Type: 'text',
    Text: String(prompt)
  })
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
  const content =
    res?.Response?.Choices?.[0]?.Message?.Content ||
    res?.Choices?.[0]?.Message?.Content ||
    res?.Response?.Choices?.[0]?.Message?.Content ||
    ''

  return String(content || '')
}

async function callHunyuanVisionNonStream(messages) {
  const client = getHunyuanClient()

  const payload = {
    Model: model,
    Messages: messages,
    Stream: false,
    ...llmOptions
  }

  const res = await client.ChatCompletions(payload)

  const errorMessage = extractPayloadError(res)
  if (errorMessage) {
    throw new Error(errorMessage)
  }

  const usage = res?.Response?.Usage || res?.Usage
  if (usage?.PromptTokens !== undefined) {
    console.log(usage.PromptTokens, 'prompt tokens...')
  }

  return pickNonStreamText(res)
}

function callHunyuanVisionStream(messages, { onText } = {}) {
  const client = getHunyuanClient()

  const payload = {
    Model: model,
    Messages: messages,
    Stream: true,
    ...llmOptions
  }

  return new Promise((resolve, reject) => {
    let finished = false
    let fullText = ''

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
      resolve(text)
    }

    client.ChatCompletions(payload).then(
      res => {
        if (!res || typeof res.on !== 'function') {
          // SDK may return non-stream response even if Stream=true.
          const text = pickNonStreamText(res)
          finish(null, text)
          return
        }

        res.on('message', message => {
          const parsed = safeJsonParse(message)
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

async function callLLMDiagnose({ image, systemPrompts: sys, userPrompts: user, streamOptions }) {
  const { onText } = streamOptions || {}

  const messages = buildLLMDiagnoseMessages({
    image,
    systemPrompts: sys,
    userPrompts: user
  })
  appendVisionPrompt(messages)

  if (!onText) {
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
    if (fullText) {
      onText(fullText, fullText)
    }
    return fullText
  }
}

module.exports = {
  callLLMDiagnose,
  systemPrompts,
  buildIdentifySymptomsUserPrompt,
  buildMatchSymptomPrompt
}
