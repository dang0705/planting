'use strict'

const {
  buildLocationKey,
  buildRecentWeatherObjectPath,
  buildWeatherManifestObjectPath
} = require('./weather-cache-paths')
const { addDays, formatLocalDateInTimezone, normalizeDate } = require('./recent-weather-features')
const {
  getRecentWeatherFromMemory,
  setRecentWeatherInMemory
} = require('./recent-weather-memory-cache')
const { createWeatherLocationRepository } = require('../repositories/weather-location-repository')
const { createWeatherObjectStorage } = require('./weather-object-storage')
const { normalizeRecentPayload } = require('./recent-weather-normalize')
const { ingestActiveLocations: ingestActiveLocationsBatch } = require('./recent-weather-batch')
const {
  readManifest,
  rebuildRecentWeather
} = require('./recent-weather-archive')
const {
  RECENT_SCHEMA_VERSION,
  buildRecentWeatherPayload
} = require('./recent-weather-payloads')
const { createCurrentWeatherArchiveService } = require('./recent-weather-current')
const { createD0NowSampleService } = require('./d0-now-sample-service')
const { createDiagnosisRecentWeatherReader } = require('./recent-weather-diagnosis-reader')
const { formatIsoInTimezone } = require('./now-sample-slots')

function resolveLocationInput(input = {}) {
  const locationKey = buildLocationKey(input)
  if (!locationKey) {
    throw new Error('缺少天气地点 locationKey 或 city/qweatherLocationId')
  }

  return {
    locationKey,
    qweatherLocationId: String(input.qweatherLocationId || input.qweather_location_id || '').trim(),
    cityName: String(input.cityName || input.city || input.city_name || '').trim(),
    latitude: input.latitude ?? input.lat ?? null,
    longitude: input.longitude ?? input.lng ?? null,
    timezone: String(input.timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai',
    isActive: input.isActive ?? input.is_active ?? true
  }
}

function isCoordinateLocationKey(locationKey = '') {
  return String(locationKey || '').startsWith('coord:')
}

function hasArchiveEntries(manifest = {}) {
  return Boolean(Object.keys(manifest?.dayArchives || {}).length)
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
      (!hasArchiveEntries(defaultManifest) &&
      !isCoordinateLocationKey(key) &&
      typeof locationRepository.findByLocationKey === 'function'
        ? await locationRepository.findByLocationKey(key).catch(() => null)
        : null) ||
      fallbackLocation
    const generatedAt = formatIsoInTimezone(now(), resolvedLocation.timezone || 'Asia/Shanghai')
    const localToday = formatLocalDateInTimezone(now(), resolvedLocation.timezone)
    const targetDate = normalizeDate(
      diagnosisDate ? addDays(diagnosisDate, -1) : addDays(localToday, -1)
    )
    const manifest = (hasArchiveEntries(defaultManifest)
      ? defaultManifest
      : await readManifest({ storage, location: resolvedLocation }).catch(() => null)) || {
      dayArchives: {},
      dailyArchives: {}
    }
    const hasManifestEntries = hasArchiveEntries(manifest)

    const rebuilt = await rebuildRecentWeather({
      storage,
      location: resolvedLocation,
      targetDate,
      generatedAt,
      manifest,
      uploadMissingRecent: hasManifestEntries
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
      sourceKind: 'rebuilt_from_day_archives'
    }
  }

  async function resolveArchiveLocation(locationInput = {}) {
    return !isCoordinateLocationKey(locationInput.locationKey) &&
      typeof locationRepository.upsertLocation === 'function'
      ? await locationRepository.upsertLocation(locationInput).catch(() => locationInput)
      : locationInput
  }

  const currentWeatherArchive = createCurrentWeatherArchiveService({
    storage,
    now,
    resolveLocationInput
  })
  const d0NowSample = createD0NowSampleService({
    storage,
    locationRepository,
    adapter,
    apiKey,
    baseUrl,
    now,
    resolveLocationInput
  })
  const readRecentWeatherForDiagnosis = createDiagnosisRecentWeatherReader({
    readRecentWeather,
    rebuildRecentWeatherFromArchives
  })

  /**
   * 采集最近天气。新架构下不再拉取 forecast 10d，
   * 而是从已 finalize 的 days 文件聚合重建 recent-10d.json。
   */
  async function ingestRecentForecast(input = {}) {
    const locationInput = resolveLocationInput(input)
    const location = await resolveArchiveLocation(locationInput)
    const generatedAtDate = now()
    const localToday = formatLocalDateInTimezone(generatedAtDate, locationInput.timezone)
    const targetDate = normalizeDate(input.targetDate || addDays(localToday, -1))
    const manifest = await readManifest({ storage, location }).catch(() => ({
      dayArchives: {},
      dailyArchives: {}
    }))

    const rebuilt = await rebuildRecentWeather({
      storage,
      location,
      targetDate,
      generatedAt: formatIsoInTimezone(generatedAtDate, locationInput.timezone || 'Asia/Shanghai'),
      manifest,
      uploadMissingRecent: hasArchiveEntries(manifest)
    })
    const recentPayload = rebuilt.recentPayload
    const uploadResult = rebuilt.uploadResult
    const normalizedRecentPayload = normalizeRecentPayload(recentPayload)
    if (uploadResult) {
      setRecentWeatherInMemory(location.locationKey, normalizedRecentPayload)
    }

    const manifestPath = buildWeatherManifestObjectPath(location.locationKey)
    const manifestUpload = await storage.uploadJson({ cloudPath: manifestPath, payload: manifest })
    if (typeof locationRepository.updateRecentObjectMetadata === 'function' && uploadResult) {
      await locationRepository
        .updateRecentObjectMetadata({
          locationKey: location.locationKey,
          recentObjectPath: recentPayload.weatherObjectPath,
          recentFileId: uploadResult.fileId,
          manifestObjectPath: manifestPath,
          manifestFileId: manifestUpload.fileId,
          recentGeneratedAt: formatIsoInTimezone(generatedAtDate, locationInput.timezone || 'Asia/Shanghai')
        })
        .catch(() => null)
    }

    return {
      location,
      manifestPath,
      manifestFileId: manifestUpload.fileId,
      recentObjectPath: recentPayload.weatherObjectPath,
      recentFileId: uploadResult?.fileId || '',
      targetDate,
      forecastDailyArchives: [],
      prunedFutureDailyArchives: [],
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
    getCurrentWeatherFromDailyArchive: currentWeatherArchive.getCurrentWeatherFromDailyArchive,
    ingestActiveLocations,
    ingestRecentForecast,
    readRecentWeather,
    readRecentWeatherForDiagnosis,
    sampleNowWeather: d0NowSample.sampleNowWeather,
    finalizeNowWeather: d0NowSample.finalizeNowWeather,
    updateNowSample: d0NowSample.updateNowSample,
    updateD0Weather24hWorking: d0NowSample.updateD0Weather24hWorking
  }
}

module.exports = {
  RECENT_SCHEMA_VERSION,
  buildRecentWeatherPayload,
  createRecentWeatherService,
  resolveLocationInput
}
