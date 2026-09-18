'use strict'

// 对象存储读取超时编排工具，从 weather-day-file-reader.js 拆分。
// 提供 single-shot 与 deadline-based 两种超时控制，供 day file 读取与 current weather fallback 复用。

// 主读 D0 day file 的初始默认读取预算：覆盖对象存储常规冷读（实测 D0 首次约 305ms、后续 184-198ms）。
const DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 600
const DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 250
const DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS = 1500
const MAX_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS = 2000

function normalizeTimeoutMs(value, fallback = DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }
  return Math.min(MAX_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS, Math.trunc(numeric))
}

function buildTimeoutResult(timeoutMs) {
  return new Promise(resolve => {
    setTimeout(() => resolve({ timedOut: true }), timeoutMs)
  })
}

async function downloadJsonWithTimeout(storage, input = {}, timeoutMs) {
  return Promise.race([
    storage
      .downloadJson(input)
      .catch(() => null)
      .then(payload => ({ payload, timedOut: false })),
    buildTimeoutResult(timeoutMs)
  ])
}

// 启动一次存储读取，返回 raceWith(deadlineMs) 用同一 settled promise 在多个 deadline 上竞速。
// 用于主读超时后仍能在 grace 总预算内继续等同一读取的结果。
function startStorageRead(storage, input = {}) {
  const startedAt = Date.now()
  const settled = storage
    .downloadJson(input)
    .catch(() => null)
    .then(payload => ({ payload, timedOut: false }))

  function raceWith(deadlineMs) {
    const remaining = Math.max(0, Math.trunc(deadlineMs - (Date.now() - startedAt)))
    return Promise.race([
      settled,
      buildTimeoutResult(remaining).then(() => ({ payload: null, timedOut: true }))
    ])
  }

  return { raceWith }
}

module.exports = {
  DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS,
  DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  DEFAULT_FALLBACK_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  MAX_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  buildTimeoutResult,
  downloadJsonWithTimeout,
  normalizeTimeoutMs,
  startStorageRead
}
