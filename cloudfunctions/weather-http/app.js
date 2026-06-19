'use strict'

const {
  jsonResponse,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const { buildEnvironmentWeatherWindow } = require('./services/weather-window-service')
const {
  buildDiagnosisRecentWeatherWindow,
  buildRecentWeatherService,
  handleD0Weather24hTimerEvent,
  handleRecentWeatherIngestionRequest,
  handleRecentWeatherRequest,
  handleRecentWeatherTimerEvent,
  handleWeather24hRequest,
  isD0Weather24hTimerEvent,
  isRecentWeatherIngestionTimerEvent,
  isDiagnosisMode
} = require('./routes/recent-weather-routes')
const { listHotCitiesForClient, resolveHotCityLocation } = require('./services/hot-city-locations')

const QWEATHER_CONFIG = {
  baseUrl: process.env.QWEATHER_API_BASE_URL || 'https://n773jqqeap.re.qweatherapi.com',
  apiKey: process.env.QWEATHER_API_KEY
}
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
      city: '',
      province: normalizeText(province)
    }
  }

  return {
    city: normalizedCity,
    province: normalizeText(province)
  }
}

function buildLocalDevWeatherData() {
  return {
    temperature: 20,
    humidity: 60,
    weather: '多云',
    feelsLike: 20,
    windDir: '',
    windScale: '',
    windSpeed: '',
    pressure: '',
    visibility: '',
    updateTime: new Date().toISOString(),
    raw: {},
    isFallback: true,
    fallbackSource: 'local_dev_missing_qweather_api_key'
  }
}

async function getCurrentWeatherFromDailyArchive(payload = {}) {
  try {
    const service = buildRecentWeatherService(QWEATHER_CONFIG)
    return await service.getCurrentWeatherFromDailyArchive(payload)
  } catch (error) {
    return {
      weatherData: null,
      dailyWeatherCache: {
        cacheHit: false,
        refreshed: false,
        reason: 'daily_archive_current_failed',
        message: error.message || String(error)
      },
      message: error.message || String(error)
    }
  }
}

function asArray(value = []) {
  return Array.isArray(value) ? value : []
}

function normalizeEnvironmentContextMode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function buildEnvironmentWeatherWindowByMode(weatherWindow = null, mode = '') {
  const normalizedMode = normalizeEnvironmentContextMode(mode)
  if (normalizedMode !== 'diagnosis') {
    return weatherWindow || {}
  }

  const sourceWindow = weatherWindow && typeof weatherWindow === 'object' ? weatherWindow : {}
  const historicalDays = asArray(sourceWindow.historicalDays)
  const historicalDaysLegacy = asArray(sourceWindow.historical_days)
  const normalizedHistoricalDays = historicalDays.length ? historicalDays : historicalDaysLegacy
  const omitFields = new Set([
    'forecastDays',
    'forecast_days',
    'historical_days',
    'currentWeather',
    'daily',
    'dailyRecords',
    'daily_records'
  ])
  const responseWindow = {}

  for (const [key, value] of Object.entries(sourceWindow)) {
    if (!omitFields.has(key)) {
      responseWindow[key] = value
    }
  }

  return {
    ...responseWindow,
    historicalDays: normalizedHistoricalDays,
    meta:
      sourceWindow.meta && typeof sourceWindow.meta === 'object'
        ? {
            ...sourceWindow.meta,
            recordCounts: {
              historicalDays: normalizedHistoricalDays.length,
              forecastDays: 0,
              totalDailyRecords: normalizedHistoricalDays.length
            }
          }
        : {
            recordCounts: {
              historicalDays: normalizedHistoricalDays.length,
              forecastDays: 0,
              totalDailyRecords: normalizedHistoricalDays.length
            }
          }
  }
}

async function main(event, context) {
  const request = getHttpRequestData(event, context)
  const path = String(request.path || '')
  const method = request.method || 'GET'
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)

  try {
    if (path.includes('/weather/health')) {
      return jsonResponse(200, { code: 200, data: { status: 'ok', timestamp: Date.now() } })
    }

    if (path.includes('/weather/hot-cities/resolve')) {
      if (!['GET', 'POST'].includes(method)) {
        return methodNotAllowed(method)
      }
      const payload = method === 'GET' ? request.query : request.body
      const result = resolveHotCityLocation({
        lat: payload.lat ?? payload.latitude,
        lng: payload.lng ?? payload.longitude
      })
      return jsonResponse(200, { code: 200, message: '解析成功', data: result })
    }

    if (path.includes('/weather/hot-cities')) {
      if (method !== 'GET') {
        return methodNotAllowed(method)
      }
      return jsonResponse(200, {
        code: 200,
        message: '获取成功',
        data: { list: listHotCitiesForClient() }
      })
    }

    if (path.includes('/weather/v7/weather/24h') || path.includes('/v7/weather/24h')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const result = await handleWeather24hRequest({
        payload: request.body || {},
        service: buildRecentWeatherService(QWEATHER_CONFIG)
      })
      return jsonResponse(result.code, {
        code: result.code,
        message: result.message,
        data: result.data
      })
    }

    if (
      path.includes('/weather/environment-context') ||
      path.includes('/weather/v7/environment-context')
    ) {
      if (!['GET', 'POST'].includes(method)) {
        return methodNotAllowed(method)
      }

      const payload = method === 'GET' ? request.query : request.body
      const lat = payload.lat
      const lng = payload.lng
      const environmentContextMode = payload.mode || payload.environmentContextMode
      const diagnosisMode = isDiagnosisMode(environmentContextMode)
      if (!diagnosisMode && (!lat || !lng)) {
        return jsonResponse(400, { code: 400, message: '缺少位置参数：lat 和 lng', data: null })
      }

      const weatherWindow = diagnosisMode
        ? await buildDiagnosisRecentWeatherWindow({
            payload,
            service: buildRecentWeatherService(QWEATHER_CONFIG)
          })
        : await buildEnvironmentWeatherWindow({
            lat,
            lng,
            diagnosisDate: payload.diagnosisDate || payload.diagnosis_date || payload.date,
            appEnv,
            apiKey: QWEATHER_CONFIG.apiKey,
            baseUrl: QWEATHER_CONFIG.baseUrl
          })
      const responseWindow = buildEnvironmentWeatherWindowByMode(
        weatherWindow,
        environmentContextMode
      )

      return jsonResponse(200, {
        code: 200,
        message: '获取成功',
        data: {
          ...responseWindow,
          timestamp: new Date().toISOString()
        }
      })
    }

    if (path.includes('/weather/recent')) {
      if (!['GET', 'POST'].includes(method)) {
        return methodNotAllowed(method)
      }
      const payload = method === 'GET' ? request.query : request.body
      const result = await handleRecentWeatherRequest({
        payload,
        service: buildRecentWeatherService(QWEATHER_CONFIG)
      })
      return jsonResponse(result.code, {
        code: result.code,
        message: result.message,
        data: result.data
      })
    }

    if (path.includes('/weather/ingestion/recent-10d')) {
      if (method !== 'POST') {
        return methodNotAllowed(method)
      }
      const result = await handleRecentWeatherIngestionRequest({
        payload: request.body || {},
        service: buildRecentWeatherService(QWEATHER_CONFIG)
      })
      return jsonResponse(result.code, {
        code: result.code,
        message: result.message,
        data: result.data
      })
    }

    if (!path.includes('/weather/current')) {
      return notFound(path)
    }

    if (!['GET', 'POST'].includes(method)) {
      return methodNotAllowed(method)
    }

    const payload = method === 'GET' ? request.query : request.body
    const lat = payload.lat
    const lng = payload.lng
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
      dailyCacheEnabled: useCache
    })

    if (!lat || !lng) {
      return jsonResponse(400, { code: 400, message: '缺少位置参数：lat 和 lng', data: null })
    }

    let weatherData = null
    let dailyWeatherCache = null
    if (!QWEATHER_CONFIG.apiKey && appEnv === 'development') {
      weatherData = buildLocalDevWeatherData()
      dailyWeatherCache = {
        cacheHit: false,
        refreshed: false,
        reason: 'local_dev_missing_qweather_api_key'
      }
    } else {
      const currentWeatherResult = await getCurrentWeatherFromDailyArchive({
        lat,
        lng,
        city: cityCacheContext.city || city,
        cityName: cityCacheContext.city || city,
        province: cityCacheContext.province,
        timezone: payload.timezone || payload.tz || 'Asia/Shanghai',
        useCache
      })
      weatherData = currentWeatherResult.weatherData
      dailyWeatherCache = currentWeatherResult.dailyWeatherCache
      if (!weatherData) {
        throw new Error(currentWeatherResult.message || '获取当天预报归档失败')
      }
    }

    return jsonResponse(200, {
      code: 200,
      message: '获取成功',
      data: {
        ...weatherData,
        cached: Boolean(dailyWeatherCache?.cacheHit),
        cacheEnabled: useCache,
        cacheScope: dailyWeatherCache?.cacheHit ? 'daily_archive' : 'daily_archive_refresh',
        city: cityCacheContext.city || String(city || '').trim(),
        province: cityCacheContext.province,
        cachedAt: '',
        expiresAt: '',
        dailyWeatherCache,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('weather-http error:', error)
    return jsonResponse(500, { code: 500, message: error.message || '获取天气失败', data: null })
  }
}

module.exports.main = (event, context) => {
  if (isD0Weather24hTimerEvent(event)) {
    return handleD0Weather24hTimerEvent({
      event,
      service: buildRecentWeatherService(QWEATHER_CONFIG)
    })
  }

  if (isRecentWeatherIngestionTimerEvent(event)) {
    return handleRecentWeatherTimerEvent({
      event,
      service: buildRecentWeatherService(QWEATHER_CONFIG)
    })
  }

  const request = getHttpRequestData(event, context)
  const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
  return runWithRequestAppEnv(appEnv, () => main(event, context))
}
