'use strict'

const https = require('https')
const { parseSSEBuffer, parseSSEEvent } = require('./sse')
const { debugLog } = require('./common')
const { createLLMRequestOptions } = require('/opt/utils/llm-request')
const {
  prompts: { llm: prompt },
  llm: { host, model, service }
} = require('/opt/configs')

const SECRET_ID = process.env.CLOUDBASE_SECRET_ID
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY
const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 64 })

function buildLLMDiagnoseMessages(image, description, plantName) {
  const contents = []

  if (image) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image } })
  }

  let text = '请诊断这张植物图片的健康状况。'
  if (plantName) text += `\n植物名称：${plantName}`
  if (description) text += `\n症状描述：${description}`
  contents.push({ Type: 'text', Text: text })
  return [{ Role: 'user', Contents: contents }]
}

function appendVisionPrompt(messages) {
  if (!messages[0] || !Array.isArray(messages[0].Contents)) return

  messages[0].Contents.push({
    Type: 'text',
    Text: prompt
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
  return payload?.Response?.Error?.Message || payload?.error?.message || ''
}

function processStreamDataLine(dataLine, state) {
  const raw = String(dataLine || '').trim()
  if (!raw || raw === '[DONE]') {
    state.finished = true
    return
  }

  const payload = JSON.parse(raw)
  const payloadError = extractPayloadError(payload)
  if (payloadError) {
    throw new Error(payloadError)
  }

  const delta = extractDeltaContent(payload)
  if (delta) {
    state.fullText += delta
    state.onText?.(delta, state.fullText)
  }

  if (isFinishPayload(payload)) {
    state.finished = true
  }
}

function callHunyuanVisionStream(messages, { onText } = {}) {
  const payload = {
    Model: model,
    Messages: messages,
    Stream: true
  }
  const body = JSON.stringify(payload)
  const options = createLLMRequestOptions({
    body,
    host,
    service,
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    agent: HTTP_AGENT
  })

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let rawBody = ''
      let buffer = ''
      const state = { fullText: '', finished: false, onText }

      const handleEventText = eventText => {
        const parsed = parseSSEEvent(eventText)
        if (!parsed.data) return
        processStreamDataLine(parsed.data, state)
      }

      res.on('data', chunk => {
        const text = chunk.toString()
        rawBody += text
        buffer += text
        const { completeEvents, rest } = parseSSEBuffer(buffer)
        buffer = rest

        for (const eventText of completeEvents) {
          try {
            handleEventText(eventText)
          } catch (error) {
            error.partialText = state.fullText
            reject(error)
            req.destroy()
            return
          }
        }
      })

      res.on('end', () => {
        if (buffer.trim()) {
          try {
            const parsed = parseSSEEvent(buffer)
            if (parsed.data) {
              processStreamDataLine(parsed.data, state)
            }
          } catch (error) {
            debugLog('解析混元尾包失败:', error.message)
          }
        }

        if (state.fullText) {
          resolve(state.fullText)
          return
        }

        if (res.statusCode >= 400) {
          reject(new Error(`混元请求失败(${res.statusCode}): ${rawBody.slice(0, 200)}`))
          return
        }

        reject(new Error('混元返回空响应'))
      })

      res.on('error', error => {
        error.partialText = state.fullText
        reject(error)
      })
    })

    req.on('error', reject)
    req.setTimeout(45000, () => {
      req.destroy()
      reject(new Error('混元请求超时'))
    })
    req.write(body)
    req.end()
  })
}

function callHunyuanVisionNonStream(messages) {
  const payload = {
    Model: model,
    Messages: messages,
    Stream: false
  }
  const body = JSON.stringify(payload)
  const options = createLLMRequestOptions({
    body,
    host,
    service,
    secretId: SECRET_ID,
    secretKey: SECRET_KEY,
    agent: HTTP_AGENT
  })

  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = ''
      res.on('data', chunk => (data += chunk))
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data)
          if (parsed.Response?.Error) {
            reject(new Error(parsed.Response.Error.Message))
            return
          }

          resolve(parsed.Response?.Choices?.[0]?.Message?.Content || '')
        } catch (error) {
          reject(new Error('解析混元响应失败'))
        }
      })
    })

    req.on('error', reject)
    req.setTimeout(45000, () => {
      req.destroy()
      reject(new Error('混元请求超时'))
    })
    req.write(body)
    req.end()
  })
}

async function callLLMDiagnose(image, description, plantName, { onText } = {}) {
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('缺少混元调用密钥配置')
  }

  const messages = buildLLMDiagnoseMessages(image, description, plantName)
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
  callLLMDiagnose
}
