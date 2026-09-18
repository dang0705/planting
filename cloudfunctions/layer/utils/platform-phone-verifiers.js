'use strict'

const crypto = require('crypto')
const {
  createPlatformError,
  normalizeAppId,
  normalizePlatformUserId
} = require('./platform-session')

const DEFAULT_PLATFORM_APP_IDS = {
  douyin_mp: 'tt79ef0f52e78e857401',
  xiaohongshu_mp: '69b9576cdb45760001d82e15'
}
const DOUYIN_DEFAULT_CLIENT_TOKEN_URL = 'https://open.douyin.com/oauth/client_token/'
const DOUYIN_DEFAULT_PHONE_NUMBER_URL = 'https://open.douyin.com/api/apps/v1/get_phonenumber_info/'
let douyinClientTokenCache = null

function getConfiguredPlatformAppId(platform, appIds = {}) {
  const appId = normalizeAppId(appIds[platform] || DEFAULT_PLATFORM_APP_IDS[platform])
  if (!appId) {
    throw createPlatformError('平台登录配置未完成，请稍后再试', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  return appId
}

async function requestPlatformJson(url, { method = 'POST', body, headers = {} } = {}) {
  if (!url || !/^https:\/\//i.test(url)) {
    throw createPlatformError('平台登录配置未完成，请稍后再试', 'PLATFORM_AUTH_NOT_CONFIGURED', 503)
  }
  let response
  try {
    response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : JSON.stringify(body || {})
    })
  } catch {
    throw createPlatformError(
      '平台手机号服务暂时不可用，请稍后重试',
      'PLATFORM_AUTH_UPSTREAM_UNAVAILABLE',
      502
    )
  }
  const parsed = await response.json().catch(() => ({}))
  const platformErrorCode = Number(
    parsed?.err_no ||
      parsed?.errcode ||
      parsed?.error_code ||
      parsed?.data?.err_no ||
      parsed?.data?.error_code ||
      0
  )
  if (!response.ok || platformErrorCode !== 0) {
    throw createPlatformError(
      '平台手机号授权验证失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
  return parsed?.data || parsed
}

function resolveDouyinPrivateKey() {
  const configured = String(process.env.DOUYIN_PHONE_PRIVATE_KEY || '').trim()
  const encoded = String(process.env.DOUYIN_PHONE_PRIVATE_KEY_BASE64 || '').trim()
  if (configured) {
    return configured.replaceAll('\\n', '\n')
  }
  if (encoded) {
    try {
      return Buffer.from(encoded, 'base64').toString('utf8').replaceAll('\\n', '\n')
    } catch {
      return ''
    }
  }
  return ''
}

function parseDouyinPhonePayload(payload) {
  if (payload && typeof payload === 'object') {
    return payload
  }
  const raw = String(payload || '').trim()
  if (!raw) {
    return null
  }
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function decryptDouyinPhonePayload(payload) {
  const privateKey = resolveDouyinPrivateKey()
  if (!privateKey) {
    throw createPlatformError(
      '抖音手机号解密配置未完成，请稍后再试',
      'PLATFORM_AUTH_NOT_CONFIGURED',
      503
    )
  }
  try {
    const encryptedPayload =
      payload && typeof payload === 'object'
        ? payload.encrypted_data || payload.encryptedData || payload.data
        : payload
    if (typeof encryptedPayload !== 'string' || !encryptedPayload.trim()) {
      throw new Error('missing encrypted phone payload')
    }
    const encrypted = Buffer.from(encryptedPayload.replace(/\s+/gu, ''), 'base64')
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
      },
      encrypted
    )
    const parsed = parseDouyinPhonePayload(decrypted.toString('utf8'))
    if (!parsed) {
      throw new Error('invalid phone payload')
    }
    return parsed
  } catch {
    throw createPlatformError(
      '抖音手机号解密失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
}

function assertDouyinPhoneWatermark(payload, appId) {
  const watermark = payload?.watermark
  const watermarkAppId = String(watermark?.appid || watermark?.appId || '').trim()
  if (!watermarkAppId || watermarkAppId !== appId) {
    throw createPlatformError(
      '抖音手机号授权与当前应用不一致，请重新授权',
      'PLATFORM_AUTH_MISMATCH',
      401
    )
  }
}

async function getDouyinClientToken(appId, appSecret) {
  const now = Date.now()
  if (douyinClientTokenCache && douyinClientTokenCache.expiresAt > now + 60_000) {
    return douyinClientTokenCache.token
  }
  const tokenResult = await requestPlatformJson(
    String(process.env.DOUYIN_CLIENT_TOKEN_URL || DOUYIN_DEFAULT_CLIENT_TOKEN_URL).trim(),
    {
      body: {
        grant_type: 'client_credential',
        client_key: appId,
        client_secret: appSecret
      }
    }
  )
  const token = String(tokenResult?.access_token || '').trim()
  const expiresIn = Number(tokenResult?.expires_in || 7200)
  if (!token) {
    throw createPlatformError(
      '抖音调用凭证获取失败，请稍后重试',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      502
    )
  }
  douyinClientTokenCache = {
    token,
    expiresAt: now + Math.max(60, expiresIn - 60) * 1000
  }
  return token
}

function decryptDouyinLegacyPhone({ encryptedData, iv, sessionKey }) {
  try {
    const key = Buffer.from(String(sessionKey || ''), 'base64')
    const vector = Buffer.from(String(iv || ''), 'base64')
    if (key.length !== 16 || vector.length !== 16) {
      throw new Error('invalid encrypted payload')
    }
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, vector)
    const raw = Buffer.concat([
      decipher.update(Buffer.from(String(encryptedData || ''), 'base64')),
      decipher.final()
    ]).toString('utf8')
    const payload = parseDouyinPhonePayload(raw)
    if (!payload) {
      throw new Error('invalid payload')
    }
    return payload
  } catch {
    throw createPlatformError(
      '抖音手机号解密失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
}

async function verifyDouyinPhoneAuthorization(data = {}, options = {}) {
  const appId = getConfiguredPlatformAppId('douyin_mp', options.appIds)
  const appSecret = String(process.env.DOUYIN_APP_SECRET || '').trim()
  const code2SessionUrl = String(
    process.env.DOUYIN_CODE2SESSION_URL ||
      'https://developer.toutiao.com/api/apps/v2/jscode2session'
  ).trim()
  const phoneNumberUrl = String(
    process.env.DOUYIN_PHONE_NUMBER_URL || DOUYIN_DEFAULT_PHONE_NUMBER_URL
  ).trim()
  const hasNewPhoneCode = Boolean(String(data.phoneCode || '').trim())
  const hasLegacyPhonePayload = Boolean(data.encryptedData && data.iv)
  if (
    !appSecret ||
    !code2SessionUrl ||
    !phoneNumberUrl ||
    !data.loginCode ||
    (!hasNewPhoneCode && !hasLegacyPhonePayload)
  ) {
    throw createPlatformError(
      '抖音手机号授权服务端配置未完成，请稍后再试',
      'PLATFORM_AUTH_NOT_CONFIGURED',
      503
    )
  }
  const login = await requestPlatformJson(code2SessionUrl, {
    body: { appid: appId, secret: appSecret, code: String(data.loginCode) }
  })
  const platformUserId = normalizePlatformUserId(login.open_id || login.openid)
  if (!platformUserId) {
    throw createPlatformError(
      '抖音登录身份验证失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
  let phoneResult
  if (hasNewPhoneCode) {
    const clientToken = await getDouyinClientToken(appId, appSecret)
    const encryptedPhoneResult = await requestPlatformJson(phoneNumberUrl, {
      body: { code: String(data.phoneCode) },
      headers: { 'access-token': clientToken }
    })
    phoneResult = decryptDouyinPhonePayload(encryptedPhoneResult?.data || encryptedPhoneResult)
    assertDouyinPhoneWatermark(phoneResult, appId)
  } else {
    phoneResult = decryptDouyinLegacyPhone({
      encryptedData: data.encryptedData,
      iv: data.iv,
      sessionKey: login.session_key
    })
    assertDouyinPhoneWatermark(phoneResult, appId)
  }
  const phone = phoneResult.phone_number || phoneResult.purePhoneNumber || phoneResult.phoneNumber
  if (!platformUserId || !phone) {
    throw createPlatformError(
      '抖音手机号授权验证失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
  const countryCode = String(phoneResult.country_code || phoneResult.countryCode || '+86').trim()
  return {
    platform: 'douyin_mp',
    appId,
    platformUserId,
    phone,
    countryCode: countryCode.startsWith('+') ? countryCode : `+${countryCode}`
  }
}

function decryptXhsPhone({ encryptedData, iv, sessionKey, appId }) {
  try {
    const key = Buffer.from(String(sessionKey || ''), 'base64')
    const vector = Buffer.from(String(iv || ''), 'base64')
    if (key.length !== 24 || vector.length !== 16) {
      throw new Error('invalid encrypted payload')
    }
    const decipher = crypto.createDecipheriv('aes-192-cbc', key, vector)
    const raw = Buffer.concat([
      decipher.update(Buffer.from(String(encryptedData || ''), 'base64')),
      decipher.final()
    ]).toString('utf8')
    const payload = JSON.parse(raw)
    if (String(payload?.watermark?.appId || '') !== appId || !payload?.purePhoneNumber) {
      throw new Error('invalid watermark')
    }
    return { phone: payload.purePhoneNumber, countryCode: payload.countryCode || '+86' }
  } catch {
    throw createPlatformError(
      '小红书手机号授权验证失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
}

async function verifyXhsPhoneAuthorization(data = {}, options = {}) {
  const appId = getConfiguredPlatformAppId('xiaohongshu_mp', options.appIds)
  const appSecret = String(process.env.XHS_APP_SECRET || '').trim()
  const code2SessionUrl = String(process.env.XHS_CODE2SESSION_URL || '').trim()
  if (!appSecret || !code2SessionUrl || !data.loginCode || !data.encryptedData || !data.iv) {
    throw createPlatformError(
      '小红书手机号授权服务端配置未完成',
      'PLATFORM_AUTH_NOT_CONFIGURED',
      503
    )
  }
  const session = await requestPlatformJson(code2SessionUrl, {
    body: { appid: appId, secret: appSecret, code: String(data.loginCode) }
  })
  const platformUserId = normalizePlatformUserId(session.open_id || session.openid)
  if (!platformUserId || !session.session_key) {
    throw createPlatformError(
      '小红书登录身份验证失败，请重新授权',
      'PLATFORM_AUTH_VERIFICATION_FAILED',
      401
    )
  }
  const phone = decryptXhsPhone({
    encryptedData: data.encryptedData,
    iv: data.iv,
    sessionKey: session.session_key,
    appId
  })
  return { platform: 'xiaohongshu_mp', appId, platformUserId, ...phone }
}

module.exports = {
  getDouyinClientToken,
  requestPlatformJson,
  verifyDouyinPhoneAuthorization,
  verifyXhsPhoneAuthorization
}
