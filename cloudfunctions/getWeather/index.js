'use strict'

const { getUserInfo, models } = require('/opt/utils/cloudbase')
const axios = require('axios')

// 和风天气API配置
const QWEATHER_CONFIG = {
  apiUrl: 'https://n773jqqeap.re.qweatherapi.com/v7/weather/now',
  apiKey: process.env.QWEATHER_API_KEY
}

/**
 * 调用和风天气API
 */
async function fetchWeather(lat, lng) {
  const url = `${QWEATHER_CONFIG.apiUrl}?location=${lng},${lat}&key=${QWEATHER_CONFIG.apiKey}`

  console.log(`[天气API] 请求位置: 纬度=${lat}, 经度=${lng}`)

  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'Accept-Encoding': 'gzip, deflate',
      'User-Agent': 'CloudBase-Weather/1.0'
    }
  })

  console.log(`[天气API] 响应状态: ${response.status}`)

  if (response.data.code !== '200') {
    throw new Error(`和风天气API错误: code=${response.data.code}`)
  }

  return response.data
}

/**
 * 格式化天气数据
 */
function formatWeatherData(apiData) {
  const now = apiData.now || {}

  return {
    temperature: parseInt(now.temp) || 0,
    humidity: parseInt(now.humidity) || 0,
    weather: now.text || '未知',
    feelsLike: parseInt(now.feelsLike) || 0,
    windDir: now.windDir || '',
    windScale: now.windScale || '',
    windSpeed: now.windSpeed || '',
    pressure: now.pressure || '',
    visibility: now.vis || '',
    updateTime: now.obsTime || new Date().toISOString(),
    raw: {
      temp: now.temp,
      humidity: now.humidity,
      text: now.text,
      icon: now.icon,
      windDir: now.windDir,
      windScale: now.windScale,
      windSpeed: now.windSpeed,
      pressure: now.pressure,
      vis: now.vis,
      feelsLike: now.feelsLike,
      wind360: now.wind360,
      precip: now.precip,
      cloud: now.cloud,
      dew: now.dew
    }
  }
}

/**
 * 计算次日0点时间
 */
function getNextMidnight() {
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return tomorrow
}

/**
 * 从MySQL缓存获取天气
 */
async function getCachedWeather(openid) {
  try {
    const sql =
      'SELECT weather_data, expires_at FROM weather_cache WHERE _openid = {{openid}} LIMIT 1'
    const result = await models.$runSQL(sql, { openid })
    const rows = result?.data?.executeResultList || []

    if (rows.length === 0) {
      console.log(`[缓存] 无缓存`)
      return null
    }

    const cache = rows[0]
    const now = new Date()
    const expiresAt = new Date(cache.expires_at.replace(' ', 'T') + 'Z')

    if (expiresAt > now) {
      console.log(`[缓存] 使用缓存，过期时间: ${expiresAt.toLocaleString()}`)
      return JSON.parse(cache.weather_data)
    }

    console.log(`[缓存] 已过期`)
    return null
  } catch (error) {
    console.error('[缓存] 查询失败:', error)
    return null
  }
}

/**
 * 保存天气到MySQL缓存
 */
async function saveCachedWeather(openid, weatherData) {
  try {
    const now = new Date()
    const expiresAt = getNextMidnight()

    const formatDate = date =>
      date
        .toISOString()
        .replace('T', ' ')
        .replace(/\.\d{3}Z$/, '')

    const checkSql = 'SELECT _id FROM weather_cache WHERE _openid = {{openid}} LIMIT 1'
    const checkResult = await models.$runSQL(checkSql, { openid })
    const exists = (checkResult?.data?.executeResultList || []).length > 0

    if (exists) {
      const updateSql =
        'UPDATE weather_cache SET weather_data = {{data}}, updated_at = {{updatedAt}}, expires_at = {{expiresAt}} WHERE _openid = {{openid}}'
      await models.$runSQL(updateSql, {
        data: JSON.stringify(weatherData),
        updatedAt: formatDate(now),
        expiresAt: formatDate(expiresAt),
        openid
      })
    } else {
      const insertSql =
        'INSERT INTO weather_cache (_openid, weather_data, updated_at, expires_at) VALUES ({{openid}}, {{data}}, {{updatedAt}}, {{expiresAt}})'
      await models.$runSQL(insertSql, {
        openid,
        data: JSON.stringify(weatherData),
        updatedAt: formatDate(now),
        expiresAt: formatDate(expiresAt)
      })
    }

    console.log(`[缓存] 已保存，过期时间: ${expiresAt.toLocaleString()}`)
  } catch (error) {
    console.error('[缓存] 保存失败:', error)
  }
}

/**
 * 主函数
 */
exports.main = async (event, context) => {
  console.log('[天气服务] ========== 开始 ==========')
  console.log('[请求参数]', JSON.stringify(event))

  try {
    const userInfo = getUserInfo(context)
    const openid = userInfo.OPENID || 'anonymous'

    // 🔴 位置参数必须由前端提供，不使用默认值
    const lat = event.lat
    const lng = event.lng

    if (!lat || !lng) {
      throw new Error('缺少位置参数：lat 和 lng 是必需的')
    }

    const useCache = event.useCache !== false // 默认启用缓存

    console.log(`[位置] 纬度=${lat}, 经度=${lng}`)
    console.log(`[缓存开关] ${useCache ? '✅ 启用' : '❌ 禁用'}`)

    let weatherData = null
    let fromCache = false

    // 1. 如果启用缓存，尝试从缓存获取
    if (useCache) {
      weatherData = await getCachedWeather(openid)
      if (weatherData) {
        fromCache = true
      }
    }

    // 2. 缓存未命中或禁用缓存，调用API
    if (!weatherData) {
      console.log('[天气服务] 调用和风天气API')
      const apiData = await fetchWeather(lat, lng)
      weatherData = formatWeatherData(apiData)

      // 如果启用缓存，保存到缓存
      if (useCache) {
        await saveCachedWeather(openid, weatherData)
      }
    }

    const response = {
      code: 200,
      message: '获取成功',
      data: {
        ...weatherData,
        cached: fromCache,
        cacheEnabled: useCache,
        timestamp: new Date().toISOString()
      }
    }

    console.log('[天气服务] ========== 完成 ==========')
    console.log(`[数据来源] ${fromCache ? '🔵 MySQL缓存' : '🟢 和风天气API'}`)
    console.log(
      `[返回数据] 温度=${weatherData.temperature}℃ 湿度=${weatherData.humidity}% 天气=${weatherData.weather}`
    )
    console.log(`[原始湿度] raw.humidity=${weatherData.raw?.humidity}`)
    console.log(`[缓存状态] cached=${fromCache}, cacheEnabled=${useCache}`)

    return response
  } catch (error) {
    console.error('[天气服务] ========== 错误 ==========')
    console.error('错误:', error.message)

    return {
      code: 500,
      message: error.message || '获取天气失败',
      data: null
    }
  }
}
