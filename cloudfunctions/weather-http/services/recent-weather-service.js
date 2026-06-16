'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const {
  buildLocationKey,
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath,
  buildWeatherRawForecastObjectPath,
  normalizeWeatherCoordinates
} = require('./weather-cache-paths')
const { addDays, formatLocalDateInTimezone, normalizeDate } = require('./recent-weather-features')
const {
  getRecentWeatherFromMemory,
  setRecentWeatherInMemory
} = require('./recent-weather-memory-cache')
const { createWeatherLocationRepository } = require('../repositories/weather-location-repository')
const { createWeatherObjectStorage } = require('./weather-object-storage')
const {
  normalizeRecentHistoricalDays,
  normalizeRecentPayload
} = require('./recent-weather-normalize')
const { ingestActiveLocations: ingestActiveLocationsBatch } = require('./recent-weather-batch')
const {
  findHistoricalRawSnapshotForDate,
  readManifest,
  rebuildRecentWeather
} = require('./recent-weather-archive')
const {
  RECENT_SCHEMA_VERSION,
  asArray,
  buildDailyArchivePayload,
  buildRecentWeatherPayload,
  isPlainObject
} = require('./recent-weather-payloads')

function resolveLocationInput(input = {}) {
  const locationKey = buildLocationKey(input)
  if (!locationKey) {
    throw new Error('缺少天气地点 locationKey 或 city/qweatherLocationId')
  }

  return {
    locationKey,
    qweatherLocationId: String(input.qweatherLocationId || input.qweather_location_id || '').trim(),
    cityName: String(input.cityName || input.city || input.city_name || '').trim(),
    timezone: String(input.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
    isActive: input.isActive ?? input.is_active ?? true
  }
}

function isCoordinateLocationKey(locationKey = '') {
  return String(locationKey || '').startsWith('coord:')
}

function hasDailyArchiveEntries(manifest = {}) {
  return Boolean(Object.keys(manifest?.dailyArchives || {}).length)
}

async function pruneFutureDailyArchives({ storage, manifest, targetDate }) {
  const normalizedTargetDate = normalizeDate(targetDate)
  const removed = []
  for (const [date, archiveMeta] of Object.entries(manifest?.dailyArchives || {})) {
    const normalizedDate = normalizeDate(date)
    if (!normalizedDate || normalizedDate <= normalizedTargetDate) {
      continue
    }
    delete manifest.dailyArchives[date]
    const cloudPath = archiveMeta?.cloudPath || ''
    const fileId = archiveMeta?.fileId || ''
    if (typeof storage.deleteJson === 'function' && (cloudPath || fileId)) {
      await storage.deleteJson({ cloudPath, fileId }).catch(() => false)
    }
    removed.push({ date: normalizedDate, cloudPath, fileId })
  }
  return removed
}

function resolveDiagnosisDate(input = {}) {
  return String(input.diagnosisDate || input.diagnosis_date || input.date || '').trim()
}

function recentPayloadMatchesDiagnosisDate(payload = {}, diagnosisDate = '') {
  if (!diagnosisDate) {
    return true
  }

  const normalizedDiagnosisDate = normalizeDate(diagnosisDate)
  const expectedTargetDate = addDays(normalizedDiagnosisDate, -1)
  const payloadDiagnosisDate = normalizeDate(
    payload.meta?.diagnosisDate || payload.meta?.diagnosis_date || ''
  )
  const payloadTargetDate = normalizeDate(payload.window?.targetDate || '')
  return (
    payloadDiagnosisDate === normalizedDiagnosisDate || payloadTargetDate === expectedTargetDate
  )
}

function shouldRebuildRecentPayloadFromArchives(payload = {}, diagnosisDate = '') {
  if (!payload) {
    return true
  }
  if (!recentPayloadMatchesDiagnosisDate(payload, diagnosisDate)) {
    return true
  }
  return Boolean(
    payload.weatherEvidenceInsufficient ||
    payload.quality === 'missing' ||
    payload.meta?.quality === 'missing' ||
    payload.meta?.weatherEvidenceInsufficient
  )
}

function createRecentWeatherService({
  storage = createWeatherObjectStorage(),
  locationRepository = createWeatherLocationRepository(),
  adapter = null,
  apiKey = '',
  baseUrl = '',
  now = () => new Date()
} = {}) {
  async function readRecentWeather({ locationKey = '', bypassMemory = false } = {}) {
    const key = String(locationKey || '').trim()
    if (!key) {
      return null
    }
    if (!bypassMemory) {
      const memoryPayload = getRecentWeatherFromMemory(key)
      if (memoryPayload) {
        return {
          payload: memoryPayload,
          cacheHit: true,
          sourceKind: 'memory_map'
        }
      }
    }

    const defaultObjectPath = buildRecentWeatherObjectPath(key)
    const defaultPayload = await storage.downloadJson({
      cloudPath: defaultObjectPath,
      fileId: ''
    })
    if (defaultPayload) {
      const normalizedPayload = normalizeRecentPayload(defaultPayload)
      setRecentWeatherInMemory(key, normalizedPayload)
      return {
        payload: normalizedPayload,
        cacheHit: false,
        sourceKind: 'object_storage'
      }
    }

    const location =
      !isCoordinateLocationKey(key) && typeof locationRepository.findByLocationKey === 'function'
        ? await locationRepository.findByLocationKey(key).catch(() => null)
        : null
    if (!location) {
      return null
    }
    const objectPath = location?.recentObjectPath || defaultObjectPath
    const payload = await storage.downloadJson({
      cloudPath: objectPath,
      fileId: location?.recentFileId || ''
    })
    if (!payload) {
      return null
    }
    const normalizedPayload = normalizeRecentPayload(payload)
    setRecentWeatherInMemory(key, normalizedPayload)
    return {
      payload: normalizedPayload,
      cacheHit: false,
      sourceKind: 'object_storage'
    }
  }

  async function rebuildRecentWeatherFromArchives({
    locationKey = '',
    diagnosisDate = '',
    location = null
  } = {}) {
    const key = String(locationKey || '').trim()
    if (!key) {
      return null
    }

    const fallbackLocation = {
      locationKey: key,
      qweatherLocationId: '',
      cityName: '',
      timezone: 'Asia/Shanghai',
      isActive: true
    }
    const defaultManifestLocation = {
      ...(location || fallbackLocation),
      manifestObjectPath: buildWeatherManifestObjectPath(key),
      manifestFileId: ''
    }
    const defaultManifest = await readManifest({
      storage,
      location: defaultManifestLocation
    }).catch(() => null)
    const resolvedLocation =
      location ||
      (!hasDailyArchiveEntries(defaultManifest) &&
      !isCoordinateLocationKey(key) &&
      typeof locationRepository.findByLocationKey === 'function'
        ? await locationRepository.findByLocationKey(key).catch(() => null)
        : null) ||
      fallbackLocation
    const generatedAt = now().toISOString()
    const localToday = formatLocalDateInTimezone(now(), resolvedLocation.timezone)
    const targetDate = normalizeDate(
      diagnosisDate ? addDays(diagnosisDate, -1) : addDays(localToday, -1)
    )
    const manifest = (hasDailyArchiveEntries(defaultManifest)
      ? defaultManifest
      : await readManifest({ storage, location: resolvedLocation }).catch(() => null)) || {
      dailyArchives: {}
    }
    const hasManifestDailyEntries = Object.keys(manifest.dailyArchives || {}).length > 0

    const rebuilt = await rebuildRecentWeather({
      storage,
      location: resolvedLocation,
      targetDate,
      generatedAt,
      manifest,
      uploadMissingRecent: hasManifestDailyEntries
    })
    if (rebuilt.skippedUpload || !rebuilt.uploadResult) {
      return null
    }
    if (typeof locationRepository.updateRecentObjectMetadata === 'function') {
      await locationRepository
        .updateRecentObjectMetadata({
          locationKey: resolvedLocation.locationKey,
          recentObjectPath: rebuilt.recentPayload.weatherObjectPath,
          recentFileId: rebuilt.uploadResult.fileId,
          manifestObjectPath:
            resolvedLocation.manifestObjectPath ||
            buildWeatherManifestObjectPath(resolvedLocation.locationKey),
          manifestFileId: resolvedLocation.manifestFileId || '',
          recentGeneratedAt: generatedAt
        })
        .catch(() => null)
    }

    return {
      payload: normalizeRecentPayload(rebuilt.recentPayload),
      cacheHit: false,
      sourceKind: 'rebuilt_from_daily_archives'
    }
  }

  async function readRecentWeatherForDiagnosis(input = {}) {
    const locationKey = buildLocationKey(input)
    if (!locationKey) {
      return {
        weatherEvidenceInsufficient: true,
        reason: 'location_key_missing',
        historicalDays: [],
        meta: {
          sourceKind: 'weather_cache_recent_10d',
          quality: 'missing',
          weatherEvidenceInsufficient: true,
          warnings: ['location_key_missing'],
          recordCounts: {
            historicalDays: 0,
            forecastDays: 0,
            totalDailyRecords: 0
          }
        }
      }
    }

    let result = null
    try {
      result = await readRecentWeather({ locationKey })
    } catch (error) {
      return {
        weatherEvidenceInsufficient: true,
        locationKey,
        historicalDays: [],
        meta: {
          sourceKind: 'weather_cache_recent_10d',
          quality: 'missing',
          weatherObjectPath: buildRecentWeatherObjectPath(locationKey),
          weatherEvidenceInsufficient: true,
          warnings: [`recent_10d_read_failed:${error.message || error}`],
          recordCounts: {
            historicalDays: 0,
            forecastDays: 0,
            totalDailyRecords: 0
          }
        }
      }
    }
    const diagnosisDate = resolveDiagnosisDate(input)
    if (result?.payload && shouldRebuildRecentPayloadFromArchives(result.payload, diagnosisDate)) {
      result = null
    }
    if (!result?.payload) {
      result = await rebuildRecentWeatherFromArchives({
        locationKey,
        diagnosisDate
      }).catch(() => null)
    }

    if (!result?.payload) {
      return {
        weatherEvidenceInsufficient: true,
        locationKey,
        historicalDays: [],
        meta: {
          sourceKind: 'weather_cache_recent_10d',
          quality: 'missing',
          weatherObjectPath: buildRecentWeatherObjectPath(locationKey),
          weatherEvidenceInsufficient: true,
          warnings: ['recent_10d_object_missing'],
          recordCounts: {
            historicalDays: 0,
            forecastDays: 0,
            totalDailyRecords: 0
          }
        }
      }
    }

    return {
      ...result.payload,
      cacheHit: result.cacheHit,
      cacheSourceKind: result.sourceKind,
      historicalDays: normalizeRecentHistoricalDays(result.payload),
      meta: {
        ...(isPlainObject(result.payload.meta) ? result.payload.meta : {}),
        sourceKind: result.payload.sourceKind || 'weather_cache_recent_10d',
        quality: result.payload.quality || 'partial',
        weatherObjectPath:
          result.payload.weatherObjectPath || buildRecentWeatherObjectPath(locationKey),
        cacheHit: result.cacheHit,
        cacheSourceKind: result.sourceKind,
        weatherEvidenceInsufficient: Boolean(result.payload.weatherEvidenceInsufficient),
        recordCounts: {
          ...(isPlainObject(result.payload.meta?.recordCounts)
            ? result.payload.meta.recordCounts
            : {}),
          historicalDays: normalizeRecentHistoricalDays(result.payload).length,
          forecastDays: 0,
          totalDailyRecords: normalizeRecentHistoricalDays(result.payload).length
        }
      }
    }
  }

  async function ingestRecentForecast(input = {}) {
    const locationInput = resolveLocationInput(input)
    const location =
      !isCoordinateLocationKey(locationInput.locationKey) &&
      typeof locationRepository.upsertLocation === 'function'
        ? await locationRepository.upsertLocation(locationInput).catch(() => locationInput)
        : locationInput
    const generatedAtDate = now()
    const generatedAt = generatedAtDate.toISOString()
    const localToday = formatLocalDateInTimezone(generatedAtDate, location.timezone)
    const targetDate = normalizeDate(input.targetDate || addDays(localToday, -1))
    const manifest = await readManifest({ storage, location })
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const normalizedCoordinates = normalizeWeatherCoordinates(input) || {}
    const forecast = await qweatherAdapter.fetchForecast10d({
      locationId: location.qweatherLocationId,
      lat: normalizedCoordinates.lat,
      lng: normalizedCoordinates.lng
    })
    const rawObjectPath = buildWeatherRawForecastObjectPath(
      location.locationKey,
      generatedAt.replace(/\.\d{3}Z$/, 'Z')
    )
    const rawPayload = {
      schemaVersion: 'weather-cache/v1/raw-forecast-10d',
      location,
      generatedAt,
      sourceKind: 'qweather_forecast_10d',
      raw: forecast.raw || {},
      daily: asArray(forecast.daily)
    }
    const rawUpload = await storage.uploadJson({ cloudPath: rawObjectPath, payload: rawPayload })
    const historicalSnapshot = await findHistoricalRawSnapshotForDate({
      storage,
      manifest,
      targetDate
    })
    const dailySnapshot = historicalSnapshot?.payload || rawPayload
    const dailyRawObjectPath = historicalSnapshot?.rawObjectPath || rawObjectPath
    const dailyObjectPath = buildWeatherDailyObjectPath(location.locationKey, targetDate)
    const dailyPayload = buildDailyArchivePayload({
      location,
      targetDate,
      snapshot: dailySnapshot,
      rawObjectPath: dailyRawObjectPath,
      dailyObjectPath,
      generatedAt
    })
    const dailyUpload = await storage.uploadJson({
      cloudPath: dailyObjectPath,
      payload: dailyPayload
    })

    manifest.rawSnapshots.push({
      cloudPath: rawObjectPath,
      fileId: rawUpload.fileId,
      generatedAt,
      sourceKind: 'qweather_forecast_10d'
    })
    manifest.rawSnapshots = manifest.rawSnapshots.slice(-40)
    manifest.dailyArchives[targetDate] = {
      cloudPath: dailyObjectPath,
      fileId: dailyUpload.fileId,
      generatedAt,
      quality: dailyPayload.quality
    }
    const prunedFutureDailyArchives = await pruneFutureDailyArchives({
      storage,
      manifest,
      targetDate
    })

    manifest.updatedAt = generatedAt

    const { recentPayload, uploadResult } = await rebuildRecentWeather({
      storage,
      location,
      targetDate,
      generatedAt,
      manifest
    })
    const normalizedRecentPayload = normalizeRecentPayload(recentPayload)
    setRecentWeatherInMemory(location.locationKey, normalizedRecentPayload)

    const manifestPath = buildWeatherManifestObjectPath(location.locationKey)
    const manifestUpload = await storage.uploadJson({ cloudPath: manifestPath, payload: manifest })
    if (typeof locationRepository.updateRecentObjectMetadata === 'function') {
      await locationRepository
        .updateRecentObjectMetadata({
          locationKey: location.locationKey,
          recentObjectPath: recentPayload.weatherObjectPath,
          recentFileId: uploadResult.fileId,
          manifestObjectPath: manifestPath,
          manifestFileId: manifestUpload.fileId,
          recentGeneratedAt: generatedAt
        })
        .catch(() => null)
    }

    return {
      location,
      rawObjectPath,
      dailyObjectPath,
      manifestPath,
      manifestFileId: manifestUpload.fileId,
      recentObjectPath: recentPayload.weatherObjectPath,
      recentFileId: uploadResult.fileId,
      targetDate,
      forecastDailyArchives: [],
      prunedFutureDailyArchives,
      quality: recentPayload.quality,
      recentPayload: normalizedRecentPayload
    }
  }

  async function ingestActiveLocations({ limit = 20 } = {}) {
    return ingestActiveLocationsBatch({
      locationRepository,
      ingestRecentForecast,
      limit
    })
  }

  return {
    ingestActiveLocations,
    ingestRecentForecast,
    readRecentWeather,
    readRecentWeatherForDiagnosis
  }
}

module.exports = {
  RECENT_SCHEMA_VERSION,
  buildDailyArchivePayload,
  buildRecentWeatherPayload,
  createRecentWeatherService,
  resolveLocationInput
}
