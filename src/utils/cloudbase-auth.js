import cloudbase from '@cloudbase/js-sdk'
// import { registerAuth } from '@cloudbase/js-sdk/miniprogram_dist/auth'
// registerAuth(cloudbase)
export const CLOUDBASE_ENV_ID = 'cloud1-2grufevs395a9d5e'

let cloudbaseApp = null
let authInstance = null
let signInPromise = null

function assertMiniProgramEnv() {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('CloudBase Auth 仅支持已初始化 wx.cloud 的微信小程序环境')
  }
}

function signInWithOpenId(auth) {
  if (typeof auth.signInWithOpenId === 'function') {
    return auth.signInWithOpenId({ refreshToken: true })
  }

  if (typeof auth.signInWithWechat === 'function') {
    return auth.signInWithWechat({})
  }

  throw new Error('当前 @cloudbase/js-sdk 不支持小程序 OpenID 静默登录')
}

export function getCloudbaseApp() {
  assertMiniProgramEnv()

  if (!cloudbaseApp) {
    cloudbaseApp = cloudbase.init({
      env: CLOUDBASE_ENV_ID,
      wxCloud: wx.cloud
    })
  }

  return cloudbaseApp
}

export function getCloudbaseAuth() {
  if (!authInstance) {
    authInstance = getCloudbaseApp().auth({
      persistence: 'local'
    })
  }

  return authInstance
}

export async function ensureCloudbaseLogin({ force = false } = {}) {
  const auth = getCloudbaseAuth()

  if (!force) {
    try {
      const loginState = await auth.getLoginState()
      if (loginState?.user) {
        return auth
      }
    } catch (error) {
      console.warn('检查 CloudBase 登录态失败，将尝试重新登录:', error)
    }
  }

  if (!signInPromise || force) {
    signInPromise = Promise.resolve(signInWithOpenId(auth)).finally(() => {
      signInPromise = null
    })
  }

  await signInPromise
  return auth
}

export async function getCloudbaseAccessToken({ forceRefresh = false } = {}) {
  const auth = await ensureCloudbaseLogin()

  try {
    const tokenInfo = await auth.getAccessToken()
    if (!tokenInfo?.accessToken) {
      throw new Error('未获取到 CloudBase access token')
    }
    return tokenInfo.accessToken
  } catch (error) {
    if (!forceRefresh) {
      const retryAuth = await ensureCloudbaseLogin({ force: true })
      const tokenInfo = await retryAuth.getAccessToken()
      if (tokenInfo?.accessToken) {
        return tokenInfo.accessToken
      }
    }

    throw error
  }
}

export async function getCloudbaseAuthHeader(options) {
  const accessToken = await getCloudbaseAccessToken(options)
  return {
    Authorization: `Bearer ${accessToken}`
  }
}
