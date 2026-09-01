import { requestHttpFunction } from '@/api/http.js'

const HTTP_OK = 200

function createSubscriptionApiError(response, fallbackMessage) {
  const error = new Error(response?.message || fallbackMessage)
  error.code = response?.code || 'SUBSCRIPTION_REQUEST_FAILED'
  error.statusCode = Number(response?.code) || 500
  error.data = response?.data || null
  return error
}

function unwrapResponse(response, fallbackMessage) {
  if (response?.code !== HTTP_OK) {
    throw createSubscriptionApiError(response, fallbackMessage)
  }
  return response.data
}

export async function fetchSubscriptionPlans() {
  const response = await requestHttpFunction('subscription-http/subscription/plans', {
    method: 'GET',
    auth: false
  })
  const data = unwrapResponse(response, '订阅套餐暂时无法加载')
  return Array.isArray(data?.plans) ? data.plans : []
}

export async function createSubscriptionOrder({ planId, clientRequestId }) {
  const response = await requestHttpFunction('subscription-http/subscription/orders', {
    method: 'POST',
    body: { planId, clientRequestId },
    auth: true,
    returnErrorResponse: true
  })
  const data = unwrapResponse(response, '支付订单暂时无法创建')
  return {
    order: data?.order || null,
    payment: data?.payment || null
  }
}

export async function fetchSubscriptionOrder(outTradeNo) {
  const response = await requestHttpFunction('subscription-http/subscription/orders', {
    method: 'GET',
    query: { outTradeNo },
    auth: true,
    returnErrorResponse: true
  })
  return unwrapResponse(response, '支付订单状态暂时无法查询') || null
}
