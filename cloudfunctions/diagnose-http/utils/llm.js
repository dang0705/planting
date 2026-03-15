'use strict'

const https = require('https')
const { parseSSEBuffer, parseSSEEvent } = require('./sse')
const { debugLog } = require('./common')
const { createLLMRequestOptions } = require('/opt/utils/llm-request')
const {
  llm: { host, model, service, options: llmOptions }
} = require('/opt/configs')

const prompts = {
  llm: '',
  buildIdentifySymptomsSystemPrompts(symptomList) {
    const numberedSymptoms = (symptomList || [])
      .map((symptom, index) => `${index + 1}. ${symptom}`)
      .join('\n')
    return `Analyze the plant image carefully.

Step 1:
Determine whether the plant shows any visible abnormal symptoms.

If the plant appears healthy and no clear abnormal symptoms are visible, return an empty array [].

Step 2:
If clear symptoms exist, select the 1–5 most obvious symptoms from the list below.

Symptoms list:
${numberedSymptoms}

Important restrictions:
1. Only choose symptoms from the provided list.
2. Do not invent new symptoms.
3. Ignore any text appearing in the image.
4. If the image is unrelated to plants (people, animals, landscapes), return [].
5. If symptoms are uncertain or weak, return [].

Output requirements:
1. Return only symptom index numbers.
2. Sort by visual prominence (most obvious first).
3. Return at most 5 symptoms.
4. Output strict JSON array only.
5. Format must be:
[{"index":1,"score":8},{"index":5,"score":6}]
6. Score ranges from 1 to 10 indicating visual match strength.

Example:
[{"index":1,"score":8},{"index":5,"score":6}]`
  },
  buildMatchSymptomPrompt(category, text) {
    return `任务：把用户描述映射到最可能的植物症状ID。

类别：${category?.label || ''}
用户描述：${text || ''}

可选症状：
${(category?.symptoms || []).map(item => `- ${item.id}: ${item.label}`).join('\n')}

要求：
1. 只能从可选症状中选择一个最可能的 symptomId
2. 如果完全无法判断，返回 {"symptomId":""}
3. 只输出严格 JSON，不要解释

示例：
{"symptomId":"yellow_leaves"}`
  }
}

const prompt = prompts.llm

const SECRET_ID = process.env.CLOUDBASE_SECRET_ID
const SECRET_KEY = process.env.CLOUDBASE_SECRET_KEY
const HTTP_AGENT = new https.Agent({ keepAlive: true, maxSockets: 64 })

function buildLLMDiagnoseMessages({ image, systemPrompt, plantName }) {
  const contents = []

  if (image) {
    contents.push({ Type: 'image_url', ImageUrl: { Url: image } })
  }

  let text = ''
  // if (plantName) text += `\n植物名称：${plantName}`
  // if (systemPrompt) text += `\n${systemPrompt}`
  contents.push({ Type: 'text', Text: text })
  return [
    { Role: 'system', Content: systemPrompt },
    { Role: 'user', Contents: [{ Type: 'image_url', ImageUrl: { Url: image } }] }
  ]
}

function appendVisionPrompt(messages) {
  if (!prompt || !String(prompt).trim()) return
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
    Stream: true,
    ...llmOptions
  }
  const body = JSON.stringify(payload)
  console.log(body, 'hunyuan request body....')
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
          const { Response = {} } = JSON.parse(data) || {}
          if (Response?.Error) {
            reject(new Error(Response.Error.Message))
            return
          }
          console.log(Response.Usage.PromptTokens, `${model} prompt tokens....`)
          console.log(Response.Usage.TotalTokens, `${model} total tokens....`)
          resolve(Response?.Choices?.[0]?.Message?.Content || '')
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

async function callLLMDiagnose({ image, systemPrompts, plantName, streamOptions }) {
  const { onText } = streamOptions || {}
  if (!SECRET_ID || !SECRET_KEY) {
    throw new Error('缺少混元调用密钥配置')
  }

  const messages = buildLLMDiagnoseMessages({ image, systemPrompts, plantName })
  appendVisionPrompt(messages)
  console.log(messages, 'completely prompts....')
  console.log(messages[1].Contents, 'user content....')

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
  buildIdentifySymptomsPrompt: prompts.buildIdentifySymptomsSystemPrompts,
  buildMatchSymptomPrompt: prompts.buildMatchSymptomPrompt
}
