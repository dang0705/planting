import { BASE_URL } from '@/api/env'
import { getCloudbaseAccessToken } from '@/utils/cloudbase-auth'

function parseResponseData(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data)
    } catch (error) {
      return null
    }
  }

  return data
}

export async function createWechatPayOrder(payload = {}) {
  const token = await getCloudbaseAccessToken()
  const openid = String(payload.openid || '')

  const response = await new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/payment/create-order?webfn=true`,
      method: 'POST',
      header: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(openid
          ? {
              'x-openid': openid,
              'x-wx-openid': openid
            }
          : {}),
        'Content-Type': 'application/json'
      },
      data: payload,
      success: resolve,
      fail: reject
    })
  })

  const result = parseResponseData(response.data)
  if (!result) {
    throw new Error('支付接口返回格式错误')
  }

  if (response.statusCode !== 200 || result.code !== 200) {
    throw new Error(result.message || `支付下单失败 (${response.statusCode})`)
  }

  return result.data
}

export async function queryWechatPayOrder(payload = {}) {
  const token = await getCloudbaseAccessToken()
  const outTradeNo = String(payload.outTradeNo || payload.out_trade_no || '').trim()
  const openid = String(payload.openid || '').trim()

  if (!outTradeNo) {
    throw new Error('outTradeNo不能为空')
  }

  const response = await new Promise((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}/payment/query-order?webfn=true&outTradeNo=${encodeURIComponent(outTradeNo)}`,
      method: 'GET',
      header: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(openid
          ? {
              'x-openid': openid,
              'x-wx-openid': openid
            }
          : {})
      },
      success: resolve,
      fail: reject
    })
  })

  const result = parseResponseData(response.data)
  if (!result) {
    throw new Error('查询接口返回格式错误')
  }

  if (response.statusCode !== 200 || result.code !== 200) {
    throw new Error(result.message || `查询订单失败 (${response.statusCode})`)
  }

  return result.data
}

export async function invokeWechatPayment(payData) {
  if (!payData) {
    throw new Error('payData不能为空')
  }

  await new Promise((resolve, reject) => {
    wx.requestPayment({
      timeStamp: payData.timeStamp,
      nonceStr: payData.nonceStr,
      package: payData.package,
      signType: payData.signType,
      paySign: payData.paySign,
      success: resolve,
      fail: reject
    })
  })

  return payData
}

export async function requestWechatPayment(payload = {}) {
  const payData = await createWechatPayOrder(payload)
  await invokeWechatPayment(payData)
  return payData
}
