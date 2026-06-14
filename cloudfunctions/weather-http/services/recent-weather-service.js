'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const {
  buildLocationKey,
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath,
  buildWeatherRawForecastObjectPath
} = require('./weather-cache-paths')
const { addDays, formatLocalDateInTimezone, normalizeDate } = require('./recent-weather-features')
const {
  getRecentWeatherFromMemory,
  setRecentWeatherInMemory
} = require('./recent-weather-memory-cache')
const { createWeatherLocationRepository } = require('../repositories/weather-location-repository')
const { createWeatherObjectStorage } = require('./weather-object-storage')
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

    const location =
      typeof locationRepository.findByLocationKey === 'function'
        ? await locationRepository.findByLocationKey(key).catch(() => null)
        : null
    const objectPath = location?.recentObjectPath || buildRecentWeatherObjectPath(key)
    const payload = await storage.downloadJson({
      cloudPath: objectPath,
      fileId: location?.recentFileId || ''
    })
    if (!payload) {
      return null
    }
    setRecentWeatherInMemory(key, payload)
    return {
      payload,
      cacheHit: false,
      sourceKind: 'object_storage'
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
      historicalDays: asArray(result.payload.historicalDays),
      meta: {
        ...(isPlainObject(result.payload.meta) ? result.payload.meta : {}),
        sourceKind: result.payload.sourceKind || 'weather_cache_recent_10d',
        quality: result.payload.quality || 'partial',
        weatherObjectPath:
          result.payload.weatherObjectPath || buildRecentWeatherObjectPath(locationKey),
        cacheHit: result.cacheHit,
        cacheSourceKind: result.sourceKind,
        weatherEvidenceInsufficient: Boolean(result.payload.weatherEvidenceInsufficient)
      }
    }
  }

  async function ingestRecentForecast(input = {}) {
    const locationInput = resolveLocationInput(input)
    const location = await locationRepository.upsertLocation(locationInput)
    const generatedAtDate = now()
    const generatedAt = generatedAtDate.toISOString()
    const localToday = formatLocalDateInTimezone(generatedAtDate, location.timezone)
    const targetDate = normalizeDate(input.targetDate || addDays(localToday, -1))
    const manifest = await readManifest({ storage, location })
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const forecast = await qweatherAdapter.fetchForecast10d({
      locationId: location.qweatherLocationId,
      lat: input.lat,
      lng: input.lng
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
    manifest.updatedAt = generatedAt

    const { recentPayload, uploadResult } = await rebuildRecentWeather({
      storage,
      location,
      targetDate,
      generatedAt,
      manifest
    })

    const manifestPath = buildWeatherManifestObjectPath(location.locationKey)
    const manifestUpload = await storage.uploadJson({ cloudPath: manifestPath, payload: manifest })
    await locationRepository.updateRecentObjectMetadata({
      locationKey: location.locationKey,
      recentObjectPath: recentPayload.weatherObjectPath,
      recentFileId: uploadResult.fileId,
      manifestObjectPath: manifestPath,
      manifestFileId: manifestUpload.fileId,
      recentGeneratedAt: generatedAt
    })

    return {
      location,
      rawObjectPath,
      dailyObjectPath,
      manifestPath,
      manifestFileId: manifestUpload.fileId,
      recentObjectPath: recentPayload.weatherObjectPath,
      recentFileId: uploadResult.fileId,
      targetDate,
      quality: recentPayload.quality,
      recentPayload
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
