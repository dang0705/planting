'use strict'

const crypto = require('crypto')

const { withNativeTransaction } = require('/opt/utils/native-mysql')

const ORDER_TABLE = 'subscription_orders'
const DAY_MS = 24 * 60 * 60 * 1000

function createServiceError(message, code, statusCode = 500) {
  const error = new Error(message)
  error.code = code
  error.statusCode = statusCode
  return error
}

function normalizeOpenid(value) {
  const openid = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,128}$/.test(openid) ? openid : ''
}

function normalizeClientRequestId(value) {
  const requestId = String(value || '').trim()
  return requestId && requestId.length <= 64 ? requestId : ''
}

function normalizeOutTradeNo(value) {
  const outTradeNo = String(value || '').trim()
  return /^[A-Za-z0-9_-]{1,32}$/.test(outTradeNo) ? outTradeNo : ''
}

function createOutTradeNo(now = Date.now) {
  const value = `sub_${now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`
  return value.slice(0, 32)
}

function mapOrder(row) {
  if (!row) {
    return null
  }
  return {
    id: row.id,
    outTradeNo: row.out_trade_no,
    clientRequestId: row.client_request_id,
    // `openid` is retained internally for WeChat JSAPI prepay. The business
    // owner is carried separately as userId; publicOrder strips this field.
    openid: row.payer_openid || row.openid || row._openid || '',
    userId: row.user_id || row._openid || '',
    planId: row.plan_id,
    plan: row.plan_type,
    description: row.description,
    amountFen: Number(row.amount_total),
    currency: row.currency,
    status: row.status,
    prepayId: row.prepay_id || '',
    transactionId: row.transaction_id || '',
    paidAt: row.paid_at ? Number(row.paid_at) : null,
    createdAt: row.created_at ? Number(row.created_at) : null,
    updatedAt: row.updated_at ? Number(row.updated_at) : null
  }
}

async function selectUserForUpdate(connection, openid) {
  const [rows] = await connection.execute(
    `SELECT _id, _openid, wechat_openid, principal_openid,
            subscription_plan, subscription_status,
            subscription_startDate, subscription_endDate
       FROM users
      WHERE _id = ?
      LIMIT 1
      FOR UPDATE`,
    [openid]
  )
  return rows[0] || null
}

async function selectOrderForUpdate(connection, outTradeNo) {
  const [rows] = await connection.execute(
    `SELECT id, out_trade_no, client_request_id, _openid, user_id, payer_openid,
            plan_id, plan_type, duration_days, amount_total, currency,
            description, status, prepay_id, transaction_id,
            paid_at, created_at, updated_at
       FROM ${ORDER_TABLE}
      WHERE out_trade_no = ?
      LIMIT 1
      FOR UPDATE`,
    [outTradeNo]
  )
  return rows[0] || null
}

async function createPendingOrder({
  openid,
  userId = '',
  payerOpenid = '',
  plan,
  clientRequestId,
  outTradeNo = createOutTradeNo(),
  now = Date.now,
  transaction = withNativeTransaction
}) {
  const normalizedUserId = normalizeOpenid(userId || openid)
  const legacyPayerOpenid = userId ? '' : normalizeOpenid(openid)
  const normalizedRequestId = normalizeClientRequestId(clientRequestId)
  const normalizedOutTradeNo = normalizeOutTradeNo(outTradeNo)
  if (!normalizedUserId || !normalizedOutTradeNo || !normalizedRequestId) {
    throw createServiceError('用户标识或订单号无效', 'SUBSCRIPTION_ORDER_INVALID', 400)
  }
  if (plan?.plan === 'free' || Number(plan?.amountFen) <= 0) {
    throw createServiceError('免费方案无需支付', 'SUBSCRIPTION_FREE_PLAN_NOT_PAYABLE', 400)
  }

  return transaction(async connection => {
    const user = await selectUserForUpdate(connection, normalizedUserId)
    if (!user) {
      throw createServiceError('用户不存在，请先登录', 'SUBSCRIPTION_USER_NOT_FOUND', 401)
    }

    if (normalizedRequestId) {
      const [existingRows] = await connection.execute(
        `SELECT id, out_trade_no, client_request_id, _openid, user_id, payer_openid,
                plan_id, plan_type, duration_days, amount_total, currency,
                description, status, prepay_id, transaction_id,
                paid_at, created_at, updated_at
           FROM ${ORDER_TABLE}
          WHERE (user_id = ? OR _openid = ?) AND client_request_id = ?
          LIMIT 1
          FOR UPDATE`,
        [normalizedUserId, normalizedUserId, normalizedRequestId]
      )
      if (existingRows[0]) {
        if (
          existingRows[0].plan_id !== plan.id ||
          Number(existingRows[0].amount_total) !== Number(plan.amountFen) ||
          existingRows[0].plan_type !== plan.plan
        ) {
          throw createServiceError(
            '幂等号已用于其他订阅套餐',
            'SUBSCRIPTION_IDEMPOTENCY_CONFLICT',
            409
          )
        }
        if (['created', 'prepay_failed'].includes(existingRows[0].status)) {
          await connection.execute(
            `UPDATE ${ORDER_TABLE}
                SET status = 'prepay_processing', updated_at = ?
              WHERE out_trade_no = ? AND status IN ('created', 'prepay_failed')`,
            [now(), existingRows[0].out_trade_no]
          )
          existingRows[0].status = 'prepay_processing'
          return { created: false, prepayClaimed: true, order: mapOrder(existingRows[0]) }
        }
        return { created: false, prepayClaimed: false, order: mapOrder(existingRows[0]) }
      }
    }

    const createdAt = now()
    const normalizedPayerOpenid = normalizeOpenid(
      payerOpenid || user.wechat_openid || user.principal_openid || legacyPayerOpenid
    )
    if (!normalizedPayerOpenid) {
      throw createServiceError(
        '微信支付身份未绑定，请重新登录后再试',
        'SUBSCRIPTION_WECHAT_IDENTITY_MISSING',
        503
      )
    }
    await connection.execute(
      `INSERT INTO ${ORDER_TABLE} (
        out_trade_no, client_request_id, _openid, user_id, payer_openid,
        plan_id, plan_type, duration_days, amount_total, currency,
        description, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'prepay_processing', ?, ?)`,
      [
        normalizedOutTradeNo,
        normalizedRequestId,
        normalizedUserId,
        user._id,
        normalizedPayerOpenid || null,
        plan.id,
        plan.plan,
        plan.durationDays,
        plan.amountFen,
        plan.currency,
        plan.description,
        createdAt,
        createdAt
      ]
    )
    return {
      created: true,
      prepayClaimed: true,
      order: {
        outTradeNo: normalizedOutTradeNo,
        clientRequestId: normalizedRequestId,
        openid: normalizedPayerOpenid,
        userId: user._id,
        planId: plan.id,
        plan: plan.plan,
        description: plan.description,
        amountFen: plan.amountFen,
        currency: plan.currency,
        status: 'prepay_processing',
        prepayId: '',
        transactionId: '',
        createdAt,
        updatedAt: createdAt
      }
    }
  })
}

async function markPrepayCreated({
  outTradeNo,
  prepayId,
  now = Date.now,
  transaction = withNativeTransaction
}) {
  return transaction(async connection => {
    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET prepay_id = ?, status = 'prepay_created', updated_at = ?
        WHERE out_trade_no = ?
          AND status IN ('created', 'prepay_processing', 'prepay_failed')`,
      [prepayId, now(), outTradeNo]
    )
    const row = await selectOrderForUpdate(connection, outTradeNo)
    if (!row) {
      throw createServiceError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }
    return mapOrder(row)
  })
}

async function markPrepayFailed({
  outTradeNo,
  reason,
  now = Date.now,
  transaction = withNativeTransaction
}) {
  return transaction(async connection => {
    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET status = 'prepay_failed', failure_reason = ?, updated_at = ?
        WHERE out_trade_no = ? AND status IN ('created', 'prepay_processing')`,
      [String(reason || '微信支付统一下单失败').slice(0, 255), now(), outTradeNo]
    )
  })
}

async function getOrderForUser({ openid, outTradeNo, transaction = withNativeTransaction }) {
  const normalizedOpenid = normalizeOpenid(openid)
  const normalizedOutTradeNo = normalizeOutTradeNo(outTradeNo)
  if (!normalizedOpenid || !normalizedOutTradeNo) {
    throw createServiceError('订单号无效', 'SUBSCRIPTION_ORDER_INVALID', 400)
  }
  return transaction(async connection => {
    const [rows] = await connection.execute(
      `SELECT id, out_trade_no, client_request_id, plan_id, plan_type,
              amount_total, currency, description, status, prepay_id,
              transaction_id, payer_openid, paid_at, created_at, updated_at, user_id
         FROM ${ORDER_TABLE}
        WHERE (user_id = ? OR _openid = ?) AND out_trade_no = ?
        LIMIT 1`,
      [normalizedOpenid, normalizedOpenid, normalizedOutTradeNo]
    )
    if (!rows[0]) {
      throw createServiceError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }
    return mapOrder(rows[0])
  })
}

async function applyPaymentNotification({
  payment,
  appId,
  mchId,
  notificationBodySha256 = '',
  now = Date.now,
  transaction = withNativeTransaction
}) {
  const outTradeNo = normalizeOutTradeNo(payment?.out_trade_no)
  const transactionId = String(payment?.transaction_id || '').trim()
  if (!outTradeNo || !transactionId || !appId || !mchId) {
    throw createServiceError('支付回调字段不完整', 'WECHAT_PAY_CALLBACK_INVALID', 400)
  }

  return transaction(async connection => {
    const order = await selectOrderForUpdate(connection, outTradeNo)
    if (!order) {
      throw createServiceError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }

    if (String(payment.appid || '') !== appId || String(payment.mchid || '') !== mchId) {
      throw createServiceError('支付回调商户校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (
      Number(payment.amount?.total) !== Number(order.amount_total) ||
      String(payment.amount?.currency || '') !== String(order.currency || 'CNY') ||
      !normalizeOpenid(order.payer_openid) ||
      String(payment.payer?.openid || '') !== String(order.payer_openid)
    ) {
      throw createServiceError('支付回调订单校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }

    if (order.status === 'paid') {
      if (String(order.transaction_id || '') !== transactionId) {
        throw createServiceError('订单已绑定其他微信交易号', 'SUBSCRIPTION_ORDER_CONFLICT', 409)
      }
      return { duplicate: true, order: mapOrder(order) }
    }

    const user = await selectUserForUpdate(connection, order.user_id || order._openid)
    if (!user) {
      throw createServiceError('会员归属用户不存在', 'SUBSCRIPTION_USER_NOT_FOUND', 503)
    }

    const paidAt = now()
    const notifyReceivedAt = paidAt
    const currentEnd = Number(user.subscription_endDate) || 0
    const currentActive =
      String(user.subscription_plan || 'free') !== 'free' &&
      String(user.subscription_status || '') === 'active' &&
      currentEnd > paidAt
    const nextEnd =
      Math.max(paidAt, currentActive ? currentEnd : 0) + Number(order.duration_days) * DAY_MS

    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET status = 'paid', transaction_id = ?, payer_openid = ?,
              paid_at = ?, notify_body_sha256 = ?, notify_received_at = ?, updated_at = ?
        WHERE out_trade_no = ? AND status <> 'paid'`,
      [
        transactionId,
        payment.payer.openid,
        paidAt,
        notificationBodySha256 || null,
        notifyReceivedAt,
        paidAt,
        outTradeNo
      ]
    )
    await connection.execute(
      `UPDATE users
          SET subscription_plan = ?, subscription_status = 'active',
              subscription_startDate = ?, subscription_endDate = ?, updatedAt = ?
        WHERE _id = ?`,
      [order.plan_type, paidAt, nextEnd, paidAt, user._id]
    )

    return {
      duplicate: false,
      order: {
        ...mapOrder({ ...order, status: 'paid', transaction_id: transactionId, paid_at: paidAt }),
        paidAt
      },
      membership: {
        plan: order.plan_type,
        status: 'active',
        startDate: paidAt,
        endDate: nextEnd
      }
    }
  })
}

async function acknowledgeNonSuccessNotification({
  payment,
  appId,
  mchId,
  notificationBodySha256 = '',
  now = Date.now,
  transaction = withNativeTransaction
}) {
  const outTradeNo = normalizeOutTradeNo(payment?.out_trade_no)
  if (!outTradeNo) {
    throw createServiceError('支付回调订单号无效', 'WECHAT_PAY_CALLBACK_INVALID', 400)
  }
  return transaction(async connection => {
    const order = await selectOrderForUpdate(connection, outTradeNo)
    if (!order) {
      throw createServiceError('支付订单不存在', 'SUBSCRIPTION_ORDER_NOT_FOUND', 404)
    }
    if (
      String(payment.appid || '') !== String(appId || '') ||
      String(payment.mchid || '') !== String(mchId || '')
    ) {
      throw createServiceError('支付回调商户校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (
      payment.amount?.total !== undefined &&
      (Number(payment.amount.total) !== Number(order.amount_total) ||
        String(payment.amount.currency || '') !== String(order.currency || 'CNY'))
    ) {
      throw createServiceError('支付回调订单校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (
      payment.payer?.openid &&
      (!normalizeOpenid(order.payer_openid) ||
        String(payment.payer.openid) !== String(order.payer_openid))
    ) {
      throw createServiceError('支付回调用户校验失败', 'WECHAT_PAY_ORDER_MISMATCH', 400)
    }
    if (order.status === 'paid') {
      return { duplicate: true, order: mapOrder(order) }
    }
    const notifyReceivedAt = now()
    await connection.execute(
      `UPDATE ${ORDER_TABLE}
          SET status = ?, notify_body_sha256 = ?, notify_received_at = ?, updated_at = ?
        WHERE out_trade_no = ? AND status <> 'paid'`,
      [
        `wechat_${String(payment.trade_state || 'unknown').toLowerCase()}`.slice(0, 32),
        notificationBodySha256 || null,
        notifyReceivedAt,
        notifyReceivedAt,
        outTradeNo
      ]
    )
    return { duplicate: false, order: mapOrder({ ...order, status: payment.trade_state }) }
  })
}

function hashNotificationBody(rawBody) {
  return crypto
    .createHash('sha256')
    .update(String(rawBody || ''), 'utf8')
    .digest('hex')
}

module.exports = {
  DAY_MS,
  acknowledgeNonSuccessNotification,
  applyPaymentNotification,
  createOutTradeNo,
  createPendingOrder,
  getOrderForUser,
  hashNotificationBody,
  markPrepayCreated,
  markPrepayFailed,
  mapOrder,
  normalizeClientRequestId,
  normalizeOpenid,
  normalizeOutTradeNo
}
