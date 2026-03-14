'use strict'

const crypto = require('crypto')

const { jsonResponse, resolveHttpUserInfo } = require('/opt/utils/http')
const {
  payment: { defaults }
} = require('/opt/configs')

// In-memory cache (per instance) for WeChat platform certificates keyed by serial.
// The platform certs are used to verify callback signatures.
const platformCertCache = {
  fetchedAt: 0,
  // serial -> { pem, publicKey }
  bySerial: new Map()
}

function getEnvValue(key) {
  return String(process.env[key] || '').trim()
}

function normalizePemPrivateKey(input) {
  const raw = String(input || '').trim()
  if (!raw) return ''

  // If key was stored with '\n' escapes, unescape it first.
  const unescaped = raw.replace(/\\n/g, '\n')

  // If it already looks like a multi-line PEM, keep as-is.
  if (unescaped.includes('\n') && /BEGIN [A-Z ]+ PRIVATE KEY/.test(unescaped)) {
    return unescaped
  }

  // Cloud consoles sometimes collapse PEM into a single line with spaces.
  // Reconstruct a standard PEM by stripping whitespace in the base64 payload and re-wrapping.
  // Support PKCS#8: "PRIVATE KEY" and PKCS#1: "RSA PRIVATE KEY" (also "EC PRIVATE KEY", etc.)
  const beginRe = /-----BEGIN ((?:[A-Z0-9 ]+ )?PRIVATE KEY)-----/
  const endRe = /-----END ((?:[A-Z0-9 ]+ )?PRIVATE KEY)-----/
  const begin = beginRe.exec(unescaped)
  const end = endRe.exec(unescaped)
  if (!begin || !end) return unescaped

  const label = begin[1]
  const payloadStart = begin.index + begin[0].length
  const payloadEnd = end.index
  if (payloadEnd <= payloadStart) return unescaped

  let base64Body = unescaped.slice(payloadStart, payloadEnd)

  // Remove whitespace (including NBSP) and any unexpected characters from copy/paste via consoles.
  base64Body = base64Body.replace(/[\s\u00A0]+/g, '')

  base64Body = base64Body.replace(/[^A-Za-z0-9+/=]/g, '')
  // Pad base64 to multiple of 4 if needed.
  if (base64Body.length % 4 !== 0) {
    base64Body = base64Body.padEnd(base64Body.length + (4 - (base64Body.length % 4)), '=')
  }

  const wrapped = base64Body.match(/.{1,64}/g)?.join('\n') || base64Body
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`
}

function summarizePem(key) {
  const text = String(key || '').trim()
  const beginMatch = text.match(/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/)
  const endMatch = text.match(/-----END (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/)
  const firstLine = beginMatch ? beginMatch[0] : ''
  const lastLine = endMatch ? endMatch[0] : ''
  const encrypted = text.includes('ENCRYPTED')
  return {
    firstLine,
    lastLine,
    encrypted,
    length: text.length
  }
}

function getApiV3Key() {
  // APIv3 key is a 32-byte string set in WeChat Merchant Platform (not the private key file).
  return getEnvValue('WECHAT_PAY_API_V3_KEY')
}

function readPaymentConfig() {
  // Keep legacy env var keys in CloudBase.
  const mchid = getEnvValue('WECHAT_PAYMENT_MERCHANT_ID')
  const serialNo = getEnvValue('WECHAT_PAYMENT_SERIAL_NO')
  const notifyUrl = getEnvValue('WECHAT_NOTIFY_URL')
  const privateKeyPem = normalizePemPrivateKey(getEnvValue('WECHAT_PAY_PRIVATE_KEY'))

  // appid is a plain value from layer config (not an env var key).
  const appid = String(defaults.appid || '').trim()

  let privateKey
  try {
    // Parse once and reuse. If this fails, signing will always fail.
    privateKey = crypto.createPrivateKey(privateKeyPem)
  } catch (error) {
    const meta = summarizePem(privateKeyPem)
    const reason = meta.encrypted ? 'ENCRYPTED_PRIVATE_KEY_NOT_SUPPORTED' : 'INVALID_PRIVATE_KEY'
    const base64Len = privateKeyPem
      .replace(/-----[^-]+-----/g, '')
      .replace(/[\r\n\t ]+/g, '')
      .length
    throw new Error(
      `微信支付私钥解析失败(${reason}): ${error.message}; firstLine=${meta.firstLine}; lastLine=${meta.lastLine}; keyLen=${meta.length}; base64Len=${base64Len}`
    )
  }

  const missing = [
    ['WECHAT_PAYMENT_MERCHANT_ID', mchid],
    ['payment.defaults.appid', appid],
    ['WECHAT_PAYMENT_SERIAL_NO', serialNo],
    ['WECHAT_NOTIFY_URL', notifyUrl],
    ['WECHAT_PAY_PRIVATE_KEY', privateKeyPem]
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)

  if (missing.length) {
    throw new Error(`缺少微信支付必要配置: ${missing.join(', ')}`)
  }

  return {
    mchid,
    appid,
    serialNo,
    notifyUrl,
    privateKey
  }
}

function buildAuthorization({ method, url, body, mchid, serialNo, privateKey }) {
  const timestamp = Math.floor(Date.now() / 1000)
  const nonce = crypto.randomBytes(16).toString('hex')
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  const signature = sign.sign(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
    'base64'
  )

  return `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`
}

function generatePaySign({ appid, timeStamp, nonceStr, prepayId, privateKey }) {
  const pkg = `prepay_id=${prepayId}`
  const message = `${appid}\n${timeStamp}\n${nonceStr}\n${pkg}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(message)
  sign.end()
  return sign.sign({ key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING }, 'base64')
}

function normalizeWeChatHeaderValue(headers, name) {
  if (!headers) return ''
  const lowered = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (String(k).toLowerCase() === lowered) {
      return Array.isArray(v) ? String(v[0] || '') : String(v || '')
    }
  }
  return ''
}

function aes256gcmDecrypt({ apiV3Key, associatedData, nonce, ciphertext }) {
  const key = Buffer.from(String(apiV3Key || ''), 'utf8')
  if (key.length !== 32) {
    throw new Error('WECHAT_PAY_API_V3_KEY 必须是 32 位字符串')
  }

  // ciphertext is base64( cipherText || authTag(16) )
  const buf = Buffer.from(String(ciphertext || ''), 'base64')
  if (buf.length <= 16) {
    throw new Error('ciphertext 长度非法')
  }
  const data = buf.subarray(0, buf.length - 16)
  const authTag = buf.subarray(buf.length - 16)

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(String(nonce || ''), 'utf8'))
  decipher.setAAD(Buffer.from(String(associatedData || ''), 'utf8'))
  decipher.setAuthTag(authTag)

  const plaintext = Buffer.concat([decipher.update(data), decipher.final()])
  return plaintext.toString('utf8')
}

async function fetchPlatformCertificates(config) {
  const apiV3Key = getApiV3Key()
  if (!apiV3Key) {
    throw new Error('缺少微信支付环境变量: WECHAT_PAY_API_V3_KEY')
  }

  const path = '/v3/certificates'
  const authorization = buildAuthorization({
    method: 'GET',
    url: path,
    body: '',
    mchid: config.mchid,
    serialNo: config.serialNo,
    privateKey: config.privateKey
  })

  const response = await fetch(`https://api.mch.weixin.qq.com${path}`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'User-Agent': 'cloudbase-payment/1.0'
    }
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`拉取平台证书失败: HTTP ${response.status}; ${detail}`)
  }

  const json = await response.json()
  const list = Array.isArray(json?.data) ? json.data : []
  const bySerial = new Map()

  for (const item of list) {
    const serial = String(item.serial_no || '').trim()
    const enc = item.encrypt_certificate || {}
    if (!serial) continue
    if (enc.algorithm !== 'AEAD_AES_256_GCM') continue

    const pem = aes256gcmDecrypt({
      apiV3Key,
      associatedData: enc.associated_data,
      nonce: enc.nonce,
      ciphertext: enc.ciphertext
    })

    // WeChat returns PEM certificate. Parse to public key for signature verification.
    let publicKey
    try {
      const cert = new crypto.X509Certificate(pem)
      publicKey = cert.publicKey
    } catch (e) {
      throw new Error(`平台证书解析失败: serial=${serial}; ${e.message}`)
    }

    bySerial.set(serial, { pem, publicKey })
  }

  platformCertCache.fetchedAt = Date.now()
  platformCertCache.bySerial = bySerial
  return bySerial
}

async function getPlatformPublicKeyBySerial(config, serial) {
  const s = String(serial || '').trim()
  if (!s) return null

  const cached = platformCertCache.bySerial.get(s)
  if (cached?.publicKey) return cached.publicKey

  // Refresh at most every 5 minutes per instance.
  const now = Date.now()
  if (now - platformCertCache.fetchedAt < 5 * 60 * 1000 && platformCertCache.bySerial.size) {
    return null
  }

  await fetchPlatformCertificates(config)
  return platformCertCache.bySerial.get(s)?.publicKey || null
}

function verifyWeChatSignature({ publicKey, timestamp, nonce, body, signature }) {
  const message = `${timestamp}\n${nonce}\n${body}\n`
  const verify = crypto.createVerify('RSA-SHA256')
  verify.update(message)
  verify.end()
  return verify.verify(publicKey, signature, 'base64')
}

function buildOutTradeNo(input) {
  if (input) return String(input)
  return `order_${Date.now()}`
}

function parseAmountTotal(input) {
  if (input === undefined || input === null || input === '') {
    return defaults.total
  }

  const total = Number(input)
  if (!Number.isInteger(total) || total <= 0) {
    throw new Error('amount.total 必须是大于 0 的整数，单位为分')
  }

  return total
}

async function resolveOpenid(requestData, payload) {
  if (payload.openid) {
    return String(payload.openid)
  }

  const userInfo = await resolveHttpUserInfo(requestData.headers, payload)
  if (userInfo?.openid) {
    return String(userInfo.openid)
  }

  return ''
}

async function handleCreateOrder(event, context, requestData) {
  const payload = { ...requestData.query, ...requestData.body }
  const openid = await resolveOpenid(requestData, payload)

  if (!openid) {
    return jsonResponse(400, {
      code: 400,
      message: 'openid不能为空',
      data: null
    })
  }

  let config
  try {
    config = readPaymentConfig()
  } catch (error) {
    return jsonResponse(500, {
      code: 500,
      message: error.message,
      data: null
    })
  }

  const description = String(payload.description || defaults.description)
  const outTradeNo = buildOutTradeNo(payload.outTradeNo)
  const currency = String(payload.currency || defaults.currency)

  let total
  try {
    total = parseAmountTotal(payload.total ?? payload.amount?.total)
  } catch (error) {
    return jsonResponse(400, {
      code: 400,
      message: error.message,
      data: null
    })
  }

  const bodyObj = {
    appid: config.appid,
    mchid: config.mchid,
    description,
    out_trade_no: outTradeNo,
    notify_url: config.notifyUrl,
    amount: { total, currency },
    payer: { openid }
  }

  if (payload.attach) {
    bodyObj.attach = String(payload.attach)
  }

  const bodyStr = JSON.stringify(bodyObj)
  const apiPath = '/v3/pay/transactions/jsapi'
  const authorization = buildAuthorization({
    method: 'POST',
    url: apiPath,
    body: bodyStr,
    mchid: config.mchid,
    serialNo: config.serialNo,
    privateKey: config.privateKey
  })

  const response = await fetch(`https://api.mch.weixin.qq.com${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: authorization,
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: bodyStr
  })

  if (!response.ok) {
    const detail = await response.text()
    return jsonResponse(response.status, {
      code: response.status,
      message: '微信支付下单失败',
      data: {
        detail
      }
    })
  }

  const data = await response.json()
  const prepayId = data.prepay_id
  if (!prepayId) {
    return jsonResponse(502, {
      code: 502,
      message: '微信下单返回缺少 prepay_id',
      data
    })
  }

  const timeStamp = String(Math.floor(Date.now() / 1000))
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const pkg = `prepay_id=${prepayId}`
  const paySign = generatePaySign({
    appid: config.appid,
    timeStamp,
    nonceStr,
    prepayId,
    privateKey: config.privateKey
  })

  return jsonResponse(200, {
    code: 200,
    message: '下单成功',
    data: {
      appId: config.appid,
      timeStamp,
      nonceStr,
      package: pkg,
      signType: 'RSA',
      paySign,
      outTradeNo
    }
  })
}

async function handlePayCallback(event, context, requestData) {
  // WeChat Pay callback: POST JSON with signature headers.
  if (requestData.method !== 'POST') {
    return jsonResponse(405, { code: 405, message: 'Method Not Allowed', data: null })
  }

  let config
  try {
    config = readPaymentConfig()
  } catch (error) {
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }

  // IMPORTANT: WeChat signature is computed over the raw request body bytes.
  // Do not re-serialize JSON, or signature verification will fail.
  const rawBody =
    typeof event?.body === 'string'
      ? event.body
      : typeof event === 'string'
        ? event
        : JSON.stringify(requestData.body || {})

  const timestamp = normalizeWeChatHeaderValue(requestData.headers, 'wechatpay-timestamp')
  const nonce = normalizeWeChatHeaderValue(requestData.headers, 'wechatpay-nonce')
  const serial = normalizeWeChatHeaderValue(requestData.headers, 'wechatpay-serial')
  const signature = normalizeWeChatHeaderValue(requestData.headers, 'wechatpay-signature')

  if (!timestamp || !nonce || !serial || !signature) {
    return jsonResponse(400, { code: 400, message: '缺少微信回调验签头', data: null })
  }

  let publicKey
  try {
    publicKey = await getPlatformPublicKeyBySerial(config, serial)
  } catch (e) {
    return jsonResponse(500, { code: 500, message: e.message, data: null })
  }

  if (!publicKey) {
    return jsonResponse(400, { code: 400, message: '未知的平台证书序列号(请检查平台证书是否已更新)', data: { serial } })
  }

  const ok = verifyWeChatSignature({
    publicKey,
    timestamp,
    nonce,
    body: rawBody,
    signature
  })

  if (!ok) {
    return jsonResponse(401, { code: 401, message: '微信回调验签失败', data: null })
  }

  // Decrypt resource payload.
  const apiV3Key = getApiV3Key()
  if (!apiV3Key) {
    return jsonResponse(500, { code: 500, message: '缺少微信支付环境变量: WECHAT_PAY_API_V3_KEY', data: null })
  }

  let parsed
  try {
    parsed = JSON.parse(rawBody || '{}')
  } catch {
    return jsonResponse(400, { code: 400, message: '回调 body 不是合法 JSON', data: null })
  }

  const resource = parsed?.resource || {}
  const enc = {
    associatedData: resource.associated_data,
    nonce: resource.nonce,
    ciphertext: resource.ciphertext
  }

  let resourceText = ''
  try {
    resourceText = aes256gcmDecrypt({ apiV3Key, ...enc })
  } catch (e) {
    return jsonResponse(400, { code: 400, message: `回调 resource 解密失败: ${e.message}`, data: null })
  }

  let resourceJson
  try {
    resourceJson = JSON.parse(resourceText || '{}')
  } catch {
    resourceJson = { _raw: resourceText }
  }

  // TODO: persist order status to DB if/when we introduce an orders collection/table.
  return jsonResponse(200, {
    code: 200,
    message: 'SUCCESS',
    data: {
      summary: {
        outTradeNo: resourceJson?.out_trade_no,
        transactionId: resourceJson?.transaction_id,
        tradeState: resourceJson?.trade_state,
        tradeStateDesc: resourceJson?.trade_state_desc
      }
    }
  })
}

async function handleHealthCheck() {
  return jsonResponse(200, {
    status: 'ok',
    module: 'payment',
    timestamp: Date.now()
  })
}

async function handleQueryOrder(event, context, requestData) {
  const payload = { ...requestData.query, ...requestData.body }
  const outTradeNo = String(payload.outTradeNo || payload.out_trade_no || '').trim()
  if (!outTradeNo) {
    return jsonResponse(400, { code: 400, message: '缺少 outTradeNo', data: null })
  }

  let config
  try {
    config = readPaymentConfig()
  } catch (error) {
    return jsonResponse(500, { code: 500, message: error.message, data: null })
  }

  const apiPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(outTradeNo)}?mchid=${encodeURIComponent(config.mchid)}`
  const authorization = buildAuthorization({
    method: 'GET',
    url: apiPath,
    body: '',
    mchid: config.mchid,
    serialNo: config.serialNo,
    privateKey: config.privateKey
  })

  const response = await fetch(`https://api.mch.weixin.qq.com${apiPath}`, {
    method: 'GET',
    headers: {
      Authorization: authorization,
      Accept: 'application/json'
    }
  })

  const text = await response.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = { detail: text }
  }

  if (!response.ok) {
    return jsonResponse(response.status, {
      code: response.status,
      message: '查询订单失败',
      data
    })
  }

  return jsonResponse(200, {
    code: 200,
    message: 'ok',
    data
  })
}

function createPaymentRouteTable() {
  return {
    createOrder: {
      match: path => path.includes('/create-order'),
      handler: handleCreateOrder
    },
    payCallback: {
      match: path => path.includes('/pay-callback'),
      handler: handlePayCallback
    },
    queryOrder: {
      match: path => path.includes('/query-order'),
      handler: handleQueryOrder
    },
    health: {
      match: path => path.includes('/health'),
      handler: handleHealthCheck
    }
  }
}

module.exports = {
  createPaymentRouteTable
}
