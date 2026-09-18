'use strict'

// day file 路径构造器与日期工具，从 weather-day-file-reader.js 拆分。
// layer 部署后 /opt/utils/ 下平铺，相对 require 同目录解析无歧义。
// 自包含不依赖 weather-http/services/weather-cache-paths.js，避免 layer → weather-http 循环依赖。

// ===== 内联路径构造器（从 weather-http/services/weather-cache-paths.js 的最小子集） =====
const INVALID_LOCATION_KEY_CHARS = /[^a-zA-Z0-9:_-]/g

function normalizePathSegment(value = '', fallback = 'unknown') {
  const normalized = String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '_')
    .replace(INVALID_LOCATION_KEY_CHARS, '')
    .slice(0, 96)
  return normalized || fallback
}

function normalizeLocationKey(value = '') {
  return normalizePathSegment(value, '')
}

function buildWeatherLocationBasePath(locationKey = '') {
  const safeLocationKey = normalizeLocationKey(locationKey)
  if (!safeLocationKey) {
    throw new Error('缺少天气地点 locationKey')
  }
  return `weather-cache/v1/locations/${safeLocationKey}`
}

function buildWeatherDayObjectPath(locationKey = '', date = '') {
  const safeDate = String(date || '')
    .trim()
    .slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) {
    throw new Error('天气 day 对象路径缺少合法日期')
  }
  return `${buildWeatherLocationBasePath(locationKey)}/days/${safeDate}.json`
}

function buildRecentWeatherObjectPath(locationKey = '') {
  return `${buildWeatherLocationBasePath(locationKey)}/recent-10d.json`
}

// ===== 内联日期工具（从 weather-http/services/recent-weather-features.js 的最小子集） =====
function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return new Date().toISOString().slice(0, 10)
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) {
    return raw.slice(0, 10)
  }
  return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-')
}

function addDays(dateText = '', offset = 0) {
  const date = new Date(`${normalizeDate(dateText)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function formatLocalDateInTimezone(now = new Date(), timezone = 'Asia/Shanghai') {
  const date = now instanceof Date ? now : new Date(now)
  const resolvedTimezone = String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolvedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return `${partMap.year}-${partMap.month}-${partMap.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

// ===== 通用工具 =====
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

module.exports = {
  addDays,
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
  buildWeatherLocationBasePath,
  formatLocalDateInTimezone,
  isPlainObject,
  normalizeDate,
  normalizeLocationKey,
  normalizePathSegment
}
