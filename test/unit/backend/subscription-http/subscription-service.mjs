import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('module')
const servicePath =
  require.resolve('../../../../cloudfunctions/subscription-http/subscription-service.js')
const originalLoad = Module._load
const calls = []
let order = null
const user = {
  _id: 'user_1',
  _openid: 'openid_1',
  subscription_plan: 'free',
  subscription_status: 'active',
  subscription_startDate: null,
  subscription_endDate: 1700000000000 + 20 * 24 * 60 * 60 * 1000
}

const connection = {
  async execute(sql, params = []) {
    calls.push({ sql, params })
    if (sql.includes('FROM users')) {
      return [[user], []]
    }
    if (sql.includes('INSERT INTO subscription_orders')) {
      order = {
        id: 1,
        out_trade_no: params[0],
        client_request_id: params[1],
        _openid: params[2],
        user_id: params[3],
        payer_openid: params[4],
        plan_id: params[5],
        plan_type: params[6],
        duration_days: params[7],
        amount_total: params[8],
        currency: params[9],
        description: params[10],
        status: 'created',
        prepay_id: null,
        transaction_id: null,
        paid_at: null,
        created_at: params[11],
        updated_at: params[12]
      }
      return [{ affectedRows: 1 }, []]
    }
    if (sql.includes('WHERE _openid = ? AND client_request_id = ?')) {
      return [
        [order && order.client_request_id === params[1] ? order : undefined].filter(Boolean),
        []
      ]
    }
    if (sql.includes('FROM subscription_orders')) {
      return [[order].filter(Boolean), []]
    }
    if (sql.includes("status = 'paid'")) {
      order.status = 'paid'
      order.transaction_id = params[0]
      order.paid_at = params[2]
      return [{ affectedRows: 1 }, []]
    }
    if (sql.includes('subscription_plan = ?')) {
      user.subscription_plan = params[0]
      user.subscription_status = 'active'
      user.subscription_startDate = params[1]
      user.subscription_endDate = params[2]
      return [{ affectedRows: 1 }, []]
    }
    if (sql.includes('prepay_id = ?')) {
      order.prepay_id = params[0]
      order.status = 'prepay_created'
      return [{ affectedRows: 1 }, []]
    }
    return [{ affectedRows: 1 }, []]
  }
}

const transaction = async handler => handler(connection)

try {
  Module._load = function loadMock(request, parent, isMain) {
    if (request === '/opt/utils/native-mysql') {
      return { withNativeTransaction: transaction }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[servicePath]
  const service = require(servicePath)
  const plan = {
    id: 'premium_30d',
    plan: 'premium',
    description: '高级会员 30 天',
    amountFen: 1,
    durationDays: 30,
    currency: 'CNY'
  }
  await assert.rejects(
    service.createPendingOrder({
      openid: 'openid_1',
      plan: {
        id: 'free',
        plan: 'free',
        description: '基础植物记录功能',
        amountFen: 0,
        durationDays: 0,
        currency: 'CNY'
      },
      clientRequestId: 'free_request_1',
      transaction
    }),
    error => error.code === 'SUBSCRIPTION_FREE_PLAN_NOT_PAYABLE' && error.statusCode === 400
  )
  const first = await service.createPendingOrder({
    openid: 'openid_1',
    plan,
    clientRequestId: 'client_1',
    outTradeNo: 'sub_test_1',
    now: () => 1700000000000,
    transaction
  })
  assert.equal(first.created, true)
  await service.markPrepayCreated({
    outTradeNo: 'sub_test_1',
    prepayId: 'prepay_1',
    transaction
  })
  const duplicateCreate = await service.createPendingOrder({
    openid: 'openid_1',
    plan,
    clientRequestId: 'client_1',
    outTradeNo: 'sub_test_other',
    transaction
  })
  assert.equal(duplicateCreate.created, false)
  assert.equal(duplicateCreate.order.outTradeNo, 'sub_test_1')

  const paid = await service.applyPaymentNotification({
    payment: {
      appid: 'wx-test-app',
      mchid: 'mch-test',
      out_trade_no: 'sub_test_1',
      transaction_id: 'wx_tx_1',
      amount: { total: 1, currency: 'CNY' },
      payer: { openid: 'openid_1' }
    },
    appId: 'wx-test-app',
    mchId: 'mch-test',
    now: () => 1700000000000,
    transaction
  })
  assert.equal(paid.duplicate, false)
  assert.equal(order.status, 'paid')
  assert.equal(user.subscription_plan, 'premium')
  assert.equal(user.subscription_endDate, 1700000000000 + 30 * 24 * 60 * 60 * 1000)

  const duplicateCallback = await service.applyPaymentNotification({
    payment: {
      appid: 'wx-test-app',
      mchid: 'mch-test',
      out_trade_no: 'sub_test_1',
      transaction_id: 'wx_tx_1',
      amount: { total: 1, currency: 'CNY' },
      payer: { openid: 'openid_1' }
    },
    appId: 'wx-test-app',
    mchId: 'mch-test',
    now: () => 1700000100000,
    transaction
  })
  assert.equal(duplicateCallback.duplicate, true)
  assert.equal(user.subscription_endDate, 1700000000000 + 30 * 24 * 60 * 60 * 1000)
  await assert.rejects(
    service.applyPaymentNotification({
      payment: {
        appid: 'wx-test-app',
        mchid: 'mch-test',
        out_trade_no: 'sub_test_1',
        transaction_id: 'wx_tx_other',
      amount: { total: 1, currency: 'CNY' },
        payer: { openid: 'openid_1' }
      },
      appId: 'wx-test-app',
      mchId: 'mch-test',
      transaction
    }),
    error => error.code === 'SUBSCRIPTION_ORDER_CONFLICT' && error.statusCode === 409
  )
  assert.ok(calls.some(call => call.sql.includes('FOR UPDATE')))
} finally {
  Module._load = originalLoad
  delete require.cache[servicePath]
}

console.log(
  'subscription order transaction and callback idempotency tests passed data_mode=unit_fake'
)
