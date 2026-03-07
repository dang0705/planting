/**
 * 天气 API
 * 获取实时天气信息和位置信息
 */

import { WEATHER_CONFIG } from '@/config/weather'

/**
 * 检查位置权限状态
 * @returns {Promise} 返回权限状态
 */
export async function checkLocationPermission() {
  return new Promise(resolve => {
    uni.getSetting({
      success: res => {
        const authSetting = res.authSetting
        if (authSetting['scope.userLocation'] === undefined) {
          // 未请求过权限
          resolve('notRequested')
        } else if (authSetting['scope.userLocation'] === true) {
          // 已授权
          resolve('authorized')
        } else {
          // 已拒绝
          resolve('denied')
        }
      },
      fail: () => {
        resolve('unknown')
      }
    })
  })
}

/**
 * 请求位置权限
 * @returns {Promise} 返回授权结果
 */
export async function requestLocationPermission() {
  return new Promise((resolve, reject) => {
    // 先检查当前权限状态
    uni.getSetting({
      success: res => {
        const authSetting = res.authSetting

        // 如果权限已经被拒绝，引导用户去设置页面
        if (authSetting['scope.userLocation'] === false) {
          uni.showModal({
            title: '位置权限',
            content: '需要获取您的位置信息来显示天气，是否去设置页面开启位置权限？',
            showCancel: true,
            confirmText: '去设置',
            cancelText: '取消',
            success: modalRes => {
              if (modalRes.confirm) {
                // 打开设置页面
                uni.openSetting({
                  success: settingRes => {
                    const settingAuth = settingRes.authSetting
                    if (settingAuth['scope.userLocation'] === true) {
                      resolve(true) // 用户在设置页面授权成功
                    } else {
                      reject(new Error('用户拒绝授权'))
                    }
                  },
                  fail: () => {
                    reject(new Error('打开设置页面失败'))
                  }
                })
              } else {
                reject(new Error('用户取消授权'))
              }
            }
          })
        } else {
          // 直接请求权限
          uni.authorize({
            scope: 'scope.userLocation',
            success: () => {
              resolve(true)
            },
            fail: err => {
              // 如果用户拒绝，引导用户去设置页面
              if (err.errMsg.includes('auth deny')) {
                uni.showModal({
                  title: '位置权限',
                  content: '需要获取您的位置信息来显示天气，是否去设置页面开启位置权限？',
                  showCancel: true,
                  confirmText: '去设置',
                  cancelText: '取消',
                  success: modalRes => {
                    if (modalRes.confirm) {
                      uni.openSetting({
                        success: settingRes => {
                          const settingAuth = settingRes.authSetting
                          if (settingAuth['scope.userLocation'] === true) {
                            resolve(true) // 用户在设置页面授权成功
                          } else {
                            reject(new Error('用户拒绝授权'))
                          }
                        },
                        fail: () => {
                          reject(new Error('打开设置页面失败'))
                        }
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
        }
      },
      fail: () => {
        // 如果获取设置失败，直接尝试授权
        uni.authorize({
          scope: 'scope.userLocation',
          success: () => {
            resolve(true)
          },
          fail: err => {
            reject(err)
          }
        })
      }
    })
  })
}

/**
 * 打开设置页面引导用户授权
 * @returns {Promise}
 */
export async function openSettingForLocation() {
  return new Promise(resolve => {
    uni.openSetting({
      success: res => {
        const authSetting = res.authSetting
        if (authSetting['scope.userLocation'] === true) {
          resolve(true)
        } else {
          resolve(false)
        }
      },
      fail: () => {
        resolve(false)
      }
    })
  })
}

/**
 * 获取用户当前位置
 * @returns {Promise} 返回位置信息
 */
export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    // 先检查权限状态，确保有权限
    uni.getSetting({
      success: settingRes => {
        const authSetting = settingRes.authSetting
        if (authSetting['scope.userLocation'] !== true) {
          reject(new Error('auth_denied'))
          return
        }

        // 有权限，获取位置
        uni.getLocation({
          type: 'gcj02',
          success: async res => {
            try {
              console.log('获取位置成功，经纬度:', res.latitude, res.longitude)
              // 根据经纬度获取城市信息
              const cityInfo = await getCityNameByLocation(res.latitude, res.longitude)
              console.log('获取城市信息成功:', cityInfo)
              resolve({
                latitude: res.latitude,
                longitude: res.longitude,
                ...cityInfo
              })
            } catch (error) {
              console.error('获取城市信息失败:', error)
              // 如果获取城市信息失败，使用默认位置信息
              resolve({
                latitude: res.latitude,
                longitude: res.longitude,
                province: '',
                city: '当前位置',
                district: ''
              })
            }
          },
          fail: err => {
            console.error('获取位置失败:', err)

            // 根据错误类型提供更友好的错误信息
            if (err.errMsg && err.errMsg.includes('auth deny')) {
              reject(new Error('auth_denied'))
            } else if (err.errMsg && err.errMsg.includes('fail')) {
              reject(new Error('location_failed'))
            } else {
              reject(err)
            }
          }
        })
      },
      fail: () => {
        reject(new Error('无法获取权限设置'))
      }
    })
  })
}

/**
 * 根据经纬度获取城市名称
 * @param {number} latitude - 纬度
 * @param {number} longitude - 经度
 * @returns {Promise} 返回城市信息
 */
export function getCityNameByLocation(latitude, longitude) {
  return new Promise(resolve => {
    // 使用腾讯地图免费API进行反向地理编码
    wx.request({
      url: `https://apis.map.qq.com/ws/geocoder/v1/`,
      data: {
        location: `${latitude},${longitude}`,
        key: 'OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77',
        output: 'json'
      },
      success: res => {
        const data = res.data
        if (data.status === 0 && data.result) {
          const addressComponent = data.result.address_component
          resolve({
            province: addressComponent.province || '',
            city: addressComponent.city || addressComponent.district || '当前位置',
            district: addressComponent.district || ''
          })
        } else {
          // 如果API调用失败，返回默认值
          resolve({
            province: '',
            city: '当前位置',
            district: ''
          })
        }
      },
      fail: () => {
        // 如果请求失败，返回默认值
        resolve({
          province: '',
          city: '当前位置',
          district: ''
        })
      }
    })
  })
}

/**
 * 获取天气信息
 * @param {Object} options - 选项
 * @param {number} options.lat - 纬度
 * @param {number} options.lng - 经度
 * @param {boolean} options.useCache - 是否使用缓存（可选，默认使用全局配置）
 * @returns {Promise} 返回天气信息
 */
export async function getWeatherInfo(options = {}) {
  try {
    const { lat, lng, useCache = WEATHER_CONFIG.USE_CACHE } = options

    console.log(
      `🔴 [天气API] 缓存开关: ${useCache ? '✅ 启用' : '❌ 禁用'} (全局配置: ${WEATHER_CONFIG.USE_CACHE})`
    )
    console.log('🔴 [天气API] 请求参数:', { lat, lng, useCache })

    const result = await wx.cloud.callFunction({
      name: 'getWeather',
      data: { lat, lng, useCache }
    })

    console.log('✅ [天气API] 云函数响应:', result)

    if (result.result.code === 200) {
      const data = result.result.data

      console.log('📊 [天气数据] 温度:', data.temperature)
      console.log('📊 [天气数据] 湿度:', data.humidity)
      console.log('📊 [天气数据] 天气:', data.weather)
      console.log('📊 [天气数据] 体感温度:', data.feelsLike)
      console.log('📊 [天气数据] 风向:', data.windDir)
      console.log('📊 [天气数据] 风力:', data.windScale)
      console.log('📊 [天气数据] 是否来自缓存:', data.cached)
      console.log('📊 [天气数据] 缓存开关状态:', data.cacheEnabled)

      return data
    } else {
      throw new Error(result.result.message || '获取天气失败')
    }
  } catch (error) {
    console.error('❌ [天气API] 失败:', error)

    return {
      temperature: 20,
      humidity: 60,
      weather: '多云',
      feelsLike: 20,
      windDir: '',
      windScale: '',
      isFallback: true
    }
  }
}

/**
 * 格式化天气显示
 * @param {Object} weatherData - 天气数据
 * @returns {string} 格式化后的天气字符串
 */
export function formatWeatherDisplay(weatherData) {
  console.log('formatWeatherDisplay 接收的数据:', weatherData)

  if (!weatherData) return '🌤️ --°C 湿度: --%'

  // 支持多种字段名格式
  const temperature =
    weatherData.temperature ||
    weatherData.temp ||
    weatherData.condition?.temp ||
    weatherData.now?.temp
  const weather =
    weatherData.weather ||
    weatherData.condition?.text ||
    weatherData.now?.text ||
    weatherData.condition?.condition
  const humidity = weatherData.humidity || weatherData.now?.humidity

  console.log('提取的温度:', temperature, '天气:', weather, '湿度:', humidity)

  // 天气图标映射
  const weatherIcons = {
    晴: '☀️',
    多云: '🌤️',
    阴: '☁️',
    雨: '🌧️',
    雪: '❄️',
    雾: '🌫️',
    雷: '⛈️',
    阵雨: '🌦️',
    雷阵雨: '⛈️',
    小雨: '🌧️',
    中雨: '🌧️',
    大雨: '🌧️',
    暴雨: '🌧️'
  }

  // 获取天气图标
  let icon = '🌤️'
  if (weather) {
    for (const [key, value] of Object.entries(weatherIcons)) {
      if (weather.includes(key)) {
        icon = value
        break
      }
    }
  }

  // 格式化温度
  let temp = '--°C'
  if (temperature !== undefined && temperature !== null) {
    temp = `${Math.round(Number(temperature))}°C`
  }

  // 格式化湿度
  let hum = '--%'
  if (humidity !== undefined && humidity !== null) {
    hum = `${Math.round(Number(humidity))}%`
  }

  const result = `${icon} ${temp} 湿度: ${hum}`
  console.log('格式化结果:', result)
  return result
}
