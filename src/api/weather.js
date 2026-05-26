/**
 * 天气 API
 * 获取实时天气信息和位置信息
 */

import { WEATHER_CONFIG } from '@/config/weather'
import { fetchCurrentWeatherQuery } from '@/vue-query/weather/queries/current-weather.js'

const CITY_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000
const CITY_LOOKUP_COORDINATE_PRECISION = 5
const cityLookupInflight = new Map()
const cityLookupCache = new Map()

function buildCityLookupKey(latitude, longitude) {
  const normalizedLat = Number(latitude)
  const normalizedLng = Number(longitude)
  if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) {
    return ''
  }
  return [
    normalizedLat.toFixed(CITY_LOOKUP_COORDINATE_PRECISION),
    normalizedLng.toFixed(CITY_LOOKUP_COORDINATE_PRECISION)
  ].join(',')
}

function buildFallbackCityInfo() {
  return {
    province: '',
    city: '当前位置',
    district: ''
  }
}

function isResolvedCityName(city = '') {
  const normalizedCity = String(city || '').trim()
  return Boolean(normalizedCity && normalizedCity !== '当前位置')
}

function getCachedCityLookup(cacheKey = '') {
  const cached = cityLookupCache.get(cacheKey)
  if (!cached) {return null}
  if (Date.now() - Number(cached.cachedAt || 0) > CITY_LOOKUP_CACHE_TTL_MS) {
    cityLookupCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function setCachedCityLookup(cacheKey = '', value = null) {
  if (!cacheKey || !value || !isResolvedCityName(value.city)) {return}
  cityLookupCache.set(cacheKey, {
    cachedAt: Date.now(),
    value
  })
}

export async function checkLocationPermission() {
  return new Promise(resolve => {
    uni.getSetting({
      success: res => {
        const authSetting = res.authSetting
        if (authSetting['scope.userLocation'] === undefined) {
          resolve('notRequested')
        } else if (authSetting['scope.userLocation'] === true) {
          resolve('authorized')
        } else {
          resolve('denied')
        }
      },
      fail: () => {
        resolve('unknown')
      }
    })
  })
}

export async function requestLocationPermission() {
  return new Promise((resolve, reject) => {
    uni.getSetting({
      success: res => {
        const authSetting = res.authSetting

        if (authSetting['scope.userLocation'] === false) {
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
                      resolve(true)
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
          uni.authorize({
            scope: 'scope.userLocation',
            success: () => {
              resolve(true)
            },
            fail: err => {
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
                            resolve(true)
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

export async function getCurrentLocation() {
  return new Promise((resolve, reject) => {
    uni.getSetting({
      success: settingRes => {
        const authSetting = settingRes.authSetting
        if (authSetting['scope.userLocation'] !== true) {
          reject(new Error('auth_denied'))
          return
        }

        uni.getLocation({
          type: 'gcj02',
          success: async res => {
            try {
              console.log('获取位置成功，经纬度:', res.latitude, res.longitude)
              const cityInfo = await getCityNameByLocation(res.latitude, res.longitude)
              console.log('获取城市信息成功:', cityInfo)
              resolve({
                latitude: res.latitude,
                longitude: res.longitude,
                ...cityInfo
              })
            } catch (error) {
              console.error('获取城市信息失败:', error)
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

export function getCityNameByLocation(latitude, longitude) {
  const cacheKey = buildCityLookupKey(latitude, longitude)
  if (!cacheKey) {
    return Promise.resolve(buildFallbackCityInfo())
  }

  const cached = getCachedCityLookup(cacheKey)
  if (cached) {
    return Promise.resolve(cached)
  }

  const inflight = cityLookupInflight.get(cacheKey)
  if (inflight) {
    return inflight
  }

  const lookupPromise = new Promise(resolve => {
    wx.request({
      url: 'https://apis.map.qq.com/ws/geocoder/v1/',
      data: {
        location: `${latitude},${longitude}`,
        key: 'OB4BZ-D4W3U-B7VVO-4PJWW-6TKDJ-WPB77',
        output: 'json'
      },
      success: res => {
        const data = res.data
        if (data.status === 0 && data.result) {
          const addressComponent = data.result.address_component
          const cityInfo = {
            province: addressComponent.province || '',
            city: addressComponent.city || addressComponent.district || '当前位置',
            district: addressComponent.district || ''
          }
          setCachedCityLookup(cacheKey, cityInfo)
          resolve(cityInfo)
        } else {
          resolve(buildFallbackCityInfo())
        }
      },
      fail: () => {
        resolve(buildFallbackCityInfo())
      }
    })
  }).finally(() => {
    cityLookupInflight.delete(cacheKey)
  })

  cityLookupInflight.set(cacheKey, lookupPromise)
  return lookupPromise
}

export async function getWeatherInfo(options = {}) {
  try {
    const { lat, lng, city = '', province = '', useCache = WEATHER_CONFIG.USE_CACHE } = options
    const hasLat = lat !== undefined && lat !== null && lat !== ''
    const hasLng = lng !== undefined && lng !== null && lng !== ''
    const normalizedLat = hasLat ? Number(lat) : NaN
    const normalizedLng = hasLng ? Number(lng) : NaN

    if (!Number.isFinite(normalizedLat) || !Number.isFinite(normalizedLng)) {
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

    const result = await fetchCurrentWeatherQuery({
      lat: normalizedLat,
      lng: normalizedLng,
      city,
      province,
      useCache
    })

    console.log('✅ [天气API] HTTP 函数响应:', result)

    if (result.code === 200) {
      return result.data
    }
    throw new Error(result.message || '获取天气失败')
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

export function formatWeatherDisplay(weatherData) {
  console.log('formatWeatherDisplay 接收的数据:', weatherData)

  if (!weatherData) {return '🌤️ --°C 湿度: --%'}

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

  let icon = '🌤️'
  if (weather) {
    for (const [key, value] of Object.entries(weatherIcons)) {
      if (weather.includes(key)) {
        icon = value
        break
      }
    }
  }

  let temp = '--°C'
  if (temperature !== undefined && temperature !== null) {
    temp = `${Math.round(Number(temperature))}°C`
  }

  let hum = '--%'
  if (humidity !== undefined && humidity !== null) {
    hum = `${Math.round(Number(humidity))}%`
  }

  const result = `${icon} ${temp} 湿度: ${hum}`
  console.log('格式化结果:', result)
  return result
}
