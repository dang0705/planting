'use strict'

// Node 18.15 does not expose the Web File global, while the database SDK's
// undici dependency expects it during module initialization.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

const {
  jsonResponse,
  internalServerError,
  methodNotAllowed,
  notFound,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')
const { withNativeTransaction } = require('/opt/utils/native-mysql')
const { assertWechatPayConfig, getSubscriptionPlans, getWechatPayConfig } = require('./config')
const {
  buildMiniProgramPaymentParams,
  createJsapiPrepay,
  decryptNotificationResource,
  queryJsapiOrder,
  verifyNotificationSignature
} = require('./wechat-pay')
const {
  acknowledgeNonSuccessNotification,
  applyPaymentNotification,
  createPendingOrder,
  getOrderForUser,
  hashNotificationBody,
  markPrepayCreated,
  markPrepayFailed
} = require('./subscription-service')
const { models } = require('/opt/utils/cloudbase')
let platformSession
try {
  platformSession = require('/opt/utils/platform-session')
} catch {
  platformSession = require('../layer/utils/platform-session')
}
const { assertPlatformFeature } = platformSession

function getRawBody(event, request) {
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

function publicPlan(plan) {
  const payable = plan.plan !== 'free' && Number(plan.amountFen) > 0
  return {
    id: plan.id,
    plan: plan.plan,
    name: plan.name,
    description: plan.description,
    amountFen: plan.amountFen,
    amountYuan: (plan.amountFen / 100).toFixed(2),
    durationDays: plan.durationDays,
    payable,
    billingMode: 'one_time',
    currency: plan.currency
  }
}

function publicOrder(order) {
  if (!order) {
    return null
  }
  const { openid: _openid, ...safeOrder } = order
  return safeOrder
}

function callbackSuccess() {
  return jsonResponse(200, { code: 'SUCCESS', message: '成功' })
}

function callbackFailure(statusCode, message = '回调处理失败') {
  return jsonResponse(statusCode, { code: 'FAIL', message })
}

async function requireUser(request, context) {
  const identity = await resolveHttpUserInfo(request.headers, request.query, context)
  if (!identity?.openid) {
    return null
  }
  return identity
}

async function resolveWechatPayerOpenid(identity, appId) {
  if (identity?.platform !== 'wechat_mp') {
    return ''
  }
  const userId = String(identity.userId || identity.openid || '').trim()
  if (!userId) {
    return ''
  }
  const result = await models.$runSQL(
    `SELECT i.openid AS payer_openid
       FROM user_platform_identities i
      WHERE i.user_id = {{userId}}
        AND i.platform = 'wechat_mp'
        AND (i.app_id = {{appId}} OR {{appId}} = '')
        AND i.openid IS NOT NULL AND i.openid <> ''
      ORDER BY i.is_primary DESC, i.updatedAt DESC
      LIMIT 1`,
    { userId, appId: String(appId || '').trim() }
  )
  const identityOpenid = String(result?.data?.executeResultList?.[0]?.payer_openid || '').trim()
  if (identityOpenid) {
    return identityOpenid
  }
  const fallback = await models.$runSQL(
    `SELECT COALESCE(NULLIF(wechat_openid, ''), NULLIF(principal_openid, '')) AS payer_openid
       FROM users
      WHERE _id = {{userId}}
      LIMIT 1`,
    { userId }
  )
  return String(fallback?.data?.executeResultList?.[0]?.payer_openid || '').trim()
}

function unavailableFeatureResponse(error) {
  return jsonResponse(403, {
    code: error.code || 'PLATFORM_FEATURE_UNAVAILABLE',
    message: error.message || '当前端暂未开放订阅服务，敬请期待。',
    data: null
  })
}

async function reconcileOrderWithWechat(order) {
  if (!order?.outTradeNo || order.status !== 'prepay_created') {
    return order
  }

  const config = getWechatPayConfig()
  assertWechatPayConfig(config, ['appId', 'mchId', 'merchantSerialNo', 'merchantPrivateKey'])
  const payment = await queryJsapiOrder({ config, outTradeNo: order.outTradeNo })
  if (!payment) {
    return order
  }
  if (payment.trade_state === 'SUCCESS') {
    await applyPaymentNotification({
      payment,
      appId: config.appId,
      mchId: config.mchId,
      transaction: withNativeTransaction
    })
    return getOrderForUser({
      openid: order.userId,
      outTradeNo: order.outTradeNo,
      transaction: withNativeTransaction
    })
  }
  if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(payment.trade_state)) {
    await acknowledgeNonSuccessNotification({
      payment,
      appId: config.appId,
      mchId: config.mchId,
      transaction: withNativeTransaction
    })
    return getOrderForUser({
      openid: order.userId,
      outTradeNo: order.outTradeNo,
      transaction: withNativeTransaction
    })
  }
  return order
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = String(request.method || 'GET').toUpperCase()

  try {
    if (path.includes('/subscription/health')) {
      return jsonResponse(200, {
        code: 200,
        data: { status: 'ok', functionName: 'subscription-http', timestamp: Date.now() }
      })
    }

    if (path.includes('/subscription/plans')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      const identity = await requireUser(request, context)
      if (!identity) {
        return jsonResponse(401, { code: 401, message: '请先登录', data: null })
      }
      try {
        assertPlatformFeature(identity, path)
      } catch (error) {
        if (Number(error?.statusCode) === 403) {
          return unavailableFeatureResponse(error)
        }
        throw error
      }
      const plans = getSubscriptionPlans().map(publicPlan)
      return jsonResponse(200, { code: 200, data: { plans } })
    }

    if (path.includes('/subscription/notify')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const config = getWechatPayConfig()
      assertWechatPayConfig(config, [
        'appId',
        'mchId',
        'apiV3Key',
        'platformSerialNo',
        'platformPublicKey'
      ])
      const rawBody = getRawBody(event, request)
      const notificationBodySha256 = hashNotificationBody(rawBody)
      if (
        !verifyNotificationSignature({
          headers: request.headers,
          rawBody,
          platformPublicKey: config.platformPublicKey,
          expectedSerialNo: config.platformSerialNo
        })
      ) {
        return callbackFailure(401, '回调签名校验失败')
      }
      const envelope = request.body || {}
      const payment = decryptNotificationResource({
        resource: envelope.resource,
        apiV3Key: config.apiV3Key
      })
      if (payment.trade_state === 'SUCCESS') {
        await applyPaymentNotification({
          payment,
          appId: config.appId,
          mchId: config.mchId,
          notificationBodySha256,
          transaction: withNativeTransaction
        })
        return callbackSuccess()
      }
      await acknowledgeNonSuccessNotification({
        payment,
        appId: config.appId,
        mchId: config.mchId,
        notificationBodySha256,
        transaction: withNativeTransaction
      })
      return callbackSuccess()
    }

    if (path.includes('/subscription/orders')) {
      const identity = await requireUser(request, context)
      if (!identity) {
        return jsonResponse(401, { code: 401, message: '请先登录', data: null })
      }
      try {
        assertPlatformFeature(identity, path)
      } catch (error) {
        if (Number(error?.statusCode) === 403) {
          return unavailableFeatureResponse(error)
        }
        throw error
      }

      if (method === 'GET') {
        const outTradeNo = request.query.outTradeNo || request.query.out_trade_no
        const order = await getOrderForUser({
          openid: identity.openid,
          outTradeNo,
          transaction: withNativeTransaction
        })
        const reconciledOrder = await reconcileOrderWithWechat(order)
        return jsonResponse(200, { code: 200, data: publicOrder(reconciledOrder) })
      }

      if (method === 'POST') {
        const planId = String(request.body?.planId || request.body?.plan_id || '').trim()
        const clientRequestId = String(
          request.body?.clientRequestId || request.body?.client_request_id || ''
        ).trim()
        if (!clientRequestId || clientRequestId.length > 64) {
          return jsonResponse(400, { code: 400, message: '缺少有效的客户端幂等号', data: null })
        }
        const plan = getSubscriptionPlans().find(item => item.id === planId)
        if (!plan) {
          return jsonResponse(400, { code: 400, message: '订阅套餐不存在', data: null })
        }
        if (plan.plan === 'free' || Number(plan.amountFen) <= 0) {
          return jsonResponse(400, {
            code: 400,
            message: '免费方案无需支付',
            data: null
          })
        }

        const config = getWechatPayConfig()
        assertWechatPayConfig(config, [
          'appId',
          'mchId',
          'merchantSerialNo',
          'merchantPrivateKey',
          'notifyUrl'
        ])
        const pending = await createPendingOrder({
          openid: identity.userId || identity.openid,
          userId: identity.userId || identity.openid,
          payerOpenid: await resolveWechatPayerOpenid(identity, config.appId),
          plan,
          clientRequestId,
          transaction: withNativeTransaction
        })
        let order = pending.order
        if (!order.prepayId && pending.prepayClaimed) {
          try {
            const prepay = await createJsapiPrepay({
              config,
              order
            })
            order = await markPrepayCreated({
              outTradeNo: order.outTradeNo,
              prepayId: prepay.prepayId,
              transaction: withNativeTransaction
            })
          } catch (error) {
            await markPrepayFailed({
              outTradeNo: order.outTradeNo,
              reason: error?.code || 'WECHAT_PAY_PREPAY_FAILED',
              transaction: withNativeTransaction
            }).catch(() => {})
            throw error
          }
        }
        if (!order.prepayId) {
          return jsonResponse(409, {
            code: 409,
            message: '支付订单正在处理中，请稍后查询订单状态',
            data: { order: publicOrder(order) }
          })
        }
        if (order.status === 'paid') {
          return jsonResponse(200, { code: 200, data: { order: publicOrder(order) } })
        }
        return jsonResponse(200, {
          code: 200,
          data: {
            order: publicOrder(order),
            payment: buildMiniProgramPaymentParams({ config, prepayId: order.prepayId })
          }
        })
      }

      return methodNotAllowed(method)
    }

    return notFound(path)
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500
    if (statusCode >= 400 && statusCode < 500) {
      return jsonResponse(statusCode, {
        code: statusCode,
        message: error.message || '请求无法处理',
        data: null
      })
    }
    console.error('subscription-http error:', error?.code || error?.message || error)
    return internalServerError(
      statusCode === 503 ? '订阅服务尚未配置完成，请稍后重试' : '订阅服务暂时不可用，请稍后重试'
    )
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}

module.exports._test = { getRawBody, main, publicOrder, publicPlan }
