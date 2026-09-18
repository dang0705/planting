'use strict'

// Node 18.15 does not expose the Web File global, while the database SDK's
// undici dependency expects it during module initialization.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

const crypto = require('crypto')

const {
  getHttpRequestData,
  internalServerError,
  jsonResponse,
  methodNotAllowed,
  notFound,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { withNativeTransaction } = require('/opt/utils/native-mysql')

const ORDER_TABLE = 'subscription_orders'
const DAY_MS = 24 * 60 * 60 * 1000
const NOTIFY_MAX_AGE_SECONDS = 300

function createError(message, code, statusCode = 500) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function readEnv(keys) {
  for (const key of keys) {
    const value = String(process.env[key] || '').trim()
    if (value) {
      return value
    }
  }
  return ''
}

function decodePem(value) {
  const normalized = String(value || '').trim().replaceAll('\\n', '\n')
  if (!normalized || normalized.includes('-----BEGIN')) {
    return normalized
  }
  try {
    const decoded = Buffer.from(normalized, 'base64').toString('utf8')
    return decoded.includes('-----BEGIN') ? decoded.trim() : normalized
  } catch {
    return normalized
  }
}

function getConfig() {
  return {
    appId: readEnv(['WECHAT_PAY_APPID', 'WECHAT_PAY_APP_ID']),
    mchId: readEnv(['WECHAT_PAY_MCHID', 'WECHAT_PAY_MERCHANT_ID']),
    apiV3Key: readEnv(['WECHAT_PAY_API_V3_KEY']),
    platformSerialNo: readEnv([
      'WECHAT_PAY_PLATFORM_SERIAL_NO',
      'WECHAT_PAY_PLATFORM_SERIAL'
    ]),
    platformPublicKey: decodePem(
      readEnv(['WECHAT_PAY_PLATFORM_PUBLIC_KEY_BASE64', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY'])
    )
  }
}

function assertConfig(config) {
  const required = ['appId', 'mchId', 'apiV3Key', 'platformSerialNo', 'platformPublicKey']
  const missing = required.filter(key => !String(config[key] || '').trim())
  if (missing.length) {
    throw createError(
      `微信支付回调配置未完成，请补齐：${missing.join(', ')}`,
      'WECHAT_PAY_CONFIG_NOT_READY',
      503
    )
  }
  if (Buffer.byteLength(config.apiV3Key, 'utf8') !== 32) {
    throw createError('微信支付 API v3 密钥必须是 32 字节', 'WECHAT_PAY_CONFIG_INVALID', 503)
  }
  try {
    crypto.createPublicKey(config.platformPublicKey)
  } catch {
    throw createError('微信支付平台公钥格式无效', 'WECHAT_PAY_CONFIG_INVALID', 503)
  }
}

function header(headers, name) {
  const target = name.toLowerCase()
  for (const [key, value] of Object.entries(headers || {})) {
    if (String(key).toLowerCase() === target) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '')
    }
  }
  return ''
}

function verifySignature({ headers, rawBody, config, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const serial = header(headers, 'Wechatpay-Serial')
  const signature = header(headers, 'Wechatpay-Signature')
  const timestamp = header(headers, 'Wechatpay-Timestamp')
  const nonce = header(headers, 'Wechatpay-Nonce')
  const numericTimestamp = Number(timestamp)
  if (
    !serial ||
    !signature ||
    !timestamp ||
    !nonce ||
    serial !== config.platformSerialNo ||
    !Number.isInteger(numericTimestamp) ||
    Math.abs(nowSeconds - numericTimestamp) > NOTIFY_MAX_AGE_SECONDS
  ) {
    return false
  }
  const message = `${timestamp}\n${nonce}\n${String(rawBody || '')}\n`
  return crypto
    .createVerify('RSA-SHA256')
    .update(message)
    .end()
    .verify(config.platformPublicKey, signature, 'base64')
}

function decryptResource(resource, apiV3Key) {
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(String(resource?.nonce || ''), 'utf8')
    )
    decipher.setAAD(Buffer.from(String(resource?.associated_data || ''), 'utf8'))
    decipher.setAuthTag(Buffer.from(String(resource?.tag || ''), 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(String(resource?.ciphertext || ''), 'base64')),
      decipher.final()
    ]).toString('utf8')
    return JSON.parse(plaintext)
  } catch {
    throw createError('微信支付回调解密失败', 'WECHAT_PAY_DECRYPT_FAILED', 400)
  }
}

function mapOrder(row) {
  return {
    outTradeNo: row.out_trade_no,
    status: row.status,
    transactionId: row.transaction_id || '',
    paidAt: row.paid_at ? Number(row.paid_at) : null
  }
}

function normalizeOutTradeNo(value) {
  const outTradeNo = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,32}$/.test(outTradeNo) ? outTradeNo : ''
}

async function applyPayment({
  payment,
  config,
  notificationBodySha256,
  transaction = withNativeTransaction,
  now = Date.now
}) {
  const outTradeNo = normalizeOutTradeNo(payment?.out_trade_no)
  const transactionId = String(payment?.transaction_id || '').trim()
  if (!outTradeNo || !transactionId) {
    throw createError('支付回调字段不完整', 'WECHAT_PAY_CALLBACK_INVALID', 400)
  }

  return transaction(async connection => {
    const [orders] = await connection.execute(
      `SELECT out_trade_no, _openid, user_id, payer_openid, plan_type, duration_days,
              amount_total, currency, status, transaction_id, paid_at
         FROM ${ORDER_TABLE}
        WHERE out_trade_no = ?
        LIMIT 1
        FOR UPDATE`,
      [outTradeNo]
    )
    const order = orders[0]
    if (!order) {
      throw createError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }
    if (String(payment.appid || '') !== config.appId || String(payment.mchid || '') !== config.mchId) {
      throw createError('支付回调商户校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (
      Number(payment.amount?.total) !== Number(order.amount_total) ||
      String(payment.amount?.currency || '') !== String(order.currency || 'CNY') ||
      !String(order.payer_openid || '').trim() ||
      String(payment.payer?.openid || '') !== String(order.payer_openid)
    ) {
      throw createError('支付回调订单校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (order.status === 'paid') {
      if (String(order.transaction_id || '') !== transactionId) {
        throw createError('订单已绑定其他微信交易号', 'SUBSCRIPTION_ORDER_CONFLICT', 409)
      }
      return { duplicate: true, order: mapOrder(order) }
    }

    const [users] = await connection.execute(
      `SELECT _id, subscription_plan, subscription_status, subscription_endDate
         FROM users
        WHERE _id = ?
         LIMIT 1
         FOR UPDATE`,
      [String(order.user_id || order._openid || '').trim()]
    )
    const user = users[0]
    if (!user) {
      throw createError('会员归属用户不存在', 'SUBSCRIPTION_USER_NOT_FOUND', 503)
    }

    const paidAt = now()
    const currentEnd = Number(user.subscription_endDate) || 0
    const currentActive =
      String(user.subscription_plan || 'free') !== 'free' &&
      String(user.subscription_status || '') === 'active' &&
      currentEnd > paidAt
    const nextEnd = Math.max(paidAt, currentActive ? currentEnd : 0) + Number(order.duration_days) * DAY_MS
    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET status = 'paid', transaction_id = ?, payer_openid = ?, paid_at = ?,
              notify_body_sha256 = ?, notify_received_at = ?, updated_at = ?
        WHERE out_trade_no = ? AND status <> 'paid'`,
      [
        transactionId,
        payment.payer.openid,
        paidAt,
        notificationBodySha256 || null,
        paidAt,
        paidAt,
        outTradeNo
      ]
    )
    await connection.execute(
      `UPDATE users
          SET subscription_plan = ?, subscription_status = 'active',
              subscription_startDate = ?, subscription_endDate = ?, updatedAt = ?
        WHERE _id = ?`,
      [order.plan_type, paidAt, nextEnd, paidAt, String(order.user_id || order._openid || '').trim()]
    )
    return {
      duplicate: false,
      order: mapOrder({ ...order, status: 'paid', transaction_id: transactionId, paid_at: paidAt }),
      membership: { plan: order.plan_type, status: 'active', startDate: paidAt, endDate: nextEnd }
    }
  })
}

async function markNonSuccess({
  payment,
  config,
  notificationBodySha256,
  transaction = withNativeTransaction,
  now = Date.now
}) {
  const outTradeNo = normalizeOutTradeNo(payment?.out_trade_no)
  if (!outTradeNo) {
    throw createError('支付回调订单号无效', 'WECHAT_PAY_CALLBACK_INVALID', 400)
  }
  return transaction(async connection => {
    const [orders] = await connection.execute(
      `SELECT out_trade_no, _openid, user_id, payer_openid, amount_total, currency,
              status, transaction_id, paid_at, plan_type, duration_days
         FROM ${ORDER_TABLE}
        WHERE out_trade_no = ?
        LIMIT 1
        FOR UPDATE`,
      [outTradeNo]
    )
    const order = orders[0]
    if (!order) {
      throw createError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }
    if (
      String(payment.appid || '') !== config.appId ||
      String(payment.mchid || '') !== config.mchId ||
      (payment.amount?.total !== undefined && Number(payment.amount.total) !== Number(order.amount_total)) ||
      (payment.payer?.openid &&
        (!String(order.payer_openid || '').trim() ||
          String(payment.payer.openid) !== String(order.payer_openid)))
    ) {
      throw createError('支付回调订单校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (order.status === 'paid') {
      return { duplicate: true, order: mapOrder(order) }
    }
    const receivedAt = now()
    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET status = ?, notify_body_sha256 = ?, notify_received_at = ?, updated_at = ?
        WHERE out_trade_no = ? AND status <> 'paid'`,
      [
        `wechat_${String(payment.trade_state || 'unknown').toLowerCase()}`.slice(0, 32),
        notificationBodySha256 || null,
        receivedAt,
        receivedAt,
        outTradeNo
      ]
    )
    return { duplicate: false, order: mapOrder({ ...order, status: payment.trade_state }) }
  })
}

function rawBody(event, request) {
  if (typeof event?.rawBody === 'string') {
    return event.rawBody
  }
  if (typeof event?.requestContext?.rawBody === 'string') {
    return event.requestContext.rawBody
  }
  if (typeof event?.body === 'string') {
    return event.body
  }
  if (event?.body && typeof event.body === 'object') {
    return JSON.stringify(event.body)
  }
  return JSON.stringify(request?.body || {})
}

function successResponse() {
  return jsonResponse(200, { code: 'SUCCESS', message: '成功' })
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  // functions-framework exposes the original method as httpContext.httpMethod;
  // the normalized helper also infers POST from a non-empty body, which is
  // insufficient for an empty or malformed webhook payload.
  const method = String(context?.httpContext?.httpMethod || request.method || 'GET').toUpperCase()
  if (!String(request.path || '').includes('/subscription/notify')) {
    return notFound(request.path)
  }
  if (method !== 'POST') {
    return methodNotAllowed(method)
  }

  try {
    const config = getConfig()
    assertConfig(config)
    const body = rawBody(event, request)
    if (!verifySignature({ headers: request.headers, rawBody: body, config })) {
      return jsonResponse(401, { code: 'FAIL', message: '回调签名校验失败' })
    }
    const payment = decryptResource(request.body?.resource, config.apiV3Key)
    const notificationBodySha256 = crypto.createHash('sha256').update(body, 'utf8').digest('hex')
    if (payment.trade_state === 'SUCCESS') {
      await applyPayment({ payment, config, notificationBodySha256 })
    } else {
      await markNonSuccess({ payment, config, notificationBodySha256 })
    }
    return successResponse()
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500
    if (statusCode >= 400 && statusCode < 500) {
      return jsonResponse(statusCode, { code: statusCode, message: error.message || '回调处理失败' })
    }
    console.error('subscription-notify-http error:', error?.code || error?.message || error)
    return internalServerError(
      statusCode === 503 ? '支付回调服务尚未配置完成' : '支付回调服务暂时不可用'
    )
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}

module.exports._test = { assertConfig, decryptResource, main, verifySignature }
