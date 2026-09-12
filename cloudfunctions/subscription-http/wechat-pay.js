'use strict'

const crypto = require('crypto')
const https = require('https')

const WECHAT_PAY_API_PATH = '/v3/pay/transactions/jsapi'
const WECHAT_PAY_QUERY_ORDER_PATH = '/v3/pay/transactions/out-trade-no'
const DEFAULT_NOTIFY_MAX_AGE_SECONDS = 300

function randomNonce() {
  return crypto.randomBytes(16).toString('hex')
}

function signText(privateKey, text) {
  return crypto.createSign('RSA-SHA256').update(text).end().sign(privateKey, 'base64')
}

function buildWechatAuthorization({ method, path, body, config, timestamp, nonceStr }) {
  const message = `${method.toUpperCase()}\n${path}\n${timestamp}\n${nonceStr}\n${body}\n`
  const signature = signText(config.merchantPrivateKey, message)
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.mchId}",nonce_str="${nonceStr}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`
}

function requestJson({ method, url, headers, body, requestImpl = requestHttpsJson }) {
  return requestImpl({ method, url, headers, body })
}

function requestHttpsJson({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const request = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          ...headers,
          'Content-Length': Buffer.byteLength(body, 'utf8')
        }
      },
      response => {
        let responseBody = ''
        response.setEncoding('utf8')
        response.on('data', chunk => {
          responseBody += chunk
        })
        response.on('end', () => {
          let parsed = null
          try {
            parsed = responseBody ? JSON.parse(responseBody) : {}
          } catch {
            parsed = { raw: responseBody }
          }
          resolve({ statusCode: response.statusCode || 0, body: parsed })
        })
      }
    )
    request.on('error', reject)
    request.end(body)
  })
}

async function createJsapiPrepay({
  config,
  order,
  requestImpl = requestHttpsJson,
  now = Date.now
}) {
  const body = JSON.stringify({
    appid: config.appId,
    mchid: config.mchId,
    description: order.description,
    out_trade_no: order.outTradeNo,
    notify_url: config.notifyUrl,
    amount: {
      total: order.amountFen,
      currency: order.currency || 'CNY'
    },
    payer: {
      openid: order.openid
    }
  })
  const timestamp = Math.floor(now() / 1000)
  const nonceStr = randomNonce()
  const authorization = buildWechatAuthorization({
    method: 'POST',
    path: WECHAT_PAY_API_PATH,
    body,
    config,
    timestamp,
    nonceStr
  })
  const result = await requestJson({
    method: 'POST',
    url: `${config.apiBaseUrl}${WECHAT_PAY_API_PATH}`,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authorization,
      'User-Agent': 'qinghuazhi-subscription/1.0'
    },
    body,
    requestImpl
  })

  if (result.statusCode < 200 || result.statusCode >= 300 || !result.body?.prepay_id) {
    const error = new Error('微信支付统一下单失败')
    error.code = 'WECHAT_PAY_PREPAY_FAILED'
    error.statusCode = 502
    error.providerStatusCode = result.statusCode
    throw error
  }
  return { prepayId: String(result.body.prepay_id) }
}

async function queryJsapiOrder({
  config,
  outTradeNo,
  requestImpl = requestHttpsJson,
  now = Date.now
}) {
  const encodedOutTradeNo = encodeURIComponent(String(outTradeNo || ''))
  const path = `${WECHAT_PAY_QUERY_ORDER_PATH}/${encodedOutTradeNo}?mchid=${encodeURIComponent(config.mchId)}`
  const timestamp = Math.floor(now() / 1000)
  const nonceStr = randomNonce()
  const authorization = buildWechatAuthorization({
    method: 'GET',
    path,
    body: '',
    config,
    timestamp,
    nonceStr
  })
  const result = await requestJson({
    method: 'GET',
    url: `${config.apiBaseUrl}${path}`,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: authorization,
      'User-Agent': 'qinghuazhi-subscription/1.0'
    },
    body: '',
    requestImpl
  })

  if (result.statusCode === 404) {
    return null
  }
  if (result.statusCode < 200 || result.statusCode >= 300 || !result.body?.out_trade_no) {
    const error = new Error('微信支付订单查询失败')
    error.code = 'WECHAT_PAY_ORDER_QUERY_FAILED'
    error.statusCode = 502
    error.providerStatusCode = result.statusCode
    throw error
  }
  return result.body
}

function buildMiniProgramPaymentParams({ config, prepayId, now = Date.now }) {
  const timeStamp = String(Math.floor(now() / 1000))
  const nonceStr = randomNonce()
  const packageValue = `prepay_id=${prepayId}`
  const message = `${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`
  return {
    appId: config.appId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: 'RSA',
    paySign: signText(config.merchantPrivateKey, message)
  }
}

function getHeader(headers, name) {
  const normalizedName = name.toLowerCase()
  const source = headers && typeof headers === 'object' ? headers : {}
  for (const [key, value] of Object.entries(source)) {
    if (String(key).toLowerCase() === normalizedName) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '')
    }
  }
  return ''
}

function verifyNotificationSignature({
  headers,
  rawBody,
  platformPublicKey,
  expectedSerialNo,
  nowSeconds = Math.floor(Date.now() / 1000),
  maxAgeSeconds = DEFAULT_NOTIFY_MAX_AGE_SECONDS
}) {
  const serial = getHeader(headers, 'Wechatpay-Serial')
  const signature = getHeader(headers, 'Wechatpay-Signature')
  const timestamp = getHeader(headers, 'Wechatpay-Timestamp')
  const nonce = getHeader(headers, 'Wechatpay-Nonce')
  const numericTimestamp = Number(timestamp)
  if (
    !serial ||
    !signature ||
    !timestamp ||
    !nonce ||
    !platformPublicKey ||
    (expectedSerialNo && serial !== expectedSerialNo) ||
    !Number.isInteger(numericTimestamp) ||
    Math.abs(nowSeconds - numericTimestamp) > maxAgeSeconds
  ) {
    return false
  }

  const message = `${timestamp}\n${nonce}\n${String(rawBody || '')}\n`
  return crypto
    .createVerify('RSA-SHA256')
    .update(message)
    .end()
    .verify(platformPublicKey, signature, 'base64')
}

function decryptNotificationResource({ resource, apiV3Key }) {
  if (!resource || Buffer.byteLength(String(apiV3Key || ''), 'utf8') !== 32) {
    const error = new Error('微信支付回调解密配置无效')
    error.code = 'WECHAT_PAY_DECRYPT_CONFIG_INVALID'
    error.statusCode = 503
    throw error
  }
  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(apiV3Key, 'utf8'),
      Buffer.from(String(resource.nonce || ''), 'utf8')
    )
    decipher.setAAD(Buffer.from(String(resource.associated_data || ''), 'utf8'))
    decipher.setAuthTag(Buffer.from(String(resource.tag || ''), 'base64'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(String(resource.ciphertext || ''), 'base64')),
      decipher.final()
    ]).toString('utf8')
    return JSON.parse(plaintext)
  } catch {
    const error = new Error('微信支付回调解密失败')
    error.code = 'WECHAT_PAY_DECRYPT_FAILED'
    error.statusCode = 400
    throw error
  }
}

module.exports = {
  DEFAULT_NOTIFY_MAX_AGE_SECONDS,
  WECHAT_PAY_API_PATH,
  WECHAT_PAY_QUERY_ORDER_PATH,
  buildMiniProgramPaymentParams,
  buildWechatAuthorization,
  createJsapiPrepay,
  decryptNotificationResource,
  getHeader,
  queryJsapiOrder,
  requestHttpsJson,
  verifyNotificationSignature
}
