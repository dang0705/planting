export function decodeChunkToText(chunk) {
  if (!chunk) {
    return ''
  }
  if (typeof chunk === 'string') {
    return chunk
  }

  const arrayBuffer =
    chunk instanceof ArrayBuffer
      ? chunk
      : chunk?.buffer instanceof ArrayBuffer
        ? chunk.buffer
        : null

  if (!arrayBuffer) {
    return ''
  }

  const byteOffset = chunk instanceof ArrayBuffer ? 0 : Number(chunk?.byteOffset || 0)
  const byteLength = chunk instanceof ArrayBuffer ? arrayBuffer.byteLength : chunk?.byteLength
  const uint8 = new Uint8Array(arrayBuffer, byteOffset, byteLength)
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

function normalizeVisualDecisionEvent(payloadItem = {}) {
  const decision = payloadItem?.decision || {}
  const counts = decision?.counts || {}
  const symptomCandidates = Array.isArray(decision?.symptomCandidates)
    ? decision.symptomCandidates
    : Array.isArray(decision?.aggregatedSymptomCandidates)
      ? decision.aggregatedSymptomCandidates
      : Array.isArray(decision?.aggregated_symptom_candidates)
        ? decision.aggregated_symptom_candidates
        : Array.isArray(payloadItem?.aggregated_symptom_candidates)
          ? payloadItem.aggregated_symptom_candidates
          : Array.isArray(payloadItem?.symptom_candidates)
            ? payloadItem.symptom_candidates
            : []
  const outOfPoolSymptomCandidates = Array.isArray(decision?.outOfPoolSymptomCandidates)
    ? decision.outOfPoolSymptomCandidates
    : Array.isArray(decision?.out_of_pool_symptom_candidates)
      ? decision.out_of_pool_symptom_candidates
      : Array.isArray(decision?.outOfPoolSymptomHints)
        ? decision.outOfPoolSymptomHints
        : Array.isArray(decision?.out_of_pool_symptom_hints)
          ? decision.out_of_pool_symptom_hints
          : Array.isArray(payloadItem?.out_of_pool_symptom_hints)
            ? payloadItem.out_of_pool_symptom_hints
            : Array.isArray(payloadItem?.out_of_pool_symptom_candidates)
              ? payloadItem.out_of_pool_symptom_candidates
              : []
  const observedSymptoms = Array.isArray(decision?.observedSymptoms)
    ? decision.observedSymptoms
    : Array.isArray(decision?.observed_symptoms)
      ? decision.observed_symptoms
      : Array.isArray(payloadItem?.observed_symptoms)
        ? payloadItem.observed_symptoms
        : []
  const routeHints = Array.isArray(decision?.routeHints)
    ? decision.routeHints
    : Array.isArray(decision?.aggregateRouteHints)
      ? decision.aggregateRouteHints
      : Array.isArray(decision?.aggregate_route_hints)
        ? decision.aggregate_route_hints
        : []
  return {
    contractVersion: String(decision?.contractVersion || '').trim(),
    counts: {
      observedSymptoms: Number(counts.observedSymptoms || observedSymptoms.length || 0),
      symptomCandidates: Number(counts.symptomCandidates || symptomCandidates.length || 0),
      outOfPoolSymptomCandidates: Number(
        counts.outOfPoolSymptomCandidates || outOfPoolSymptomCandidates.length || 0
      ),
      routeHints: Number(counts.routeHints || routeHints.length || 0)
    }
  }
}

export function logDiagnosisStartCompletion(source, data) {
  const usage = data?.aiUsage || data?.visualUsage || null
  console.log(`[diagnosis/start] ${source} final response:`, data)
  console.log(`[diagnosis/start] ${source} AI raw data:`, data?.aiDebug || [])
  for (const item of Array.isArray(data?.aiDebug) ? data.aiDebug : []) {
    const formattedPrompt = String(item?.formattedPrompt || '')
    if (!formattedPrompt) {
      continue
    }
    console.log(
      `[diagnosis/start] ${source} ai[${item.imageIndex ?? '?'}] complete prompt:\n${formattedPrompt}`
    )
  }
  console.log(`[diagnosis/start] ${source} token usage:`, {
    inputTokens: usage?.inputTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
    cachedTokens: usage?.cachedTokens ?? null,
    cacheCreationTokens: usage?.cacheCreationTokens ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null
  })
}

export function buildVisualProgressText(eventName, payloadItem = {}) {
  const normalizedEventName = String(
    eventName || payloadItem?.phase || payloadItem?.type || ''
  ).trim()
  const explicitContent = String(payloadItem?.content || '').trim()
  if (normalizedEventName === 'visual_progress' && explicitContent) {
    return explicitContent
  }

  if (normalizedEventName === 'visual_session_created') {
    return '已准备好，正在检查照片。'
  }
  if (normalizedEventName === 'visual_preparing') {
    return '正在准备检查照片。'
  }
  if (normalizedEventName === 'visual_input_ready') {
    const imageCount = Number(payloadItem?.imageCount || 0)
    return imageCount > 1
      ? `已收到 ${imageCount} 张照片，正在逐张查看。`
      : '已收到照片，正在仔细查看。'
  }
  if (normalizedEventName === 'visual_model_started') {
    return '正在查看照片中的可见痕迹。'
  }
  if (normalizedEventName === 'visual_model_response_started') {
    return '正在整理照片检查结果。'
  }
  if (normalizedEventName === 'visual_model_complete') {
    return '照片已查看，正在整理发现。'
  }
  if (normalizedEventName === 'visual_decision_ready') {
    const decision = normalizeVisualDecisionEvent(payloadItem)
    const inPoolCount = Math.max(
      decision.counts.symptomCandidates,
      decision.counts.observedSymptoms
    )
    const outOfPoolCount = decision.counts.outOfPoolSymptomCandidates
    const visibleAbnormalityCount = inPoolCount + outOfPoolCount
    if (visibleAbnormalityCount > 0) {
      return `照片检查完成，发现 ${visibleAbnormalityCount} 处可见异常。`
    }
    return '照片检查完成，暂时没有看到明确异常，可能需要更清楚的照片。'
  }
  if (normalizedEventName === 'visual_persisted') {
    return '照片已检查，正在准备下一步。'
  }
  if (normalizedEventName === 'visual_extraction_complete') {
    return '照片检查完成，正在准备问题或结果。'
  }
  return ''
}

export function buildStreamDiagnosisPromise(payload, { onProgress, streamDiagnoseRequester } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false
    let latestFullText = ''
    let latestProgressText = ''

    const pushProgress = text => {
      const normalizedText = String(text || '').trim()
      if (!normalizedText || normalizedText === latestProgressText) {
        return
      }
      latestProgressText = normalizedText
      latestFullText = normalizedText
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
      const normalizedEventName = String(
        payloadItem?.event || eventName || payloadItem?.type || 'message'
      ).trim()

      if (normalizedEventName.startsWith('visual_')) {
        pushProgress(buildVisualProgressText(normalizedEventName, payloadItem))
        return
      }

      if (normalizedEventName === 'reply') {
        const fullText = String(payloadItem?.fullText || '').trim()
        const content = String(payloadItem?.content || '').trim()
        if (fullText) {
          latestFullText = fullText
          onProgress?.(fullText)
          return
        }
        if (content) {
          latestFullText += content
          onProgress?.(latestFullText)
        }
        return
      }

      if (normalizedEventName === 'error') {
        settleReject(new Error(payloadItem?.message || '流式诊断失败'))
        return
      }

      if (normalizedEventName === 'done') {
        const data = payloadItem?.data
        if (data && typeof data === 'object') {
          logDiagnosisStartCompletion('stream', data)
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
        const chunkText = decodeChunkToText(chunk?.data ?? chunk)
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
          logDiagnosisStartCompletion('stream-buffered', envelope.data)
          settleResolve(envelope.data)
          return
        }

        if (latestFullText) {
          settleReject(new Error('流式诊断已结束，但未返回结构化结果'))
          return
        }

        settleReject(new Error('流式诊断响应为空'))
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
  onProgress?.('正在分析图片并生成问诊...')
  const streamPayload = {
    ...payload,
    streamVisualDecision: true
  }

  return requestWithRetry(
    () => buildStreamDiagnosisPromise(streamPayload, { onProgress, streamDiagnoseRequester }),
    { retries: 0, fallbackMessage: '发起流式诊断失败' }
  )
}
