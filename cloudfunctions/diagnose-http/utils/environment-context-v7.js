'use strict'

const { resolveCarePlannerThresholds } = require('../configs/care-planner-thresholds')
const {
  estimateLightHealth,
  normalizeUserLightContext,
  computeLightExposure
} = require('./light-health-estimator')
// 浇水规划器已抽取到 layer 共享，diagnose-http 与 plant-user-http 共用同一实现。
// 部署环境通过 CloudBase Layer 加载 /opt/utils/watering-planner；
// 本地测试环境回退到相对路径直接引用源码。
let buildWateringPlannerShared
let WATERING_CONTEXTS_SHARED
let WATERING_ACTIONS_SHARED
try {
  ;({
    buildWateringPlanner: buildWateringPlannerShared,
    WATERING_CONTEXTS: WATERING_CONTEXTS_SHARED,
    WATERING_ACTIONS: WATERING_ACTIONS_SHARED
  } = require('/opt/utils/watering-planner'))
} catch {
  ;({
    buildWateringPlanner: buildWateringPlannerShared,
    WATERING_CONTEXTS: WATERING_CONTEXTS_SHARED,
    WATERING_ACTIONS: WATERING_ACTIONS_SHARED
  } = require('../../layer/utils/watering-planner'))
}

const WATERING_CONTEXTS = WATERING_CONTEXTS_SHARED
const WATERING_ACTIONS = WATERING_ACTIONS_SHARED

let computeTranspirationIntervalFactorShared
let resolveShadowModeFromEnvShared
let resolveAirEnvironmentEvidenceShared
try {
  ;({
    computeTranspirationIntervalFactor: computeTranspirationIntervalFactorShared,
    resolveShadowModeFromEnv: resolveShadowModeFromEnvShared
  } = require('/opt/utils/transpiration'))
  ;({
    resolveAirEnvironmentEvidence: resolveAirEnvironmentEvidenceShared
  } = require('/opt/utils/air-environment-evidence'))
} catch {
  ;({
    computeTranspirationIntervalFactor: computeTranspirationIntervalFactorShared,
    resolveShadowModeFromEnv: resolveShadowModeFromEnvShared
  } = require('../../layer/utils/transpiration'))
  ;({
    resolveAirEnvironmentEvidence: resolveAirEnvironmentEvidenceShared
  } = require('../../layer/utils/air-environment-evidence'))
}

// 剂量分类器同 watering-planner：部署环境通过 /opt/utils 加载，本地回退到相对路径。
// 之前无条件相对路径 require 在 CloudBase 部署时会 MODULE_NOT_FOUND（diagnose-http 函数包不包含 layer 目录）。
let resolveMlToDoseClassShared
try {
  ;({
    resolveMlToDoseClass: resolveMlToDoseClassShared
  } = require('/opt/utils/water-volume-format'))
} catch {
  ;({
    resolveMlToDoseClass: resolveMlToDoseClassShared
  } = require('../../layer/utils/water-volume-format'))
}
const resolveMlToDoseClass = resolveMlToDoseClassShared

let fertilizationPlannerShared
try {
  fertilizationPlannerShared = require('/opt/utils/fertilization-reminder-planner')
} catch {
  fertilizationPlannerShared = require('../../layer/utils/fertilization-reminder-planner')
}
const { buildFertilizationDecision, FERTILIZING_ACTIONS } = fertilizationPlannerShared

const LIGHT_CONTEXTS = Object.freeze({
  EXCESS_LIGHT_OR_SUNBURN_RISK: 'excess_light_or_sunburn_risk',
  RECENT_LIGHT_INCREASE_STRESS: 'recent_light_increase_stress',
  RECENT_LIGHT_DECREASE: 'recent_light_decrease',
  LOW_LIGHT_BACKGROUND: 'low_light_background'
})

const MS_PER_DAY = 24 * 60 * 60 * 1000
// 仅用于解析历史光照变化事件，不用于推导当前光照环境。
const DIRECT_LIGHT_TOKENS = [
  'direct_sun_exposure',
  'directsun',
  'fullsun',
  'strongsun',
  'outdoor_sun',
  'balcony_direct_sun',
  'sunburn_risk',
  '直射',
  '暴晒',
  '全日照',
  '强光'
]
const STRONGER_LIGHT_TOKENS = [
  'moved_to_stronger_light',
  'stronger_light',
  'movedtosun',
  '移到更强光',
  '移到直射',
  '换到强光'
]

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase()
}

function normalizeRawText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasMeaningfulUserLightContext(value = {}) {
  if (!isPlainObject(value)) {
    return false
  }
  return Boolean(
    value.naturalLightType ||
      value.natural_light_type ||
      [
        'facing',
        'windowType',
        'window_type',
        'position',
        'hasDirectSun',
        'has_direct_sun',
        'distance',
        'distanceMeters',
        'distance_meters'
      ].some(key => value[key] !== undefined && value[key] !== null && value[key] !== '')
  )
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstNumber(...values) {
  for (const value of values) {
    const number = toNumber(value)
    if (number !== undefined) {
      return number
    }
  }
  return undefined
}

function clonePlain(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

function pickNumberFields(source = {}, fields = []) {
  const picked = {}
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      picked[field] = Number(source[field])
    }
  }
  return picked
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeRawText(value)
    if (text) {
      return text
    }
  }
  return ''
}

function normalizeDate(value = '') {
  const raw = normalizeRawText(value)
  if (!raw) {
    return ''
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
  }
  return raw.slice(0, 10)
}

function parseDate(value = '') {
  const normalized = normalizeDate(value)
  if (!normalized) {
    return null
  }
  const date = new Date(`${normalized}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysAgo(referenceDate = '', eventDate = '') {
  const reference = parseDate(referenceDate)
  const event = parseDate(eventDate)
  if (!reference || !event) {
    return null
  }
  return Math.floor((reference.getTime() - event.getTime()) / MS_PER_DAY)
}

function includesAnyToken(value = '', tokens = []) {
  const normalized = normalizeText(value)
  const raw = normalizeRawText(value)
  return tokens.some(token => normalized.includes(normalizeText(token)) || raw.includes(token))
}

function normalizeBucket(value = '') {
  const normalized = normalizeText(value).replace(/-/g, '_')
  if (!normalized || ['unknown', 'unsure', 'not_sure', '没留意', '说不清'].includes(normalized)) {
    return 'unknown'
  }
  if (['within10d', 'within_10d', '0_10d', '0_10_days', '10d'].includes(normalized)) {
    return 'within_10d'
  }
  if (['11_30d', '11_30_days', '11_to_30d'].includes(normalized)) {
    return '11_30d'
  }
  if (['31_60d', '31_60_days', '31_to_60d'].includes(normalized)) {
    return '31_60d'
  }
  if (['over_60d', '60d_plus', 'more_than_60d', 'gt_60d'].includes(normalized)) {
    return 'over_60d'
  }
  if (['never', 'almost_never', '从不', '很久没施肥'].includes(normalized)) {
    return 'almost_never'
  }
  return normalized
}

function normalizeDailyEnvironmentRecord(record = {}) {
  if (!isPlainObject(record)) {
    return null
  }

  const tempMin = firstNumber(
    record.tempMin,
    record.tempMinC,
    record.temp_min,
    record.temp_min_c,
    record.temperatureMin,
    record.temperature_min
  )
  const tempMax = firstNumber(
    record.tempMax,
    record.tempMaxC,
    record.temp_max,
    record.temp_max_c,
    record.temperatureMax,
    record.temperature_max
  )
  const humidity = firstNumber(
    record.humidity,
    record.humidityAvg,
    record.humidity_avg,
    record.rh,
    record.relativeHumidity
  )
  const precipitation = firstNumber(
    record.precipitation,
    record.precipMm,
    record.precip_mm,
    record.rainMm,
    record.rain_mm,
    record.precip,
    record.rain
  )
  const uvIndex = firstNumber(record.uvIndex, record.uv_index, record.uv)
  const weatherText = firstText(
    record.weatherText,
    record.textDay,
    record.textNight,
    record.weather,
    record.text
  )

  return {
    date: normalizeDate(
      record.date || record.fxDate || record.obsDate || record.time || record.day
    ),
    tempMin,
    tempMax,
    humidity,
    precipitation,
    uvIndex,
    weatherText,
    source: firstText(record.source),
    missing: Boolean(record.missing)
  }
}

function resolveEnvironmentBounds(options = {}) {
  const genus = options.genusCareProfile || options.genusProfile || options.plantContext || {}
  const watering = genus.watering || genus.wateringStrategy || genus.watering_strategy_json || {}
  return {
    temperatureMin: firstNumber(
      options.temperatureMin,
      options.tempMin,
      genus.temperatureMin,
      genus.tempMin,
      watering.tempMin
    ),
    temperatureMax: firstNumber(
      options.temperatureMax,
      options.tempMax,
      genus.temperatureMax,
      genus.tempMax,
      watering.tempMax
    ),
    humidityMin: firstNumber(
      options.humidityMin,
      options.rhMin,
      genus.humidityMin,
      genus.rhMin,
      watering.humidityMin
    ),
    humidityMax: firstNumber(
      options.humidityMax,
      options.rhMax,
      genus.humidityMax,
      genus.rhMax,
      watering.humidityMax
    ),
    uvIndexMax: firstNumber(
      options.uvIndexMax,
      options.uvMax,
      genus.uvIndexMax,
      genus.uvMax,
      genus.sunning?.uvIndexMax
    )
  }
}

function isRainyRecord(record = {}) {
  const precipitation = toNumber(record.precipitation)
  if (precipitation !== undefined && precipitation > 0) {
    return true
  }
  return /雨|雪|rain|shower|storm/i.test(record.weatherText || '')
}

function updateConsecutiveStreak(state = {}, key = '', active = false) {
  const currentKey = `${key}Current`
  const maxKey = `${key}Max`
  state[currentKey] = active ? Number(state[currentKey] || 0) + 1 : 0
  state[maxKey] = Math.max(Number(state[maxKey] || 0), Number(state[currentKey] || 0))
}

function buildEnvironmentSummary({
  dailyRecords = [],
  windowDays,
  userHasDirectSunExposure = false,
  thresholds: rawThresholds = null,
  ...boundsInput
} = {}) {
  const thresholds = resolveCarePlannerThresholds(rawThresholds).environment
  const records = (Array.isArray(dailyRecords) ? dailyRecords : [])
    .slice(0, windowDays)
    .map(normalizeDailyEnvironmentRecord)
    .filter(Boolean)
  const bounds = resolveEnvironmentBounds(boundsInput)
  const effectiveBounds = {
    temperatureMin: firstNumber(bounds.temperatureMin, thresholds.conservativeTemperatureMinC),
    temperatureMax: firstNumber(bounds.temperatureMax, thresholds.conservativeTemperatureMaxC),
    humidityMin: firstNumber(bounds.humidityMin, thresholds.conservativeHumidityMinPercent),
    humidityMax: firstNumber(bounds.humidityMax, thresholds.conservativeHumidityMaxPercent),
    uvIndexMax: bounds.uvIndexMax
  }
  const summary = {
    windowDays,
    recordCount: records.length,
    highHumidityDays: 0,
    lowHumidityDays: 0,
    coldHumidDays: 0,
    hotDryDays: 0,
    hotHumidDays: 0,
    rainyDays: 0,
    maxConsecutiveHighHumidityDays: 0,
    maxConsecutiveLowHumidityDays: 0,
    maxConsecutiveColdHumidDays: 0,
    maxConsecutiveHotDryDays: 0,
    maxConsecutiveRainyDays: 0,
    thresholds: {
      humidityMinPercent: effectiveBounds.humidityMin,
      humidityMaxPercent: effectiveBounds.humidityMax,
      temperatureMinC: effectiveBounds.temperatureMin,
      temperatureMaxC: effectiveBounds.temperatureMax,
      uvIndexMax: effectiveBounds.uvIndexMax
    }
  }
  const streaks = {}
  let maxUvIndex
  let aboveGenusUvMaxDays = 0
  let hasUv = false

  for (const record of records) {
    const highHumidity =
      record.humidity !== undefined &&
      effectiveBounds.humidityMax !== undefined &&
      record.humidity > effectiveBounds.humidityMax
    const lowHumidity =
      record.humidity !== undefined &&
      effectiveBounds.humidityMin !== undefined &&
      record.humidity < effectiveBounds.humidityMin
    const cold =
      record.tempMin !== undefined &&
      effectiveBounds.temperatureMin !== undefined &&
      record.tempMin < effectiveBounds.temperatureMin
    const hot =
      record.tempMax !== undefined &&
      effectiveBounds.temperatureMax !== undefined &&
      record.tempMax > effectiveBounds.temperatureMax
    const rainy = isRainyRecord(record)

    if (highHumidity) {
      summary.highHumidityDays += 1
    }
    if (lowHumidity) {
      summary.lowHumidityDays += 1
    }
    if (cold && highHumidity) {
      summary.coldHumidDays += 1
    }
    if (hot && lowHumidity) {
      summary.hotDryDays += 1
    }
    if (hot && highHumidity) {
      summary.hotHumidDays += 1
    }
    if (rainy) {
      summary.rainyDays += 1
    }

    updateConsecutiveStreak(streaks, 'highHumidity', highHumidity)
    updateConsecutiveStreak(streaks, 'lowHumidity', lowHumidity)
    updateConsecutiveStreak(streaks, 'coldHumid', cold && highHumidity)
    updateConsecutiveStreak(streaks, 'hotDry', hot && lowHumidity)
    updateConsecutiveStreak(streaks, 'rainy', rainy)

    if (record.uvIndex !== undefined) {
      hasUv = true
      maxUvIndex = maxUvIndex === undefined ? record.uvIndex : Math.max(maxUvIndex, record.uvIndex)
      if (
        userHasDirectSunExposure === true &&
        effectiveBounds.uvIndexMax !== undefined &&
        record.uvIndex > effectiveBounds.uvIndexMax
      ) {
        aboveGenusUvMaxDays += 1
      }
    }
  }

  summary.maxConsecutiveHighHumidityDays = Number(streaks.highHumidityMax || 0)
  summary.maxConsecutiveLowHumidityDays = Number(streaks.lowHumidityMax || 0)
  summary.maxConsecutiveColdHumidDays = Number(streaks.coldHumidMax || 0)
  summary.maxConsecutiveHotDryDays = Number(streaks.hotDryMax || 0)
  summary.maxConsecutiveRainyDays = Number(streaks.rainyMax || 0)

  if (hasUv) {
    summary.maxUvIndex = maxUvIndex
    summary.aboveGenusUvMaxDays = aboveGenusUvMaxDays
  }

  return summary
}

function buildHistoricalEnvironmentSummary10d(options = {}) {
  return buildEnvironmentSummary({
    ...options,
    dailyRecords: options.dailyRecords || options.historicalDays || options.historyDays || [],
    windowDays: 10
  })
}

function buildForecastEnvironmentSummary15d(options = {}) {
  return buildEnvironmentSummary({
    ...options,
    dailyRecords: options.dailyRecords || options.forecastDays || options.futureDays || [],
    windowDays: 15
  })
}

function normalizeWateringEvent(event = {}, conservativeReferenceDate = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const watered = event.watered !== false && event.didWater !== false && event.action !== 'none'
  const amount = normalizeText(
    event.amount || event.wateringAmount || event.watering_amount || event.level || event.value
  )
  const date = normalizeDate(
    event.date || event.eventDate || event.day || conservativeReferenceDate
  )
  const amountMlRaw = event.amountMl ?? event.amount_ml ?? event.wateringAmountMl
  const amountMl = Number.isFinite(Number(amountMlRaw)) ? Number(amountMlRaw) : null
  const doseClassFromMl =
    amountMl !== null && amountMl > 0 ? resolveMlToDoseClass(amountMl, 0) : null
  if (!watered && !amount && !doseClassFromMl) {
    return null
  }
  return {
    date,
    watered: true,
    amount: amount || doseClassFromMl || 'unknown',
    amountMl,
    doseClass: doseClassFromMl || amount || 'unknown'
  }
}

function normalizeFertilizingEvent(event = {}, conservativeReferenceDate = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const fertilized =
    event.fertilized !== false && event.didFertilize !== false && event.action !== 'none'
  const strength = normalizeText(
    event.strength ||
      event.fertilizingStrength ||
      event.fertilizerStrength ||
      event.concentration ||
      event.value
  )
  const date = normalizeDate(
    event.date || event.eventDate || event.day || conservativeReferenceDate
  )
  if (!fertilized && !strength) {
    return null
  }
  return {
    date,
    fertilized: true,
    strength: strength || 'unknown'
  }
}

function normalizeLightEvent(event = {}, conservativeReferenceDate = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const value = normalizeRawText(
    event.event || event.lightEvent || event.light_event || event.value || event.condition
  )
  const date = normalizeDate(
    event.date || event.eventDate || event.day || conservativeReferenceDate
  )
  if (!value) {
    return null
  }
  return {
    date,
    event: normalizeText(value),
    rawEvent: value
  }
}

function eventsFromDailyRecords(dailyRecords = [], referenceDate = '') {
  const wateringEvents = []
  const fertilizingEvents = []
  const lightChangeEvents = []

  for (const record of Array.isArray(dailyRecords) ? dailyRecords : []) {
    if (!isPlainObject(record)) {
      continue
    }
    const date = normalizeDate(record.date || record.day || referenceDate)
    if (
      record.watered === true ||
      record.didWater === true ||
      record.wateringAmount ||
      record.watering_amount
    ) {
      const event = normalizeWateringEvent(record, date)
      if (event) {
        wateringEvents.push(event)
      }
    }
    if (
      record.fertilized === true ||
      record.didFertilize === true ||
      record.fertilizingStrength ||
      record.fertilizerStrength ||
      record.fertilizing_strength
    ) {
      const event = normalizeFertilizingEvent(record, date)
      if (event) {
        fertilizingEvents.push(event)
      }
    }
    if (
      record.lightEvent ||
      record.light_event ||
      record.lightCondition ||
      record.light_condition
    ) {
      const event = normalizeLightEvent(
        {
          ...record,
          event:
            record.lightEvent ||
            record.light_event ||
            record.lightCondition ||
            record.light_condition
        },
        date
      )
      if (event) {
        lightChangeEvents.push(event)
      }
    }
  }

  return { wateringEvents, fertilizingEvents, lightChangeEvents }
}

function dedupeNormalizedEvents(events = [], keyResolver = event => JSON.stringify(event)) {
  const seen = new Set()
  const deduped = []

  for (const event of Array.isArray(events) ? events : []) {
    const key = String(keyResolver(event) || '').trim()
    if (!key || seen.has(key)) {
      continue
    }
    seen.add(key)
    deduped.push(event)
  }

  return deduped
}

function limitRecentNormalizedEvents(events = [], limit = 10) {
  return events
    .slice()
    .sort((a, b) => normalizeDate(b.date).localeCompare(normalizeDate(a.date)))
    .slice(0, limit)
    .sort((a, b) => normalizeDate(a.date).localeCompare(normalizeDate(b.date)))
}

function latestDaysAgo(referenceDate = '', events = []) {
  let latest = null
  for (const event of events) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {
      continue
    }
    latest = latest === null ? diff : Math.min(latest, diff)
  }
  return latest
}

function buildBehaviorSummary(referenceDate = '', events = {}, lastFertilizedBucket = 'unknown') {
  const wateringEvents = Array.isArray(events.wateringEvents) ? events.wateringEvents : []
  const fertilizingEvents = Array.isArray(events.fertilizingEvents) ? events.fertilizingEvents : []
  const lightChangeEvents = Array.isArray(events.lightChangeEvents) ? events.lightChangeEvents : []
  const latestFertilizingEvent = fertilizingEvents
    .slice()
    .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))[0]

  // v2.1：使用 doseClass 枚举替代硬编码 amount 列表
  const thoroughWateringCount10d = wateringEvents.filter(event =>
    ['thorough', 'deep', 'soaked', '浇透', '透浇'].includes(normalizeText(event.amount))
  ).length
  const lastWateredDaysAgoValue = latestDaysAgo(referenceDate, wateringEvents)

  return {
    // v2.1：移除 wateringCount10d，改用 effectiveHydrationLoad 等字段
    // diagnose-http 自有 buildBehaviorSummary 不接入盆型几何，使用简化水合负载
    effectiveHydrationLoad: computeSimplifiedHydrationLoad(wateringEvents, referenceDate),
    wetPressureLoad: computeSimplifiedWetPressure(wateringEvents, referenceDate),
    lastEffectiveRootWateredDaysAgo: computeLastEffectiveRootWatered(wateringEvents, referenceDate),
    rootZoneMoistureIndex: null,
    thoroughWateringCount10d,
    lastWateredDaysAgo: lastWateredDaysAgoValue,
    fertilizingCount10d: fertilizingEvents.length,
    latestFertilizerStrength: normalizeText(latestFertilizingEvent?.strength || ''),
    lastFertilizedBucket,
    movedToStrongerLightWithin10d: lightChangeEvents.some(event =>
      includesAnyToken(event.event || event.rawEvent, STRONGER_LIGHT_TOKENS)
    ),
    userHasDirectSunExposure: lightChangeEvents.some(event =>
      includesAnyToken(event.event || event.rawEvent, DIRECT_LIGHT_TOKENS)
    )
  }
}

/**
 * 从浇水事件解析 doseClass。优先用 normalizeWateringEvent 已落档的 doseClass，
 * 不存在时回退到 amount 字符串匹配，保证旧数据兼容。
 */
function resolveDoseClassFromEvent(event = {}) {
  const preset = normalizeText(event?.doseClass)
  if (preset && preset !== 'unknown') {
    return preset
  }
  const amount = normalizeText(
    event?.amount || event?.wateringAmount || event?.level || event?.value
  )
  if (['mist', '喷雾', '喷淋'].includes(amount)) {
    return 'mist'
  }
  if (['small', '少量', '少许'].includes(amount)) {
    return 'small'
  }
  if (['normal', '普通', '常规'].includes(amount)) {
    return 'normal'
  }
  if (['thorough', 'deep', 'soaked', '浇透', '透浇', '大水'].includes(amount)) {
    return 'thorough'
  }
  return 'unknown'
}

/**
 * diagnose-http 简化水合负载计算（不依赖盆型几何）。
 * 按 doseClass 权重 × recencyDecay 求和，归一化到 0~1。
 */
function computeSimplifiedHydrationLoad(wateringEvents = [], referenceDate = '') {
  if (!wateringEvents.length) {
    return 0
  }
  const lookback = 10
  const weightMap = { unknown: 0.4, mist: 0.1, small: 0.4, normal: 0.7, thorough: 1.0 }
  let total = 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookback) {
      continue
    }
    const doseClass = resolveDoseClassFromEvent(event)
    const weight = weightMap[doseClass] ?? 0.4
    const recencyDecay = 1 - diff / lookback
    total += weight * recencyDecay
  }
  return Math.round((total / lookback) * 10 * 100) / 100
}

/**
 * diagnose-http 简化湿压计算（不依赖盆型几何）。
 */
function computeSimplifiedWetPressure(wateringEvents = [], referenceDate = '') {
  if (!wateringEvents.length) {
    return 0
  }
  const lookback = 10
  const weightMap = { unknown: 0.3, mist: 0.05, small: 0.3, normal: 0.6, thorough: 1.0 }
  let total = 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookback) {
      continue
    }
    const doseClass = resolveDoseClassFromEvent(event)
    const weight = weightMap[doseClass] ?? 0.3
    const recencyDecay = 1 - diff / lookback
    total += weight * recencyDecay
  }
  return Math.round((total / lookback) * 10 * 100) / 100
}

/**
 * 距上次有效根区浇水的天数（排除喷雾）。
 */
function computeLastEffectiveRootWatered(wateringEvents = [], referenceDate = '') {
  let latest = null
  for (const event of wateringEvents) {
    const doseClass = resolveDoseClassFromEvent(event)
    if (doseClass === 'mist') {
      continue
    }
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {
      continue
    }
    latest = latest === null ? diff : Math.min(latest, diff)
  }
  return latest
}

function normalizeCareBehaviorTimeline(input = {}) {
  const source = isPlainObject(input) ? input : {}
  const referenceDate = normalizeDate(
    source.referenceDate ||
      source.reference_date ||
      source.diagnosisDate ||
      source.diagnosis_date ||
      new Date().toISOString()
  )
  const dailyRecords = Array.isArray(source.dailyRecords)
    ? source.dailyRecords
    : Array.isArray(source.daily_records)
      ? source.daily_records
      : []
  const eventsFromDaily = eventsFromDailyRecords(dailyRecords, referenceDate)
  const wateringEvents10d = [
    ...(Array.isArray(source.wateringEvents10d) ? source.wateringEvents10d : []),
    ...(Array.isArray(source.watering_events_10d) ? source.watering_events_10d : []),
    ...eventsFromDaily.wateringEvents
  ]
    .map(event => normalizeWateringEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedWateringEvents10d = dedupeNormalizedEvents(wateringEvents10d, event =>
    normalizeDate(event.date)
  )
  const recentWateringEvents10d = limitRecentNormalizedEvents(dedupedWateringEvents10d)
  const fertilizingEvents10d = [
    ...(Array.isArray(source.fertilizingEvents10d) ? source.fertilizingEvents10d : []),
    ...(Array.isArray(source.fertilizing_events_10d) ? source.fertilizing_events_10d : []),
    ...eventsFromDaily.fertilizingEvents
  ]
    .map(event => normalizeFertilizingEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedFertilizingEvents10d = dedupeNormalizedEvents(fertilizingEvents10d, event =>
    normalizeDate(event.date)
  )
  const recentFertilizingEvents10d = limitRecentNormalizedEvents(dedupedFertilizingEvents10d)
  const lightChangeEvents10d = [
    ...(Array.isArray(source.lightChangeEvents10d) ? source.lightChangeEvents10d : []),
    ...(Array.isArray(source.light_change_events_10d) ? source.light_change_events_10d : []),
    ...eventsFromDaily.lightChangeEvents
  ]
    .map(event => normalizeLightEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedLightChangeEvents10d = dedupeNormalizedEvents(lightChangeEvents10d, event =>
    normalizeDate(event.date)
  )
  const recentLightChangeEvents10d = limitRecentNormalizedEvents(dedupedLightChangeEvents10d)
  const lastFertilizedBucket = normalizeBucket(
    source.lastFertilizedBucket || source.last_fertilized_bucket
  )
  const normalizedDailyRecords = dailyRecords.filter(isPlainObject).map(record => ({
    ...record,
    date: normalizeDate(record.date || record.day || referenceDate)
  }))

  const summary = buildBehaviorSummary(
    referenceDate,
    {
      wateringEvents: recentWateringEvents10d,
      fertilizingEvents: recentFertilizingEvents10d,
      lightChangeEvents: recentLightChangeEvents10d
    },
    recentFertilizingEvents10d.length > 0 ? 'within_10d' : lastFertilizedBucket
  )

  return {
    referenceDate,
    reference_date: referenceDate,
    dailyRecords: normalizedDailyRecords,
    daily_records: normalizedDailyRecords,
    wateringEvents10d: recentWateringEvents10d,
    watering_events_10d: recentWateringEvents10d,
    fertilizingEvents10d: recentFertilizingEvents10d,
    fertilizing_events_10d: recentFertilizingEvents10d,
    lightChangeEvents10d: recentLightChangeEvents10d,
    light_change_events_10d: recentLightChangeEvents10d,
    lastFertilizedBucket: summary.lastFertilizedBucket,
    last_fertilized_bucket: summary.lastFertilizedBucket,
    summary
  }
}

function buildWateringPlanner({
  wateringStrategy = {},
  historical = {},
  forecast = {},
  behaviorTimeline = {},
  thresholds: rawThresholds = null,
  potProfile = null,
  wateringQuantization = null,
  transpirationIntervalFactor = null
} = {}) {
  // 委托给 layer 共享实现，传入 diagnose-http 自有的阈值解析器以保持配置覆盖行为一致
  return buildWateringPlannerShared({
    wateringStrategy,
    historical,
    forecast,
    behaviorTimeline,
    potProfile,
    wateringQuantization,
    transpirationIntervalFactor,
    thresholds: rawThresholds,
    resolveThresholds: resolveCarePlannerThresholds
  })
}

function buildFertilizingPlanner(...args) {
  const options = args[0] || {}
  const plantContext = options.plantContext || {}
  const referenceDate = String(
    options.diagnosisDate ||
      options.referenceDate ||
      options.behaviorTimeline?.referenceDate ||
      options.behaviorTimeline?.reference_date ||
      new Date().toISOString().slice(0, 10)
  ).slice(0, 10)
  const decision = buildFertilizationDecision({
    plantContext,
    fertilizerType: options.fertilizerType || '',
    referenceDate
  })
  return {
    ...decision,
    calculation: {
      formulaVersion: 'fertilizing_monthly_v1',
      inputs: {
        referenceDate,
        month: decision.ruleMonth,
        fertilizerType: decision.fertilizerType,
        historyStatus: decision.historyStatus,
        historyCount: Array.isArray(plantContext.fertilizationHistory)
          ? plantContext.fertilizationHistory.length
          : 0
      },
      result: {
        status: decision.status,
        nextCheckDate: decision.nextCheckDate,
        dueNow: decision.dueNow,
        lastAppliedDate: decision.lastAppliedDate,
        reasons: decision.reasons
      }
    }
  }
}

function buildLightPlanner({
  forecast = {},
  behaviorTimeline = {},
  plantContext = {},
  userLightContext = {},
  weatherDays = [],
  plantFeatures = {},
  weatherEvidenceInsufficient = false,
  recentLightChange = 'unknown'
} = {}) {
  const timeline = behaviorTimeline?.summary
    ? behaviorTimeline
    : normalizeCareBehaviorTimeline(behaviorTimeline)
  const lightContext = []
  const lightHealth = estimateLightHealth({
    plantContext,
    userLightContext,
    weatherDays,
    plantFeatures,
    weatherEvidenceInsufficient
  })
  const stableExposure = lightHealth?.lightHealthEvidence?.exposure || null
  const directExposure = Boolean(
    stableExposure &&
      stableExposure.confidence !== 'low' &&
      stableExposure.evidence?.naturalLightType === 'direct'
  )

  const hasEffectiveWeatherLightEvidence =
    weatherEvidenceInsufficient !== true && plantFeatures?.lightEvidenceInsufficient !== true
  if (
    directExposure &&
    hasEffectiveWeatherLightEvidence &&
    Number(forecast.aboveGenusUvMaxDays || 0) > 0
  ) {
    lightContext.push(LIGHT_CONTEXTS.EXCESS_LIGHT_OR_SUNBURN_RISK)
  }

  const normalizedRecentLightChange = [
    'stronger_direct_light',
    'no_clear_change',
    'weaker_light',
    'unknown'
  ].includes(String(recentLightChange || '').trim())
    ? String(recentLightChange).trim()
    : 'unknown'

  if (
    normalizedRecentLightChange === 'stronger_direct_light' ||
    (directExposure && timeline.summary?.movedToStrongerLightWithin10d === true)
  ) {
    lightContext.push(LIGHT_CONTEXTS.RECENT_LIGHT_INCREASE_STRESS)
  }
  if (normalizedRecentLightChange === 'weaker_light') {
    lightContext.push(LIGHT_CONTEXTS.RECENT_LIGHT_DECREASE)
  }

  if (lightHealth?.lightHealthEvidence?.direction === 'low') {
    lightContext.push(LIGHT_CONTEXTS.LOW_LIGHT_BACKGROUND)
  }

  return {
    lightContext,
    realExposureScene: directExposure,
    recentLightChange: normalizedRecentLightChange,
    userLightContext: normalizeUserLightContext(userLightContext),
    lightHealthScore: lightHealth?.lightHealthScore ?? null,
    lightHealthLevel: lightHealth?.lightHealthLevel || '',
    lightHealthReason: lightHealth?.lightHealthReason || '',
    lightHealthEvidence: lightHealth?.lightHealthEvidence || null
  }
}

function resolvePlantRequiresBrightLight(plantContext = {}) {
  const sunningText = normalizeRawText(
    plantContext.sunning?.way ||
      plantContext.sunning?.description ||
      plantContext.lightRequirement ||
      plantContext.light_requirement ||
      ''
  )
  return /明亮|强散射|bright|indirect/i.test(sunningText)
}

function buildEnvironmentCareContextV7({
  diagnosisDate = '',
  plantContext = {},
  environmentWeatherWindow = {},
  careBehaviorTimeline = {},
  userLightContext = {},
  recentLightChange = 'unknown',
  airEnvironmentInput = null,
  airEnvironmentEvidence = null,
  wateringQuantization = null,
  thresholds: rawThresholds = null
} = {}) {
  const thresholds = resolveCarePlannerThresholds(
    rawThresholds ||
      plantContext.carePlannerThresholds ||
      plantContext.care_planner_thresholds ||
      {}
  )
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate:
      diagnosisDate ||
      environmentWeatherWindow?.meta?.diagnosisDate ||
      environmentWeatherWindow?.meta?.diagnosis_date ||
      careBehaviorTimeline?.referenceDate ||
      careBehaviorTimeline?.reference_date,
    ...careBehaviorTimeline
  })
  const effectiveUserLightContext = hasMeaningfulUserLightContext(userLightContext)
    ? userLightContext
    : plantContext.userLightContext || {}
  const environmentExposure = computeLightExposure({
    userLightContext: effectiveUserLightContext,
    weatherDays: [
      ...(environmentWeatherWindow.historicalDays ||
        environmentWeatherWindow.historical_days ||
        []),
      ...(environmentWeatherWindow.forecastDays || environmentWeatherWindow.forecast_days || [])
    ],
    weatherLightFactor: environmentWeatherWindow?.plantFeatures?.weatherLightFactor10d,
    weatherEvidenceInsufficient:
      environmentWeatherWindow?.weatherEvidenceInsufficient === true ||
      environmentWeatherWindow?.plantFeatures?.lightEvidenceInsufficient === true,
    weatherLightConfidence: environmentWeatherWindow?.plantFeatures?.lightConfidence || ''
  })
  const directExposure = Boolean(
    environmentExposure &&
      environmentExposure.confidence !== 'low' &&
      environmentExposure.evidence?.naturalLightType === 'direct'
  )
  const bounds = {
    plantContext,
    temperatureMin: plantContext.temperatureMin,
    temperatureMax: plantContext.temperatureMax,
    humidityMin: plantContext.humidityMin,
    humidityMax: plantContext.humidityMax,
    uvIndexMax: plantContext.uvIndexMax
  }
  const historicalSummary10d = buildHistoricalEnvironmentSummary10d({
    dailyRecords:
      environmentWeatherWindow.historicalDays || environmentWeatherWindow.historical_days || [],
    userHasDirectSunExposure: directExposure,
    thresholds,
    ...bounds
  })
  const forecastSummary15d = buildForecastEnvironmentSummary15d({
    dailyRecords:
      environmentWeatherWindow.forecastDays || environmentWeatherWindow.forecast_days || [],
    userHasDirectSunExposure: directExposure,
    thresholds,
    ...bounds
  })
  const resolvedAirEnvironmentEvidence =
    airEnvironmentEvidence ||
    resolveAirEnvironmentEvidenceShared(airEnvironmentInput) ||
    resolveAirEnvironmentEvidenceShared(
      plantContext.airEnvironment?.input || plantContext.airEnvironment || null
    )
  const transpiration = computeTranspirationIntervalFactorShared({
    lightEnvironment: effectiveUserLightContext,
    weatherDays: (
      environmentWeatherWindow.historicalDays ||
      environmentWeatherWindow.historical_days ||
      []
    ).slice(0, 10),
    weatherLightFactor: environmentWeatherWindow?.plantFeatures?.weatherLightFactor10d,
    weatherEvidenceInsufficient:
      environmentWeatherWindow?.weatherEvidenceInsufficient === true ||
      environmentWeatherWindow?.plantFeatures?.lightEvidenceInsufficient === true,
    weatherLightConfidence: environmentWeatherWindow?.plantFeatures?.lightConfidence || '',
    weatherSummary: historicalSummary10d,
    plantStrategy:
      wateringQuantization || plantContext.wateringQuantization
        ? {
            wateringQuantization: wateringQuantization || plantContext.wateringQuantization
          }
        : null,
    airEnvironmentEvidence: resolvedAirEnvironmentEvidence,
    shadow: resolveShadowModeFromEnvShared()
  })
  const watering = buildWateringPlanner({
    wateringStrategy:
      plantContext.watering ||
      plantContext.wateringStrategy ||
      plantContext.watering_strategy_json ||
      {},
    historical: historicalSummary10d,
    forecast: forecastSummary15d,
    behaviorTimeline: timeline,
    thresholds,
    potProfile: plantContext.potProfile || null,
    wateringQuantization: wateringQuantization || plantContext.wateringQuantization || null,
    userLightContext: effectiveUserLightContext,
    airEnvironmentEvidence: resolvedAirEnvironmentEvidence,
    transpirationIntervalFactor: transpiration.intervalFactor
  })
  const fertilizing = buildFertilizingPlanner({
    diagnosisDate,
    behaviorTimeline: timeline,
    plantContext
  })
  const light = buildLightPlanner({
    forecast: forecastSummary15d,
    behaviorTimeline: timeline,
    plantContext,
    userLightContext: effectiveUserLightContext,
    weatherDays: [
      ...(environmentWeatherWindow.historicalDays ||
        environmentWeatherWindow.historical_days ||
        []),
      ...(environmentWeatherWindow.forecastDays || environmentWeatherWindow.forecast_days || [])
    ],
    plantFeatures: environmentWeatherWindow?.plantFeatures || {},
    weatherEvidenceInsufficient: environmentWeatherWindow?.weatherEvidenceInsufficient === true,
    recentLightChange
  })

  return {
    version: 'v7',
    environmentWeatherWindow,
    careBehaviorTimeline: timeline,
    historicalSummary10d,
    forecastSummary15d,
    behaviorSummary10d: timeline.summary,
    thresholds: clonePlain(thresholds),
    watering,
    fertilizing,
    light,
    calculationTrace: {
      watering: watering.calculation || null,
      fertilizing: fertilizing.calculation || null,
      light: {
        formulaVersion:
          light.lightHealthEvidence?.formulaVersion || 'light_planner_v7_contextual',
        inputs: {
          forecast: pickNumberFields(forecastSummary15d, ['aboveGenusUvMaxDays']),
          userHasDirectSunExposure: directExposure,
          plantRequiresBrightLight: resolvePlantRequiresBrightLight(plantContext),
          userLightContext: light.userLightContext,
          recentLightChange: light.recentLightChange
        },
        result: {
          lightContext: light.lightContext,
          realExposureScene: light.realExposureScene,
          lightHealthScore: light.lightHealthScore,
          lightHealthLevel: light.lightHealthLevel,
          lightHealthReason: light.lightHealthReason
        },
        evidence: light.lightHealthEvidence
      }
    },
    outputs: {
      wateringContext: watering.wateringContext,
      wateringAction: watering.action,
      fertilizingAction: fertilizing.action,
      fertilizationStatus: fertilizing.status,
      lightContext: light.lightContext,
      lightHealthScore: light.lightHealthScore,
      lightHealthLevel: light.lightHealthLevel,
      lightHealthReason: light.lightHealthReason,
      lightHealthEvidence: light.lightHealthEvidence,
      recentLightChange: light.recentLightChange,
      airEnvironmentEvidence: resolvedAirEnvironmentEvidence,
      transpirationIntervalFactor: transpiration.intervalFactor,
      transpirationComputedFactor: transpiration.computedFactor,
      transpirationShadow: transpiration.shadow
    }
  }
}

module.exports = {
  buildHistoricalEnvironmentSummary10d,
  buildForecastEnvironmentSummary15d,
  normalizeCareBehaviorTimeline,
  buildEnvironmentCareContextV7,
  buildWateringPlanner,
  buildFertilizingPlanner,
  buildLightPlanner,
  WATERING_CONTEXTS,
  WATERING_ACTIONS,
  FERTILIZING_ACTIONS,
  LIGHT_CONTEXTS,
  resolveCarePlannerThresholds
}
