import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..')
const {
  assertWechatPayConfig,
  getSubscriptionPlans,
  getWechatPayConfig
} = require('../../../../cloudfunctions/subscription-http/config.js')

const plans = getSubscriptionPlans({
  WECHAT_PAY_SUBSCRIPTION_PLANS_JSON: JSON.stringify([
    {
      id: 'premium_30d',
      plan: 'premium',
      name: '高级会员 30 天',
      description: '高级会员 30 天',
      amountFen: 1,
      durationDays: 30
    }
  ])
})
assert.deepEqual(plans[0], {
  id: 'premium_30d',
  plan: 'premium',
  name: '高级会员 30 天',
  description: '高级会员 30 天',
  amountFen: 1,
  durationDays: 30,
  currency: 'CNY'
})
const defaultPlans = getSubscriptionPlans({})
assert.deepEqual(
  defaultPlans.map(plan => plan.id),
  ['free', 'premium_30d']
)
assert.equal(defaultPlans[0].amountFen, 0)
assert.equal(defaultPlans[0].durationDays, 0)
assert.equal(defaultPlans[1].amountFen, 1)
assert.equal(defaultPlans[1].durationDays, 30)
const freePlan = getSubscriptionPlans({
  WECHAT_PAY_SUBSCRIPTION_PLANS_JSON: JSON.stringify([
    {
      id: 'free',
      plan: 'free',
      name: '免费用户',
      description: '基础植物记录功能'
    }
  ])
})
assert.equal(freePlan[0].amountFen, 0)
assert.equal(freePlan[0].durationDays, 0)
assert.throws(
  () => getSubscriptionPlans({ WECHAT_PAY_SUBSCRIPTION_PLANS_JSON: '{bad' }),
  error => error.code === 'SUBSCRIPTION_PLANS_INVALID' && error.statusCode === 503
)
assert.throws(
  () =>
    assertWechatPayConfig({ appId: 'wx', apiV3Key: 'too-short' }, ['appId', 'mchId', 'apiV3Key']),
  error => error.code === 'WECHAT_PAY_CONFIG_NOT_READY' && error.statusCode === 503
)

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
const inlinePrivateKey = privateKeyPem.replaceAll('\n', '')
assert.doesNotThrow(() =>
  assertWechatPayConfig(
    getWechatPayConfig({
      WECHAT_PAY_APPID: 'wx-test',
      WECHAT_PAY_MCHID: 'mch-test',
      WECHAT_PAY_MERCHANT_SERIAL_NO: 'merchant-serial',
      WECHAT_PAY_MERCHANT_PRIVATE_KEY: inlinePrivateKey,
      WECHAT_PAY_NOTIFY_URL: 'https://example.test/subscription/notify'
    }),
    ['appId', 'mchId', 'merchantSerialNo', 'merchantPrivateKey', 'notifyUrl']
  )
)

const migration = fs.readFileSync(
  path.join(repoRoot, 'scripts/sql/ensure-subscription-orders-table-20260830.sql'),
  'utf8'
)
assert.match(migration, /CREATE TABLE IF NOT EXISTS `cloud1_dev`\.`subscription_orders`/u)
assert.match(migration, /client_request_id` VARCHAR\(64\) NOT NULL/u)
assert.match(migration, /UNIQUE KEY `uq_subscription_out_trade_no`/u)
assert.match(migration, /UNIQUE KEY `uq_subscription_client_request`/u)
assert.match(migration, /notify_body_sha256/u)
assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE TABLE/u)

console.log('subscription config validation tests passed data_mode=unit_fake')
