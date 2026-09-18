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
const { RECENT_SCHEMA_VERSION, buildRecentWeatherPayload } = require('./recent-weather-payloads')
const { createDiagnosisRecentWeatherReader } = require('./recent-weather-diagnosis-reader')
const { formatIsoInTimezone } = require('./now-sample-slots')

const recentWeatherReadInFlight = new Map()
const storageIds = new WeakMap()
let nextStorageId = 1

function getStorageId(storage) {
  if (!storage || (typeof storage !== 'object' && typeof storage !== 'function')) {
    return 'default'
  }
  if (!storageIds.has(storage)) {
    storageIds.set(storage, nextStorageId++)
  }
  return String(storageIds.get(storage))
}

function loadRecentWeatherArchive() {
  return require('./recent-weather-archive')
}

function loadRecentWeatherBatch() {
  return require('./recent-weather-batch')
}

function loadCurrentWeatherArchive() {
  return require('./recent-weather-current')
}

function loadD0NowSampleService() {
  return require('./d0-now-sample-service')
}

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

    const inFlightKey = `${getStorageId(storage)}:${bypassMemory ? 'bypass' : 'normal'}:${key}`
    const inFlight = recentWeatherReadInFlight.get(inFlightKey)
    if (inFlight) {
      return inFlight
    }

    const readPromise = (async () => {
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
    })()
    recentWeatherReadInFlight.set(inFlightKey, readPromise)
    readPromise.then(
      () => recentWeatherReadInFlight.delete(inFlightKey),
      () => recentWeatherReadInFlight.delete(inFlightKey)
    )
    return readPromise
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
    const { readManifest, rebuildRecentWeather } = loadRecentWeatherArchive()
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

  const { createCurrentWeatherArchiveService } = loadCurrentWeatherArchive()
  const currentWeatherArchive = createCurrentWeatherArchiveService({
    storage,
    now,
    resolveLocationInput
  })
  let d0NowSample
  function getD0NowSampleService() {
    if (!d0NowSample) {
      const { createD0NowSampleService } = loadD0NowSampleService()
      d0NowSample = createD0NowSampleService({
        storage,
        locationRepository,
        adapter,
        apiKey,
        baseUrl,
        now,
        resolveLocationInput
      })
    }
    return d0NowSample
  }

  async function runD0Mutation(methodName, input = {}) {
    const result = await getD0NowSampleService()[methodName](input)
    currentWeatherArchive.clearCurrentWeatherCache({
      locationKey: result?.location?.locationKey || input.locationKey || input.location_key,
      targetDate: result?.targetDate || input.targetDate || input.target_date || input.date
    })
    return result
  }
  const readRecentWeatherForDiagnosis = createDiagnosisRecentWeatherReader({
    readRecentWeather,
    rebuildRecentWeatherFromArchives
  })

  /**
   * 采集历史天气。新架构下不再拉取 forecast 10d，
   * 而是从已 finalize 的 D-1..D-10 days 文件聚合重建 recent-10d.json；
   * D0 最新天气由独立 now 采样链路写入当天 day file.latestSample，不由本函数生成。
   */
  async function ingestRecentForecast(input = {}) {
    const locationInput = resolveLocationInput(input)
    const location = await resolveArchiveLocation(locationInput)
    const generatedAtDate = now()
    const localToday = formatLocalDateInTimezone(generatedAtDate, locationInput.timezone)
    const latestHistoricalDate = addDays(localToday, -1)
    const requestedTargetDate = String(input.targetDate || '').trim()
    const targetDate =
      requestedTargetDate && normalizeDate(requestedTargetDate) < latestHistoricalDate
        ? normalizeDate(requestedTargetDate)
        : latestHistoricalDate
    const { readManifest, rebuildRecentWeather } = loadRecentWeatherArchive()
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
          recentGeneratedAt: formatIsoInTimezone(
            generatedAtDate,
            locationInput.timezone || 'Asia/Shanghai'
          )
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
    const { ingestActiveLocations: ingestActiveLocationsBatch } = loadRecentWeatherBatch()
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
    sampleNowWeather: input => runD0Mutation('sampleNowWeather', input),
    finalizeNowWeather: input => runD0Mutation('finalizeNowWeather', input),
    updateNowSample: input => runD0Mutation('updateNowSample', input),
    updateD0Weather24hWorking: input => runD0Mutation('updateD0Weather24hWorking', input)
  }
}

module.exports = {
  RECENT_SCHEMA_VERSION,
  buildRecentWeatherPayload,
  createRecentWeatherService,
  resolveLocationInput
}
