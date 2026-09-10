'use strict'

const crypto = require('crypto')

const SESSION_PREFIX = 'planting-session-v1'
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
const PHONE_PROOF_PREFIX = 'planting-phone-proof-v1'
const PHONE_PROOF_TTL_SECONDS = 5 * 60
const SUPPORTED_PLATFORMS = new Set(['wechat_mp', 'douyin_mp', 'xiaohongshu_mp'])
const RESTRICTED_PLATFORMS = new Set(['douyin_mp', 'xiaohongshu_mp'])
const FEATURE_RESTRICTED_PLATFORMS = new Set(['xiaohongshu_mp'])

const FEATURE_MESSAGES = {
  identify: '当前端暂未开放 AI 植物识别，敬请期待。',
  diagnosis: '当前端暂未开放 AI 植物诊断，敬请期待。',
  watering: '当前端暂未开放浇水提醒，敬请期待。',
  fertilization: '当前端暂未开放施肥提醒，敬请期待。',
  calendar: '当前端暂未开放日历提醒，敬请期待。',
  subscription: '当前端暂未开放订阅服务，敬请期待。',
  storage: '当前端暂未开放图片与文件服务，敬请期待。'
}

function createPlatformError(message, code = 'PLATFORM_AUTH_INVALID', statusCode = 401) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function requiredSecret(name, minLength = 32) {
  const value = String(process.env[name] || '').trim()
  if (value.length < minLength) {
    throw createPlatformError('登录服务配置未完成，请稍后再试', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  return value
}

function normalizePlatform(value) {
  const platform = String(value || '').trim()
  return SUPPORTED_PLATFORMS.has(platform) ? platform : ''
}

function normalizeAppId(value) {
  return String(value || '')
    .trim()
    .slice(0, 128)
}

function normalizePlatformUserId(value) {
  const id = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,160}$/.test(id) ? id : ''
}

function normalizePhone(phone, countryCode = '+86') {
  const compact = String(phone || '').replace(/[\s-]/g, '')
  const normalizedCountryCode =
    String(countryCode || '+86')
      .trim()
      .replace(/^00/, '+') || '+86'
  if (!/^\+?\d{1,4}$/.test(normalizedCountryCode) || !/^\+?\d{6,20}$/.test(compact)) {
    return null
  }
  const digits = compact.replace(/^\+/, '')
  return {
    countryCode: normalizedCountryCode.startsWith('+')
      ? normalizedCountryCode
      : `+${normalizedCountryCode}`,
    phone: digits
  }
}

function readEncryptionKey() {
  const raw = requiredSecret('PHONE_ENCRYPTION_KEY')
  const hex = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : null
  const base64 = hex || Buffer.from(raw, 'base64')
  if (base64.length !== 32) {
    throw createPlatformError('手机号加密配置无效', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  return base64
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b)
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function encodeSigned(prefix, payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${prefix}.${encoded}.${sign(encoded, secret)}`
}

function decodeSigned(token, prefix, secret) {
  const [receivedPrefix, encoded, signature, extra] = String(token || '').split('.')
  if (receivedPrefix !== prefix || !encoded || !signature || extra) {
    return null
  }
  if (!constantTimeEqual(sign(encoded, secret), signature)) {
    return null
  }
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

function hashPhone(phone, countryCode) {
  const normalized = normalizePhone(phone, countryCode)
  if (!normalized) {
    throw createPlatformError('手机号授权结果无效', 'PLATFORM_PHONE_INVALID', 400)
  }
  const secret = requiredSecret('PHONE_HASH_SECRET')
  return crypto
    .createHmac('sha256', secret)
    .update(`${normalized.countryCode}:${normalized.phone}`)
    .digest('hex')
}

function encryptPhone(phone, countryCode) {
  const normalized = normalizePhone(phone, countryCode)
  if (!normalized) {
    throw createPlatformError('手机号授权结果无效', 'PLATFORM_PHONE_INVALID', 400)
  }
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', readEncryptionKey(), iv)
  const plaintext = Buffer.from(JSON.stringify(normalized), 'utf8')
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`
}

function maskPhone(phone, countryCode = '+86') {
  const normalized = normalizePhone(phone, countryCode)
  if (!normalized) {
    return ''
  }
  const digits = normalized.phone
  if (digits.length < 7) {
    return `${normalized.countryCode}****`
  }
  return `${normalized.countryCode}${digits.slice(0, 3)}****${digits.slice(-4)}`
}

function createPhoneProof({ platform, appId, platformUserId, phone, countryCode }) {
  const normalizedPlatform = normalizePlatform(platform)
  const normalizedAppId = normalizeAppId(appId)
  const normalizedUserId = normalizePlatformUserId(platformUserId)
  if (!normalizedPlatform || !normalizedAppId || !normalizedUserId) {
    throw createPlatformError('平台授权身份无效', 'PLATFORM_AUTH_INVALID', 401)
  }
  const normalizedPhone = normalizePhone(phone, countryCode)
  if (!normalizedPhone) {
    throw createPlatformError('手机号授权结果无效', 'PLATFORM_PHONE_INVALID', 400)
  }
  const issuedAt = Math.floor(Date.now() / 1000)
  return encodeSigned(
    PHONE_PROOF_PREFIX,
    {
      version: 1,
      platform: normalizedPlatform,
      appId: normalizedAppId,
      platformUserId: normalizedUserId,
      phoneHash: hashPhone(normalizedPhone.phone, normalizedPhone.countryCode),
      phoneCiphertext: encryptPhone(normalizedPhone.phone, normalizedPhone.countryCode),
      phoneMasked: maskPhone(normalizedPhone.phone, normalizedPhone.countryCode),
      issuedAt,
      expiresAt: issuedAt + PHONE_PROOF_TTL_SECONDS,
      nonce: crypto.randomBytes(16).toString('base64url')
    },
    requiredSecret('PHONE_PROOF_SECRET')
  )
}

function verifyPhoneProof(phoneProof) {
  const payload = decodeSigned(phoneProof, PHONE_PROOF_PREFIX, requiredSecret('PHONE_PROOF_SECRET'))
  const now = Math.floor(Date.now() / 1000)
  if (
    !payload ||
    payload.version !== 1 ||
    !normalizePlatform(payload.platform) ||
    !normalizeAppId(payload.appId) ||
    !normalizePlatformUserId(payload.platformUserId) ||
    !/^[a-f0-9]{64}$/i.test(String(payload.phoneHash || '')) ||
    !String(payload.phoneCiphertext || '').startsWith('v1.') ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(String(payload.nonce || '')) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60 ||
    payload.expiresAt < now ||
    payload.expiresAt - payload.issuedAt > PHONE_PROOF_TTL_SECONDS
  ) {
    throw createPlatformError('手机号授权已失效，请重新授权', 'PLATFORM_PHONE_PROOF_INVALID', 401)
  }
  return payload
}

function createSessionToken() {
  return `${SESSION_PREFIX}_${crypto.randomBytes(32).toString('base64url')}`
}

function hashSessionToken(token) {
  const raw = String(token || '').trim()
  if (!raw.startsWith(`${SESSION_PREFIX}_`)) {
    return ''
  }
  return crypto
    .createHmac('sha256', requiredSecret('SESSION_TOKEN_SECRET'))
    .update(raw)
    .digest('hex')
}

function sessionExpiresAt(now = Date.now()) {
  return now + SESSION_TTL_MS
}

function getBearerToken(headers = {}) {
  const platformSession = String(
    Object.entries(headers || {}).find(
      ([key]) => String(key).toLowerCase() === 'x-planting-platform-session'
    )?.[1] || ''
  ).trim()
  if (platformSession) {
    return platformSession
  }

  const authorization = String(headers.authorization || headers.Authorization || '').trim()
  const matched = authorization.match(/^Bearer\s+(.+)$/i)
  return matched ? String(matched[1] || '').trim() : ''
}

function isRestrictedPlatform(platform) {
  // 仅控制抖音/小红书的数据传输适配；功能门禁单独由
  // FEATURE_RESTRICTED_PLATFORMS 控制。
  return RESTRICTED_PLATFORMS.has(normalizePlatform(platform))
}

function featureForRequestPath(path = '') {
  const normalized = String(path || '').toLowerCase()
  if (/identify|recognition/.test(normalized)) {
    return 'identify'
  }
  if (/diagnos/.test(normalized)) {
    return 'diagnosis'
  }
  if (/fertiliz/.test(normalized)) {
    return 'fertilization'
  }
  if (/watering|water-reminder/.test(normalized)) {
    return 'watering'
  }
  if (/calendar|reminder/.test(normalized)) {
    return 'calendar'
  }
  if (/subscription|pay|order/.test(normalized)) {
    return 'subscription'
  }
  if (/storage|upload|file/.test(normalized)) {
    return 'storage'
  }
  return ''
}

function isBasicPlantCrudPath(path = '') {
  return /\/user-plants(?:\/)?$/.test(String(path || '').split('?')[0])
}

function assertPlatformFeature(identity, path) {
  const platform = normalizePlatform(identity?.platform)
  if (!FEATURE_RESTRICTED_PLATFORMS.has(platform)) {
    return true
  }
  if (isBasicPlantCrudPath(path)) {
    return true
  }
  const feature = featureForRequestPath(path) || 'diagnosis'
  throw createPlatformError(
    FEATURE_MESSAGES[feature] || '当前端暂未开放该功能，敬请期待。',
    'PLATFORM_FEATURE_UNAVAILABLE',
    403
  )
}

function allowedManualPlantFields(payload = {}) {
  const source = payload && typeof payload === 'object' ? payload : {}
  const allowed = new Set([
    'id',
    'recordVersion',
    'nickname',
    'recognizedName',
    'location',
    'plantDate',
    'notes',
    'sourceType'
  ])
  const forbidden = Object.keys(source).filter(key => !allowed.has(key))
  if (forbidden.length) {
    throw createPlatformError(
      '当前端仅支持植物文字基础信息',
      'PLATFORM_PLANT_FIELDS_FORBIDDEN',
      403
    )
  }
  return {
    id: source.id,
    recordVersion: source.recordVersion,
    nickname:
      String(source.nickname || '')
        .trim()
        .slice(0, 80) || null,
    recognizedName:
      String(source.recognizedName || '')
        .trim()
        .slice(0, 120) || null,
    location:
      String(source.location || '')
        .trim()
        .slice(0, 120) || null,
    plantDate:
      String(source.plantDate || '')
        .trim()
        .slice(0, 16) || null,
    notes:
      source.notes === undefined || source.notes === null
        ? null
        : String(source.notes).slice(0, 500),
    sourceType: 'manual'
  }
}

async function resolvePersistentSession({ token, models, now = Date.now(), timing = null }) {
  const tokenHash = hashSessionToken(token)
  if (!tokenHash || !models?.$runSQL) {
    return null
  }
  let result
  try {
    timing?.mark('session-sql-start')
    result = await models.$runSQL(
      `SELECT s.user_id, s.platform, s.app_id, s.expires_at, s.revoked_at,
              u._openid AS storage_openid,
              u.subscription_plan,
              u.subscription_status,
              u.subscription_endDate,
              u.usage_diagnoseMonth,
              u.usage_lastMonthReset
         FROM user_sessions s
         LEFT JOIN users u ON BINARY u._id = BINARY s.user_id
        WHERE s.token_hash = {{tokenHash}}
        LIMIT 1`,
      { tokenHash }
    )
    timing?.mark('session-sql-ready')
  } catch (error) {
    // 迁移尚未执行时，旧环境没有 user_sessions；按未登录处理，
    // 不让业务接口把缺表异常暴露成 500，也不回退到平台 OpenID。
    if (/user_sessions|unknown table|doesn'?t exist|不存在/i.test(String(error?.message || ''))) {
      return null
    }
    throw error
  }
  const session = result?.data?.executeResultList?.[0]
  if (
    !session ||
    session.revoked_at ||
    Number(session.expires_at || 0) <= Number(now) ||
    !normalizePlatform(session.platform) ||
    !String(session.user_id || '').trim()
  ) {
    return null
  }
  return {
    // 业务身份使用稳定的 users._id；历史业务表仍以 users._openid 作为
    // 存储归属键，因此会话同时暴露该存储别名，确保跨平台并入旧微信账户
    // 后可以读写同一批历史植物，而不需要批量改写全部历史行。
    openid: String(session.storage_openid || session.user_id).trim(),
    userId: String(session.user_id).trim(),
    platform: normalizePlatform(session.platform),
    appId: normalizeAppId(session.app_id),
    quotaUserSnapshot: {
      subscription_plan: session.subscription_plan,
      subscription_status: session.subscription_status,
      subscription_endDate: session.subscription_endDate,
      usage_diagnoseMonth: session.usage_diagnoseMonth,
      usage_lastMonthReset: session.usage_lastMonthReset
    },
    quotaUserSnapshotFresh:
      Boolean(session.usage_lastMonthReset) &&
      new Date(session.usage_lastMonthReset).toISOString().slice(0, 7) ===
        new Date(now).toISOString().slice(0, 7),
    source: 'platform-session'
  }
}

module.exports = {
  FEATURE_MESSAGES,
  SESSION_PREFIX,
  SESSION_TTL_MS,
  createPlatformError,
  normalizePlatform,
  normalizeAppId,
  normalizePlatformUserId,
  normalizePhone,
  hashPhone,
  encryptPhone,
  maskPhone,
  createPhoneProof,
  verifyPhoneProof,
  createSessionToken,
  hashSessionToken,
  sessionExpiresAt,
  getBearerToken,
  isRestrictedPlatform,
  featureForRequestPath,
  isBasicPlantCrudPath,
  assertPlatformFeature,
  allowedManualPlantFields,
  resolvePersistentSession,
  _test: {
    decodeSigned,
    encodeSigned,
    requiredSecret,
    constantTimeEqual
  }
}
