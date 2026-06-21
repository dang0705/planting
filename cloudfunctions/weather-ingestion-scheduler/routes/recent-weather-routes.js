'use strict'

const { createRecentWeatherService } = require('../services/recent-weather-service')
const { buildLocationKey } = require('../services/weather-cache-paths')
const { createD0SlotManifestService } = require('../services/d0-slot-manifest')
const { createD0TimerAuditService } = require('../services/d0-timer-audit')

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
  const targetDate = event.targetDate || event.target_date || ''
  const manifestService = createD0SlotManifestService({ env: process.env })
  const auditService = createD0TimerAuditService()
  const startAt = new Date().toISOString()

  // load or seed manifest -> advance ONE batch -> persist cursor（跨 invocation 可推进）
  const loaded = await manifestService.loadOrSeedManifest({ triggerName, targetDate })
  const advance = await manifestService.advanceManifest({
    manifest: loaded.manifest,
    cloudPath: loaded.cloudPath,
    worker: city => service.updateNowSample(city)
  })

  const endAt = new Date().toISOString()
  const batchResults = advance.batchResults
  const succeeded = batchResults.filter(item => item.ok).length
  const failed = batchResults.length - succeeded
  // 审计状态契约：某批存在失败城市即为 failure，否则 success（completed 仅作字段保留，不作状态）
  const status = failed > 0 ? 'failure' : 'success'
  const manifest = advance.manifest
  const sourceKind = manifest.finalized ? 'observed_now_rollup_timer' : 'observed_now_samples_timer'
  const firstFailure = batchResults.find(item => !item.ok)
  const firstErrorText = firstFailure
    ? String(firstFailure.error || firstFailure.message || 'unknown')
    : ''
  // errorSummary：失败城市数 + 首个错误信息（无失败时记 failed:0）
  const errorSummary = failed > 0 ? `failed:${failed}; ${firstErrorText}` : 'failed:0'

  // 审计记录：同一 invocation 用 recordId 去重，按日期聚合到同一 JSON
  const recordId = `${triggerName}:${manifest.date}:${startAt}`
  await auditService.appendAuditRecord({
    date: manifest.date,
    record: {
      recordId,
      triggerName,
      targetDate: manifest.date,
      slotName: manifest.slotName,
      finalized: manifest.finalized,
      sourceKind,
      startAt,
      endAt,
      status,
      errorSummary,
      cursor: manifest.cursor,
      batchSize: manifest.batchSize,
      totalCities: manifest.totalCities,
      attempted: batchResults.length,
      succeeded,
      failed,
      completed: advance.completed,
      cities: batchResults
    }
  })

  return {
    code: 200,
    message: manifest.finalized ? 'D0 天气定时定稿完成' : 'D0 天气定时更新完成',
    data: {
      triggerName,
      targetDate: manifest.date,
      finalized: manifest.finalized,
      attempted: batchResults.length,
      succeeded,
      failed,
      cursor: manifest.cursor,
      totalCities: manifest.totalCities,
      completed: advance.completed,
      batchSize: manifest.batchSize,
      cities: batchResults,
      sourceKind
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
