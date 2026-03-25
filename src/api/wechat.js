/**
 * 微信登录 API
 * 集成微信登录、获取手机号等功能
 */
import {
  getCloudbaseAccessToken,
  getCloudbaseUserIdentity,
  getWechatPhoneProfile
} from '@/utils/cloudbase-auth'
import { requestHttpFunction } from '@/api/http'

/**
 * 微信登录
 * @returns {Promise} 返回 code 用于后端换取 openid
 */
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

/**
 * 获取 CloudBase Access Token
 * 通过 @cloudbase/js-sdk 在微信小程序内静默换取 access token
 * @returns {Promise<string>} 返回 access token
 */
export async function getAccessToken() {
  try {
    return await getCloudbaseAccessToken()
  } catch (error) {
    console.error('获取 access token 失败:', error)
    throw error
  }
}

/**
 * 获取用户信息（需要用户授权）
 * @returns {Promise} 返回用户信息
 */
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

/**
 * 获取手机号（通过 button 组件的 open-type="getPhoneNumber"）
 * 注意：这个方法需要在 button 的 @getphonenumber 事件中调用
 * @param {Object} e - 事件对象，包含 code
 * @returns {Promise} 返回手机号信息
 */
export async function getPhoneNumber(e) {
  if (e.detail.code) {
    // 返回 code，由云函数解密获取手机号
    return {
      code: e.detail.code,
      errMsg: e.detail.errMsg
    }
  } else {
    throw new Error(e.detail.errMsg || '获取手机号失败')
  }
}

/**
 * 完整的微信登录流程（使用云开发自动鉴权）
 * @returns {Promise} 返回登录结果
 */
export async function loginWithCode() {
  try {
    const identity = await getCloudbaseUserIdentity()
    const result = await requestHttpFunction('auth-user-http/auth/user', {
      method: 'POST',
      body: {
        action: 'wechatLogin',
        data: identity
      }
    })

    if (result.code === 200) {
      return result.data
    } else {
      throw new Error(result.message || '登录失败')
    }
  } catch (error) {
    console.error('微信登录失败:', error)
    throw error
  }
}

/**
 * 使用手机号登录（需要先获取手机号桥接参数）
 * @param {string|Object} phoneCode - 手机号授权 code 或桥接参数对象
 * @returns {Promise} 返回登录结果
 */
export async function loginWithPhone(phoneCode) {
  try {
    const identity = await getCloudbaseUserIdentity()
    const phoneProfile = await getWechatPhoneProfile({
      code: typeof phoneCode === 'string' ? phoneCode : phoneCode?.code || '',
      cloudId: typeof phoneCode === 'object' ? phoneCode?.cloudId || phoneCode?.cloudID || '' : ''
    })
    const result = await requestHttpFunction('auth-user-http/auth/user', {
      method: 'POST',
      body: {
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
      }
    })

    if (result.code === 200) {
      return result.data
    } else {
      throw new Error(result.message || '登录失败')
    }
  } catch (error) {
    console.error('手机号登录失败:', error)
    throw error
  }
}

/**
 * 更新用户邮箱
 * @param {string} userId 用户 ID
 * @param {string} email 邮箱
 * @returns {Promise}
 */
export async function updateUserEmail(userId, email) {
  const result = await requestHttpFunction('auth-user-http/auth/user', {
    method: 'PATCH',
    body: {
      action: 'updateEmail',
      data: {
        userId,
        email
      }
    }
  })

  if (result.code === 200) {
    return result.data
  } else {
    throw new Error(result.message || '更新邮箱失败')
  }
}

/**
 * 更新用户手机号
 * @param {string} userId 用户 ID
 * @param {string} phoneNumber 手机号
 * @returns {Promise}
 */
export async function updateUserPhoneNumber(userId, phoneNumber) {
  const result = await requestHttpFunction('auth-user-http/auth/user', {
    method: 'PATCH',
    body: {
      action: 'updatePhoneNumber',
      data: {
        userId,
        phoneNumber
      }
    }
  })

  if (result.code === 200) {
    return result.data
  } else {
    throw new Error(result.message || '更新手机号失败')
  }
}

/**
 * 获取用户信息
 * @param {string} userId 用户 ID
 * @returns {Promise}
 */
export async function getUserById(userId) {
  const result = await requestHttpFunction('auth-user-http/auth/user', {
    method: 'POST',
    body: {
      action: 'getUserByOpenid',
      data: {
        openid: userId
      }
    }
  })

  if (result.code === 200) {
    return result.data
  } else {
    throw new Error(result.message || '获取用户信息失败')
  }
}
