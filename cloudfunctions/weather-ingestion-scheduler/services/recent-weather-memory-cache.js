'use strict'

const RECENT_WEATHER_CACHE_TTL_MS = 30 * 60 * 1000
const recentWeatherCache = new Map()

function buildRecentWeatherCacheKey(locationKey = '') {
  return `weather:recent10:${String(locationKey || '').trim()}`
}

function getRecentWeatherFromMemory(locationKey = '', now = Date.now()) {
  const cacheKey = buildRecentWeatherCacheKey(locationKey)
  const entry = recentWeatherCache.get(cacheKey)
  if (!entry) {
    return null
  }

  if (Number(now) - Number(entry.cachedAt || 0) > RECENT_WEATHER_CACHE_TTL_MS) {
    recentWeatherCache.delete(cacheKey)
    return null
  }

  return entry.value || null
}

function setRecentWeatherInMemory(locationKey = '', value = null, now = Date.now()) {
  const cacheKey = buildRecentWeatherCacheKey(locationKey)
  if (!locationKey || !value) {
    return null
  }
  recentWeatherCache.set(cacheKey, {
    cachedAt: Number(now) || Date.now(),
    value
  })
  return value
}

function clearRecentWeatherMemoryCache(locationKey = '') {
  if (locationKey) {
    recentWeatherCache.delete(buildRecentWeatherCacheKey(locationKey))
    return
  }
  recentWeatherCache.clear()
}

module.exports = {
  RECENT_WEATHER_CACHE_TTL_MS,
  buildRecentWeatherCacheKey,
  clearRecentWeatherMemoryCache,
  getRecentWeatherFromMemory,
  setRecentWeatherInMemory
}
