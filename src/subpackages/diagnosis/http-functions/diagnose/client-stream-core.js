import {
  buildVisualProgressText,
  findStreamEventName,
  findStreamEventPayload
} from './client-stream-events.js'
import {
  buildFrontendTokenUsageSummary,
  logFrontendDiagnosisDone,
  collectFrontendVisualNodeDebug,
  resolveDebugEvidence
} from './client-stream-debug.js'

function toChunkUint8Array(chunk) {
  if (!chunk || typeof chunk === 'string') {
    return null
  }
  const arrayBuffer =
    chunk instanceof ArrayBuffer
      ? chunk
      : chunk?.buffer instanceof ArrayBuffer
        ? chunk.buffer
        : null
  if (!arrayBuffer) {
    return null
  }
  const byteOffset = chunk instanceof ArrayBuffer ? 0 : Number(chunk?.byteOffset || 0)
  const byteLength = chunk instanceof ArrayBuffer ? arrayBuffer.byteLength : chunk?.byteLength
  return new Uint8Array(arrayBuffer, byteOffset, byteLength)
}

export function decodeChunkToText(chunk) {
  if (!chunk) {
    return ''
  }
  if (typeof chunk === 'string') {
    return chunk
  }
  const uint8 = toChunkUint8Array(chunk)
  if (!uint8) {
    return ''
  }
  if (typeof TextDecoder !== 'undefined') {
    try {
      return new TextDecoder('utf-8').decode(uint8)
    } catch {
      return ''
    }
  }
  return Array.from(uint8)
    .map(code => String.fromCharCode(code))
    .join('')
}

function createChunkTextDecoder() {
  const decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null
  return {
    decode(chunk) {
      if (typeof chunk === 'string') {
        return chunk
      }
      const uint8 = toChunkUint8Array(chunk)
      if (!uint8) {
        return ''
      }
      if (decoder) {
        try {
          return decoder.decode(uint8, { stream: true })
        } catch {
          return ''
        }
      }
      return decodeChunkToText(uint8)
    },
    flush() {
      if (!decoder) {
        return ''
      }
      try {
        return decoder.decode()
      } catch {
        return ''
      }
    }
  }
}

export function createSseParser(onEvent) {
  let buffer = ''

  function emitBlock(rawBlock) {
    const block = String(rawBlock || '').trim()
    if (!block) {
      return
    }
    let eventName = 'message'
    const dataLines = []
    block.split('\n').forEach(line => {
      const normalizedLine = String(line || '').trimEnd()
      if (!normalizedLine || normalizedLine.startsWith(':')) {
        return
      }
      if (normalizedLine.startsWith('event:')) {
        eventName = normalizedLine.slice(6).trim() || eventName
        return
      }
      if (normalizedLine.startsWith('data:')) {
        dataLines.push(normalizedLine.slice(5).trimStart())
      }
    })
    if (!dataLines.length) {
      return
    }
    const dataText = dataLines.join('\n')
    try {
      onEvent?.(eventName, JSON.parse(dataText))
    } catch {
      onEvent?.(eventName, { raw: dataText })
    }
  }

  return {
    push(chunkText) {
      buffer += String(chunkText || '').replace(/\r\n/g, '\n')
      let separatorIndex = buffer.indexOf('\n\n')
      while (separatorIndex >= 0) {
        emitBlock(buffer.slice(0, separatorIndex))
        buffer = buffer.slice(separatorIndex + 2)
        separatorIndex = buffer.indexOf('\n\n')
      }
    },
    flush() {
      if (!buffer.trim()) {
        return
      }
      emitBlock(buffer)
      buffer = ''
    }
  }
}

export function buildStreamDiagnosisPromise(payload, { onProgress, streamDiagnoseRequester } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let latestProgressText = ''
    let latestVisualUsage = null
    let latestModelBusinessData = []
    let latestFinalVisualEvidenceData = null
    const chunkTextDecoder = createChunkTextDecoder()

    const pushProgress = text => {
      const normalizedText = String(text || '').trim()
      if (!normalizedText || normalizedText === latestProgressText) {
        return
      }
      latestProgressText = normalizedText
      onProgress?.(normalizedText)
    }
    const settleResolve = data => {
      if (settled) {
        return
      }
      settled = true
      resolve(data)
    }
    const settleReject = error => {
      if (settled) {
        return
      }
      settled = true
      reject(error)
    }

    const parser = createSseParser((eventName, payloadItem) => {
      const normalizedEventName = findStreamEventName(eventName, payloadItem)
      const eventPayload = findStreamEventPayload(normalizedEventName, payloadItem)
      if (normalizedEventName === 'visual_model_prompt_ready') {
        return
      }
      if (normalizedEventName.startsWith('visual_')) {
        const displayText = buildVisualProgressText(normalizedEventName, payloadItem)
        const nodeDebug = collectFrontendVisualNodeDebug(eventPayload)
        latestVisualUsage = nodeDebug.usage || latestVisualUsage
        if (nodeDebug.modelBusinessData?.length) {
          latestModelBusinessData = nodeDebug.modelBusinessData
        }
        latestFinalVisualEvidenceData =
          resolveDebugEvidence(eventPayload) || latestFinalVisualEvidenceData
        pushProgress(displayText)
        return
      }
      if (normalizedEventName === 'reply') {
        // 原始流片段不是最终结构化业务数据；避免污染前端调试控制台。
        return
      }
      if (normalizedEventName === 'error') {
        settleReject(new Error(eventPayload?.message || '流式诊断失败'))
        return
      }
      if (normalizedEventName === 'done') {
        const data = eventPayload?.data
        if (data && typeof data === 'object') {
          logFrontendDiagnosisDone(data, eventPayload?.diagnosisDebug, {
            fallbackUsage: latestVisualUsage,
            fallbackModelBusinessData: latestModelBusinessData,
            fallbackEvidence: latestFinalVisualEvidenceData
          })
          settleResolve(data)
          return
        }
        settleReject(new Error('流式诊断未返回有效结果'))
      }
    })

    streamDiagnoseRequester({
      payload,
      timeout: 65000,
      onChunkReceived: chunk => {
        const chunkText = chunkTextDecoder.decode(chunk?.data ?? chunk)
        if (!chunkText) {
          return
        }
        parser.push(chunkText)
      }
    })
      .then(response => {
        const responseData = response?.data
        const responseText =
          typeof responseData === 'string'
            ? responseData.trim()
            : decodeChunkToText(responseData).trim()
        const trailingChunkText = chunkTextDecoder.flush()
        if (trailingChunkText) {
          parser.push(trailingChunkText)
        }
        if (responseText) {
          parser.push(responseText)
        }
        parser.flush()
        if (settled) {
          return
        }

        const envelope =
          responseData && typeof responseData === 'object' && !responseText
            ? responseData
            : responseText
              ? (() => {
                  try {
                    return JSON.parse(responseText)
                  } catch {
                    return null
                  }
                })()
              : null
        if (Number(envelope?.code ?? 200) !== 200) {
          settleReject(new Error(envelope?.message || '流式诊断失败'))
          return
        }
        if (envelope?.data && typeof envelope.data === 'object') {
          settleResolve(envelope.data)
          return
        }
        settleReject(new Error('检查结果暂时无法获取，请重试'))
      })
      .catch(error => {
        settleReject(error)
      })
  })
}

// 适配既有调用名：保留真实 SSE 调用入口，供灰度或脚本验证使用。
export async function requestDiagnoseStream(
  payload,
  { onProgress, streamDiagnoseRequester, requestWithRetry } = {}
) {
  // 前端诊断调试日志：保留 start 请求的入口和图片数量，禁止删除。
  console.log('[诊断 start][请求]', {
    imageCount: Array.isArray(payload?.images) ? payload.images.length : 0,
    diagnosisProfile: payload?.diagnosisProfile || 'full',
    entrySource: payload?.entrySource || 'diagnose_tab'
  })
  onProgress?.('正在检查照片...')
  const streamPayload = {
    ...payload,
    streamVisualDecision: true
  }
  return requestWithRetry(
    () => buildStreamDiagnosisPromise(streamPayload, { onProgress, streamDiagnoseRequester }),
    { retries: 0, fallbackMessage: '发起流式诊断失败' }
  )
}

export { buildFrontendTokenUsageSummary, buildVisualProgressText }
