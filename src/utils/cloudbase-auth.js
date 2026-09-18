/**
 * 微信小程序身份与手机号能力
 *
 * 仅依赖微信小程序提供的 wx.cloud 能力，不引入 CloudBase Web SDK；实际
 * 调用前按需初始化，避免 App 启动阶段被过期的 DevTools 凭据阻断。
 * 远端身份查询使用普通 wechat-identity 事件函数拿到短时 HTTP 身份票据；
 * 业务 HTTP 云函数统一经公网 HTTPS 路由调用。登录由现有的微信登录链路负责；
 * 这里仅提供身份查询和手机号授权能力。
 */
import { IS_LOCAL_API_BASE_URL, PUBLIC_HTTP_FUNCTION_BASE_URL } from '@/api/env'
import { CLOUDBASE_ENV_ID, getRequestAppEnvHeader } from '@/utils/runtime-env'
import {
  clearPlatformSession,
  getActivePlatformAccessToken,
  savePlatformIdentityTicket
} from '@/api/platform-session'

let miniProgramCloudInitialized = false
let pendingPlatformIdentityRefresh = null

function createPlatformIdentityRefreshError(response = {}) {
  const body = response?.data && typeof response.data === 'object' ? response.data : {}
  const statusCode = Number(response?.statusCode || 0)
  const error = new Error(
    body?.message ||
      (statusCode === 401
        ? '当前登录会话已失效，请重新登录后再继续问诊'
        : '身份票据刷新失败，请稍后重试')
  )
  error.statusCode = statusCode
  return error
}

function requestPlatformIdentityRefresh(platformSessionToken) {
  if (typeof uni === 'undefined' || typeof uni.request !== 'function') {
    return Promise.reject(new Error('当前运行环境无法刷新登录身份'))
  }

  const url = `${PUBLIC_HTTP_FUNCTION_BASE_URL}/auth-user-http/auth/user`
  return new Promise((resolve, reject) => {
    uni.request({
      url,
      method: 'POST',
      data: {
        action: 'getUserByOpenid',
        data: {}
      },
      header: {
        'Content-Type': 'application/json',
        'x-app-env': getRequestAppEnvHeader(),
        'x-env': getRequestAppEnvHeader(),
        'x-planting-platform-session': platformSessionToken
      },
      dataType: 'json',
      success: response => {
        const body = response?.data && typeof response.data === 'object' ? response.data : {}
        const user = body?.data && typeof body.data === 'object' ? body.data : {}
        const httpIdentityTicket = String(user.httpIdentityTicket || '').trim()
        if (
          Number(response?.statusCode || 0) < 200 ||
          Number(response?.statusCode || 0) >= 300 ||
          Number(body?.code) !== 200 ||
          !httpIdentityTicket
        ) {
          reject(createPlatformIdentityRefreshError(response))
          return
        }

        const httpIdentityTicketExpiresAt = Number(user.httpIdentityTicketExpiresAt || 0)
        savePlatformIdentityTicket(httpIdentityTicket, httpIdentityTicketExpiresAt)
        resolve({
          user,
          httpIdentityTicket,
          httpIdentityTicketExpiresAt
        })
      },
      fail: error => reject(new Error(error?.errMsg || '身份票据刷新失败，请稍后重试'))
    })
  })
}

export async function refreshPlatformHttpIdentity() {
  const platformSessionToken = getActivePlatformAccessToken()
  if (!platformSessionToken) {
    throw new Error('当前登录会话已失效，请重新登录后再继续问诊')
  }
  if (!pendingPlatformIdentityRefresh) {
    pendingPlatformIdentityRefresh = (async () => {
      try {
        return await requestPlatformIdentityRefresh(platformSessionToken)
      } catch (error) {
        if (Number(error?.statusCode) === 401) {
          clearPlatformSession()
        }
        throw error
      } finally {
        pendingPlatformIdentityRefresh = null
      }
    })()
  }
  return pendingPlatformIdentityRefresh
}

function assertMiniProgramEnv() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('微信身份能力仅支持微信小程序环境')
  }
}

export function ensureWechatCloudInitialized() {
  assertMiniProgramEnv()
  if (miniProgramCloudInitialized) {
    return
  }

  wx.cloud.init({
    env: CLOUDBASE_ENV_ID,
    // 业务鉴权使用手机号会话或 CloudBase 网关注入身份，不启用用户追踪。
    traceUser: false
  })
  miniProgramCloudInitialized = true
}

export async function getWechatCloudIdentity() {
  assertMiniProgramEnv()

  const platformSessionToken = getActivePlatformAccessToken()
  if (
    !IS_LOCAL_API_BASE_URL &&
    platformSessionToken &&
    typeof uni !== 'undefined' &&
    typeof uni.request === 'function'
  ) {
    const refreshedIdentity = await refreshPlatformHttpIdentity()
    const user = refreshedIdentity.user || {}
    const openid = user.wechat_openid || user._openid || user.openid || ''
    if (!openid) {
      throw new Error('auth-user-http 未返回有效 openid')
    }
    return {
      openid,
      appid: '',
      unionid: user.wechat_unionid || user.union_id || user.unionid || '',
      httpIdentityTicket: refreshedIdentity.httpIdentityTicket,
      httpIdentityTicketExpiresAt: refreshedIdentity.httpIdentityTicketExpiresAt
    }
  }

  if (!IS_LOCAL_API_BASE_URL && typeof wx.cloud.callFunction === 'function') {
    ensureWechatCloudInitialized()
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'wechat-identity',
        data: {},
        success: response => {
          const result =
            response?.result && typeof response.result === 'object' ? response.result : {}
          const openid = result.openid || ''
          if (!openid) {
            reject(new Error('wechat-identity 未返回有效 openid'))
            return
          }

          resolve({
            openid,
            appid: result.appid || '',
            unionid: result.unionid || '',
            httpIdentityTicket: result.httpIdentityTicket || ''
          })
        },
        fail: reject
      })
    })
  }

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
  ensureWechatCloudInitialized()

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
    throw new Error('微信身份接口未返回有效 openid')
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
