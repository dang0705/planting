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

/**
 * 对单条链路执行「首次请求 + 间隔重试」。
 * retryCount 表示重试次数（不含首次），因此总尝试次数 = retryCount + 1。
 * 每次失败后、下一次尝试前等待 retryIntervalMs。
 */
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

/**
 * 采集当前实况：先 fetchPrimary（/v7/weather/now，间隔 retryIntervalMs 重试 retryCount 次），
 * 全部失败后回退 fetchFallback（/v7/grid-weather/now，同样重试），
 * 两条链路都失败时构造 missing sample（missing:true，sourceKind: weather_now_sample_missing）。
 *
 * retry 不放在 adapter 内，adapter 只暴露 fetchCurrentWeather / fetchGridWeatherNow 两个入口，
 * 由本函数以注入的 fetchPrimary / fetchFallback 闭包形式执行重试与回退。
 *
 * 返回:
 * - 成功: { ok:true, sourceKind, weatherData, missingSample:null }
 * - 全失败: { ok:false, sourceKind:'weather_now_sample_missing', weatherData:null, missingSample }
 */
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
