'use strict'

const { checkAIQuota, deductQuota } = require('/opt/utils/quota')
const { resolveHttpUserInfo } = require('/opt/utils/http')

function isTrustedLocalFunctionRuntime() {
  return /^(1|true)$/i.test(String(process.env.CLOUDBASE_LOCAL_FUNCTIONS_GATEWAY || '').trim())
}

function shouldBypassQuota(openid = '') {
  if (!isTrustedLocalFunctionRuntime()) {
    return false
  }
  const normalizedOpenid = String(openid || '').trim()
  return normalizedOpenid.startsWith('dev_terminal_')
}

const INTERNAL_REVIEW_OPENID_PREFIXES = ['dev_terminal_', 'anon_dev_']

function getInternalReviewAllowlist() {
  return String(process.env.DIAGNOSE_INTERNAL_REVIEW_OPENIDS || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
}

function hasInternalReviewAccess({ userInfo = null } = {}) {
  const openid = String(userInfo?.openid || '').trim()
  if (!openid) {
    return false
  }

  const allowlist = getInternalReviewAllowlist()
  if (allowlist.includes(openid)) {
    return true
  }

  const hasDevPrefix = INTERNAL_REVIEW_OPENID_PREFIXES.some(prefix => openid.startsWith(prefix))
  return isTrustedLocalFunctionRuntime() && hasDevPrefix
}

function assertInternalReviewAccess({ userInfo = null } = {}) {
  if (hasInternalReviewAccess({ userInfo })) {
    return
  }

  throw Object.assign(new Error('当前账号无权访问内部审核页面'), { statusCode: 403 })
}

async function resolveRequestPrincipal({ request = null, context = null, payload = {} } = {}) {
  const userInfo = await resolveHttpUserInfo(request?.headers || {}, payload, context)

  return {
    userInfo
  }
}

function assertAuthenticatedUser({ userInfo = null, message = '请先登录' } = {}) {
  if (userInfo?.openid) {
    return
  }

  throw Object.assign(new Error(message), { statusCode: 401 })
}

async function ensureQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) {
    return
  }

  const quota = await checkAIQuota(openid, 'diagnose')
  if (!quota.allowed) {
    throw Object.assign(new Error(quota.message || '诊断配额不足'), {
      statusCode: quota.code || 403
    })
  }
}

async function consumeQuota(openid, { skipQuota = false } = {}) {
  if (skipQuota || !openid) {
    return
  }

  try {
    await deductQuota(openid, 'diagnose')
  } catch (error) {
    console.warn('扣减诊断配额失败（忽略）:', error.message)
  }
}

async function runWithQuotaGuard({ openid = '', enabled = true, task } = {}) {
  if (typeof task !== 'function') {
    throw new Error('runWithQuotaGuard 缺少 task')
  }

  const skipQuota = shouldBypassQuota(openid)
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
  hasInternalReviewAccess,
  runWithQuotaGuard
}
