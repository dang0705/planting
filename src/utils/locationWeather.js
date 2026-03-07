/**
 * 位置授权和天气获取工具
 * 简化流程，确保用户授权后立即显示城市和天气信息
 */

import { getWeatherInfo, getCurrentLocation } from '@/api/weather'

/**
 * 一键获取位置和天气信息
 * @returns {Promise} 返回位置和天气信息
 */
export async function getLocationAndWeather() {
  try {
    console.log('开始获取位置和天气信息...')
    
    // 1. 直接获取当前位置（系统会自动处理权限）
    const location = await getCurrentLocation()
    console.log('位置信息获取成功:', location)
    
    // 2. 立即获取天气信息
    const weather = await getWeatherInfo({
      lat: location.latitude,
      lng: location.longitude,
      useSystemCache: false
    })
    console.log('天气信息获取成功:', weather)
    
    return {
      location: {
        province: location.province,
        city: location.city,
        district: location.district,
        latitude: location.latitude,
        longitude: location.longitude
      },
      weather: weather
    }
  } catch (error) {
    console.error('获取位置和天气失败:', error)
    
    // 返回默认数据，确保界面不会卡死
    return {
      location: {
        province: '',
        city: '当前位置',
        district: '',
        latitude: 0,
        longitude: 0
      },
      weather: {
        temperature: 20,
        humidity: 60,
        weather: '晴',
        cached: false,
        updatedAt: new Date().toISOString(),
        isFallback: true
      }
    }
  }
}

/**
 * 检查位置权限状态
 * @returns {Promise} 返回权限状态
 */
export async function checkPermissionStatus() {
  return new Promise(resolve => {
    uni.getSetting({
      success: res => {
        const authSetting = res.authSetting
        if (authSetting['scope.userLocation'] === true) {
          resolve('authorized')
        } else {
          resolve('notAuthorized')
        }
      },
      fail: () => resolve('unknown')
    })
  })
}

/**
 * 直接请求位置权限（简化版本）
 * @returns {Promise} 返回授权结果
 */
export async function requestPermission() {
  return new Promise((resolve, reject) => {
    uni.authorize({
      scope: 'scope.userLocation',
      success: () => {
        console.log('位置权限授权成功')
        resolve(true)
      },
      fail: (err) => {
        console.log('位置权限授权失败:', err)
        
        // 如果用户拒绝，引导去设置
        if (err.errMsg.includes('auth deny')) {
          uni.showModal({
            title: '位置权限',
            content: '需要获取您的位置信息来显示天气，是否去设置页面开启位置权限？',
            showCancel: true,
            confirmText: '去设置',
            cancelText: '取消',
            success: (modalRes) => {
              if (modalRes.confirm) {
                uni.openSetting({
                  success: (settingRes) => {
                    const settingAuth = settingRes.authSetting
                    if (settingAuth['scope.userLocation'] === true) {
                      resolve(true)
                    } else {
                      reject(new Error('用户拒绝授权'))
                    }
                  },
                  fail: () => reject(new Error('打开设置页面失败'))
                })
              } else {
                reject(new Error('用户取消授权'))
              }
            }
          })
        } else {
          reject(err)
        }
      }
    })
  })
}