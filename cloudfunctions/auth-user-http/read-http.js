'use strict'

const {
  jsonResponse,
  internalServerError,
  getHttpRequestData,
  normalizeHeaders,
  resolveHttpIdentityTicket,
  resolveCloudbaseRuntimeHeaderUser,
  resolveLocalFunctionUser,
  createHttpIdentityTicket,
  getBearerToken,
  hashSessionToken,
  hasPlatformSessionMaterial
} = require('./read-runtime')
const { runCloudbaseSql } = require('./read-sql-runtime')

const HTTP_IDENTITY_TICKET_TTL_MS = 5 * 60 * 1000
const PUBLIC_USER_SELECT_FIELDS = [
  '_id',
  '_openid',
  'principal_platform',
  'principal_openid',
  'wechat_openid',
  'wechat_unionid',
  'douyin_openid',
  'xiaohongshu_openid',
  'union_id',
  'username',
  'email',
  'phoneNumber',
  'phone_country_code',
  'phone_verified_at',
  'phone_bind_platform',
  'phone_bind_source',
  'subscription_plan',
  'subscription_status',
  'subscription_startDate',
  'subscription_endDate',
  'usage_diagnoseToday',
  'usage_diagnoseTotal',
  'usage_identifyToday',
  'usage_identifyTotal',
  'usage_lastResetDate',
  'profile_avatar',
  'profile_bio',
  'profile_wechatNickname',
  'profile_wechatAvatar',
  'profile_createdAt',
  'profile_lastLoginAt',
  'isActive',
  'createdAt',
  'updatedAt',
  'usage_chatToday',
  'usage_chatTotal',
  'usage_diagnoseMonth',
  'usage_lastMonthReset',
  'quota',
  'phone_masked'
].join(',')
function sqlSelect(fields, alias = '') {
  const prefix = alias ? `${alias}.` : ''
  return fields
    .split(',')
    .map(field => `${prefix}\`${field.trim()}\``)
    .join(', ')
}

function normalizePlatform(value = '') {
  const platform = String(value || '').trim()
  return ['wechat_mp', 'douyin_mp', 'xiaohongshu_mp'].includes(platform) ? platform : ''
}

function normalizeAppId(value = '') {
  return String(value || '')
    .trim()
    .slice(0, 128)
}

function readQaPerformanceProbeId(headers = {}) {
  const normalized = String(headers['x-qa-performance-probe-id'] || '').trim()
  return /^[A-Za-z0-9._:-]{8,120}$/u.test(normalized) ? normalized : ''
}

function createQaRequestTiming(probeId) {
  if (!probeId) {
    return null
  }
  const startedAt = Date.now()
  const marks = []
  return {
    mark(stage, details = {}) {
      marks.push({ stage, elapsed_ms: Date.now() - startedAt, ...details })
    },
    flush() {
      console.log('qa-performance-timing', JSON.stringify({ probeId, marks }))
    }
  }
}

function maskLegacyPhone(phone, countryCode = '+86') {
  const compact = String(phone || '').replace(/[\s-]/gu, '')
  const normalizedCountryCode =
    String(countryCode || '+86')
      .trim()
      .replace(/^00/u, '+') || '+86'
  if (!/^\+?\d{1,4}$/u.test(normalizedCountryCode) || !/^\+?\d{6,20}$/u.test(compact)) {
    return ''
  }
  const digits = compact.replace(/^\+/u, '')
  if (digits.length < 7) {
    return `${normalizedCountryCode}****`
  }
  return `${normalizedCountryCode}${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function userResponse(user = {}) {
  const maskedPhone = String(
    user.phone_masked ||
      (user.phoneNumber ? maskLegacyPhone(user.phoneNumber, user.phone_country_code || '+86') : '')
  ).trim()
  const {
    password: _password,
    phone_ciphertext: _ciphertext,
    phone_hash: _hash,
    phoneNumber: _legacyPhoneNumber,
    // These aliases only exist on the server-side platform-session JOIN. They
    // are identity-resolution metadata, not part of the public user contract.
    user_id: _sessionUserId,
    session_platform: _sessionPlatform,
    session_app_id: _sessionAppId,
    ...safe
  } = user
  return { ...safe, phoneNumber: maskedPhone, phoneMasked: maskedPhone }
}

function userResponseWithHttpIdentityTicket(user = {}, identity = {}) {
  const safeUser = userResponse(user)
  const canonicalIdentity =
    identity?.source === 'platform-session' ||
    (identity?.source === 'signed-http-ticket' && identity?.userId)
  if (!canonicalIdentity) {
    return safeUser
  }
  const openid = String(identity?.openid || user?._openid || user?._id || '').trim()
  const userId = String(identity?.userId || identity?.uid || user?._id || '').trim()
  if (!userId) {
    return safeUser
  }
  const httpIdentityTicket = createHttpIdentityTicket({
    openid,
    uid: userId,
    customUserId: userId,
    platform: normalizePlatform(identity?.platform || user?.principal_platform),
    subject: 'planting-user'
  })
  return httpIdentityTicket
    ? {
        ...safeUser,
        httpIdentityTicket,
        httpIdentityTicketExpiresAt: Date.now() + HTTP_IDENTITY_TICKET_TTL_MS
      }
    : safeUser
}

async function readUserByField(field, value, timing = null) {
  if (!['_id', '_openid'].includes(field)) {
    const error = new Error('用户字段无效')
    error.code = 'USER_FIELD_INVALID'
    throw error
  }
  timing?.mark('user-rest-read-start', { field })
  const result = await runCloudbaseSql(
    `SELECT ${sqlSelect(PUBLIC_USER_SELECT_FIELDS, 'u')}
       FROM users u
      WHERE u.\`${field}\` = {{value}}
      LIMIT 1`,
    { value }
  )
  const users = result?.data?.executeResultList || []
  timing?.mark('user-rest-read-ready', { field, row_count: users.length })
  const user = users[0]
  if (!user) {
    const error = new Error('用户不存在')
    error.code = 'USER_NOT_FOUND'
    throw error
  }
  return user
}

async function readUserByRuntimeOpenid(openid, timing = null) {
  timing?.mark('user-rest-read-start', { field: 'runtime-openid' })
  const result = await runCloudbaseSql(
    `SELECT ${sqlSelect(PUBLIC_USER_SELECT_FIELDS, 'u')}
       FROM users u
      WHERE u._openid = {{openid}}
         OR u.wechat_openid = {{openid}}
         OR u.principal_openid = {{openid}}
      LIMIT 1`,
    { openid }
  )
  const users = result?.data?.executeResultList || []
  timing?.mark('user-rest-read-ready', { field: 'runtime-openid', row_count: users.length })
  const user = users[0]
  if (!user) {
    const error = new Error('用户不存在')
    error.code = 'USER_NOT_FOUND'
    throw error
  }
  return user
}

async function readUserByPlatformSession(token, timing = null) {
  const tokenHash = hashSessionToken(token)
  if (!tokenHash) {
    return null
  }
  timing?.mark('session-rest-read-start')
  const result = await runCloudbaseSql(
    `SELECT s.user_id AS user_id, s.platform AS session_platform, s.app_id AS session_app_id,
            ${sqlSelect(PUBLIC_USER_SELECT_FIELDS, 'u')}
       FROM user_sessions s
       JOIN users u ON BINARY u._id = BINARY s.user_id
      WHERE s.token_hash = {{tokenHash}}
        AND s.revoked_at <=> NULL
        AND s.expires_at > {{now}}
      LIMIT 1`,
    { tokenHash, now: Date.now() }
  )
  const sessions = result?.data?.executeResultList || []
  timing?.mark('session-rest-read-ready', { row_count: sessions.length })
  const session = sessions[0]
  const userId = String(session?.user_id || '').trim()
  const platform = normalizePlatform(session?.session_platform)
  if (!session || !userId || !platform) {
    return null
  }
  const user = session
  const openid = String(session._openid || userId).trim()
  return {
    identity: {
      openid,
      userId,
      platform,
      appId: normalizeAppId(session.session_app_id),
      source: 'platform-session'
    },
    user
  }
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const qaProbeId = readQaPerformanceProbeId(request.headers)
  const timing = createQaRequestTiming(qaProbeId)
  if (qaProbeId) {
    console.log(
      'qa-performance-probe',
      JSON.stringify({ probeId: qaProbeId, endpoint: 'auth-user-http/auth/user' })
    )
  }
  timing?.mark('request-enter')
  try {
    const payload = request.method === 'GET' ? request.query : request.body
    if (String(payload?.action || '') !== 'getUserByOpenid') {
      return jsonResponse(400, { code: 400, message: '无效操作', data: null })
    }
    const headers = normalizeHeaders(request.headers)
    let identity = null
    let user = null
    // 持久平台会话始终优先于短票据。即使请求同时带有旧票据，也必须先验证
    // 当前会话；会话失效时直接走既有 401，而不是让旧票据绕过吊销/过期校验。
    if (hasPlatformSessionMaterial(headers)) {
      const sessionUser = await readUserByPlatformSession(getBearerToken(headers), timing)
      if (!sessionUser) {
        return jsonResponse(401, { code: 401, message: '请先登录', data: null })
      }
      identity = sessionUser.identity
      user = sessionUser.user
    }
    // 没有持久会话时才使用票据；两者同时存在时，持久会话优先，避免
    // 旧票据或跨平台票据覆盖当前统一账号归属。
    const ticketIdentity = resolveHttpIdentityTicket(headers)
    if (!identity && ticketIdentity?.userId && ticketIdentity.subject === 'planting-user') {
      identity = ticketIdentity
    }
    if (!identity) {
      identity = resolveCloudbaseRuntimeHeaderUser(headers) || resolveLocalFunctionUser(headers)
    }
    if (!identity?.openid) {
      return jsonResponse(401, { code: 401, message: '请先登录', data: null })
    }
    if (!user) {
      user = identity.uid
        ? await readUserByField('_id', identity.uid, timing)
        : await readUserByRuntimeOpenid(identity.openid, timing)
    }
    timing?.mark('response-ready', { source: identity.source || '' })
    return jsonResponse(200, {
      code: 200,
      message: '获取成功',
      data: userResponseWithHttpIdentityTicket(user, identity)
    })
  } catch (error) {
    console.error('auth-user-http/read error:', {
      code: error?.code || 'AUTH_USER_READ_FAILED',
      message: String(error?.message || '').slice(0, 300),
      requestId: String(error?.requestId || '').slice(0, 128)
    })
    return internalServerError('用户信息暂时不可用，请稍后再试')
  } finally {
    timing?.flush()
  }
}

module.exports = { main }
