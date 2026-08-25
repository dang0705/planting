export function getRetakeRemainingSeconds({
  retakeExpiresAt = 0,
  serverNow = 0,
  receivedClientAt = 0,
  currentNow = Date.now()
} = {}) {
  const expiresAtMs = Number(retakeExpiresAt || 0)
  const serverNowMs = Number(serverNow || 0)
  if (!expiresAtMs || !serverNowMs) {
    return 0
  }
  const receivedAtMs = Number(receivedClientAt || 0)
  const nowMs = Number(currentNow || Date.now())
  const clientElapsedMs = receivedAtMs ? Math.max(0, nowMs - receivedAtMs) : 0
  return Math.max(0, Math.ceil((expiresAtMs - serverNowMs - clientElapsedMs) / 1000))
}

export function formatRetakeCountdownText({
  authorization = null,
  expired = false,
  total = 0
} = {}) {
  if (!authorization) {
    return ''
  }
  if (expired) {
    return '补拍时间已结束'
  }
  const normalizedTotal = Math.max(0, Number(total || 0))
  const minutes = Math.floor(normalizedTotal / 60)
  const seconds = String(normalizedTotal % 60).padStart(2, '0')
  return `剩余 ${minutes}:${seconds}`
}

export function isRetakeSkippedUnknown(retakeRequest = null, retakeAuthorizationState = null) {
  return (
    String(retakeRequest?.status || '').trim() === 'skipped_unknown' ||
    String(retakeAuthorizationState?.status || '').trim() === 'skipped_unknown'
  )
}

export function canShowRetakeStartButton({
  hasActiveRetakeAuthorization = false,
  retakeExpired = false,
  retakeSkippedUnknown = false
} = {}) {
  return !hasActiveRetakeAuthorization && !retakeExpired && !retakeSkippedUnknown
}
