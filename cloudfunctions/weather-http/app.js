'use strict'

const crypto = require('crypto')
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
const WEATHER_CITY_CACHE_TTL_MS = 24 * 60 * 60 * 1000
const INVALID_CITY_CACHE_NAMES = new Set([
  '',
  '当前位置',
  '定位失败',
  '位置获取失败',
  '位置权限未授权'
])

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '')
}

function normalizeCityName(value = '') {
  const city = normalizeText(value)
  return INVALID_CITY_CACHE_NAMES.has(city) ? '' : city
}

function buildCityCacheContext({ city = '', province = '' } = {}) {
  const normalizedCity = normalizeCityName(city)
  if (!normalizedCity) {
    return {
      cacheKey: '',
      city: '',
      province: normalizeText(province)
    }
  }

  return {
    cacheKey: `weather:city:${normalizedCity}`,
    city: normalizedCity,
    province: normalizeText(province)
  }
}

function buildCityCacheOpenid(cacheKey = '') {
  const hash = crypto.createHash('sha1').update(String(cacheKey || '')).digest('hex')
  return `city:${hash.slice(0, 40)}`
}

function formatDate(date) {
  return date.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '')
}

function parseDbDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {return null}
  return new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`)
}

function getCityCacheExpiresAt() {
  return new Date(Date.now() + WEATHER_CITY_CACHE_TTL_MS)
}

function isCityCacheSchemaError(error) {
  const message = String(error?.message || error || '')
  return (
    message.includes('Unknown column') ||
    message.includes('cache_key') ||
    message.includes('cache_scope')
  )
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

async function getCachedWeatherByOpenid(openid) {
  try {
    const result = await models.$runSQL(
      'SELECT weather_data, updated_at, expires_at FROM weather_cache WHERE _openid = {{openid}} ORDER BY updated_at DESC LIMIT 1',
      { openid }
    )
    const rows = result?.data?.executeResultList || []
    if (!rows.length) {return null}

    const cache = rows[0]
    const expiresAt = parseDbDate(cache.expires_at)
    if (expiresAt > new Date()) {
      return {
        weatherData: JSON.parse(cache.weather_data),
        cachedAt: cache.updated_at || '',
        expiresAt: cache.expires_at || ''
      }
    }
    return null
  } catch (error) {
    console.error('读取天气缓存失败:', error)
    return null
  }
}

async function getCachedWeatherByCity(cacheKey = '') {
  if (!cacheKey) {return null}

  try {
    const result = await models.$runSQL(
      `
        SELECT weather_data, updated_at, expires_at, city, province
        FROM weather_cache
        WHERE cache_scope = 'city'
          AND cache_key = {{cacheKey}}
          AND expires_at > CURRENT_TIMESTAMP
        ORDER BY updated_at DESC
        LIMIT 1
      `,
      { cacheKey }
    )
    const rows = result?.data?.executeResultList || []
    if (!rows.length) {return null}

    const cache = rows[0]
    return {
      weatherData: JSON.parse(cache.weather_data),
      cachedAt: cache.updated_at || '',
      expiresAt: cache.expires_at || '',
      city: cache.city || '',
      province: cache.province || ''
    }
  } catch (error) {
    if (isCityCacheSchemaError(error)) {
      console.warn('天气城市缓存字段未就绪，降级为用户缓存:', error.message)
      return null
    }
    console.error('读取城市天气缓存失败:', error)
    return null
  }
}

async function saveCachedWeatherForOpenid(openid, weatherData, expiresAt = getNextMidnight()) {
  const now = new Date()

  const checkResult = await models.$runSQL(
    'SELECT _id FROM weather_cache WHERE _openid = {{openid}} ORDER BY updated_at DESC LIMIT 1',
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

async function saveCachedWeatherForCity(cacheContext = {}, weatherData) {
  const cacheKey = String(cacheContext.cacheKey || '').trim()
  if (!cacheKey) {return null}

  const now = new Date()
  const expiresAt = getCityCacheExpiresAt()
  const payload = {
    cacheOpenid: buildCityCacheOpenid(cacheKey),
    cacheKey,
    cacheScope: 'city',
    city: cacheContext.city || '',
    province: cacheContext.province || '',
    data: JSON.stringify(weatherData),
    updatedAt: formatDate(now),
    expiresAt: formatDate(expiresAt)
  }

  try {
    const checkResult = await models.$runSQL(
      "SELECT _id FROM weather_cache WHERE cache_scope = 'city' AND cache_key = {{cacheKey}} LIMIT 1",
      { cacheKey }
    )
    const row = (checkResult?.data?.executeResultList || [])[0]

    if (row?._id) {
      await models.$runSQL(
        `
          UPDATE weather_cache
          SET weather_data = {{data}},
              updated_at = {{updatedAt}},
              expires_at = {{expiresAt}},
              city = {{city}},
              province = {{province}}
          WHERE _id = {{id}}
        `,
        { ...payload, id: row._id }
      )
      return {
        cachedAt: payload.updatedAt,
        expiresAt: payload.expiresAt
      }
    }

    await models.$runSQL(
      `
        INSERT INTO weather_cache (
          _openid, cache_scope, cache_key, city, province, weather_data, updated_at, expires_at
        ) VALUES (
          {{cacheOpenid}}, {{cacheScope}}, {{cacheKey}}, {{city}}, {{province}}, {{data}}, {{updatedAt}}, {{expiresAt}}
        )
      `,
      payload
    )
    return {
      cachedAt: payload.updatedAt,
      expiresAt: payload.expiresAt
    }
  } catch (error) {
    if (isCityCacheSchemaError(error)) {
      console.warn('写入城市天气缓存失败，可能未执行 schema migration:', error.message)
      return null
    }
    console.error('写入城市天气缓存失败:', error)
    return null
  }
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
    const hasCityPayload =
      Object.prototype.hasOwnProperty.call(payload, 'city') ||
      Object.prototype.hasOwnProperty.call(payload, 'cityName')
    const city = payload.city || payload.cityName || ''
    const province = payload.province || ''
    const useCache = payload.useCache !== false && payload.useCache !== 'false'
    const cityCacheContext = buildCityCacheContext({ city, province })

    console.log('weather-http payload:', {
      method,
      path,
      query: request.query || {},
      body: request.body || {},
      resolvedPayload: payload || {},
      lat,
      lng,
      city: cityCacheContext.city,
      province: cityCacheContext.province,
      cityCacheEnabled: Boolean(cityCacheContext.cacheKey),
      openid
    })

    if (!lat || !lng) {
      return jsonResponse(400, { code: 400, message: '缺少位置参数：lat 和 lng', data: null })
    }

    let weatherData = null
    let fromCache = false
    let cacheScope = ''
    let cacheMeta = null
    if (useCache) {
      const cityCache = await getCachedWeatherByCity(cityCacheContext.cacheKey)
      if (cityCache?.weatherData) {
        weatherData = cityCache.weatherData
        fromCache = true
        cacheScope = 'city'
        cacheMeta = {
          cachedAt: cityCache.cachedAt,
          expiresAt: cityCache.expiresAt
        }
        await saveCachedWeatherForOpenid(openid, weatherData, parseDbDate(cityCache.expiresAt) || getCityCacheExpiresAt())
      }
    }

    if (!weatherData && useCache && !cityCacheContext.cacheKey && !hasCityPayload) {
      const userCache = await getCachedWeatherByOpenid(openid)
      if (userCache?.weatherData) {
        weatherData = userCache.weatherData
        fromCache = true
        cacheScope = 'user'
        cacheMeta = {
          cachedAt: userCache.cachedAt,
          expiresAt: userCache.expiresAt
        }
      }
    }

    if (!weatherData) {
      weatherData = formatWeatherData(await fetchWeather(lat, lng))
      if (useCache) {
        const cityCacheMeta = await saveCachedWeatherForCity(cityCacheContext, weatherData)
        await saveCachedWeatherForOpenid(
          openid,
          weatherData,
          cityCacheMeta?.expiresAt ? parseDbDate(cityCacheMeta.expiresAt) : getNextMidnight()
        )
        cacheScope = cityCacheMeta ? 'city_refresh' : 'user_refresh'
        cacheMeta = cityCacheMeta || null
      }
    }

    return jsonResponse(200, {
      code: 200,
      message: '获取成功',
      data: {
        ...weatherData,
        cached: fromCache,
        cacheEnabled: useCache,
        cacheScope,
        city: cityCacheContext.city || String(city || '').trim(),
        province: cityCacheContext.province,
        cachedAt: cacheMeta?.cachedAt || '',
        expiresAt: cacheMeta?.expiresAt || '',
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
