'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const {
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath,
  buildWeatherWorkingObjectPath,
  normalizeWeatherCoordinates
} = require('./weather-cache-paths')
const { formatLocalDateInTimezone, normalizeDate } = require('./recent-weather-features')
const { readManifest } = require('./recent-weather-archive')
const { buildDaylightSlots, buildSunWindow } = require('./daylight-slots')

const D0_DAYLIGHT_METRIC_VERSION = 'weather-cache/v1/d0-daylight-slots-v1'

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function roundMetric(value, precision = 1) {
  if (!Number.isFinite(value)) {
    return null
  }
  const multiplier = 10 ** precision
  return Math.round(value * multiplier) / multiplier
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeHourlyRecord(record = {}) {
  const fxTime = normalizeText(record.fxTime || record.time || record.obsTime)
  const timestamp = Date.parse(fxTime)
  if (!Number.isFinite(timestamp)) {
    return null
  }
  return {
    fxTime,
    timestamp,
    cloud: normalizeNumber(record.cloud),
    precip: normalizeNumber(record.precip ?? record.precipMm),
    pop: normalizeNumber(record.pop),
    humidity: normalizeNumber(record.humidity),
    temp: normalizeNumber(record.temp ?? record.tempC),
    windSpeed: normalizeNumber(record.windSpeed),
    text: normalizeText(record.text || record.textDay || record.weather)
  }
}

function valuesFor(records = [], key = '') {
  return records.map(record => record[key]).filter(Number.isFinite)
}

function sum(values = []) {
  return values.reduce((total, value) => total + value, 0)
}

function mean(values = []) {
  return values.length ? roundMetric(sum(values) / values.length) : null
}

function max(values = []) {
  return values.length ? Math.max(...values) : null
}

function percentile(values = [], ratio = 0.75) {
  if (!values.length) {
    return null
  }
  const ordered = values.slice().sort((left, right) => left - right)
  const index = Math.max(0, Math.ceil(ordered.length * ratio) - 1)
  return ordered[index]
}

function dominantText(records = []) {
  const counts = new Map()
  for (const record of records) {
    if (!record.text) {
      continue
    }
    counts.set(record.text, (counts.get(record.text) || 0) + 1)
  }
  let dominant = ''
  let maxCount = 0
  for (const [text, count] of counts.entries()) {
    if (count > maxCount) {
      dominant = text
      maxCount = count
    }
  }
  return dominant
}

function aggregateSlotMetrics(slot = {}, hourlyRecords = []) {
  if (slot.missing || !slot.startTime || !slot.endTime) {
    return {
      ...slot,
      cloudMean: null,
      cloudMax: null,
      cloudP75: null,
      precipSum: null,
      precipMaxHourly: null,
      popMax: null,
      humidityMean: null,
      tempMean: null,
      windSpeedMean: null,
      dominantText: '',
      quality: 'missing',
      missing: true
    }
  }
  const start = Date.parse(slot.startTime)
  const end = Date.parse(slot.endTime)
  const slotRecords = hourlyRecords.filter(
    record => record.timestamp >= start && record.timestamp < end
  )
  if (!slotRecords.length) {
    return {
      ...slot,
      cloudMean: null,
      cloudMax: null,
      cloudP75: null,
      precipSum: null,
      precipMaxHourly: null,
      popMax: null,
      humidityMean: null,
      tempMean: null,
      windSpeedMean: null,
      dominantText: '',
      quality: 'missing',
      missing: true
    }
  }
  const cloud = valuesFor(slotRecords, 'cloud')
  const precip = valuesFor(slotRecords, 'precip')
  return {
    ...slot,
    cloudMean: mean(cloud),
    cloudMax: max(cloud),
    cloudP75: percentile(cloud),
    precipSum: roundMetric(sum(precip)),
    precipMaxHourly: max(precip),
    popMax: max(valuesFor(slotRecords, 'pop')),
    humidityMean: mean(valuesFor(slotRecords, 'humidity')),
    tempMean: mean(valuesFor(slotRecords, 'temp')),
    windSpeedMean: mean(valuesFor(slotRecords, 'windSpeed')),
    dominantText: dominantText(slotRecords),
    quality: 'complete',
    missing: false
  }
}

function attachWorkingSlotContract(slot = {}, updatedAt = '') {
  return {
    name: slot.slotKey,
    start: slot.startTime,
    end: slot.endTime,
    sourceKind: 'hourly_forecast_snapshot',
    updatedAt,
    missingFields: [],
    ...slot
  }
}

function resolveWeatherLocation(location = {}) {
  const explicit = normalizeText(location.weatherLocation || location.weather_location)
  if (explicit) {
    return explicit
  }
  const latitude = normalizeNumber(location.latitude ?? location.lat)
  const longitude = normalizeNumber(location.longitude ?? location.lng)
  if (latitude === null || longitude === null) {
    return ''
  }
  return `${longitude.toFixed(4)},${latitude.toFixed(4)}`
}

function buildD0WorkingPayload({
  location = {},
  date = '',
  timezone = 'Asia/Shanghai',
  hourly = [],
  generatedAt = '',
  updatedAt = generatedAt,
  weatherObjectPath = ''
} = {}) {
  const normalizedHourly = (Array.isArray(hourly) ? hourly : [])
    .map(normalizeHourlyRecord)
    .filter(Boolean)
  const sunWindow = buildSunWindow({
    date,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone
  })
  const daylightSlots = buildDaylightSlots({
    date,
    latitude: location.latitude,
    longitude: location.longitude,
    timezone
  }).map(slot => attachWorkingSlotContract(aggregateSlotMetrics(slot, normalizedHourly), updatedAt))
  const quality = daylightSlots.every(slot => slot.missing)
    ? 'missing'
    : daylightSlots.some(slot => slot.missing)
      ? 'partial'
      : 'complete'

  return {
    schemaVersion: 'weather-cache/v1/working',
    location,
    locationKey: location.locationKey,
    cityName: location.cityName || location.city || '',
    weatherLocation: resolveWeatherLocation(location),
    date,
    timezone,
    sunWindow,
    daylightSlots,
    sourceKind: 'qweather_weather_24h_working',
    metricVersion: D0_DAYLIGHT_METRIC_VERSION,
    generatedAt,
    updatedAt,
    weatherObjectPath,
    quality
  }
}

function buildD0DailyArchivePayload({
  workingPayload,
  dailyObjectPath = '',
  workingObjectPath = '',
  generatedAt = ''
} = {}) {
  const daylightSlots = workingPayload.daylightSlots || []
  return {
    schemaVersion: 'weather-cache/v1/daily',
    location: workingPayload.location,
    date: workingPayload.date,
    generatedAt,
    updatedAt: generatedAt,
    sourceKind: 'qweather_weather_24h_daily_archive',
    quality: workingPayload.quality,
    workingObjectPath,
    weatherObjectPath: dailyObjectPath,
    daily: {
      date: workingPayload.date,
      source: 'qweather_weather_24h_daily_archive',
      sourceKind: 'qweather_weather_24h_daily_archive',
      quality: workingPayload.quality,
      weatherObjectPath: dailyObjectPath,
      sunWindow: workingPayload.sunWindow,
      daylightSlots,
      daylight: {
        timezone: workingPayload.timezone,
        ...workingPayload.sunWindow,
        slots: daylightSlots,
        quality: workingPayload.quality,
        missing: workingPayload.quality === 'missing'
      }
    }
  }
}

function createD0Weather24hService({
  storage,
  locationRepository,
  adapter = null,
  apiKey = '',
  baseUrl = '',
  now,
  resolveLocationInput
}) {
  async function resolveArchiveLocation(locationInput = {}) {
    return typeof locationRepository?.upsertLocation === 'function'
      ? await locationRepository.upsertLocation(locationInput).catch(() => locationInput)
      : locationInput
  }

  async function fetchWeather24h(input = {}, locationInput = {}) {
    if (Array.isArray(input.hourly)) {
      return { raw: { source: 'payload_hourly' }, hourly: input.hourly }
    }
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const coordinates =
      normalizeWeatherCoordinates(input) ||
      normalizeWeatherCoordinates({ lat: locationInput.latitude, lng: locationInput.longitude }) ||
      {}
    return qweatherAdapter.fetchWeather24h({
      locationId: locationInput.qweatherLocationId,
      lat: coordinates.lat,
      lng: coordinates.lng
    })
  }

  async function updateD0Weather24hWorking(input = {}) {
    const locationInput = resolveLocationInput(input)
    const location = await resolveArchiveLocation(locationInput)
    const generatedAtDate = now()
    const timezone = location.timezone || 'Asia/Shanghai'
    const targetDate = normalizeDate(
      input.targetDate ||
        input.target_date ||
        input.date ||
        formatLocalDateInTimezone(generatedAtDate, timezone)
    )
    const generatedAt = generatedAtDate.toISOString()
    const forecast24h = await fetchWeather24h(input, location)
    const workingObjectPath = buildWeatherWorkingObjectPath(location.locationKey, targetDate)
    const workingPayload = buildD0WorkingPayload({
      location,
      date: targetDate,
      timezone,
      hourly: forecast24h.hourly,
      generatedAt,
      updatedAt: generatedAt,
      weatherObjectPath: workingObjectPath
    })
    const workingUpload = await storage.uploadJson({
      cloudPath: workingObjectPath,
      payload: workingPayload
    })
    const manifest = await readManifest({ storage, location })
    manifest.workingArchives = {
      ...(manifest.workingArchives || {}),
      [targetDate]: {
        cloudPath: workingObjectPath,
        fileId: workingUpload.fileId,
        generatedAt,
        quality: workingPayload.quality
      }
    }

    let dailyPayload = null
    let dailyUpload = null
    let dailyObjectPath = ''
    const shouldFinalize =
      input.finalize === true ||
      input.finalize === 'true' ||
      input.slotFinalize === true ||
      input.slotFinalize === 'true'
    if (shouldFinalize) {
      dailyObjectPath = buildWeatherDailyObjectPath(location.locationKey, targetDate)
      dailyPayload = buildD0DailyArchivePayload({
        workingPayload,
        dailyObjectPath,
        workingObjectPath,
        generatedAt
      })
      dailyUpload = await storage.uploadJson({ cloudPath: dailyObjectPath, payload: dailyPayload })
      manifest.dailyArchives = {
        ...(manifest.dailyArchives || {}),
        [targetDate]: {
          cloudPath: dailyObjectPath,
          fileId: dailyUpload.fileId,
          generatedAt,
          quality: dailyPayload.quality
        }
      }
    }

    manifest.updatedAt = generatedAt
    const manifestPath = buildWeatherManifestObjectPath(location.locationKey)
    const manifestUpload = await storage.uploadJson({ cloudPath: manifestPath, payload: manifest })
    return {
      location,
      targetDate,
      workingObjectPath,
      workingFileId: workingUpload.fileId,
      workingPayload,
      dailyObjectPath,
      dailyFileId: dailyUpload?.fileId || '',
      dailyPayload,
      manifestPath,
      manifestFileId: manifestUpload.fileId,
      finalized: Boolean(dailyPayload),
      recentObjectPath: '',
      recentPayload: null
    }
  }

  return {
    updateD0Weather24hWorking
  }
}

module.exports = {
  D0_DAYLIGHT_METRIC_VERSION,
  aggregateSlotMetrics,
  buildD0DailyArchivePayload,
  buildD0WorkingPayload,
  createD0Weather24hService,
  normalizeHourlyRecord
}
