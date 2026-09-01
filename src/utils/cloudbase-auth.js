/**
 * 微信小程序身份与手机号能力
 *
 * 仅依赖已初始化的 wx.cloud.callFunction，不引入 CloudBase Web SDK。
 * 登录由现有的微信登录链路负责；这里仅提供身份查询和手机号授权能力，
 * HTTP 请求使用 wechat-identity 返回的签名身份票据。
 */

function assertMiniProgramEnv() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('微信身份能力仅支持已初始化 wx.cloud 的微信小程序环境')
  }
}

export async function getWechatCloudIdentity() {
  assertMiniProgramEnv()

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'wechat-identity',
      data: {},
      success: res => {
        const result = res?.result || {}
        resolve({
          openid: result.openid || '',
          appid: result.appid || '',
          unionid: result.unionid || '',
          httpIdentityTicket: result.httpIdentityTicket || ''
        })
      },
      fail: reject
    })
  })
}

export async function getWechatPhoneProfile({ code = '', cloudId = '' } = {}) {
  assertMiniProgramEnv()

  const data = {}
  if (cloudId && typeof wx.cloud.CloudID === 'function') {
    data.weRunData = wx.cloud.CloudID(cloudId)
  }
  if (code) {
    data.code = code
  }
  if (!cloudId && code) {
    const loginResult = await new Promise((resolve, reject) => {
      wx.login({
        success: resolve,
        fail: reject
      })
    })
    if (!loginResult?.code) {
      throw new Error('微信登录未返回有效凭据')
    }
    data.loginCode = loginResult.code
  }

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'wechat-phone',
      data,
      success: res => {
        const result = res?.result || {}
        if (!result.phoneProof) {
          reject(new Error(result.message || 'wechat-phone 未返回有效手机号授权证明'))
          return
        }

        resolve({
          phoneProof: result.phoneProof
        })
      },
      fail: reject
    })
  })
}

export async function getCloudbaseUserIdentity() {
  const wechatIdentity = await getWechatCloudIdentity()
  if (!wechatIdentity?.openid) {
    throw new Error('wechat-identity 未返回有效 openid')
  }

  return {
    openid: wechatIdentity.openid,
    uid: '',
    customUserId: '',
    appid: wechatIdentity.appid || '',
    unionid: wechatIdentity.unionid || '',
    httpIdentityTicket: wechatIdentity.httpIdentityTicket || ''
  }
}
