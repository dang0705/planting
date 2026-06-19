'use strict'

const { HOT_CITY_WEATHER_LOCATIONS } = require('./hot-city-locations')

function buildHotCityIngestionTargets() {
  return HOT_CITY_WEATHER_LOCATIONS.map(city => ({
    locationKey: city.key,
    qweatherLocationId: '',
    cityName: city.name,
    lat: city.latitude,
    lng: city.longitude,
    latitude: city.latitude,
    longitude: city.longitude,
    timezone: 'Asia/Shanghai',
    isActive: true
  }))
}

function dedupeIngestionTargets(targets = []) {
  const seen = new Set()
  const result = []
  for (const target of targets) {
    if (!target?.locationKey || seen.has(target.locationKey)) {
      continue
    }
    seen.add(target.locationKey)
    result.push(target)
  }
  return result
}

async function ingestActiveLocations({
  locationRepository,
  ingestRecentForecast,
  limit = 20
} = {}) {
  const hotCityTargets = buildHotCityIngestionTargets()
  let activeRows = []
  if (typeof locationRepository?.listActiveLocations === 'function') {
    activeRows = await locationRepository
      .listActiveLocations({ limit: Math.max(Number(limit) || 20, hotCityTargets.length) })
      .catch(() => [])
  }
  const targets = dedupeIngestionTargets([
    ...hotCityTargets,
    ...activeRows.map(row => ({
      locationKey: row.locationKey,
      qweatherLocationId: row.qweatherLocationId || '',
      cityName: row.cityName || '',
      timezone: row.timezone || 'Asia/Shanghai'
    }))
  ])

  const results = []
  for (const target of targets) {
    try {
      const result = await ingestRecentForecast(target)
      results.push({
        locationKey: target.locationKey,
        ok: true,
        recentObjectPath: result.recentObjectPath,
        targetDate: result.targetDate,
        quality: result.quality
      })
    } catch (error) {
      results.push({
        locationKey: target.locationKey,
        ok: false,
        message: String(error?.message || error || '')
      })
    }
  }

  return {
    total: targets.length,
    successCount: results.filter(item => item.ok).length,
    failureCount: results.filter(item => !item.ok).length,
    results
  }
}

module.exports = {
  buildHotCityIngestionTargets,
  ingestActiveLocations
}
