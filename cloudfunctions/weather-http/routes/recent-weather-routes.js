'use strict'

const { createRecentWeatherService } = require('../services/recent-weather-service')
const { buildLocationKey } = require('../services/weather-cache-paths')
const { formatLocalDateInTimezone } = require('../services/recent-weather-features')

const DEFAULT_ENVIRONMENT_CONTEXT_CACHE_READ_TIMEOUT_MS = 700

function buildRecentWeatherService({ apiKey = '', baseUrl = '' } = {}) {
  return createRecentWeatherService({ apiKey, baseUrl })
}

function normalizeMode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
}

function isDiagnosisMode(value = '') {
  return normalizeMode(value) === 'diagnosis'
}

function pickPayloadLocation(payload = {}) {
  return {
    locationKey: payload.locationKey || payload.location_key || '',
    qweatherLocationId: payload.qweatherLocationId || payload.qweather_location_id || '',
    cityName: payload.cityName || payload.city || payload.city_name || '',
    city: payload.city || payload.cityName || '',
    timezone: payload.timezone || '',
    diagnosisDate: payload.diagnosisDate || payload.diagnosis_date || payload.date || '',
    plantId: payload.plantId || payload.plant_id || '',
    careLocationId: payload.careLocationId || payload.care_location_id || '',
    source: payload.source || payload.careLocationSource || payload.care_location_source || '',
    lat: payload.lat,
    lng: payload.lng
  }
}

async function buildDiagnosisRecentWeatherWindow({
  payload = {},
  service,
  now = () => new Date(),
  onTimingMark = null
}) {
  const markTiming = (stage, details = {}) => {
    if (typeof onTimingMark === 'function') {
      onTimingMark(stage, details)
    }
  }
  const locationInfo = pickPayloadLocation(payload)
  const timezone = locationInfo.timezone || 'Asia/Shanghai'
  const diagnosisDate = locationInfo.diagnosisDate || formatLocalDateInTimezone(now(), timezone)
  const readTimeoutMs =
    payload.readTimeoutMs || payload.timeoutMs || DEFAULT_ENVIRONMENT_CONTEXT_CACHE_READ_TIMEOUT_MS
  const allowArchiveRebuild =
    payload.allowArchiveRebuild === true || payload.allowArchiveRebuild === 'true'
  const useCurrentWeatherMemoryCache =
    payload.useCurrentWeatherMemoryCache === true || payload.useCurrentWeatherMemoryCache === 'true'

  // recent-10d 与 D0 是独立事实源，但两次读取没有先后依赖；并行等待可把
  // 请求时间从两条网络链路之和收敛到较慢的一条。关键环境接口默认不在请求内
  // 触发 10 个 day archive 的同步重建，缓存缺失时明确降级并交给定时采集恢复。
  markTiming('weather-cache-window-start', {
    allow_archive_rebuild: allowArchiveRebuild,
    read_timeout_ms: readTimeoutMs
  })
  const recentWindowPromise = service.readRecentWeatherForDiagnosis({
    ...locationInfo,
    timezone,
    diagnosisDate,
    allowArchiveRebuild,
    readTimeoutMs
  })
  recentWindowPromise.then(
    recentWindow =>
      markTiming('weather-cache-recent-ready', {
        recent_cache_hit: recentWindow?.cacheHit === true,
        historical_days: Array.isArray(recentWindow?.historicalDays)
          ? recentWindow.historicalDays.length
          : 0
      }),
    error => markTiming('weather-cache-recent-failed', { message: String(error?.message || error) })
  )
  const currentWeatherPromise = Promise.resolve()
    .then(() =>
      service.getCurrentWeatherFromDailyArchive({
        ...locationInfo,
        timezone,
        targetDate: diagnosisDate,
        useCache: true,
        useMemoryCache: useCurrentWeatherMemoryCache,
        skipFinalizedFallback: useCurrentWeatherMemoryCache,
        readTimeoutMs
      })
    )
    .catch(error => ({
      weatherData: null,
      dailyWeatherCache: {
        reason: `current_weather_read_failed:${error.message || error}`
      }
    }))
  currentWeatherPromise.then(currentResult =>
    markTiming('weather-cache-current-ready', {
      current_cache_hit: currentResult?.dailyWeatherCache?.cacheHit === true,
      current_weather_present: Boolean(currentResult?.weatherData)
    })
  )
  const [recentWindow, currentResult] = await Promise.all([
    recentWindowPromise,
    currentWeatherPromise
  ])
  markTiming('weather-cache-window-ready', {
    recent_cache_hit: recentWindow?.cacheHit === true,
    current_cache_hit: currentResult?.dailyWeatherCache?.cacheHit === true,
    current_weather_present: Boolean(currentResult?.weatherData)
  })

  // 诊断天气窗口由两个独立缓存层组成：
  // 1) currentWeather：读取当天 days/{date}.json.latestSample，它是定时 QWeather /now 采样写入的 D0 最新缓存；
  // 2) historicalDays：读取 recent-10d.json，仅包含 D-10..D-1 的历史缓存。
  // 诊断请求不现场调用 QWeather；D0 缓存缺失时可读取 finalized rollup 做内部判定，
  // 但只有与 diagnosisDate 一致的天气才允许返回给前端，避免旧日期数据误标为“今天”。
  let currentWeather = null
  let todayWeatherSource = 'missing'
  let todayWeatherReason = 'missing'
  let todayWeatherFallbackDate = ''

  try {
    if (currentResult?.weatherData) {
      const observedWeatherDate = String(
        currentResult.weatherData.weatherDate || currentResult.dailyWeatherCache?.targetDate || ''
      ).slice(0, 10)
      const isTodayWeather = !observedWeatherDate || observedWeatherDate === diagnosisDate
      // D0 缺失时可以读取最近定稿日作为内部诊断降级，但绝不能把旧日期数据
      // 标成“今天”的天气返回给前端，否则时间线会产生事实错误。
      if (!isTodayWeather) {
        todayWeatherFallbackDate = observedWeatherDate
        todayWeatherReason = 'day_latest_sample_missing'
      } else {
        currentWeather = currentResult.weatherData
      }
      const cacheSource = currentResult.weatherData.cacheSource || ''
      if (!isTodayWeather) {
        todayWeatherSource = 'missing'
      } else if (cacheSource === 'day_latest_sample') {
        todayWeatherSource = 'day_latest_sample'
      } else if (cacheSource === 'day_finalized_rollup') {
        todayWeatherSource = 'day_finalized_rollup_fallback'
      } else if (cacheSource) {
        todayWeatherSource = cacheSource
      }
      if (isTodayWeather) {
        todayWeatherReason = currentResult.dailyWeatherCache?.reason || todayWeatherSource
      }
    } else {
      todayWeatherReason = currentResult?.dailyWeatherCache?.reason || 'day_latest_sample_missing'
    }
  } catch (error) {
    todayWeatherReason = `current_weather_read_failed:${error.message || error}`
  }

  return {
    ...recentWindow,
    currentWeather,
    todayWeatherSource,
    todayWeatherReason,
    ...(todayWeatherFallbackDate ? { todayWeatherFallbackDate } : {}),
    meta: {
      ...recentWindow.meta,
      diagnosisDate,
      mode: 'diagnosis'
    }
  }
}

async function handleRecentWeatherRequest({ payload = {}, service }) {
  const locationKey = buildLocationKey(pickPayloadLocation(payload))
  if (!locationKey) {
    return {
      code: 400,
      message: '缺少天气地点 locationKey 或 city/qweatherLocationId',
      data: null
    }
  }

  const result = await service.readRecentWeather({
    locationKey,
    bypassMemory: payload.bypassMemory === true || payload.bypassMemory === 'true'
  })

  if (!result?.payload) {
    return {
      code: 404,
      message: '未找到最近10天天气缓存',
      data: null
    }
  }

  return {
    code: 200,
    message: '获取成功',
    data: {
      ...result.payload,
      cacheHit: result.cacheHit,
      cacheSourceKind: result.sourceKind
    }
  }
}

async function handleRecentWeatherIngestionRequest({ payload = {}, service }) {
  if (payload.batch === true || payload.batch === 'true') {
    const result = await service.ingestActiveLocations({
      limit: payload.limit || payload.batchLimit
    })
    return {
      code: 200,
      message: '批量采集完成',
      data: {
        sourceKind: 'weather_cache_recent_10d_batch',
        ...result
      }
    }
  }

  const result = await service.ingestRecentForecast({
    ...pickPayloadLocation(payload),
    targetDate: payload.targetDate || payload.target_date || ''
  })

  return {
    code: 200,
    message: '采集成功',
    data: {
      location: result.location,
      manifestPath: result.manifestPath,
      recentObjectPath: result.recentObjectPath,
      recentFileId: result.recentFileId,
      targetDate: result.targetDate,
      forecastDailyArchives: result.forecastDailyArchives || [],
      prunedFutureDailyArchives: result.prunedFutureDailyArchives || [],
      quality: result.quality,
      recentPayload: result.recentPayload,
      sourceKind: 'weather_cache_recent_10d'
    }
  }
}

async function handleWeather24hRequest({ payload = {}, service }) {
  const result = await service.updateNowSample({
    ...pickPayloadLocation(payload),
    latitude: payload.latitude ?? payload.lat,
    longitude: payload.longitude ?? payload.lng,
    targetDate: payload.targetDate || payload.target_date || payload.date || '',
    date: payload.date || '',
    slotName: payload.slotName || payload.slot_name || '',
    triggerName: payload.triggerName || payload.trigger_name || '',
    finalize: payload.finalize,
    slotFinalize: payload.slotFinalize || payload.slot_finalize
  })

  return {
    code: 200,
    message: result.finalized ? 'D0 now 采样定稿成功' : 'D0 now 采样成功',
    data: {
      location: result.location,
      targetDate: result.targetDate,
      dayObjectPath: result.dayObjectPath,
      dayFileId: result.dayFileId,
      slotName: result.slotName || '',
      finalized: result.finalized,
      dayPayload: result.dayPayload,
      dailyRollup: result.dailyRollup || null,
      sample: result.sample || null,
      sourceKind: result.finalized ? 'observed_now_rollup' : 'observed_now_samples'
    }
  }
}

module.exports = {
  buildDiagnosisRecentWeatherWindow,
  buildRecentWeatherService,
  handleRecentWeatherIngestionRequest,
  handleRecentWeatherRequest,
  handleWeather24hRequest,
  isDiagnosisMode,
  pickPayloadLocation
}
