const SESSION_STORAGE_KEY = 'planting-platform-session'
const HTTP_IDENTITY_TICKET_TTL_MS = 5 * 60 * 1000

export function readPlatformSession() {
  try {
    const session = uni.getStorageSync(SESSION_STORAGE_KEY)
    return session && typeof session === 'object' ? session : null
  } catch {
    return null
  }
}

export function savePlatformSession(session = {}) {
  const accessToken = String(session?.accessToken || '').trim()
  const expiresAt = Number(session?.expiresAt || 0)
  if (!accessToken || !Number.isFinite(expiresAt)) {
    throw new Error('登录会话无效')
  }
  const identityTicket = String(session?.httpIdentityTicket || '').trim()
  const identityTicketExpiresAt = Number(session?.httpIdentityTicketExpiresAt || 0)
  uni.setStorageSync(SESSION_STORAGE_KEY, {
    accessToken,
    expiresAt,
    ...(identityTicket ? { httpIdentityTicket: identityTicket } : {}),
    ...(identityTicket && Number.isFinite(identityTicketExpiresAt) && identityTicketExpiresAt > 0
      ? { httpIdentityTicketExpiresAt: identityTicketExpiresAt }
      : {})
  })
}

export function savePlatformIdentityTicket(identityTicket, expiresAt = 0) {
  const normalizedTicket = String(identityTicket || '').trim()
  if (!normalizedTicket) {
    return
  }
  const session = readPlatformSession()
  const accessToken = String(session?.accessToken || '').trim()
  const sessionExpiresAt = Number(session?.expiresAt || 0)
  if (!accessToken || !Number.isFinite(sessionExpiresAt) || sessionExpiresAt <= Date.now()) {
    return
  }
  const normalizedExpiresAt = Number(expiresAt || 0)
  uni.setStorageSync(SESSION_STORAGE_KEY, {
    ...session,
    accessToken,
    expiresAt: sessionExpiresAt,
    httpIdentityTicket: normalizedTicket,
    httpIdentityTicketExpiresAt:
      Number.isFinite(normalizedExpiresAt) && normalizedExpiresAt > 0
        ? normalizedExpiresAt
        : Date.now() + HTTP_IDENTITY_TICKET_TTL_MS
  })
}

export function clearPlatformSession() {
  try {
    uni.removeStorageSync(SESSION_STORAGE_KEY)
  } catch {
    // 存储不可用时无需阻断退出流程。
  }
}

export function getActivePlatformAccessToken(now = Date.now()) {
  const session = readPlatformSession()
  if (!session || Number(session.expiresAt || 0) <= now) {
    if (session) {
      clearPlatformSession()
    }
    return ''
  }
  return String(session.accessToken || '').trim()
}

export function getActivePlatformIdentityTicket(now = Date.now()) {
  const session = readPlatformSession()
  if (!session || Number(session.expiresAt || 0) <= now) {
    if (session) {
      clearPlatformSession()
    }
    return ''
  }
  if (Number(session.httpIdentityTicketExpiresAt || 0) <= now) {
    return ''
  }
  return String(session.httpIdentityTicket || '').trim()
}

export { SESSION_STORAGE_KEY }
