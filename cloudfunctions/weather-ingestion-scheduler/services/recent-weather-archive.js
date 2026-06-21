'use strict'

const {
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
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

/**
 * 从 days/{date}.json 读取已 finalize 的单日归档，
 * 从嵌套 dailyRollup 结构提取 historicalDays 使用的 normalizeDailyWeatherRecord。
 * 只接受 state=finalized 的 day file。
 */
function convertDayFileToDailyRecord(dayPayload = {}, date = '') {
  if (!dayPayload || String(dayPayload.state || '') !== 'finalized') {
    return null
  }

  const rollup = dayPayload.dailyRollup
  if (!rollup) {
    return null
  }

  // 从嵌套结构提取字段
  const tempFeatures = rollup.tempFeatures || {}
  const moistureFeatures = rollup.moistureFeatures || {}
  const lightFeatures = rollup.lightFeatures || {}

  return normalizeDailyWeatherRecord(
    {
      date: date || rollup.date || dayPayload?.date,
      tempMaxC: tempFeatures.tempMax ?? rollup.tempMax ?? tempFeatures.tempMean,
      tempMinC: rollup.tempMin ?? tempFeatures.tempMean,
      humidity: moistureFeatures.humidityMean ?? rollup.humidity,
      precipMm: moistureFeatures.precipLastHourSum ?? rollup.precipMm,
      cloud: lightFeatures.daylightCloudMean ?? rollup.cloud,
      textDay: rollup.dominantWeatherText || rollup.text || '',
      windSpeedDay: rollup.windSpeed,
      source: 'weather_cache_day_finalized',
      sourceKind: 'observed_now_rollup',
      quality: rollup.quality || 'partial',
      weatherObjectPath: dayPayload?.weatherObjectPath || ''
    },
    {
      date,
      sourceKind: 'observed_now_rollup',
      quality: rollup.quality || 'partial'
    }
  )
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

/**
 * 读取单日归档。只从 manifest.dayArchives 指向的 days/{date}.json 读取，
 * 且只接受 state=finalized 的文件。
 * 不 fallback 到旧 dailyArchives / working / 非 finalized 的 day file。
 */
async function readDailyArchive({ storage, location, date, manifest }) {
  const dayArchiveMeta = manifest.dayArchives?.[date]

  let dayObjectPath = ''
  let payload = null

  if (dayArchiveMeta?.cloudPath || dayArchiveMeta?.fileId) {
    dayObjectPath = dayArchiveMeta.cloudPath || buildWeatherDayObjectPath(location.locationKey, date)
    payload = await storage
      .downloadJson({ cloudPath: dayObjectPath, fileId: dayArchiveMeta.fileId || '' })
      .catch(() => null)
  }

  // 如果 manifest 没有 dayArchives 条目，仍尝试直接读 days/{date}.json
  if (!payload) {
    dayObjectPath = buildWeatherDayObjectPath(location.locationKey, date)
    payload = await storage.downloadJson({ cloudPath: dayObjectPath, fileId: '' }).catch(() => null)
  }

  if (payload) {
    const record = convertDayFileToDailyRecord(payload, date)
    if (record) {
      return record
    }
    // payload 存在但不是 finalized day file → 返回 missing
    return buildMissingDailyRecord({
      date,
      dailyObjectPath: dayObjectPath,
      reason: 'day_file_not_finalized'
    })
  }

  return buildMissingDailyRecord({ date, dailyObjectPath: dayObjectPath })
}

/**
 * 重建 recent-10d.json。只聚合 D-1 到 D-10 且 state=finalized 的 days 文件；
 * D0 今日不得进入 recent-10d。
 */
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
    const dayObjectPath =
      manifest.dayArchives?.[date]?.cloudPath ||
      buildWeatherDayObjectPath(location.locationKey, date)
    dailyObjectPaths[date] = dayObjectPath
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
  convertDayFileToDailyRecord,
  findHistoricalRawSnapshotForDate,
  isDisallowedHistoricalDaily,
  readManifest,
  rebuildRecentWeather
}
