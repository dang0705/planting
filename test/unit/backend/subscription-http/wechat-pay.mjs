import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const wechatPay = require('../../../../cloudfunctions/subscription-http/wechat-pay.js')

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' }
})
const config = {
  appId: 'wx-test-app',
  mchId: 'mch-test',
  merchantSerialNo: 'merchant-serial',
  merchantPrivateKey: privateKey,
  apiBaseUrl: 'https://pay.test',
  notifyUrl: 'https://example.test/subscription/notify'
}

const prepay = await wechatPay.createJsapiPrepay({
  config,
  order: {
    openid: 'openid_1',
    outTradeNo: 'sub_test_1',
    description: '高级会员 30 天',
    amountFen: 1,
    currency: 'CNY'
  },
  now: () => 1700000000000,
  requestImpl: async ({ method, url, headers, body }) => {
    assert.equal(method, 'POST')
    assert.equal(url, 'https://pay.test/v3/pay/transactions/jsapi')
    assert.equal(JSON.parse(body).amount.total, 1)
    assert.match(headers.Authorization, /^WECHATPAY2-SHA256-RSA2048 /u)
    return { statusCode: 200, body: { prepay_id: 'wx-prepay-1' } }
  }
})
assert.equal(prepay.prepayId, 'wx-prepay-1')

const queriedOrder = await wechatPay.queryJsapiOrder({
  config,
  outTradeNo: 'sub_test_1',
  now: () => 1700000000000,
  requestImpl: async ({ method, url, headers, body }) => {
    assert.equal(method, 'GET')
    assert.equal(url, 'https://pay.test/v3/pay/transactions/out-trade-no/sub_test_1?mchid=mch-test')
    assert.equal(body, '')
    assert.match(headers.Authorization, /^WECHATPAY2-SHA256-RSA2048 /u)
    return {
      statusCode: 200,
      body: { out_trade_no: 'sub_test_1', trade_state: 'SUCCESS' }
    }
  }
})
assert.equal(queriedOrder.trade_state, 'SUCCESS')
const missingOrder = await wechatPay.queryJsapiOrder({
  config,
  outTradeNo: 'sub_missing',
  requestImpl: async () => ({ statusCode: 404, body: {} })
})
assert.equal(missingOrder, null)

const paymentParams = wechatPay.buildMiniProgramPaymentParams({
  config,
  prepayId: prepay.prepayId,
  now: () => 1700000000000
})
const paymentVerify = crypto
  .createVerify('RSA-SHA256')
  .update(
    `${paymentParams.appId}\n${paymentParams.timeStamp}\n${paymentParams.nonceStr}\n${paymentParams.package}\n`
  )
  .end()
assert.equal(paymentVerify.verify(publicKey, paymentParams.paySign, 'base64'), true)

const rawBody = '{"id":"event_1"}'
const callbackTimestamp = '1700000000'
const callbackNonce = 'callback-nonce'
const callbackMessage = `${callbackTimestamp}\n${callbackNonce}\n${rawBody}\n`
const callbackSignature = crypto
  .createSign('RSA-SHA256')
  .update(callbackMessage)
  .end()
  .sign(privateKey, 'base64')
const callbackHeaders = {
  'Wechatpay-Serial': 'platform-serial',
  'Wechatpay-Signature': callbackSignature,
  'Wechatpay-Timestamp': callbackTimestamp,
  'Wechatpay-Nonce': callbackNonce
}
assert.equal(
  wechatPay.verifyNotificationSignature({
    headers: callbackHeaders,
    rawBody,
    platformPublicKey: publicKey,
    expectedSerialNo: 'platform-serial',
    nowSeconds: 1700000001
  }),
  true
)
assert.equal(
  wechatPay.verifyNotificationSignature({
    headers: callbackHeaders,
    rawBody: `${rawBody} `,
    platformPublicKey: publicKey,
    expectedSerialNo: 'platform-serial',
    nowSeconds: 1700000001
  }),
  false
)
assert.equal(
  wechatPay.verifyNotificationSignature({
    headers: callbackHeaders,
    rawBody,
    platformPublicKey: publicKey,
    expectedSerialNo: 'platform-serial',
    nowSeconds: 1700000401
  }),
  false
)

const apiV3Key = '12345678901234567890123456789012'
const iv = Buffer.from('123456789012')
const associatedData = Buffer.from('transaction')
const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), iv)
cipher.setAAD(associatedData)
const plaintext = JSON.stringify({
  appid: 'wx-test-app',
  mchid: 'mch-test',
  out_trade_no: 'sub_test_1',
  transaction_id: 'wx-tx-1',
  trade_state: 'SUCCESS'
})
const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
const decrypted = wechatPay.decryptNotificationResource({
  apiV3Key,
  resource: {
    algorithm: 'AEAD_AES_256_GCM',
    ciphertext: ciphertext.toString('base64'),
    nonce: iv.toString('utf8'),
    associated_data: associatedData.toString('utf8'),
    tag: cipher.getAuthTag().toString('base64')
  }
})
assert.equal(decrypted.transaction_id, 'wx-tx-1')

console.log('wechat pay signature, prepay and callback decrypt tests passed data_mode=unit_fake')
