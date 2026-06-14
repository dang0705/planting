'use strict'

async function ingestActiveLocations({
  locationRepository,
  ingestRecentForecast,
  limit = 20
} = {}) {
  if (typeof locationRepository?.listActiveLocations !== 'function') {
    throw new Error('天气地点仓储缺少 listActiveLocations')
  }

  const locations = await locationRepository.listActiveLocations({ limit })
  const results = []

  for (const location of locations) {
    try {
      const result = await ingestRecentForecast({
        locationKey: location.locationKey,
        qweatherLocationId: location.qweatherLocationId,
        cityName: location.cityName,
        timezone: location.timezone
      })
      results.push({
        locationKey: location.locationKey,
        ok: true,
        recentObjectPath: result.recentObjectPath,
        targetDate: result.targetDate,
        quality: result.quality
      })
    } catch (error) {
      results.push({
        locationKey: location.locationKey,
        ok: false,
        message: String(error?.message || error || '')
      })
    }
  }

  return {
    total: locations.length,
    successCount: results.filter(item => item.ok).length,
    failureCount: results.filter(item => !item.ok).length,
    results
  }
}

module.exports = {
  ingestActiveLocations
}
