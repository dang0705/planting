'use strict'

const crypto = require('node:crypto')

const HTTP_IDENTITY_TICKET_PREFIX = 'planting-http-v1'
const HTTP_IDENTITY_TICKET_HEADER = 'x-planting-http-identity-ticket'
const HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS = 5 * 60
const OPENID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u
const PLATFORM_SET = new Set(['wechat_mp', 'douyin_mp', 'xiaohongshu_mp'])

function getSecret() {
  const secret = String(process.env.HTTP_IDENTITY_TICKET_SECRET || '').trim()
  return secret.length >= 32 ? secret : ''
}

function sign(encodedPayload, secret) {
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

function sameSignature(expected, received) {
  const expectedBuffer = Buffer.from(String(expected || ''))
  const receivedBuffer = Buffer.from(String(received || ''))
  return (
    expectedBuffer.length > 0 &&
    expectedBuffer.length === receivedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  )
}

function createHttpIdentityTicket({
  openid = '',
  uid = '',
  customUserId = '',
  subject = '',
  platform = ''
} = {}) {
  const secret = getSecret()
  const normalizedOpenid = String(openid || '').trim()
  if (!secret || !OPENID_PATTERN.test(normalizedOpenid)) {
    return ''
  }
  const issuedAt = Math.floor(Date.now() / 1000)
  const normalizedSubject = String(subject || '').trim()
  const normalizedUid = String(uid || '').trim()
  const normalizedPlatform = PLATFORM_SET.has(String(platform || '').trim())
    ? String(platform).trim()
    : ''
  if (normalizedSubject === 'planting-user' && (!normalizedUid || !normalizedPlatform)) {
    return ''
  }
  const payload = {
    version: 1,
    openid: normalizedOpenid,
    uid: normalizedUid,
    customUserId: String(customUserId || '').trim(),
    ...(normalizedSubject ? { subject: normalizedSubject } : {}),
    ...(normalizedPlatform ? { platform: normalizedPlatform } : {}),
    issuedAt,
    expiresAt: issuedAt + HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS,
    nonce: crypto.randomBytes(16).toString('base64url')
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${HTTP_IDENTITY_TICKET_PREFIX}.${encodedPayload}.${sign(encodedPayload, secret)}`
}

function resolveHttpIdentityTicket(headers = {}) {
  const authorization = String(headers.authorization || '').trim()
  const headerTicket = String(headers[HTTP_IDENTITY_TICKET_HEADER] || '').trim()
  const token = authorization.startsWith(`Bearer ${HTTP_IDENTITY_TICKET_PREFIX}.`)
    ? authorization.slice('Bearer '.length)
    : headerTicket
  const [prefix, encodedPayload, signature, extra] = token.split('.')
  const secret = getSecret()
  if (!secret || prefix !== HTTP_IDENTITY_TICKET_PREFIX || !encodedPayload || !signature || extra) {
    return null
  }
  if (!sameSignature(sign(encodedPayload, secret), signature)) {
    return null
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  const now = Math.floor(Date.now() / 1000)
  if (
    !payload ||
    payload.version !== 1 ||
    !OPENID_PATTERN.test(String(payload.openid || '')) ||
    !Number.isInteger(payload.issuedAt) ||
    !Number.isInteger(payload.expiresAt) ||
    payload.issuedAt > now + 60 ||
    payload.expiresAt < now ||
    payload.expiresAt < payload.issuedAt ||
    payload.expiresAt - payload.issuedAt > HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS
  ) {
    return null
  }
  const subject = String(payload.subject || '').trim()
  const userId = subject === 'planting-user' ? String(payload.uid || '').trim() : ''
  const platform = PLATFORM_SET.has(String(payload.platform || '').trim())
    ? String(payload.platform).trim()
    : ''
  return {
    openid: String(payload.openid).trim(),
    ...(userId
      ? { userId, uid: userId, customUserId: String(payload.customUserId || '').trim() }
      : {}),
    ...(subject ? { subject } : {}),
    ...(platform ? { platform } : {}),
    source: 'signed-http-ticket'
  }
}

module.exports = {
  HTTP_IDENTITY_TICKET_PREFIX,
  HTTP_IDENTITY_TICKET_HEADER,
  HTTP_IDENTITY_TICKET_MAX_AGE_SECONDS,
  createHttpIdentityTicket,
  resolveHttpIdentityTicket
}
