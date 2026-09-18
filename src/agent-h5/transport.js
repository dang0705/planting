let initialTicket = ''
export function captureEntryTicket(location = window.location, history = window.history) {
  initialTicket = new URLSearchParams(location.hash.split('?')[1] || '').get('ticket') || ''
  // Fragments are not sent to HTTP/CDN logs. Remove it before any chat request.
  history.replaceState(null, '', `${location.pathname}#/pages/chat/chat`)
}
function endpoint(name) {
  return new URL(`../${name}`, window.location.href).href
}

function createSseParser(onEvent) {
  let buffer = ''

  function emitBlock(block) {
    const data = String(block || '')
      .split('\n')
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim()
    if (!data || data === '[DONE]') {
      return
    }
    try {
      onEvent(JSON.parse(data))
    } catch {
      throw new Error('回复中断')
    }
  }

  return {
    push(chunk) {
      buffer += String(chunk || '').replace(/\r\n/g, '\n')
      let separator
      while ((separator = buffer.indexOf('\n\n')) >= 0) {
        emitBlock(buffer.slice(0, separator))
        buffer = buffer.slice(separator + 2)
      }
    },
    flush() {
      if (buffer.trim()) {
        emitBlock(buffer)
      }
      buffer = ''
    }
  }
}

function getTextFromEvent(event) {
  if (typeof event?.text === 'string') {
    return event.text
  }
  const update = event?.params?.update
  if (
    event?.method === 'session/update' &&
    update?.sessionUpdate === 'agent_message_chunk' &&
    update.content?.type === 'text' &&
    typeof update.content.text === 'string'
  ) {
    return update.content.text
  }
  return ''
}

function eventTypeNames(event) {
  const update = event?.params?.update
  return [
    event?.type,
    event?.event,
    event?.name,
    event?.method,
    event?.params?.type,
    event?.params?.event,
    update?.type,
    update?.event,
    update?.sessionUpdate
  ]
    .filter(value => typeof value === 'string')
    .map(value => value.toLowerCase())
}

function isAskUserEvent(event) {
  return eventTypeNames(event).some(
    type => type === 'ask_user' || type === 'askuserquestion' || type.endsWith('/askuserquestion')
  )
}

function askUserPayload(event) {
  if (!isAskUserEvent(event)) {
    return null
  }
  const candidates = [event?.data, event?.params?.update, event?.params, event].filter(
    value => value && typeof value === 'object'
  )
  return candidates.find(value => {
    const hasQuestions = Array.isArray(value.questions) || (value.question && value.options)
    return hasQuestions
  })
}

function normalizeQuestion(question, index) {
  const options = Array.isArray(question?.options)
    ? question.options
        .map(option => {
          if (typeof option === 'string') {
            return { label: option, description: '' }
          }
          if (!option || typeof option !== 'object') {
            return null
          }
          const label = String(option.label ?? '').trim()
          return label
            ? {
                label,
                description: String(option.description ?? '').trim()
              }
            : null
        })
        .filter(Boolean)
    : []
  const text = String(question?.question ?? '').trim()
  if (!text || !options.length) {
    return null
  }
  return {
    question: text,
    header: String(question?.header ?? `问题 ${index + 1}`).trim() || `问题 ${index + 1}`,
    options,
    multiSelect: question?.multiSelect === true,
    selected: [],
    submitting: false
  }
}

export function getAskUserEvent(event) {
  const payload = askUserPayload(event)
  if (!payload) {
    return null
  }
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [payload]
  const questions = rawQuestions.map(normalizeQuestion).filter(Boolean).slice(0, 4)
  if (!questions.length) {
    return null
  }
  const pendingToolUse = event?.result?.pendingToolUse
  const resumeToken = String(
    event?.resumeToken ??
      event?.data?.resumeToken ??
      event?.params?.resumeToken ??
      event?.params?.update?.resumeToken ??
      payload.resumeToken ??
      pendingToolUse?.resumeToken ??
      ''
  ).trim()
  if (!resumeToken) {
    throw new Error('回复中断')
  }
  return { resumeToken, questions }
}

export async function exchangeEntryTicket() {
  if (!initialTicket) {
    throw new Error('请返回小程序，从小青入口重新进入。')
  }
  const ticket = initialTicket
  initialTicket = ''
  const response = await fetch(endpoint('session'), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
    signal: AbortSignal.timeout(15000)
  })
  if (!response.ok) {
    throw new Error('登录已失效，请返回小程序重新进入小青。')
  }
}
async function sendStream(body, onText, signal, onAskUser, onQuota) {
  const response = await fetch(endpoint('message'), {
    method: 'POST',
    credentials: 'same-origin',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!response.ok || !response.body) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    throw Object.assign(new Error(payload?.message || '请求未完成'), {
      status: response.status,
      code: payload?.code || response.status,
      data: payload?.data || null
    })
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder()
  let done = false
  const parser = createSseParser(event => {
    if (event?.error) {
      throw new Error('回复中断')
    }
    if (event?.type === 'quota' && event.data && typeof event.data === 'object') {
      onQuota?.(event.data)
    }
    const askUser = getAskUserEvent(event)
    if (askUser) {
      onAskUser?.(askUser)
      done = true
    }
    const text = getTextFromEvent(event)
    if (text) {
      onText(text)
    }
    if (
      event?.done === true ||
      event?.result?.stopReason === 'end_turn' ||
      event?.result?.stopReason === 'tool_use'
    ) {
      done = true
    }
  })
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      parser.push(decoder.decode(result.value, { stream: true }))
    }
    parser.push(decoder.decode())
    parser.flush()
    if (!done) {
      throw new Error('回复中断')
    }
  } finally {
    reader.releaseLock()
  }
}

export async function sendMessage(text, onText, signal, onAskUser, onQuota) {
  return sendStream({ text }, onText, signal, onAskUser, onQuota)
}

export async function sendToolResult(resumeToken, answers, onText, signal, onAskUser, onQuota) {
  return sendStream(
    {
      resumeToken: String(resumeToken || ''),
      answers
    },
    onText,
    signal,
    onAskUser,
    onQuota
  )
}
