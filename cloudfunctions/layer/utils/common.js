'use strict'

const DEBUG_LOG = process.env.DEBUG_LOG === 'true'

function debugLog(...args) {
  if (DEBUG_LOG) {
    console.log(...args)
  }
}

function isSkipAuthEnabled(value) {
  if (value === true) return true
  const normalized = String(value || '').trim().toLowerCase()
  return normalized === 'true' || normalized === '1'
}

function buildScopedId(scope) {
  return `${scope}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

module.exports = {
  DEBUG_LOG,
  debugLog,
  isSkipAuthEnabled,
  buildScopedId
}
