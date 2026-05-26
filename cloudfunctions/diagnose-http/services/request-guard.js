'use strict'

const { checkAIQuota, deductQuota } = require('/opt/utils/quota')
const {
  normalizeHeaders,
  resolveRequestAppEnv,
  resolveHttpUserInfo,
  isSkipAuthEnabled
} = require('/opt/utils/http')

function shouldSkipPersistence(request = null) {
  const headers = normalizeHeaders(request?.headers || {})
  return String(headers['x-terminal-e2e'] || '').trim().toLowerCase() !== 'true'
}

function shouldBypassQuota(request = null, openid = '', { skipAuth = false } = {}) {
  if (skipAuth) {
    return true
  }

  const headers = normalizeHeaders(request?.headers || {})
  const appEnv = resolveRequestAppEnv(headers, request?.query || {}, request?.body || {})
  const isTerminalE2E = String(headers['x-terminal-e2e'] || '').trim().toLowerCase() === 'true'
  if (!isTerminalE2E || appEnv !== 'development') {
    return false
  }

  const normalizedOpenid = String(openid || '').trim()
  return normalizedOpenid.startsWith('anon_dev_') || normalizedOpenid.startsWith('dev_terminal_')
}

function buildRequestExecutionFlags(request = null, payload = {}) {
  const skipAuth = isSkipAuthEnabled(payload?.skipAuth)

  return {
    skipAuth,
    skipPersistence: skipAuth && shouldSkipPersistence(request)
  }
}

const INTERNAL_REVIEW_OPENID_PREFIXES = ['dev_terminal_', 'anon_dev_']

function getInternalReviewAllowlist() {
  return String(process.env.DIAGNOSE_INTERNAL_REVIEW_OPENIDS || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function hasInternalReviewAccess({ request = null, skipAuth = false, userInfo = null } = {}) {
  const openid = String(userInfo?.openid || '').trim()
  if (!openid) {
    return false
  }

  const allowlist = getInternalReviewAllowlist()
  if (allowlist.includes(openid)) {
    return true
  }

  const headers = normalizeHeaders(request?.headers || {})
  const appEnv = resolveRequestAppEnv(headers, request?.query || {}, request?.body || {})
  const hasDevPrefix = INTERNAL_REVIEW_OPENID_PREFIXES.some(prefix => openid.startsWith(prefix))

  if (skipAuth && hasDevPrefix) {
    return true
  }

  return appEnv === 'development' && hasDevPrefix
}

function assertInternalReviewAccess({ request = null, skipAuth = false, userInfo = null } = {}) {
  if (hasInternalReviewAccess({ request, skipAuth, userInfo })) {
    return
  }

  throw Object.assign(new Error('当前账号无权访问内部审核页面'), { statusCode: 403 })
}

async function resolveRequestPrincipal({ request = null, context = null, payload = {} } = {}) {
  const { skipAuth, skipPersistence } = buildRequestExecutionFlags(request, payload)
  const userInfo = skipAuth
    ? { openid: payload?.openid || '' }
    : await resolveHttpUserInfo(request?.headers || {}, payload, context)

  return {
    skipAuth,
    skipPersistence,
    userInfo
  }
}

function assertAuthenticatedUser({ skipAuth = false, userInfo = null, message = '请先登录' } = {}) {
  if (skipAuth || userInfo?.openid) {
    return
  }

  throw Object.assign(new Error(message), { statusCode: 401 })
}

async function ensureQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) {return}

  const quota = await checkAIQuota(openid, 'diagnose')
  if (!quota.allowed) {
    throw Object.assign(new Error(quota.message || '诊断配额不足'), { statusCode: quota.code || 403 })
  }
}

async function consumeQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) {return}

  try {
    await deductQuota(openid, 'diagnose')
  } catch (error) {
    console.warn('扣减诊断配额失败（忽略）:', error.message)
  }
}

async function runWithQuotaGuard({
  request = null,
  openid = '',
  skipAuth = false,
  enabled = true,
  task
} = {}) {
  if (typeof task !== 'function') {
    throw new Error('runWithQuotaGuard 缺少 task')
  }

  const skipQuota = shouldBypassQuota(request, openid, { skipAuth })
  if (!enabled) {
    return task({ skipQuota })
  }

  await ensureQuota(openid, { skipQuota })
  const result = await task({ skipQuota })
  await consumeQuota(openid, { skipQuota })
  return result
}

module.exports = {
  resolveRequestPrincipal,
  assertAuthenticatedUser,
  assertInternalReviewAccess,
  runWithQuotaGuard
}
