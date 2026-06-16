'use strict'

const {
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath
} = require('./weather-cache-paths')
const { buildDateRangeEndingAt, normalizeDailyWeatherRecord } = require('./recent-weather-features')
const { setRecentWeatherInMemory } = require('./recent-weather-memory-cache')
const {
  asArray,
  buildMissingDailyRecord,
  buildRecentWeatherPayload,
  normalizeManifest,
  snapshotHasDailyForDate
} = require('./recent-weather-payloads')
const { isDisallowedHistoricalDaily } = require('./recent-weather-source-policy')

function resolveDailyArchiveRecord(payload = {}) {
  if (payload?.daily) {
    return payload.daily
  }

  if (
    payload?.date ||
    payload?.fxDate ||
    payload?.uvIndex !== undefined ||
    payload?.tempMaxC !== undefined ||
    payload?.humidity !== undefined
  ) {
    return payload
  }

  return null
}

async function readManifest({ storage, location }) {
  const locationKey = location.locationKey
  const manifestPath = location.manifestObjectPath || buildWeatherManifestObjectPath(locationKey)
  const manifest = await storage.downloadJson({
    cloudPath: manifestPath,
    fileId: location.manifestFileId || ''
  })
  return normalizeManifest(manifest, locationKey)
}

async function readRawSnapshot({ storage, snapshotMeta = {} } = {}) {
  const cloudPath = String(snapshotMeta.cloudPath || '').trim()
  const fileId = String(snapshotMeta.fileId || '').trim()
  if (!cloudPath && !fileId) {
    return null
  }

  const payload = await storage.downloadJson({ cloudPath, fileId })
  if (!payload) {
    return null
  }

  return {
    payload,
    rawObjectPath: payload.rawObjectPath || cloudPath,
    generatedAt: payload.generatedAt || snapshotMeta.generatedAt || ''
  }
}

async function findHistoricalRawSnapshotForDate({ storage, manifest, targetDate }) {
  const snapshots = asArray(manifest.rawSnapshots).slice().reverse()
  for (const snapshotMeta of snapshots) {
    const snapshot = await readRawSnapshot({ storage, snapshotMeta }).catch(() => null)
    if (snapshot?.payload && snapshotHasDailyForDate(snapshot.payload, targetDate)) {
      return snapshot
    }
  }
  return null
}

async function readDailyArchive({ storage, location, date, manifest }) {
  const dailyArchiveMeta = manifest.dailyArchives?.[date] || {}
  const dailyObjectPath =
    dailyArchiveMeta.cloudPath || buildWeatherDailyObjectPath(location.locationKey, date)
  const payload = await storage.downloadJson({
    cloudPath: dailyObjectPath,
    fileId: dailyArchiveMeta.fileId || ''
  })
  const dailyRecord = resolveDailyArchiveRecord(payload)
  if (!dailyRecord) {
    return buildMissingDailyRecord({ date, dailyObjectPath })
  }
  if (isDisallowedHistoricalDaily(payload)) {
    return buildMissingDailyRecord({
      date,
      dailyObjectPath,
      reason: 'qweather_historical_weather_disallowed'
    })
  }
  return normalizeDailyWeatherRecord(dailyRecord, {
    date,
    source: 'weather_cache_daily_archive',
    sourceKind: dailyRecord.sourceKind || payload.sourceKind || 'weather_cache_daily_archive',
    weatherObjectPath: dailyRecord.weatherObjectPath || dailyObjectPath,
    rawObjectPath: payload.rawObjectPath || ''
  })
}

async function rebuildRecentWeather({
  storage,
  location,
  targetDate,
  generatedAt,
  manifest,
  uploadMissingRecent = true
}) {
  const dates = buildDateRangeEndingAt(targetDate, 10)
  const dailyObjectPaths = {}
  const days = []

  for (const date of dates) {
    const dailyObjectPath =
      manifest.dailyArchives?.[date]?.cloudPath ||
      buildWeatherDailyObjectPath(location.locationKey, date)
    dailyObjectPaths[date] = dailyObjectPath
    days.push(await readDailyArchive({ storage, location, date, manifest }))
  }

  const recentPayload = buildRecentWeatherPayload({
    location,
    targetDate,
    generatedAt,
    days,
    dailyObjectPaths
  })
  if (!uploadMissingRecent && recentPayload.quality === 'missing') {
    return {
      recentPayload,
      uploadResult: null,
      skippedUpload: true
    }
  }

  const uploadResult = await storage.uploadJson({
    cloudPath: recentPayload.weatherObjectPath,
    payload: recentPayload
  })

  setRecentWeatherInMemory(location.locationKey, recentPayload)

  return {
    recentPayload,
    uploadResult
  }
}

module.exports = {
  buildRecentWeatherObjectPath,
  findHistoricalRawSnapshotForDate,
  isDisallowedHistoricalDaily,
  readManifest,
  rebuildRecentWeather
}
