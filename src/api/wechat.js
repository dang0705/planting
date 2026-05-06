/**
 * 微信登录 API
 * 集成微信登录、获取手机号等功能
 */
import {
  getCloudbaseAccessToken,
  getCloudbaseUserIdentity,
  getWechatPhoneProfile
} from '@/utils/cloudbase-auth'
import { executeAuthUserMutation } from '@/vue-query/auth/mutations/user.js'
import { fetchAuthUserByOpenidQuery } from '@/vue-query/auth/queries/user.js'

export async function wechatLogin() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: res => {
        if (res.code) {
          resolve(res.code)
        } else {
          reject(new Error('获取登录 code 失败'))
        }
      },
      fail: err => {
        reject(err)
      }
    })
  })
}

export async function getAccessToken() {
  try {
    return await getCloudbaseAccessToken()
  } catch (error) {
    console.error('获取 access token 失败:', error)
    throw error
  }
}

export async function getUserInfo() {
  return new Promise((resolve, reject) => {
    wx.getUserInfo({
      success: res => {
        resolve(res.userInfo)
      },
      fail: err => {
        reject(err)
      }
    })
  })
}

export async function getPhoneNumber(e) {
  if (e.detail.code) {
    return {
      code: e.detail.code,
      errMsg: e.detail.errMsg
    }
  }
  throw new Error(e.detail.errMsg || '获取手机号失败')
}

export async function loginWithCode() {
  try {
    const identity = await getCloudbaseUserIdentity()
    const result = await executeAuthUserMutation({
      method: 'POST',
      action: 'wechatLogin',
      data: identity
    })

    if (result.code === 200) {
      return result.data
    }
    throw new Error(result.message || '登录失败')
  } catch (error) {
    console.error('微信登录失败:', error)
    throw error
  }
}

export async function loginWithPhone(phoneCode) {
  try {
    const identity = await getCloudbaseUserIdentity()
    const phoneProfile = await getWechatPhoneProfile({
      code: typeof phoneCode === 'string' ? phoneCode : phoneCode?.code || '',
      cloudId: typeof phoneCode === 'object' ? phoneCode?.cloudId || phoneCode?.cloudID || '' : ''
    })

    const result = await executeAuthUserMutation({
      method: 'POST',
      action: 'phoneLogin',
      data: identity
        ? {
            ...identity,
            phoneNumber: phoneProfile.phoneNumber,
            countryCode: phoneProfile.countryCode,
            phoneSource: 'wechat_phone_bridge'
          }
        : {
            phoneNumber: phoneProfile.phoneNumber,
            countryCode: phoneProfile.countryCode,
            phoneSource: 'wechat_phone_bridge'
          }
    })

    if (result.code === 200) {
      return result.data
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
