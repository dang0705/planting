'use strict'

const { createRecentWeatherService } = require('../services/recent-weather-service')
const { buildLocationKey } = require('../services/weather-cache-paths')

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

async function buildDiagnosisRecentWeatherWindow({ payload = {}, service }) {
  const locationInfo = pickPayloadLocation(payload)
  const recentWindow = await service.readRecentWeatherForDiagnosis({
    ...locationInfo,
    allowArchiveRebuild:
      payload.allowArchiveRebuild === true || payload.allowArchiveRebuild === 'true',
    readTimeoutMs: payload.readTimeoutMs || payload.timeoutMs
  })

  // 诊断模式 D0 当天观测：复用 layer 共享的 getCurrentWeatherFromDailyArchive，
  // 从 day file latestSample 填充 currentWeather 挂到 response 顶层。
  // 诊断模式保持只读 recent-10d.json（historicalDays D-10..D-1），不引入 forecastDays；
  // day file 缺失/超时不回退 QWeather 实时 API，currentWeather=null。
  const diagnosisDate =
    locationInfo.diagnosisDate ||
    payload.diagnosisDate ||
    payload.diagnosis_date ||
    payload.date ||
    recentWindow.meta?.diagnosisDate ||
    ''
  const timezone = locationInfo.timezone || 'Asia/Shanghai'

  let currentWeather = null
  let todayWeatherSource = 'missing'
  let todayWeatherReason = 'missing'

  try {
    const currentResult = await service.getCurrentWeatherFromDailyArchive({
      ...locationInfo,
      timezone,
      targetDate: diagnosisDate,
      useCache: true
    })
    if (currentResult?.weatherData) {
      currentWeather = currentResult.weatherData
      const cacheSource = currentResult.weatherData.cacheSource || ''
      if (cacheSource === 'day_latest_sample') {
        todayWeatherSource = 'day_latest_sample'
      } else if (cacheSource === 'day_finalized_rollup') {
        todayWeatherSource = 'day_finalized_rollup_fallback'
      } else if (cacheSource) {
        todayWeatherSource = cacheSource
      }
      todayWeatherReason = currentResult.dailyWeatherCache?.reason || todayWeatherSource
    } else {
      todayWeatherReason =
        currentResult?.dailyWeatherCache?.reason || 'day_latest_sample_missing'
    }
  } catch (error) {
    todayWeatherReason = `current_weather_read_failed:${error.message || error}`
  }

  return {
    ...recentWindow,
    currentWeather,
    todayWeatherSource,
    todayWeatherReason,
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
