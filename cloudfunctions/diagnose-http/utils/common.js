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

function buildRecordId() {
  return `diagnose_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function shouldFallbackToModel(error) {
  const message = String(error?.message || '')

  if (/超时|timeout|ETIMEDOUT|ECONNRESET|ECONNABORTED/i.test(message)) {
    return false
  }

  if (/缺少混元调用密钥配置|密钥|签名|鉴权|unauthorized|forbidden/i.test(message)) {
    return false
  }

  return true
}

module.exports = {
  DEBUG_LOG,
  debugLog,
  isSkipAuthEnabled,
  buildRecordId,
  shouldFallbackToModel
}

