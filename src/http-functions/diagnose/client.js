import { httpRequest } from '@/http-functions/core/httpRequest'

function decodeChunkText(chunk, decoder) {
  if (!chunk) return ''
  if (typeof chunk === 'string') return chunk
  if (!(chunk instanceof ArrayBuffer) && !ArrayBuffer.isView(chunk)) return ''

  const source =
    chunk instanceof ArrayBuffer
      ? new Uint8Array(chunk)
      : new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength)

  if (decoder) {
    return decoder.decode(source, { stream: true })
  }

  const binary = Array.from(source, byte => String.fromCharCode(byte)).join('')
  try {
    return decodeURIComponent(escape(binary))
  } catch {
    return binary
  }
}

function parseJsonPayload(payload, decoder) {
  if (
    payload &&
    typeof payload === 'object' &&
    !(payload instanceof ArrayBuffer) &&
    !ArrayBuffer.isView(payload)
  ) {
    return payload
  }

  const text = decodeChunkText(payload, decoder)
  if (!text) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseSSEBuffer(buffer) {
  const normalized = String(buffer || '').replace(/\r\n/g, '\n')
  const events = normalized.split('\n\n')

  return {
    completeEvents: events.slice(0, -1),
    rest: events[events.length - 1] || ''
  }
}

function parseSSEEvent(eventText) {
  const dataLines = []
  let eventName = ''
  let eventId = ''

  for (const rawLine of String(eventText || '').split('\n')) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) continue

    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim()
      continue
    }

    if (line.startsWith('id:')) {
      eventId = line.slice(3).trim()
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  return {
    event: eventName,
    id: eventId,
    data: dataLines.join('\n')
  }
}

function normalizeDiagnoseResult(result) {
  if (!result) {
    throw new Error('诊断响应为空')
  }
  if (result.code !== 200) {
    throw new Error(result.message || '诊断请求失败')
  }

  const responseData = result.data || {}
  const diagnosis = {
    ...responseData.diagnosis,
    diagnosisId:
      responseData.recordId ||
      responseData.diagnosisId ||
      responseData.diagnosis?.diagnosisId ||
      '',
    problemCausality:
      responseData.problemCausality || responseData.diagnosis?.problemCausality || []
  }
  const fullText = diagnosis.summary || diagnosis.symptoms || '诊断完成'

  return {
    recordId: responseData.recordId || '',
    plantId: responseData.plantId || '',
    diagnosis,
    fullText,
    timestamp: responseData.timestamp || Date.now(),
    status: 'completed'
  }
}

const diagnoseSyncRequester = httpRequest({
  functionPath: 'diagnose-http/diagnose',
  method: 'POST'
})

const diagnoseStreamRequester = httpRequest({
  functionPath: 'diagnose-http/stream/diagnose',
  method: 'POST',
  headers: {
    Accept: 'text/event-stream'
  },
  enableChunked: true
})

export async function requestDiagnoseSync(payload) {
  const response = await diagnoseSyncRequester({ payload })
  const result = parseJsonPayload(response.data)
  if (!result) {
    throw new Error('诊断响应格式错误')
  }
  return normalizeDiagnoseResult(result)
}

export async function requestDiagnoseStream(payload, { onProgress } = {}) {
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
  let buffer = ''
  let finalResult = null
  let finalError = null

  const response = await diagnoseStreamRequester({
    payload,
    onChunkReceived: chunk => {
      buffer += decodeChunkText(chunk.data, decoder)
      const { completeEvents, rest } = parseSSEBuffer(buffer)
      buffer = rest

      for (const eventText of completeEvents) {
        const parsedEvent = parseSSEEvent(eventText)
        if (!parsedEvent.data) continue

        try {
          const parsed = JSON.parse(parsedEvent.data)
          const eventName = parsedEvent.event || parsed.event || parsed.type || ''

          if (eventName === 'prompt' || parsed.type === 'prompt') {
            continue
          }

          if ((eventName === 'reply' || parsed.type === 'reply') && parsed.content) {
            onProgress?.('正在标注图片可见症状并匹配规则诊断...')
          }

          if (parsed.type === 'error') {
            finalError = new Error(parsed.message || '流式诊断失败')
          }

          if (parsed.type === 'done' || parsed.code !== undefined) {
            finalResult = parsed
          }
        } catch (error) {
          console.warn('解析 SSE 数据失败:', error, parsedEvent)
        }
      }
    }
  })

  if (finalError && !finalResult) {
    throw finalError
  }

  if (!finalResult && buffer.trim()) {
    const parsedEvent = parseSSEEvent(buffer)
    if (parsedEvent.data) {
      const parsed = JSON.parse(parsedEvent.data)
      if ((parsedEvent.event || parsed.event || parsed.type) !== 'prompt') {
        finalResult = parsed
      }
    }
  }

  if (!finalResult) {
    const parsedJson = parseJsonPayload(response.data, decoder)
    if (!parsedJson) {
      throw new Error('诊断响应格式错误')
    }
    finalResult = parsedJson
  }

  return normalizeDiagnoseResult(finalResult)
}

export async function requestDiagnoseFollowUp(payload) {
  const response = await diagnoseSyncRequester({ payload })
  const result = parseJsonPayload(response.data)
  if (!result) {
    throw new Error('问诊响应格式错误')
  }
  return normalizeDiagnoseResult(result)
}
