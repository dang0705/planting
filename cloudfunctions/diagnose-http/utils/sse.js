'use strict'

function parseSSEBuffer(buffer) {
  const normalized = String(buffer || '').replace(/\r\n/g, '\n')
  const events = normalized.split('\n\n')

  return {
    completeEvents: events.slice(0, -1),
    rest: events[events.length - 1] || ''
  }
}

function parseSSEEvent(eventText) {
  const lines = String(eventText || '').split('\n')
  const event = {
    event: '',
    id: '',
    retry: '',
    dataLines: []
  }

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    if (!line || line.startsWith(':')) {continue}

    const separatorIndex = line.indexOf(':')
    const field = separatorIndex === -1 ? line : line.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : line.slice(separatorIndex + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue

    if (field === 'event') {event.event = value}
    else if (field === 'data') {event.dataLines.push(value)}
    else if (field === 'id') {event.id = value}
    else if (field === 'retry') {event.retry = value}
  }

  return {
    event: event.event,
    id: event.id,
    retry: event.retry,
    data: event.dataLines.join('\n')
  }
}

function findOverlapSuffixPrefix(previousText, nextText) {
  const prev = String(previousText || '')
  const next = String(nextText || '')
  const maxLength = Math.min(prev.length, next.length)

  for (let size = maxLength; size > 0; size -= 1) {
    if (prev.slice(-size) === next.slice(0, size)) {
      return size
    }
  }

  return 0
}

function stripPromptEcho(deltaText, promptText, currentReplyText) {
  let delta = String(deltaText || '')
  const prompt = String(promptText || '')
  const reply = String(currentReplyText || '')

  if (!delta) {return ''}

  if (!reply && prompt) {
    if (delta.startsWith(prompt)) {
      delta = delta.slice(prompt.length)
    } else if (prompt.startsWith(delta)) {
      return ''
    } else {
      const overlap = findOverlapSuffixPrefix(prompt, delta)
      if (overlap > 0) {
        delta = delta.slice(overlap)
      }
    }
  }

  return delta
}

function sanitizeReplyDelta(deltaText, promptText, currentReplyText) {
  let delta = stripPromptEcho(deltaText, promptText, currentReplyText)
  if (!delta) {return ''}

  const overlap = findOverlapSuffixPrefix(currentReplyText, delta)
  if (overlap > 0) {
    delta = delta.slice(overlap)
  }

  return delta
}

module.exports = {
  parseSSEBuffer,
  parseSSEEvent,
  sanitizeReplyDelta
}

