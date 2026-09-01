const SESSION_STORAGE_KEY = 'planting-platform-session'

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
  uni.setStorageSync(SESSION_STORAGE_KEY, { accessToken, expiresAt })
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

export { SESSION_STORAGE_KEY }
