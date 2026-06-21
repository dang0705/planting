'use strict'

const { createRecentWeatherService } = require('../services/recent-weather-service')
const { buildLocationKey } = require('../services/weather-cache-paths')
const { listConfiguredHotCitiesForIngestion } = require('../services/hot-city-locations')
const { isFinalizeSlot, resolveSlotForTriggerName } = require('../services/now-sample-slots')

const D0_WEATHER_24H_TIMER_TRIGGERS = new Set([
  'weather-d0-now-morning-0920',
  'weather-d0-now-forenoon-1220',
  'weather-d0-now-noon-1420',
  'weather-d0-now-afternoon-1820',
  'weather-d0-now-finalize-2130',
  'weather-d0-24h-0630',
  'weather-d0-24h-1130',
  'weather-d0-24h-1530',
  'weather-d0-24h-finalize-2130'
])

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
  const recentWindow = await service.readRecentWeatherForDiagnosis({
    ...pickPayloadLocation(payload),
    allowArchiveRebuild:
      payload.allowArchiveRebuild === true || payload.allowArchiveRebuild === 'true',
    readTimeoutMs: payload.readTimeoutMs || payload.timeoutMs
  })
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

function isRecentWeatherIngestionTimerEvent(event = {}) {
  const type = String(event.Type || event.type || '')
    .trim()
    .toLowerCase()
  const triggerName = String(
    event.TriggerName || event.triggerName || event.name || event.trigger_name || ''
  ).trim()

  return type === 'timer' && triggerName === 'weather-ingestion-recent-10d'
}

function pickTimerTriggerName(event = {}) {
  return String(
    event.TriggerName || event.triggerName || event.name || event.trigger_name || ''
  ).trim()
}

function isD0Weather24hTimerEvent(event = {}) {
  const type = String(event.Type || event.type || '')
    .trim()
    .toLowerCase()
  return type === 'timer' && D0_WEATHER_24H_TIMER_TRIGGERS.has(pickTimerTriggerName(event))
}

function pickNowSampleAuditFields(sample = null) {
  if (!sample || typeof sample !== 'object') {
    return null
  }
  return {
    slotName: sample.slotName || '',
    sampledAt: sample.sampledAt || '',
    obsTime: sample.obsTime || '',
    temp: sample.temp,
    feelsLike: sample.feelsLike,
    icon: sample.icon || '',
    text: sample.text || '',
    wind360: sample.wind360,
    windDir: sample.windDir || '',
    windScale: sample.windScale || '',
    windSpeed: sample.windSpeed,
    humidity: sample.humidity,
    precipLastHour: sample.precipLastHour,
    pressure: sample.pressure,
    visibilityKm: sample.visibilityKm,
    cloud: sample.cloud,
    dew: sample.dew,
    sourceKind: sample.sourceKind || ''
  }
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

async function handleD0Weather24hTimerEvent({ event = {}, service } = {}) {
  const triggerName = pickTimerTriggerName(event)
  const finalized = isFinalizeSlot(resolveSlotForTriggerName(triggerName))
  const targetDate = event.targetDate || event.target_date || ''
  const results = []
  let resolvedTargetDate = targetDate

  const hotCityTargets = listConfiguredHotCitiesForIngestion()
  for (const city of hotCityTargets) {
    try {
      const result = await service.updateNowSample({
        locationKey: city.key,
        cityName: city.name,
        latitude: city.latitude,
        longitude: city.longitude,
        timezone: 'Asia/Shanghai',
        targetDate,
        triggerName,
        finalize: finalized
      })
      resolvedTargetDate = resolvedTargetDate || result.targetDate
      results.push({
        locationKey: city.key,
        dayObjectPath: result.dayObjectPath,
        slotName: result.slotName || '',
        sample: pickNowSampleAuditFields(result.sample || null),
        latestSample: pickNowSampleAuditFields(result.dayPayload?.latestSample || null),
        error: ''
      })
    } catch (error) {
      results.push({
        locationKey: city.key,
        dayObjectPath: '',
        slotName: '',
        error: error.message || String(error)
      })
    }
  }

  const succeeded = results.filter(item => !item.error).length
  return {
    code: 200,
    message: finalized ? 'D0 天气定时定稿完成' : 'D0 天气定时更新完成',
    data: {
      triggerName,
      targetDate: resolvedTargetDate || '',
      finalized,
      attempted: hotCityTargets.length,
      succeeded,
      failed: results.length - succeeded,
      cities: results,
      sourceKind: finalized ? 'observed_now_rollup_timer' : 'observed_now_samples_timer'
    }
  }
}

module.exports = {
  buildDiagnosisRecentWeatherWindow,
  buildRecentWeatherService,
  handleD0Weather24hTimerEvent,
  handleRecentWeatherIngestionRequest,
  handleRecentWeatherRequest,
  handleRecentWeatherTimerEvent,
  handleWeather24hRequest,
  isD0Weather24hTimerEvent,
  isRecentWeatherIngestionTimerEvent,
  isDiagnosisMode,
  pickPayloadLocation
}
