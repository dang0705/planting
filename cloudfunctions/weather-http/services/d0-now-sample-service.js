'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')
const { attemptWeatherObservation } = require('./now-sample-weather-observation')
const {
  buildWeatherDayObjectPath,
  buildWeatherManifestObjectPath,
  normalizeWeatherCoordinates
} = require('./weather-cache-paths')
const { formatLocalDateInTimezone, normalizeDate } = require('./recent-weather-features')
const { readManifest } = require('./recent-weather-archive')
const { buildSunWindow } = require('./daylight-slots')
const {
  buildNowSampleSlotTimes,
  isFinalizeSlot,
  resolveSlotForTriggerName
} = require('./now-sample-slots')
const {
  DAYLIGHT_SLOT_NAMES,
  classifyColdStressLevel,
  classifyHeatStressLevel,
  classifyLowLightProxy,
  classifyWetSoilRisk,
  dominantText,
  max,
  mean,
  percentile,
  pruneUndefined: _unused
} = require('./now-sample-rollup-helpers')

const DAY_FILE_SCHEMA_VERSION = 'weather-cache/v1/day-now-sample'
const MAX_SAMPLES = 8

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function pruneUndefined(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
  )
}

function buildWeatherNowSample({ slotName = '', sampledAt = '', nowData = {}, sourceKind = 'weather_now_sample' }) {
  const obsTime = normalizeText(nowData.obsTime || nowData.obs_time || sampledAt)
  return pruneUndefined({
    slotName,
    sampledAt,
    obsTime: obsTime || undefined,
    temp: normalizeNumber(nowData.temp ?? nowData.tempC),
    feelsLike: normalizeNumber(nowData.feelsLike ?? nowData.feelsLikeC),
    icon: normalizeText(nowData.icon || ''),
    text: normalizeText(nowData.text || nowData.textDay || ''),
    wind360: normalizeNumber(nowData.wind360),
    windDir: normalizeText(nowData.windDir || ''),
    windScale: normalizeText(nowData.windScale || ''),
    windSpeed: normalizeNumber(nowData.windSpeed ?? nowData.windSpeedDay),
    humidity: normalizeNumber(nowData.humidity),
    precipLastHour: normalizeNumber(nowData.precip ?? nowData.precipMm),
    pressure: normalizeNumber(nowData.pressure),
    visibilityKm: normalizeNumber(nowData.visibilityKm ?? nowData.vis),
    cloud: normalizeNumber(nowData.cloud),
    dew: normalizeNumber(nowData.dew),
    sourceKind
  })
}

function buildSampleFromCurrentWeather({ slotName = '', sampledAt = '', currentWeather = {}, sourceKind }) {
  return buildWeatherNowSample({
    slotName,
    sampledAt,
    nowData: currentWeather,
    sourceKind
  })
}

function resolveSampleTimestampMs(sample = {}) {
  for (const value of [sample.sampledAt, sample.obsTime]) {
    const timestamp = Date.parse(normalizeText(value))
    if (Number.isFinite(timestamp)) {
      return timestamp
    }
  }
  return null
}

function resolveLatestSample(samples = []) {
  return (Array.isArray(samples) ? samples : [])
    .filter(sample => sample && !sample.missing)
    .reduce((latest, sample) => {
    if (!sample) {
      return latest
    }
    if (!latest) {
      return sample
    }
    const sampleTime = resolveSampleTimestampMs(sample)
    const latestTime = resolveSampleTimestampMs(latest)
    if (sampleTime === null && latestTime === null) {
      return sample
    }
    if (sampleTime !== null && (latestTime === null || sampleTime >= latestTime)) {
      return sample
    }
    return latest
  }, null)
}

function resolveDayFileQuality(samples = []) {
  const validSamples = (Array.isArray(samples) ? samples : []).filter(
    sample => sample && !sample.missing
  )
  if (!validSamples.length) {
    return 'missing'
  }
  return validSamples.length >= 3 ? 'complete' : 'partial'
}

/**
 * 构造 dailyRollup，采用 ClickUp 要求的嵌套结构。
 * - sampleSummary: { sampleCount, daylightSampleCount, missingSlots }
 * - lightFeatures: { daylightCloudMean, daylightCloudP75, daylightCloudMax, lowLightProxy }
 * - moistureFeatures: { humidityMean, precipLastHourSum, wetSoilRiskFromWeather }
 * - tempFeatures: { tempMean, tempMax, heatStressLevel, coldStressLevel }
 */
function buildDailyRollup({ samples = [], sunWindow = {}, date = '', generatedAt = '' }) {
  const validSamples = (Array.isArray(samples) ? samples : []).filter(
    sample => sample && !sample.missing
  )
  const sampleCount = validSamples.length
  const quality = sampleCount >= 3 ? 'complete' : sampleCount > 0 ? 'partial' : 'missing'

  const daylightSampleCount = validSamples.filter(sample =>
    DAYLIGHT_SLOT_NAMES.includes(sample.slotName)
  ).length
  const collectedSlotNames = new Set(validSamples.map(sample => sample.slotName))
  const missingSlots = DAYLIGHT_SLOT_NAMES.filter(name => !collectedSlotNames.has(name))

  const temps = validSamples.map(s => s.temp).filter(Number.isFinite)
  const humidities = validSamples.map(s => s.humidity).filter(Number.isFinite)
  const precips = validSamples.map(s => s.precipLastHour).filter(Number.isFinite)
  const clouds = validSamples.map(s => s.cloud).filter(Number.isFinite)
  const winds = validSamples.map(s => s.windSpeed).filter(Number.isFinite)

  const tempMean = mean(temps)
  const tempMax = max(temps)
  const tempMin = temps.length ? Math.min(...temps) : null
  const humidityMean = mean(humidities)
  const precipLastHourSum = precips.length
    ? Math.round(precips.reduce((a, b) => a + b, 0) * 100) / 100
    : null
  const daylightCloudMean = mean(clouds)
  const daylightCloudP75 = percentile(clouds)
  const daylightCloudMax = max(clouds)
  const windSpeedMean = mean(winds)

  return pruneUndefined({
    date,
    generatedAt,
    quality,
    sampleSummary: {
      sampleCount,
      daylightSampleCount,
      missingSlots
    },
    lightFeatures: pruneUndefined({
      daylightCloudMean,
      daylightCloudP75,
      daylightCloudMax,
      lowLightProxy: classifyLowLightProxy(daylightCloudMean)
    }),
    moistureFeatures: pruneUndefined({
      humidityMean,
      precipLastHourSum,
      wetSoilRiskFromWeather: classifyWetSoilRisk(precipLastHourSum, humidityMean)
    }),
    tempFeatures: pruneUndefined({
      tempMean,
      tempMax,
      heatStressLevel: classifyHeatStressLevel(tempMax),
      coldStressLevel: classifyColdStressLevel(tempMin)
    }),
    tempMin,
    windSpeedMean,
    dominantWeatherText: dominantText(validSamples),
    sunWindow: sunWindow.sunrise ? sunWindow : undefined
  })
}

function buildDayFilePayload({
  location = {},
  date = '',
  timezone = 'Asia/Shanghai',
  state = 'working',
  samples = [],
  latestSample = null,
  dailyRollup = null,
  sourceKind = 'observed_now_samples',
  quality = 'missing',
  generatedAt = '',
  updatedAt = '',
  sunWindow = {},
  weatherObjectPath = ''
} = {}) {
  return pruneUndefined({
    schemaVersion: DAY_FILE_SCHEMA_VERSION,
    location,
    locationKey: location.locationKey,
    cityName: location.cityName || location.city || '',
    date,
    timezone,
    state,
    sunWindow,
    samples,
    latestSample,
    dailyRollup: dailyRollup || undefined,
    sourceKind,
    quality,
    generatedAt,
    updatedAt: updatedAt || generatedAt,
    weatherObjectPath
  })
}

function createD0NowSampleService({
  storage,
  locationRepository,
  adapter = null,
  apiKey = '',
  baseUrl = '',
  now,
  resolveLocationInput,
  sleep
}) {
  async function resolveArchiveLocation(locationInput = {}) {
    return typeof locationRepository?.upsertLocation === 'function'
      ? await locationRepository.upsertLocation(locationInput).catch(() => locationInput)
      : locationInput
  }

  async function fetchCurrentWeatherNow(input = {}, locationInput = {}) {
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const coordinates =
      normalizeWeatherCoordinates(input) ||
      normalizeWeatherCoordinates({ lat: locationInput.latitude, lng: locationInput.longitude }) ||
      {}
    return qweatherAdapter.fetchCurrentWeather({
      lat: coordinates.lat,
      lng: coordinates.lng
    })
  }

  async function fetchGridWeatherNow(input = {}, locationInput = {}) {
    const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
    const coordinates =
      normalizeWeatherCoordinates(input) ||
      normalizeWeatherCoordinates({ lat: locationInput.latitude, lng: locationInput.longitude }) ||
      {}
    return qweatherAdapter.fetchGridWeatherNow({
      lat: coordinates.lat,
      lng: coordinates.lng
    })
  }

  async function readDayFile(locationKey = '', date = '') {
    const cloudPath = buildWeatherDayObjectPath(locationKey, date)
    const payload = await storage.downloadJson({ cloudPath, fileId: '' }).catch(() => null)
    return { payload, cloudPath }
  }

  function resolveSlotName(input = {}) {
    if (input.slotName) {
      return input.slotName
    }
    const fromTrigger = resolveSlotForTriggerName(input.triggerName || input.trigger_name || '')
    if (fromTrigger) {
      return fromTrigger
    }
    return ''
  }

  /**
   * D0 working：调用 /v7/weather/now 采样，追加到 days/{date}.json 的 samples[]，
   * 更新 latestSample，state 保持 working。
   */
  async function sampleNowWeather(input = {}) {
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

    const slotTimes = buildNowSampleSlotTimes({
      date: targetDate,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone
    })
    const slotName = resolveSlotName(input)
    if (!slotName) {
      throw new Error('now 采样缺少 slotName 或可识别的 triggerName')
    }

    const observation = await attemptWeatherObservation({
      fetchPrimary: () => fetchCurrentWeatherNow(input, location),
      fetchFallback: () => fetchGridWeatherNow(input, location),
      sleep,
      slotName,
      sampledAt: generatedAt
    })

    const sample = observation.ok
      ? buildSampleFromCurrentWeather({
          slotName,
          sampledAt: generatedAt,
          currentWeather: observation.weatherData,
          sourceKind: observation.sourceKind
        })
      : observation.missingSample

    const dayObjectPath = buildWeatherDayObjectPath(location.locationKey, targetDate)
    const { payload: existingPayload } = await readDayFile(location.locationKey, targetDate)
    const existingSamples = Array.isArray(existingPayload?.samples) ? existingPayload.samples : []
    const samples = [...existingSamples, sample].slice(-MAX_SAMPLES)
    const sunWindow = existingPayload?.sunWindow || slotTimes

    const dayPayload = buildDayFilePayload({
      location,
      date: targetDate,
      timezone,
      state: 'working',
      samples,
      latestSample: resolveLatestSample(samples),
      sourceKind: 'observed_now_samples',
      quality: resolveDayFileQuality(samples),
      generatedAt: existingPayload?.generatedAt || generatedAt,
      updatedAt: generatedAt,
      sunWindow,
      weatherObjectPath: dayObjectPath
    })

    const upload = await storage.uploadJson({ cloudPath: dayObjectPath, payload: dayPayload })
    await updateManifestDayArchive({
      location,
      targetDate,
      dayObjectPath,
      fileId: upload.fileId,
      generatedAt,
      quality: dayPayload.quality,
      state: 'working'
    })

    return {
      location,
      targetDate,
      slotName,
      dayObjectPath,
      dayFileId: upload.fileId,
      dayPayload,
      finalized: false,
      sample,
      recentObjectPath: '',
      recentPayload: null
    }
  }

  /**
   * D0 finalize：在同一个 days 文件内生成 dailyRollup，
   * state 改为 finalized，设置 finalizedAt，sourceKind 改为 observed_now_rollup。
   */
  async function finalizeNowWeather(input = {}) {
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
    const dayObjectPath = buildWeatherDayObjectPath(location.locationKey, targetDate)

    const { payload: existingPayload } = await readDayFile(location.locationKey, targetDate)
    const samples = Array.isArray(existingPayload?.samples) ? existingPayload.samples : []
    const sunWindow =
      existingPayload?.sunWindow ||
      buildSunWindow({
        date: targetDate,
        latitude: location.latitude,
        longitude: location.longitude,
        timezone
      })

    const dailyRollup = buildDailyRollup({ samples, sunWindow, date: targetDate, generatedAt })

    const dayPayload = buildDayFilePayload({
      location,
      date: targetDate,
      timezone,
      state: 'finalized',
      samples,
      latestSample: resolveLatestSample(samples),
      dailyRollup,
      sourceKind: 'observed_now_rollup',
      quality: dailyRollup.quality,
      generatedAt: existingPayload?.generatedAt || generatedAt,
      updatedAt: generatedAt,
      sunWindow,
      weatherObjectPath: dayObjectPath
    })
    dayPayload.finalizedAt = generatedAt

    const upload = await storage.uploadJson({ cloudPath: dayObjectPath, payload: dayPayload })
    await updateManifestDayArchive({
      location,
      targetDate,
      dayObjectPath,
      fileId: upload.fileId,
      generatedAt,
      quality: dayPayload.quality,
      state: 'finalized'
    })

    return {
      location,
      targetDate,
      dayObjectPath,
      dayFileId: upload.fileId,
      dayPayload,
      finalized: true,
      dailyRollup,
      recentObjectPath: '',
      recentPayload: null
    }
  }

  async function updateManifestDayArchive({
    location,
    targetDate,
    dayObjectPath,
    fileId,
    generatedAt,
    quality,
    state
  }) {
    const manifest = await readManifest({ storage, location })
    manifest.dayArchives = {
      ...(manifest.dayArchives || {}),
      [targetDate]: { cloudPath: dayObjectPath, fileId, generatedAt, quality, state }
    }
    manifest.updatedAt = generatedAt
    const manifestPath = buildWeatherManifestObjectPath(location.locationKey)
    await storage.uploadJson({ cloudPath: manifestPath, payload: manifest }).catch(() => null)
  }

  /**
   * 统一入口：根据 finalize 标志分发到 sampleNowWeather 或 finalizeNowWeather。
   * 保留旧入口名 updateD0Weather24hWorking 以兼容路由调用。
   */
  async function updateNowSample(input = {}) {
    const shouldFinalize =
      input.finalize === true ||
      input.finalize === 'true' ||
      input.slotFinalize === true ||
      input.slotFinalize === 'true' ||
      isFinalizeSlot(resolveSlotForTriggerName(input.triggerName || input.trigger_name || ''))
    if (shouldFinalize) {
      return finalizeNowWeather(input)
    }
    return sampleNowWeather(input)
  }

  return {
    sampleNowWeather,
    finalizeNowWeather,
    updateNowSample,
    updateD0Weather24hWorking: updateNowSample
  }
}

module.exports = {
  DAY_FILE_SCHEMA_VERSION,
  MAX_SAMPLES,
  buildDailyRollup,
  buildDayFilePayload,
  buildSampleFromCurrentWeather,
  buildWeatherNowSample,
  createD0NowSampleService,
  resolveDayFileQuality
}
