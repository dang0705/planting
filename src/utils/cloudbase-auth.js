/**
 * 微信小程序身份与手机号能力
 *
 * 仅依赖已初始化的 wx.cloud.callFunction，不再引入 CloudBase Web SDK。
 * 保留微信云函数身份查询与手机号授权公共能力；access token / Bearer Header
 * 相关实现已移除，HTTP 认证由 wx.cloud 身份链路 + openid Header 承担。
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
          unionid: result.unionid || ''
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

  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'wechat-phone',
      data,
      success: res => {
        const result = res?.result || {}
        if (!result.phoneNumber) {
          reject(new Error(result.message || 'wechat-phone 未返回有效手机号'))
          return
        }

        resolve({
          openid: result.openid || '',
          appid: result.appid || '',
          unionid: result.unionid || '',
          phoneNumber: result.phoneNumber || '',
          purePhoneNumber: result.purePhoneNumber || '',
          countryCode: result.countryCode || '+86'
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
    unionid: wechatIdentity.unionid || ''
  }
}
