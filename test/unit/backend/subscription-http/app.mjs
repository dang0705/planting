import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('module')
const appPath = require.resolve('../../../../cloudfunctions/subscription-http/app.js')
const originalLoad = Module._load
const originalPlans = process.env.WECHAT_PAY_SUBSCRIPTION_PLANS_JSON
process.env.WECHAT_PAY_SUBSCRIPTION_PLANS_JSON = JSON.stringify([
  {
    id: 'free',
    plan: 'free',
    name: '免费用户',
    description: '基础植物记录功能'
  },
  {
    id: 'premium_30d',
    plan: 'premium',
    name: '高级会员 30 天',
    description: '高级会员 30 天',
    amountFen: 1,
    durationDays: 30
  }
])

const http = {
  jsonResponse: (statusCode, payload) => ({ statusCode, payload }),
  internalServerError: message => ({ statusCode: 500, payload: { code: 500, message } }),
  methodNotAllowed: method => ({ statusCode: 405, payload: { code: 405, method } }),
  notFound: path => ({ statusCode: 404, payload: { code: 404, path } }),
  getHttpRequestData: event => event,
  resolveRequestAppEnv: () => 'development',
  runWithRequestAppEnv: (_appEnv, callback) => callback(),
  resolveHttpUserInfo: async () => ({ openid: 'openid_1' })
}

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/http') {
      return http
    }
    if (request === '/opt/utils/native-mysql') {
      return {
        withNativeTransaction: async () => {
          throw new Error('unexpected database call')
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[appPath]
  const app = require(appPath)
  const health = await app._test.main({ path: '/subscription/health', method: 'GET', body: {} })
  assert.equal(health.statusCode, 200)

  const plans = await app._test.main({ path: '/subscription/plans', method: 'GET', body: {} })
  assert.equal(plans.statusCode, 200)
  assert.equal(plans.payload.data.plans.length, 2)
  assert.equal(plans.payload.data.plans[0].payable, false)
  assert.equal(plans.payload.data.plans[1].amountYuan, '0.01')
  assert.equal(plans.payload.data.plans[1].payable, true)

  const freeOrder = await app._test.main({
    path: '/subscription/orders',
    method: 'POST',
    headers: {},
    query: {},
    body: { planId: 'free', clientRequestId: 'free_request_1' }
  })
  assert.equal(freeOrder.statusCode, 400)
  assert.equal(freeOrder.payload.message, '免费方案无需支付')

  const missingIdempotency = await app._test.main({
    path: '/subscription/orders',
    method: 'POST',
    headers: {},
    query: {},
    body: { planId: 'premium_30d' }
  })
  assert.equal(missingIdempotency.statusCode, 400)
  assert.match(missingIdempotency.payload.message, /幂等/u)
} finally {
  Module._load = originalLoad
  delete require.cache[appPath]
  if (originalPlans === undefined) {
    delete process.env.WECHAT_PAY_SUBSCRIPTION_PLANS_JSON
  } else {
    process.env.WECHAT_PAY_SUBSCRIPTION_PLANS_JSON = originalPlans
  }
}

console.log('subscription HTTP route contract tests passed data_mode=unit_fake')
