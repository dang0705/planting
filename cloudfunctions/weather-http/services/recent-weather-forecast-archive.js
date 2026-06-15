'use strict'

const { buildWeatherDailyObjectPath } = require('./weather-cache-paths')
const {
  asArray,
  buildDailyArchivePayload,
  snapshotHasDailyForDate
} = require('./recent-weather-payloads')
const { normalizeDate } = require('./recent-weather-features')

async function archiveForecastSnapshotDailyEntries({
  location,
  generatedAt,
  manifest,
  snapshot,
  rawObjectPath,
  storage
}) {
  const dates = [
    ...new Set(
      asArray(snapshot?.daily || snapshot?.raw?.daily)
        .map(day => normalizeDate(day?.date || day?.fxDate))
        .filter(Boolean)
    )
  ]
  const archived = []

  for (const date of dates) {
    if (!snapshotHasDailyForDate(snapshot, date)) {
      continue
    }

    const dailyObjectPath = buildWeatherDailyObjectPath(location.locationKey, date)
    const dailyPayload = buildDailyArchivePayload({
      location,
      targetDate: date,
      snapshot,
      rawObjectPath,
      dailyObjectPath,
      generatedAt
    })
    const dailyUpload = await storage.uploadJson({
      cloudPath: dailyObjectPath,
      payload: dailyPayload
    })
    manifest.dailyArchives[date] = {
      cloudPath: dailyObjectPath,
      fileId: dailyUpload.fileId,
      generatedAt,
      quality: dailyPayload.quality
    }
    archived.push({
      date,
      dailyObjectPath,
      dailyPayload,
      dailyUpload
    })
  }

  return archived
}

module.exports = {
  archiveForecastSnapshotDailyEntries
}
