'use strict'

function safeJsonParse(value, conservative = null) {
  if (value === null || value === undefined || value === '') {return conservative}
  if (typeof value === 'object') {return value}

  try {
    return JSON.parse(value)
  } catch {
    return conservative
  }
}

function normalizeStoredNullableText(value, conservative = null) {
  if (value === null || value === undefined) {return conservative}

  const normalized = String(value).trim()
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return conservative
  }

  return normalized
}

function normalizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function normalizeStoredStringList(value = []) {
  if (Array.isArray(value)) {
    return normalizeStringList(value)
  }

  const parsed = safeJsonParse(value, [])
  return normalizeStringList(Array.isArray(parsed) ? parsed : [])
}

module.exports = {
  safeJsonParse,
  normalizeStoredNullableText,
  normalizeStringList,
  normalizeStoredStringList
}
