'use strict'

const TRANSIENT_RETRY_DELAY_MS = 150
const TRANSIENT_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNREFUSED',
  'ECONNRESET',
  'EAI_AGAIN',
  'EPIPE',
  'ESOCKETTIMEDOUT',
  'ETIMEDOUT',
  'ERR_SOCKET_TIMEOUT',
  'PROTOCOL_CONNECTION_LOST',
  'CLOUDBASE_SQL_TIMEOUT'
])

function isTransientCloudbaseSqlConnectionError(error) {
  const code = String(error?.code || '')
    .trim()
    .toUpperCase()
  const message = String(error?.message || '')

  if (TRANSIENT_ERROR_CODES.has(code)) {
    return true
  }
  if (/^CLOUDBASE_SQL_HTTP_(?:408|429|502|503|504)$/u.test(code)) {
    return true
  }
  if (code === 'PE-MYS-5000') {
    return (
      /SQLSTATE:\s*08000\b/iu.test(message) &&
      /(?:connection error|database connection failed)/iu.test(message)
    )
  }
  return (
    !code &&
    /(?:database connection failed|socket hang up|connection (?:reset|lost)|timed out|timeout)/iu.test(
      message
    )
  )
}

async function runWithOneTransientRetry(
  operation,
  { onRetry, delayMs = TRANSIENT_RETRY_DELAY_MS } = {}
) {
  try {
    return await operation()
  } catch (error) {
    if (!isTransientCloudbaseSqlConnectionError(error)) {
      throw error
    }
    onRetry?.(error)
    if (delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
    return operation()
  }
}

module.exports = {
  isTransientCloudbaseSqlConnectionError,
  runWithOneTransientRetry,
  _test: { TRANSIENT_ERROR_CODES, TRANSIENT_RETRY_DELAY_MS }
}
