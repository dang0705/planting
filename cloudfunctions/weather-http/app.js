'use strict'

// CloudBase Nodejs18.15 的运行时没有全局 File，而当前依赖树中的 undici
// 在加载时会直接读取它；提前补齐最小兼容实现，避免函数在启动阶段以 443 退出。
if (typeof globalThis.File === 'undefined') {
  const BlobConstructor = typeof globalThis.Blob === 'function' ? globalThis.Blob : null
  globalThis.File = BlobConstructor
    ? class File extends BlobConstructor {
        constructor(fileBits, fileName, options = {}) {
          super(fileBits, options)
          this.name = String(fileName || '')
          this.lastModified = Number(options.lastModified || Date.now())
        }
      }
    : class File {
        constructor(_fileBits, fileName, options = {}) {
          this.name = String(fileName || '')
          this.lastModified = Number(options.lastModified || Date.now())
        }
      }
}

const {
  jsonResponse,
  internalServerError,
  notFound,
  methodNotAllowed,
  getHttpRequestData,
  resolveRequestAppEnv,
  runWithRequestAppEnv
} = require('/opt/utils/http')
const {
  buildEnvironmentWeatherWindow,
  prefetchEnvironmentForecast
} = require('./services/weather-window-service')
const {
  buildDiagnosisRecentWeatherWindow,
  buildRecentWeatherService,
  handleRecentWeatherIngestionRequest,
  handleRecentWeatherRequest,
  handleWeather24hRequest,
  isDiagnosisMode
} = require('./routes/recent-weather-routes')
const { listHotCitiesForClient, resolveHotCityLocation } = require('./services/hot-city-locations')

const QWEATHER_CONFIG = {
  baseUrl: process.env.QWEATHER_API_BASE_URL || 'https://n773jqqeap.re.qweatherapi.com',
  apiKey: process.env.QWEATHER_API_KEY
}
let sharedRecentWeatherService

function getSharedRecentWeatherService() {
  if (!sharedRecentWeatherService) {
    sharedRecentWeatherService = buildRecentWeatherService(QWEATHER_CONFIG)
  }
  return sharedRecentWeatherService
}

function readQaPerformanceProbeId(headers = {}) {
  const value = headers['x-qa-performance-probe-id'] || headers['X-QA-Performance-Probe-Id'] || ''
  const normalized = String(value).trim()
  return /^[A-Za-z0-9._:-]{8,120}$/u.test(normalized) ? normalized : ''
}

function createQaRequestTiming(probeId) {
  if (!probeId) {
    return null
  }
  const startedAt = Date.now()
  const marks = []
  return {
    mark(stage, details = {}) {
      marks.push({ stage, elapsed_ms: Date.now() - startedAt, ...details })
    },
    flush() {
      console.log('qa-performance-timing', JSON.stringify({ probeId, marks }))
    }
  }
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
    const service = getSharedRecentWeatherService()
    return await service.getCurrentWeatherFromDailyArchive(payload)
  } catch {
    return {
      weatherData: null,
      dailyWeatherCache: {
        cacheHit: false,
        refreshed: false,
        reason: 'daily_archive_current_failed',
        message: '天气缓存暂不可用'
      },
      message: '天气缓存暂不可用'
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
  // 诊断模式保留 currentWeather（D0 当天观测，由 buildDiagnosisRecentWeatherWindow 填充），
  // 但仍 omit forecastDays/forecast_days（诊断模式不返回预报）。
  const omitFields = new Set([
    'forecastDays',
    'forecast_days',
    'historical_days',
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
  const qaProbeId = readQaPerformanceProbeId(request.headers)
  const timing = createQaRequestTiming(qaProbeId)
  if (qaProbeId) {
    const endpoint = path.includes('/weather/environment-context')
      ? 'weather-http/weather/environment-context'
      : path.includes('/weather/current')
        ? 'weather-http/weather/current'
        : 'weather-http'
    console.log('qa-performance-probe', JSON.stringify({ probeId: qaProbeId, endpoint }))
  }
  timing?.mark('request-enter')

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
        lng: payload.lng ?? payload.longitude,
        cityName: payload.cityName ?? payload.city ?? payload.name
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
        service: getSharedRecentWeatherService()
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
      timing?.mark('environment-context-start')
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

      const recentWeatherService = getSharedRecentWeatherService()
      // 诊断与浇水环境窗口必须先读取同一个 recent-10d/day archive 缓存：
      // 历史天气和 D0 不能由 environment 模式再次直连 QWeather，否则同一天会出现两套事实。
      const forecastDaysPromise = diagnosisMode
        ? null
        : prefetchEnvironmentForecast({
            lat,
            lng,
            diagnosisDate: payload.diagnosisDate || payload.diagnosis_date || payload.date,
            apiKey: QWEATHER_CONFIG.apiKey,
            baseUrl: QWEATHER_CONFIG.baseUrl
          })
      forecastDaysPromise?.then(
        value => timing?.mark('weather-forecast-ready', { forecast_days: value?.length || 0 }),
        error =>
          timing?.mark('weather-forecast-failed', { message: String(error?.message || error) })
      )
      forecastDaysPromise?.catch(() => null)
      const cachedWeatherWindow = await buildDiagnosisRecentWeatherWindow({
        payload: {
          ...payload,
          // 环境首页允许短时复用已确认存在的 D0；诊断模式必须每次重新确认 day file，
          // 避免 D0 归档刚被采样/定稿或撤销时把旧值继续当成当前事实。
          useCurrentWeatherMemoryCache: !diagnosisMode
        },
        service: recentWeatherService,
        onTimingMark: (stage, details) => timing?.mark(stage, details)
      })
      const weatherWindow = diagnosisMode
        ? cachedWeatherWindow
        : await buildEnvironmentWeatherWindow({
            lat,
            lng,
            diagnosisDate: payload.diagnosisDate || payload.diagnosis_date || payload.date,
            appEnv,
            apiKey: QWEATHER_CONFIG.apiKey,
            baseUrl: QWEATHER_CONFIG.baseUrl,
            // 透传 locationKey / qweather id / city，让后端用 buildLocationKey 解析并暴露到 response 顶层，
            // 供前端 catalog 植物 D0 day file 查询使用（无 qweather id / hot city 时走 coord 兜底）。
            locationKey: payload.locationKey || payload.location_key || '',
            qweatherLocationId: payload.qweatherLocationId || payload.qweather_location_id || '',
            cityName: payload.cityName || payload.city_name || '',
            city: payload.city || '',
            cacheWindow: cachedWeatherWindow,
            forecastDaysPromise
          })
      timing?.mark('environment-context-window-ready', {
        mode: normalizeEnvironmentContextMode(environmentContextMode),
        forecast_prefetch_started: Boolean(forecastDaysPromise)
      })
      const responseWindow = buildEnvironmentWeatherWindowByMode(
        weatherWindow,
        environmentContextMode
      )
      timing?.mark('environment-context-response-ready', {
        mode: normalizeEnvironmentContextMode(environmentContextMode),
        historical_days: Array.isArray(responseWindow?.historicalDays)
          ? responseWindow.historicalDays.length
          : 0,
        forecast_days: Array.isArray(responseWindow?.forecastDays)
          ? responseWindow.forecastDays.length
          : 0
      })

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
        service: getSharedRecentWeatherService()
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
        service: getSharedRecentWeatherService()
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
    }

    const isCacheMiss = !weatherData
    return jsonResponse(200, {
      code: 200,
      message: isCacheMiss ? '天气缓存不足，请稍后重试' : '获取成功',
      data: {
        ...(weatherData || {}),
        weatherEvidenceInsufficient: isCacheMiss || undefined,
        cached: Boolean(dailyWeatherCache?.cacheHit),
        cacheEnabled: useCache,
        cacheScope: dailyWeatherCache?.cacheHit ? 'day_latest_sample' : 'cache_miss',
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
    return internalServerError('获取天气失败，请稍后重试')
  } finally {
    timing?.flush()
  }
}

module.exports = {
  main: (event, context) => {
    const request = getHttpRequestData(event, context)
    const appEnv = resolveRequestAppEnv(request.headers, request.query, request.body)
    return runWithRequestAppEnv(appEnv, () => main(event, context))
  },
  buildEnvironmentWeatherWindowByMode
}
