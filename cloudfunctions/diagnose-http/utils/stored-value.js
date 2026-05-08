'use strict'

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {return fallback}
  if (typeof value === 'object') {return value}

  try {
    return JSON.parse(value)
  } catch (error) {
    return fallback
  }
}

function normalizeStoredNullableText(value, fallback = null) {
  if (value === null || value === undefined) {return fallback}

  const normalized = String(value).trim()
  if (!normalized || normalized.toLowerCase() === 'null' || normalized.toLowerCase() === 'undefined') {
    return fallback
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
