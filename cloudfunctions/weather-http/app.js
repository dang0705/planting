'use strict'

const axios = require('axios')
const { models } = require('/opt/utils/cloudbase')
const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv,
  resolveHttpUserInfo
} = require('/opt/utils/http')

const QWEATHER_CONFIG = {
  apiUrl: 'https://n773jqqeap.re.qweatherapi.com/v7/weather/now',
  apiKey: process.env.QWEATHER_API_KEY
}

async function fetchWeather(lat, lng) {
  if (!QWEATHER_CONFIG.apiKey) {
    throw new Error('缺少环境变量 QWEATHER_API_KEY')
  }
  const url = `${QWEATHER_CONFIG.apiUrl}?location=${lng},${lat}&key=${QWEATHER_CONFIG.apiKey}`
  const response = await axios.get(url, {
    timeout: 10000,
    headers: {
      'Accept-Encoding': 'gzip, deflate',
      'User-Agent': 'CloudBase-Weather/1.0'
    }
  })

  if (response.data.code !== '200') {
    throw new Error(`和风天气API错误: code=${response.data.code}`)
  }

  return response.data
}

function formatWeatherData(apiData) {
  const now = apiData.now || {}
  return {
    temperature: parseInt(now.temp, 10) || 0,
    humidity: parseInt(now.humidity, 10) || 0,
    weather: now.text || '未知',
    feelsLike: parseInt(now.feelsLike, 10) || 0,
    windDir: now.windDir || '',
    windScale: now.windScale || '',
    windSpeed: now.windSpeed || '',
    pressure: now.pressure || '',
    visibility: now.vis || '',
    updateTime: now.obsTime || new Date().toISOString(),
    raw: now
  }
}

function getNextMidnight() {
  const tomorrow = new Date()
  tomorrow.setHours(24, 0, 0, 0)
  return tomorrow
}

async function getCachedWeather(openid) {
  try {
    const result = await models.$runSQL(
      'SELECT weather_data, expires_at FROM weather_cache WHERE _openid = {{openid}} LIMIT 1',
      { openid }
    )
    const rows = result?.data?.executeResultList || []
    if (!rows.length) return null

    const cache = rows[0]
    const expiresAt = new Date(cache.expires_at.replace(' ', 'T') + 'Z')
    if (expiresAt > new Date()) {
      return JSON.parse(cache.weather_data)
    }
    return null
  } catch (error) {
    console.error('读取天气缓存失败:', error)
    return null
  }
}

async function saveCachedWeather(openid, weatherData) {
  const now = new Date()
  const expiresAt = getNextMidnight()
  const formatDate = date => date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')

  const checkResult = await models.$runSQL(
    'SELECT _id FROM weather_cache WHERE _openid = {{openid}} LIMIT 1',
    { openid }
  )
  const exists = (checkResult?.data?.executeResultList || []).length > 0

  if (exists) {
    await models.$runSQL(
      'UPDATE weather_cache SET weather_data = {{data}}, updated_at = {{updatedAt}}, expires_at = {{expiresAt}} WHERE _openid = {{openid}}',
      {
        data: JSON.stringify(weatherData),
        updatedAt: formatDate(now),
        expiresAt: formatDate(expiresAt),
        openid
      }
    )
    return
  }

  await models.$runSQL(
    'INSERT INTO weather_cache (_openid, weather_data, updated_at, expires_at) VALUES ({{openid}}, {{data}}, {{updatedAt}}, {{expiresAt}})',
    {
      openid,
      data: JSON.stringify(weatherData),
      updatedAt: formatDate(now),
      expiresAt: formatDate(expiresAt)
    }
  )
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'

  try {
    if (path.includes('/weather/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (!path.includes('/weather/current')) {
      return notFound(path)
    }

    if (!['GET', 'POST'].includes(method)) {
      return methodNotAllowed(method)
    }

    const payload = method === 'GET' ? request.query : request.body
    const userInfo = await resolveHttpUserInfo(request.headers, payload, context)
    const openid = userInfo?.openid || 'anonymous'
    const lat = payload.lat
    const lng = payload.lng
    const useCache = payload.useCache !== false && payload.useCache !== 'false'

    console.log('weather-http payload:', {
      method,
      path,
      query: request.query || {},
      body: request.body || {},
      resolvedPayload: payload || {},
      lat,
      lng,
      openid
    })

    if (!lat || !lng) {
      return jsonResponse(400, { code: 400, message: '缺少位置参数：lat 和 lng', data: null })
    }

    let weatherData = null
    let fromCache = false
    if (useCache) {
      weatherData = await getCachedWeather(openid)
      fromCache = Boolean(weatherData)
    }

    if (!weatherData) {
      weatherData = formatWeatherData(await fetchWeather(lat, lng))
      if (useCache) {
        await saveCachedWeather(openid, weatherData)
      }
    }

    return jsonResponse(200, {
      code: 200,
      message: '获取成功',
      data: {
        ...weatherData,
        cached: fromCache,
        cacheEnabled: useCache,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('weather-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message || '获取天气失败', data: null })
  }
}

module.exports.main = (event, context) => {
  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
