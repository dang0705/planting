/**
 * 微信登录 API
 * 集成微信登录、获取手机号等功能
 */
import { getWechatPhoneProfile } from '@/utils/cloudbase-auth'
import { clearPlatformSession, savePlatformSession } from '@/api/platform-session'
import { requestHttpFunction } from '@/api/http'
import { executeAuthUserMutation } from '@/vue-query/auth/mutations/user.js'
import { fetchAuthUserByOpenidQuery } from '@/vue-query/auth/queries/user.js'

export async function loginWithPhone(phoneCode) {
  try {
    // 手机号授权必须以当前微信运行时身份核验，不能让旧 Bearer 会话抢占身份解析。
    clearPlatformSession()
    const phoneProfile = await getWechatPhoneProfile({
      code: typeof phoneCode === 'string' ? phoneCode : phoneCode?.code || '',
      cloudId: typeof phoneCode === 'object' ? phoneCode?.cloudId || phoneCode?.cloudID || '' : ''
    })

    const result = await requestHttpFunction('platform-phone-bootstrap-http/auth/platform-phone', {
      method: 'POST',
      auth: false,
      body: {
        action: 'platformPhoneLogin',
        data: {
          platform: 'wechat_mp',
          phoneProof: phoneProfile.phoneProof
        }
      }
    })

    if (result.code === 200) {
      savePlatformSession(result.data?.session)
      return {
        ...result.data,
        token: result.data?.session?.accessToken || ''
      }
    }
    throw new Error(result.message || '登录失败')
  } catch (error) {
    console.error('手机号登录失败:', error)
    throw error
  }
}

export async function updateUserEmail(userId, email) {
  const result = await executeAuthUserMutation({
    method: 'PATCH',
    action: 'updateEmail',
    data: {
      userId,
      email
    }
  })

  if (result.code === 200) {
    return result.data
  }
  throw new Error(result.message || '更新邮箱失败')
}

export async function updateUserPhoneNumber(userId, phoneNumber) {
  const result = await executeAuthUserMutation({
    method: 'PATCH',
    action: 'updatePhoneNumber',
    data: {
      userId,
      phoneNumber
    }
  })

  if (result.code === 200) {
    return result.data
  }
  throw new Error(result.message || '更新手机号失败')
}

export async function getUserById(userId) {
  const result = await fetchAuthUserByOpenidQuery(userId)
  if (result.code === 200) {
    return result.data
  }
  throw new Error(result.message || '获取用户信息失败')
}
