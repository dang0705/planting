'use strict'

const DEFAULT_RETRY_COUNT = 3
const DEFAULT_RETRY_INTERVAL_MS = 10000
const PRIMARY_SOURCE_KIND = 'weather_now_sample'
const FALLBACK_SOURCE_KIND = 'grid_weather_now_sample'
const MISSING_SOURCE_KIND = 'weather_now_sample_missing'

function defaultSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function extractErrorMessage(error) {
  if (!error) {
    return 'unknown error'
  }
  return error.message || String(error)
}

async function callWithRetry({ operation, retryCount, retryIntervalMs, sleep }) {
  const maxAttempts = retryCount + 1
  const errors = []
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation()
      return { ok: true, result, attempts: attempt, errors }
    } catch (error) {
      errors.push(extractErrorMessage(error))
      if (attempt < maxAttempts) {
        await sleep(retryIntervalMs)
      }
    }
  }
  return { ok: false, result: null, attempts: maxAttempts, errors }
}

function buildFailureReason(primaryErrors, fallbackErrors) {
  const primaryCount = primaryErrors.length
  const fallbackCount = fallbackErrors.length
  const primaryLast = primaryCount ? primaryErrors[primaryCount - 1] : '无'
  const fallbackLast = fallbackCount ? fallbackErrors[fallbackCount - 1] : '无'
  return (
    'primary 失败 ' +
    primaryCount +
    ' 次, 最后错误: ' +
    primaryLast +
    ' | fallback 失败 ' +
    fallbackCount +
    ' 次, 最后错误: ' +
    fallbackLast
  )
}

function buildMissingSample({ slotName, sampledAt, primaryErrors, fallbackErrors }) {
  return {
    slotName,
    sampledAt,
    missing: true,
    sourceKind: MISSING_SOURCE_KIND,
    failureReason: buildFailureReason(primaryErrors, fallbackErrors)
  }
}

async function attemptWeatherObservation({
  fetchPrimary,
  fetchFallback,
  sleep = defaultSleep,
  slotName = '',
  sampledAt = '',
  retryCount = DEFAULT_RETRY_COUNT,
  retryIntervalMs = DEFAULT_RETRY_INTERVAL_MS
} = {}) {
  const primary = await callWithRetry({
    operation: fetchPrimary,
    retryCount,
    retryIntervalMs,
    sleep
  })
  if (primary.ok) {
    return {
      ok: true,
      sourceKind: PRIMARY_SOURCE_KIND,
      weatherData: primary.result,
      missingSample: null
    }
  }

  const fallback = await callWithRetry({
    operation: fetchFallback,
    retryCount,
    retryIntervalMs,
    sleep
  })
  if (fallback.ok) {
    return {
      ok: true,
      sourceKind: FALLBACK_SOURCE_KIND,
      weatherData: fallback.result,
      missingSample: null
    }
  }

  return {
    ok: false,
    sourceKind: MISSING_SOURCE_KIND,
    weatherData: null,
    missingSample: buildMissingSample({
      slotName,
      sampledAt,
      primaryErrors: primary.errors,
      fallbackErrors: fallback.errors
    })
  }
}

module.exports = {
  DEFAULT_RETRY_COUNT,
  DEFAULT_RETRY_INTERVAL_MS,
  PRIMARY_SOURCE_KIND,
  FALLBACK_SOURCE_KIND,
  MISSING_SOURCE_KIND,
  attemptWeatherObservation
}
