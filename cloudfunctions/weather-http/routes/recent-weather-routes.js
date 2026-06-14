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
    lat: payload.lat,
    lng: payload.lng
  }
}

async function buildDiagnosisRecentWeatherWindow({ payload = {}, service }) {
  const recentWindow = await service.readRecentWeatherForDiagnosis(pickPayloadLocation(payload))
  return {
    ...recentWindow,
    meta: {
      ...recentWindow.meta,
      diagnosisDate:
        payload.diagnosisDate ||
        payload.diagnosis_date ||
        payload.date ||
        recentWindow.meta?.diagnosisDate ||
        '',
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
      rawObjectPath: result.rawObjectPath,
      dailyObjectPath: result.dailyObjectPath,
      manifestPath: result.manifestPath,
      recentObjectPath: result.recentObjectPath,
      recentFileId: result.recentFileId,
      targetDate: result.targetDate,
      quality: result.quality,
      sourceKind: 'weather_cache_recent_10d'
    }
  }
}

function isRecentWeatherIngestionTimerEvent(event = {}) {
  const type = String(event.Type || event.type || '')
    .trim()
    .toLowerCase()
  const triggerName = String(
    event.TriggerName || event.triggerName || event.name || event.trigger_name || ''
  ).trim()

  return type === 'timer' && triggerName === 'weather-ingestion-recent-10d'
}

async function handleRecentWeatherTimerEvent({
  event = {},
  service,
  defaultLimit = process.env.WEATHER_INGESTION_BATCH_LIMIT || 20
} = {}) {
  const limit = event.limit || event.Limit || defaultLimit
  const result = await service.ingestActiveLocations({ limit })
  return {
    code: 200,
    message: '定时采集完成',
    data: {
      triggerName: event.TriggerName || event.triggerName || '',
      sourceKind: 'weather_cache_recent_10d_timer',
      ...result
    }
  }
}

module.exports = {
  buildDiagnosisRecentWeatherWindow,
  buildRecentWeatherService,
  handleRecentWeatherIngestionRequest,
  handleRecentWeatherRequest,
  handleRecentWeatherTimerEvent,
  isRecentWeatherIngestionTimerEvent,
  isDiagnosisMode,
  pickPayloadLocation
}
