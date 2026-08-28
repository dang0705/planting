'use strict'

const {
  buildLocationKey,
  buildRecentWeatherObjectPath,
  normalizeLocationKey
} = require('./weather-cache-paths')
const { addDays, buildPlantWeatherFeatures, normalizeDate } = require('./recent-weather-features')
const { normalizeRecentHistoricalDays } = require('./recent-weather-normalize')
const { isPlainObject } = require('./recent-weather-payloads')

const DEFAULT_DIAGNOSIS_RECENT_READ_TIMEOUT_MS = 1200

function normalizePositiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback
}

function resolveDiagnosisDate(input = {}) {
  return String(input.diagnosisDate || input.diagnosis_date || input.date || '').trim()
}

function recentPayloadMatchesDiagnosisDate(payload = {}, diagnosisDate = '') {
  if (!diagnosisDate) {
    return true
  }

  const normalizedDiagnosisDate = normalizeDate(diagnosisDate)
  const expectedTargetDate = addDays(normalizedDiagnosisDate, -1)
  const payloadDiagnosisDate = normalizeDate(
    payload.meta?.diagnosisDate || payload.meta?.diagnosis_date || ''
  )
  const payloadTargetDate = normalizeDate(payload.window?.targetDate || '')
  return (
    payloadDiagnosisDate === normalizedDiagnosisDate || payloadTargetDate === expectedTargetDate
  )
}

function shouldRebuildRecentPayloadFromArchives(payload = {}, diagnosisDate = '') {
  if (!payload) {
    return true
  }
  if (!recentPayloadMatchesDiagnosisDate(payload, diagnosisDate)) {
    return true
  }
  return Boolean(
    payload.weatherEvidenceInsufficient ||
    payload.quality === 'missing' ||
    payload.meta?.quality === 'missing' ||
    payload.meta?.weatherEvidenceInsufficient
  )
}

function buildNextDayWindowAlignment(payload = {}, diagnosisDate = '') {
  const normalizedDiagnosisDate = diagnosisDate ? normalizeDate(diagnosisDate) : ''
  if (!normalizedDiagnosisDate) {
    return null
  }

  const expectedTargetDate = addDays(normalizedDiagnosisDate, -1)
  const payloadDiagnosisDate = normalizeDate(
    payload.meta?.diagnosisDate || payload.meta?.diagnosis_date || ''
  )
  const payloadTargetDate = normalizeDate(payload.window?.targetDate || '')
  const isUsable = !(
    payload.weatherEvidenceInsufficient ||
    payload.quality === 'missing' ||
    payload.meta?.quality === 'missing' ||
    payload.meta?.weatherEvidenceInsufficient
  )
  if (
    !isUsable ||
    payloadTargetDate !== normalizedDiagnosisDate ||
    payloadDiagnosisDate !== addDays(normalizedDiagnosisDate, 1)
  ) {
    return null
  }

  const firstHistoricalDate = addDays(expectedTargetDate, -9)
  const historicalDays = normalizeRecentHistoricalDays(payload).filter(day => {
    const rawDate = String(day?.date || day?.fxDate || '').trim()
    if (!rawDate) {
      return false
    }
    const date = normalizeDate(rawDate)
    return date >= firstHistoricalDate && date <= expectedTargetDate
  })
  if (!historicalDays.length) {
    return null
  }

  return {
    diagnosisDate: normalizedDiagnosisDate,
    targetDate: expectedTargetDate,
    historicalDays
  }
}

function buildMissingDiagnosisWeatherWindow({
  locationKey = '',
  plantId = '',
  careLocationId = '',
  source = '',
  reason = 'recent_10d_object_missing',
  warning = reason,
  timedOut = false
} = {}) {
  return {
    weatherEvidenceInsufficient: true,
    ...(locationKey ? { locationKey } : {}),
    ...(plantId ? { plantId } : {}),
    ...(careLocationId ? { careLocationId } : {}),
    ...(source ? { source } : {}),
    historicalDays: [],
    meta: {
      sourceKind: 'weather_cache_recent_10d',
      quality: 'missing',
      ...(locationKey ? { weatherObjectPath: buildRecentWeatherObjectPath(locationKey) } : {}),
      ...(plantId ? { plantId } : {}),
      ...(careLocationId ? { careLocationId } : {}),
      ...(source ? { source } : {}),
      weatherEvidenceInsufficient: true,
      reason,
      timedOut,
      warnings: [warning],
      recordCounts: {
        historicalDays: 0,
        forecastDays: 0,
        totalDailyRecords: 0
      }
    }
  }
}

async function withTimeout(promise, timeoutMs, timeoutValue) {
  const safeTimeoutMs = normalizePositiveInteger(timeoutMs, 0)
  if (!safeTimeoutMs) {
    return promise
  }

  let timeoutId
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => {
        timeoutId = setTimeout(() => resolve(timeoutValue), safeTimeoutMs)
      })
    ])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

function createDiagnosisRecentWeatherReader({
  readRecentWeather,
  rebuildRecentWeatherFromArchives
}) {
  return async function readRecentWeatherForDiagnosis(input = {}) {
    const explicitLocationKey = normalizeLocationKey(input.locationKey || input.location_key || '')
    const locationKey = explicitLocationKey || buildLocationKey(input)
    if (!locationKey) {
      return buildMissingDiagnosisWeatherWindow({
        ...input,
        reason: 'location_key_missing',
        warning: 'location_key_missing'
      })
    }
    if (!explicitLocationKey && locationKey.startsWith('coord:')) {
      // 诊断流必须以植物 careLocation 的 locationKey 为准；坐标级 fallback 不算命中。
      return buildMissingDiagnosisWeatherWindow({
        ...input,
        locationKey,
        reason: 'diagnosis_location_key_missing',
        warning: 'diagnosis_location_key_missing'
      })
    }

    let result = null
    const readTimeoutMs = normalizePositiveInteger(
      input.readTimeoutMs || input.timeoutMs || process.env.WEATHER_ENV_CONTEXT_READ_TIMEOUT_MS,
      DEFAULT_DIAGNOSIS_RECENT_READ_TIMEOUT_MS
    )
    try {
      result = await withTimeout(readRecentWeather({ locationKey }), readTimeoutMs, {
        timedOut: true
      })
      if (result?.timedOut) {
        return buildMissingDiagnosisWeatherWindow({
          ...input,
          locationKey,
          reason: 'recent_10d_read_timeout',
          warning: `recent_10d_read_timeout:${readTimeoutMs}ms`,
          timedOut: true
        })
      }
    } catch (error) {
      return buildMissingDiagnosisWeatherWindow({
        ...input,
        locationKey,
        reason: 'recent_10d_read_failed',
        warning: `recent_10d_read_failed:${error.message || error}`
      })
    }

    const diagnosisDate = resolveDiagnosisDate(input)
    const nextDayWindowAlignment = result?.payload
      ? buildNextDayWindowAlignment(result.payload, diagnosisDate)
      : null
    if (
      result?.payload &&
      shouldRebuildRecentPayloadFromArchives(result.payload, diagnosisDate) &&
      !nextDayWindowAlignment
    ) {
      result = null
    }
    const allowArchiveRebuild = input.allowArchiveRebuild === true
    if (!result?.payload && allowArchiveRebuild) {
      result = await rebuildRecentWeatherFromArchives({
        locationKey,
        diagnosisDate
      }).catch(() => null)
    }

    if (!result?.payload) {
      return buildMissingDiagnosisWeatherWindow({
        ...input,
        locationKey,
        reason: allowArchiveRebuild ? 'recent_10d_object_missing' : 'recent_10d_rebuild_deferred',
        warning: allowArchiveRebuild ? 'recent_10d_object_missing' : 'recent_10d_rebuild_deferred'
      })
    }

    const historicalDays =
      nextDayWindowAlignment?.historicalDays || normalizeRecentHistoricalDays(result.payload)
    return {
      ...result.payload,
      locationKey,
      cacheHit: result.cacheHit,
      cacheSourceKind: result.sourceKind,
      historicalDays,
      ...(nextDayWindowAlignment
        ? {
            plantFeatures: buildPlantWeatherFeatures(historicalDays)
          }
        : {}),
      ...(nextDayWindowAlignment
        ? {
            window: {
              ...(isPlainObject(result.payload.window) ? result.payload.window : {}),
              targetDate: nextDayWindowAlignment.targetDate,
              start: historicalDays[0]?.date || '',
              end: historicalDays[historicalDays.length - 1]?.date || '',
              days: historicalDays.length
            }
          }
        : {}),
      meta: {
        ...(isPlainObject(result.payload.meta) ? result.payload.meta : {}),
        ...(nextDayWindowAlignment
          ? {
              diagnosisDate: nextDayWindowAlignment.diagnosisDate,
              historicalWindow: {
                start: historicalDays[0]?.date || '',
                end: historicalDays[historicalDays.length - 1]?.date || ''
              },
              cacheWindowAlignment: 'next_day_d0_trimmed'
            }
          : {}),
        sourceKind: result.payload.sourceKind || 'weather_cache_recent_10d',
        quality: result.payload.quality || 'partial',
        weatherObjectPath:
          result.payload.weatherObjectPath || buildRecentWeatherObjectPath(locationKey),
        ...(input.plantId ? { plantId: input.plantId } : {}),
        ...(input.careLocationId ? { careLocationId: input.careLocationId } : {}),
        ...(input.source ? { source: input.source } : {}),
        cacheHit: result.cacheHit,
        cacheSourceKind: result.sourceKind,
        weatherEvidenceInsufficient: Boolean(result.payload.weatherEvidenceInsufficient),
        recordCounts: {
          ...(isPlainObject(result.payload.meta?.recordCounts)
            ? result.payload.meta.recordCounts
            : {}),
          historicalDays: historicalDays.length,
          forecastDays: 0,
          totalDailyRecords: historicalDays.length
        }
      }
    }
  }
}

module.exports = {
  createDiagnosisRecentWeatherReader
}
