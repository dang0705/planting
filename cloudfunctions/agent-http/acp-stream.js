'use strict'

function sanitizeAgentText(value) {
  return String(value || '')
    .replace(/qinghuazhi_plant_lookup/giu, '植物目录查询')
    .replace(/qinghuazhi_watering_plan/giu, '浇水建议')
    .replace(/qinghuazhi_user_plant_lookup/giu, '我的植物查询')
    .replace(/qinghuazhi_user_plant_watering_plan/giu, '我的植物浇水规划')
    .replace(/qinghuazhi_fertilization_advice/giu, '施肥建议')
    .replace(/qinghuazhi_diagnosis/giu, '正式问诊')
    // 兼容旧模型偶尔回显的工具名，但不再允许该工具执行；只做脱敏。
    .replace(/qinghuazhi_symptom_triage/giu, '正式问诊')
    .replace(/watering_planner_v21/giu, '浇水规划器')
    .replace(/Stream closed/giu, '查询中断')
    .replace(/likely_too_dry/giu, '可能偏干')
    .replace(/likely_too_wet/giu, '可能偏湿')
    .replace(/follow_baseline_or_check_soil/giu, '按基础建议并检查盆土')
    .replace(/increase_soil_check_frequency/giu, '增加盆土检查频率')
    .replace(/delay_and_check_soil/giu, '暂缓浇水并检查盆土')
    .replace(/needs_review/giu, '尚待人工确认')
    .replace(/CHECK_SOIL_BEFORE_WATERING/gu, '浇水前先检查盆土')
    .replace(/amountRangeMl/gu, '建议水量')
    .replace(/nextWaterDate/gu, '下次浇水日期')
    .replace(/nextWaterWindow/gu, '建议浇水时间范围')
    .replace(/soak_then_drain/giu, '浇透后排水')
    .replace(/调用青花植的浇水计划工具/gu, '结合青花植的浇水建议')
    .replace(/原因码(?:\s*[：:])?/gu, '原因：')
    .replace(/[（(]low[）)]/giu, '（信息不足）')
    .replace(/[（(]medium[）)]/giu, '（一般）')
    .replace(/[（(]high[）)]/giu, '（较高）')
    .replace(/\blow\b/giu, '信息不足')
    .replace(/\bmedium\b/giu, '一般')
    .replace(/\bhigh\b/giu, '较高')
    .replace(/\b(?:toolu|call|session|request|req|plan)[_-][a-z0-9_-]{6,}\b/giu, '')
}

const STREAM_SENSITIVE_TOKENS = [
  'qinghuazhi_plant_lookup',
  'qinghuazhi_watering_plan',
  'qinghuazhi_user_plant_lookup',
  'qinghuazhi_user_plant_watering_plan',
  'qinghuazhi_fertilization_advice',
  'qinghuazhi_diagnosis',
  'qinghuazhi_symptom_triage',
  'watering_planner_v21',
  'Stream closed',
  'likely_too_dry',
  'likely_too_wet',
  'follow_baseline_or_check_soil',
  'increase_soil_check_frequency',
  'delay_and_check_soil',
  'needs_review',
  'CHECK_SOIL_BEFORE_WATERING',
  'amountRangeMl',
  'nextWaterDate',
  'nextWaterWindow',
  'soak_then_drain',
  '调用青花植的浇水计划工具',
  '原因码',
  'low',
  'medium',
  'high'
]
const STREAM_GENERIC_TAIL_RE =
  /(?:^|[^a-z0-9])((?:toolu|call|session|request|req|plan)(?:[_-][a-z0-9_-]*)?)$/iu

// Keep only a possible sensitive suffix between ACP chunks. Complete text is
// sanitized before it is emitted, so a tool name split at an arbitrary model
// boundary can never cross the UI boundary in raw form.
function createStreamingTextSanitizer(onText) {
  let pending = ''
  const emit = value => {
    const safeText = sanitizeAgentText(value)
    if (safeText) {
      onText({ text: safeText })
    }
  }
  const findHoldStart = value => {
    const normalized = value.toLowerCase()
    let holdStart = value.length
    for (const token of STREAM_SENSITIVE_TOKENS) {
      const normalizedToken = token.toLowerCase()
      const lowerBound = Math.max(1, normalizedToken.length - value.length)
      for (let length = lowerBound; length < normalizedToken.length; length += 1) {
        if (normalized.endsWith(normalizedToken.slice(0, length))) {
          holdStart = Math.min(holdStart, value.length - length)
        }
      }
    }
    const genericMatch = value.match(STREAM_GENERIC_TAIL_RE)
    if (genericMatch) {
      holdStart = Math.min(
        holdStart,
        genericMatch.index + genericMatch[0].length - genericMatch[1].length
      )
    }
    return holdStart
  }
  return {
    push(value) {
      pending += value
      const holdStart = findHoldStart(pending)
      if (holdStart > 0) {
        emit(pending.slice(0, holdStart))
        pending = pending.slice(holdStart)
      }
    },
    flush() {
      if (pending) {
        emit(pending)
        pending = ''
      }
    }
  }
}

// ACP stays server-side. Only explicitly allowed answer text crosses the UI boundary.
async function consumeAcpStream(stream, onText, { streamText = false } = {}) {
  const decoder = new TextDecoder()
  let buffer = '',
    sessionId = '',
    stopReason = '',
    pendingToolUse = null,
    clientToolRequest = null,
    answerBytes = 0,
    answerText = ''
  const streamSanitizer = streamText ? createStreamingTextSanitizer(onText) : null
  function accept(line) {
    if (!line.startsWith('data:')) {
      return
    }
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') {
      return
    }
    const frame = JSON.parse(data)
    if (frame.error) {
      throw new Error('回复暂时不可用，请稍后重试。')
    }
    if (typeof frame.params?.sessionId === 'string') {
      sessionId = frame.params.sessionId
    }
    const update = frame.params?.update
    if (
      frame.method === 'session/update' &&
      update?.sessionUpdate === 'agent_message_chunk' &&
      update.content?.type === 'text'
    ) {
      const text = update.content.text
      if (typeof text !== 'string') {
        return
      }
      answerBytes += Buffer.byteLength(text)
      if (answerBytes > 65536) {
        throw new Error('回复过长，请换一个更具体的问题。')
      }
      answerText += text
      if (streamText) {
        streamSanitizer.push(text)
      }
    }
    if (typeof frame.method === 'string' && frame.method.startsWith('client/')) {
      const input = { ...(frame.params || {}) }
      delete input.sessionId
      clientToolRequest = {
        toolUseId: typeof frame._meta?.toolCallId === 'string' ? frame._meta.toolCallId : '',
        toolName: frame.method.slice('client/'.length),
        input
      }
    }
    if (frame.id === 1 && typeof frame.result?.stopReason === 'string') {
      stopReason = frame.result.stopReason
      if (stopReason === 'tool_use') {
        pendingToolUse = frame.result.pendingToolUse || null
        if (clientToolRequest?.toolName) {
          const toolUseId = clientToolRequest.toolUseId || pendingToolUse?.toolUseId || ''
          if (toolUseId) {
            pendingToolUse = {
              ...(pendingToolUse || {}),
              toolUseId,
              toolName: clientToolRequest.toolName,
              input: clientToolRequest.input
            }
          }
        }
      }
    }
  }
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true })
    if (buffer.length > 262144) {
      throw new Error('回复暂时不可用，请稍后重试。')
    }
    let end
    while ((end = buffer.indexOf('\n')) >= 0) {
      accept(buffer.slice(0, end).replace(/\r$/, ''))
      buffer = buffer.slice(end + 1)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) {
    accept(buffer.trim())
  }
  const completedTurn = stopReason === 'end_turn' && answerBytes > 0
  const pausedForTool =
    stopReason === 'tool_use' &&
    pendingToolUse &&
    typeof pendingToolUse.toolUseId === 'string' &&
    typeof pendingToolUse.toolName === 'string' &&
    pendingToolUse.input &&
    typeof pendingToolUse.input === 'object' &&
    !Array.isArray(pendingToolUse.input)
  if ((!completedTurn && !pausedForTool) || !sessionId) {
    throw new Error('回复未完成，请稍后重试。')
  }
  if (streamText) {
    streamSanitizer.flush()
  }
  if (completedTurn && !streamText) {
    const text = sanitizeAgentText(answerText).trim()
    if (!text) {
      throw new Error('回复未完成，请稍后重试。')
    }
    onText({ text })
  }
  return {
    sessionId,
    stopReason,
    ...(pausedForTool ? { pendingToolUse } : {})
  }
}

module.exports = { consumeAcpStream, sanitizeAgentText }
