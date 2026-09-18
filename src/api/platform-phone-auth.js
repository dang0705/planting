import { requestHttpFunction } from '@/api/http'
import { clearPlatformSession, savePlatformSession } from '@/api/platform-session'
import { IS_LOCAL_API_BASE_URL, PLATFORM_PHONE_BOOTSTRAP_BASE_URL } from '@/api/env'

function loginWithCurrentPlatform({ force = false } = {}) {
  return new Promise((resolve, reject) => {
    uni.login({
      // 平台登录凭证只在用户主动发起手机号登录时准备，避免页面切换反复
      // 拉起抖音宿主的“一键登录”窗口。需要显式重新登录时再传 force: true。
      force,
      success: result => {
        if (result?.isLogin === false) {
          reject(new Error('当前平台未登录，请先登录后再授权手机号'))
        } else if (result?.code) {
          resolve(String(result.code))
        } else {
          reject(new Error(result?.errMsg || '未获取到平台登录凭据'))
        }
      },
      fail: error => reject(new Error(error?.errMsg || '平台登录失败，请稍后重试'))
    })
  })
}

function normalizePhoneAuthorizationDetail(eventDetail) {
  const detail =
    eventDetail && typeof eventDetail === 'object' && !Array.isArray(eventDetail) ? eventDetail : {}
  return {
    code: typeof detail.code === 'string' ? detail.code.trim() : '',
    encryptedData: typeof detail.encryptedData === 'string' ? detail.encryptedData.trim() : '',
    iv: typeof detail.iv === 'string' ? detail.iv.trim() : ''
  }
}

export async function createPlatformLoginCode(options = {}) {
  return loginWithCurrentPlatform(options)
}

export async function authorizePlatformPhone({ loginCode, eventDetail = {} }) {
  const detail = normalizePhoneAuthorizationDetail(eventDetail)
  let data = null
  // #ifdef MP-TOUTIAO
  data = {
    platform: 'douyin_mp',
    loginCode,
    phoneCode: detail.code,
    encryptedData: detail.encryptedData,
    iv: detail.iv
  }
  // #endif
  // #ifdef MP-XHS
  data = {
    platform: 'xiaohongshu_mp',
    loginCode,
    encryptedData: detail.encryptedData,
    iv: detail.iv
  }
  // #endif
  if (!data?.loginCode || (!data.phoneCode && !data.encryptedData)) {
    throw new Error('未获取到手机号授权凭据')
  }

  clearPlatformSession()
  const functionPath = IS_LOCAL_API_BASE_URL
    ? 'platform-phone-bootstrap-http/auth/platform-phone'
    : 'auth/platform-phone'
  const result = await requestHttpFunction(functionPath, {
    method: 'POST',
    auth: false,
    baseUrl: IS_LOCAL_API_BASE_URL ? undefined : PLATFORM_PHONE_BOOTSTRAP_BASE_URL,
    body: { action: 'platformPhoneLogin', data }
  })
  if (Number(result?.code) !== 200 || !result?.data?.session) {
    throw new Error(result?.message || '手机号登录失败')
  }
  savePlatformSession(result.data.session)
  return result.data.user
}
