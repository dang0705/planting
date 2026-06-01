'use strict'

const WATERING_CONTEXTS = Object.freeze({
  WET: 'likely_too_wet',
  DRY: 'likely_too_dry',
  BASELINE: 'keep_baseline_or_check_soil'
})

const WATERING_ACTIONS = Object.freeze({
  WET: 'delay_and_check_soil',
  DRY: 'increase_soil_check_frequency',
  BASELINE: 'follow_baseline_or_check_soil'
})

const FERTILIZING_ACTIONS = Object.freeze({
  PAUSE: 'pause',
  THIN_AFTER_DUE: 'thin_after_due',
  NORMAL_BASELINE: 'normal_baseline',
  POSSIBLE_DEFICIENCY_CHECK: 'possible_deficiency_check'
})

const LIGHT_CONTEXTS = Object.freeze({
  EXCESS_LIGHT_OR_SUNBURN_RISK: 'excess_light_or_sunburn_risk',
  RECENT_LIGHT_INCREASE_STRESS: 'recent_light_increase_stress',
  LOW_LIGHT_BACKGROUND: 'low_light_background'
})

const FERTILIZING_BASELINE = Object.freeze({
  intervalDays: [30, 45],
  fertilizerType: 'thin_liquid_fertilizer'
})

const MS_PER_DAY = 24 * 60 * 60 * 1000
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
const LOW_LIGHT_TOKENS = [
  'low_light',
  'shade',
  'dark',
  'weak_light',
  '阴暗',
  '弱光',
  '背阴'
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

function toNumber(value) {
  if (value === null || value === undefined || value === '') {return undefined}
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function firstNumber(...values) {
  for (const value of values) {
    const number = toNumber(value)
    if (number !== undefined) {return number}
  }
  return undefined
}

function firstText(...values) {
  for (const value of values) {
    const text = normalizeRawText(value)
    if (text) {return text}
  }
  return ''
}

function normalizeDate(value = '') {
  const raw = normalizeRawText(value)
  if (!raw) {return ''}
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [
      match[1],
      String(match[2]).padStart(2, '0'),
      String(match[3]).padStart(2, '0')
    ].join('-')
  }
  return raw.slice(0, 10)
}

function parseDate(value = '') {
  const normalized = normalizeDate(value)
  if (!normalized) {return null}
  const date = new Date(`${normalized}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysAgo(referenceDate = '', eventDate = '') {
  const reference = parseDate(referenceDate)
  const event = parseDate(eventDate)
  if (!reference || !event) {return null}
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
  if (!isPlainObject(record)) {return null}

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
  const weatherText = firstText(record.weatherText, record.textDay, record.textNight, record.weather, record.text)

  return {
    date: normalizeDate(record.date || record.fxDate || record.obsDate || record.time || record.day),
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
    temperatureMin: firstNumber(options.temperatureMin, options.tempMin, genus.temperatureMin, genus.tempMin, watering.tempMin),
    temperatureMax: firstNumber(options.temperatureMax, options.tempMax, genus.temperatureMax, genus.tempMax, watering.tempMax),
    humidityMin: firstNumber(options.humidityMin, options.rhMin, genus.humidityMin, genus.rhMin, watering.humidityMin),
    humidityMax: firstNumber(options.humidityMax, options.rhMax, genus.humidityMax, genus.rhMax, watering.humidityMax),
    uvIndexMax: firstNumber(options.uvIndexMax, options.uvMax, genus.uvIndexMax, genus.uvMax, genus.sunning?.uvIndexMax)
  }
}

function isRainyRecord(record = {}) {
  const precipitation = toNumber(record.precipitation)
  if (precipitation !== undefined && precipitation > 0) {return true}
  return /雨|雪|rain|shower|storm/i.test(record.weatherText || '')
}

function buildEnvironmentSummary({
  dailyRecords = [],
  windowDays,
  userHasDirectSunExposure = false,
  ...boundsInput
} = {}) {
  const records = (Array.isArray(dailyRecords) ? dailyRecords : [])
    .slice(0, windowDays)
    .map(normalizeDailyEnvironmentRecord)
    .filter(Boolean)
  const bounds = resolveEnvironmentBounds(boundsInput)
  const summary = {
    windowDays,
    recordCount: records.length,
    highHumidityDays: 0,
    lowHumidityDays: 0,
    coldHumidDays: 0,
    hotDryDays: 0,
    hotHumidDays: 0,
    rainyDays: 0
  }
  let maxUvIndex
  let aboveGenusUvMaxDays = 0
  let hasUv = false

  for (const record of records) {
    const highHumidity =
      record.humidity !== undefined &&
      bounds.humidityMax !== undefined &&
      record.humidity > bounds.humidityMax
    const lowHumidity =
      record.humidity !== undefined &&
      bounds.humidityMin !== undefined &&
      record.humidity < bounds.humidityMin
    const cold =
      record.tempMin !== undefined &&
      bounds.temperatureMin !== undefined &&
      record.tempMin < bounds.temperatureMin
    const hot =
      record.tempMax !== undefined &&
      bounds.temperatureMax !== undefined &&
      record.tempMax > bounds.temperatureMax

    if (highHumidity) {summary.highHumidityDays += 1}
    if (lowHumidity) {summary.lowHumidityDays += 1}
    if (cold && highHumidity) {summary.coldHumidDays += 1}
    if (hot && lowHumidity) {summary.hotDryDays += 1}
    if (hot && highHumidity) {summary.hotHumidDays += 1}
    if (isRainyRecord(record)) {summary.rainyDays += 1}

    if (record.uvIndex !== undefined) {
      hasUv = true
      maxUvIndex = maxUvIndex === undefined ? record.uvIndex : Math.max(maxUvIndex, record.uvIndex)
      if (
        userHasDirectSunExposure === true &&
        bounds.uvIndexMax !== undefined &&
        record.uvIndex > bounds.uvIndexMax
      ) {
        aboveGenusUvMaxDays += 1
      }
    }
  }

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

function normalizeWateringEvent(event = {}, fallbackReferenceDate = '') {
  if (!isPlainObject(event)) {return null}
  const watered = event.watered !== false && event.didWater !== false && event.action !== 'none'
  const amount = normalizeText(event.amount || event.wateringAmount || event.watering_amount || event.level || event.value)
  const date = normalizeDate(event.date || event.eventDate || event.day || fallbackReferenceDate)
  if (!watered && !amount) {return null}
  return {
    date,
    watered: true,
    amount: amount || 'unknown'
  }
}

function normalizeFertilizingEvent(event = {}, fallbackReferenceDate = '') {
  if (!isPlainObject(event)) {return null}
  const fertilized = event.fertilized !== false && event.didFertilize !== false && event.action !== 'none'
  const strength = normalizeText(event.strength || event.fertilizingStrength || event.fertilizerStrength || event.concentration || event.value)
  const date = normalizeDate(event.date || event.eventDate || event.day || fallbackReferenceDate)
  if (!fertilized && !strength) {return null}
  return {
    date,
    fertilized: true,
    strength: strength || 'unknown'
  }
}

function normalizeLightEvent(event = {}, fallbackReferenceDate = '') {
  if (!isPlainObject(event)) {return null}
  const value = normalizeRawText(event.event || event.lightEvent || event.light_event || event.value || event.condition)
  const date = normalizeDate(event.date || event.eventDate || event.day || fallbackReferenceDate)
  if (!value) {return null}
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
    if (!isPlainObject(record)) {continue}
    const date = normalizeDate(record.date || record.day || referenceDate)
    if (
      record.watered === true ||
      record.didWater === true ||
      record.wateringAmount ||
      record.watering_amount
    ) {
      const event = normalizeWateringEvent(record, date)
      if (event) {wateringEvents.push(event)}
    }
    if (
      record.fertilized === true ||
      record.didFertilize === true ||
      record.fertilizingStrength ||
      record.fertilizerStrength ||
      record.fertilizing_strength
    ) {
      const event = normalizeFertilizingEvent(record, date)
      if (event) {fertilizingEvents.push(event)}
    }
    if (record.lightEvent || record.light_event || record.lightCondition || record.light_condition) {
      const event = normalizeLightEvent({
        ...record,
        event: record.lightEvent || record.light_event || record.lightCondition || record.light_condition
      }, date)
      if (event) {lightChangeEvents.push(event)}
    }
  }

  return { wateringEvents, fertilizingEvents, lightChangeEvents }
}

function dedupeNormalizedEvents(events = [], keyResolver = event => JSON.stringify(event)) {
  const seen = new Set()
  const deduped = []

  for (const event of Array.isArray(events) ? events : []) {
    const key = String(keyResolver(event) || '').trim()
    if (!key || seen.has(key)) {continue}
    seen.add(key)
    deduped.push(event)
  }

  return deduped
}

function latestDaysAgo(referenceDate = '', events = []) {
  let latest = null
  for (const event of events) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {continue}
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

  return {
    wateringCount10d: wateringEvents.length,
    thoroughWateringCount10d: wateringEvents.filter(event =>
      ['thorough', 'deep', 'soaked', '浇透', '透浇'].includes(normalizeText(event.amount))
    ).length,
    lastWateredDaysAgo: latestDaysAgo(referenceDate, wateringEvents),
    fertilizingCount10d: fertilizingEvents.length,
    latestFertilizerStrength: normalizeText(latestFertilizingEvent?.strength || ''),
    lastFertilizedBucket,
    movedToStrongerLightWithin10d: lightChangeEvents.some(event => includesAnyToken(event.event || event.rawEvent, STRONGER_LIGHT_TOKENS)),
    userHasDirectSunExposure: lightChangeEvents.some(event => includesAnyToken(event.event || event.rawEvent, DIRECT_LIGHT_TOKENS))
  }
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
    : (Array.isArray(source.daily_records) ? source.daily_records : [])
  const eventsFromDaily = eventsFromDailyRecords(dailyRecords, referenceDate)
  const wateringEvents10d = [
    ...(Array.isArray(source.wateringEvents10d) ? source.wateringEvents10d : []),
    ...(Array.isArray(source.watering_events_10d) ? source.watering_events_10d : []),
    ...eventsFromDaily.wateringEvents
  ]
    .map(event => normalizeWateringEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedWateringEvents10d = dedupeNormalizedEvents(
    wateringEvents10d,
    event => normalizeDate(event.date)
  ).slice(0, 10)
  const fertilizingEvents10d = [
    ...(Array.isArray(source.fertilizingEvents10d) ? source.fertilizingEvents10d : []),
    ...(Array.isArray(source.fertilizing_events_10d) ? source.fertilizing_events_10d : []),
    ...eventsFromDaily.fertilizingEvents
  ]
    .map(event => normalizeFertilizingEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedFertilizingEvents10d = dedupeNormalizedEvents(
    fertilizingEvents10d,
    event => normalizeDate(event.date)
  ).slice(0, 10)
  const lightChangeEvents10d = [
    ...(Array.isArray(source.lightChangeEvents10d) ? source.lightChangeEvents10d : []),
    ...(Array.isArray(source.light_change_events_10d) ? source.light_change_events_10d : []),
    ...eventsFromDaily.lightChangeEvents
  ]
    .map(event => normalizeLightEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedLightChangeEvents10d = dedupeNormalizedEvents(
    lightChangeEvents10d,
    event => normalizeDate(event.date)
  ).slice(0, 10)
  const lastFertilizedBucket = normalizeBucket(source.lastFertilizedBucket || source.last_fertilized_bucket)
  const normalizedDailyRecords = dailyRecords
    .filter(isPlainObject)
    .map(record => ({
      ...record,
      date: normalizeDate(record.date || record.day || referenceDate)
    }))

  const summary = buildBehaviorSummary(
    referenceDate,
    {
      wateringEvents: dedupedWateringEvents10d,
      fertilizingEvents: dedupedFertilizingEvents10d,
      lightChangeEvents: dedupedLightChangeEvents10d
    },
    dedupedFertilizingEvents10d.length > 0 ? 'within_10d' : lastFertilizedBucket
  )

  return {
    referenceDate,
    reference_date: referenceDate,
    dailyRecords: normalizedDailyRecords,
    daily_records: normalizedDailyRecords,
    wateringEvents10d: dedupedWateringEvents10d,
    watering_events_10d: dedupedWateringEvents10d,
    fertilizingEvents10d: dedupedFertilizingEvents10d,
    fertilizing_events_10d: dedupedFertilizingEvents10d,
    lightChangeEvents10d: dedupedLightChangeEvents10d,
    light_change_events_10d: dedupedLightChangeEvents10d,
    lastFertilizedBucket: summary.lastFertilizedBucket,
    last_fertilized_bucket: summary.lastFertilizedBucket,
    summary
  }
}

function resolveBaselineInterval(wateringStrategy = {}) {
  const freq = wateringStrategy.freq || wateringStrategy.intervalDays || wateringStrategy.interval_days
  if (Array.isArray(freq) && freq.length >= 2) {
    const min = toNumber(freq[0])
    const max = toNumber(freq[1])
    if (min !== undefined && max !== undefined) {return [min, max]}
  }
  return [5, 8]
}

function buildWateringPlanner({
  wateringStrategy = {},
  historical = {},
  forecast = {},
  behaviorTimeline = {}
} = {}) {
  const timeline = behaviorTimeline?.summary
    ? behaviorTimeline
    : normalizeCareBehaviorTimeline(behaviorTimeline)
  const summary = timeline.summary || {}
  const wateringCount10d = Number(summary.wateringCount10d || 0)
  const lastWateredDaysAgo = summary.lastWateredDaysAgo
  const baseline = {
    intervalDays: resolveBaselineInterval(wateringStrategy)
  }
  const minIntervalDays = Math.max(1, Number(baseline.intervalDays?.[0]) || 5)
  const maxReasonableWaterings10d = Math.max(1, Math.ceil(10 / minIntervalDays))
  const wetPressureScore =
    (Number(historical.highHumidityDays || 0) >= 4 ? 1 : 0) +
    (Number(historical.coldHumidDays || 0) >= 2 ? 1 : 0) +
    (Number(historical.rainyDays || 0) >= 4 ? 1 : 0)
  const effectiveWetWaterings10d = Math.max(1, maxReasonableWaterings10d - wetPressureScore)

  if (
    wateringCount10d > effectiveWetWaterings10d
  ) {
    return {
      baseline,
      wateringContext: WATERING_CONTEXTS.WET,
      action: WATERING_ACTIONS.WET,
      reasons: wetPressureScore > 0
        ? ['recent_watering_plus_wet_environment']
        : ['recent_watering_exceeds_baseline_window']
    }
  }

  if (
    (Number(forecast.hotDryDays || 0) >= 3 && (lastWateredDaysAgo === null || lastWateredDaysAgo >= 7)) ||
    (Number(historical.hotDryDays || 0) >= 3 && wateringCount10d === 0)
  ) {
    return {
      baseline,
      wateringContext: WATERING_CONTEXTS.DRY,
      action: WATERING_ACTIONS.DRY,
      reasons: ['hot_dry_window_plus_low_recent_watering']
    }
  }

  return {
    baseline,
    wateringContext: WATERING_CONTEXTS.BASELINE,
    action: WATERING_ACTIONS.BASELINE,
    reasons: ['baseline_or_manual_soil_check']
  }
}

function buildFertilizingPlanner(...args) {
  const options = args[0] || {}
  const timeline = options.behaviorTimeline?.summary
    ? options.behaviorTimeline
    : normalizeCareBehaviorTimeline(options.behaviorTimeline || {})
  const summary = timeline.summary || {}
  const lastFertilizedBucket = normalizeBucket(
    options.lastFertilizedBucket ||
      options.last_fertilized_bucket ||
      summary.lastFertilizedBucket ||
      timeline.lastFertilizedBucket
  )
  const recentStrength = normalizeText(
    options.recentFertilizerStrength ||
      options.recent_fertilizer_strength ||
      summary.latestFertilizerStrength
  )
  const weakGrowth = Boolean(options.plantShowsWeakGrowth || options.weakGrowth || options.hasWeakGrowth)
  const justRepotted = Boolean(options.justRepottedRecently || options.justRepotted || options.recentlyRepotted)
  const recentFertilizingCount = Number(summary.fertilizingCount10d || 0)
  const concentrated = ['strong', 'concentrated', 'high', 'heavy', '浓肥', '浓'].includes(recentStrength)

  if (justRepotted || concentrated || recentFertilizingCount > 0 || lastFertilizedBucket === 'within_10d') {
    return {
      baseline: { ...FERTILIZING_BASELINE },
      action: FERTILIZING_ACTIONS.PAUSE,
      lastFertilizedBucket,
      reasons: ['recent_or_high_risk_fertilizing_gate']
    }
  }

  if (weakGrowth && ['over_60d', 'almost_never', 'unknown'].includes(lastFertilizedBucket)) {
    return {
      baseline: { ...FERTILIZING_BASELINE },
      action: FERTILIZING_ACTIONS.POSSIBLE_DEFICIENCY_CHECK,
      lastFertilizedBucket,
      reasons: ['weak_growth_and_long_gap']
    }
  }

  if (['31_60d', 'over_60d', 'almost_never'].includes(lastFertilizedBucket)) {
    return {
      baseline: { ...FERTILIZING_BASELINE },
      action: FERTILIZING_ACTIONS.THIN_AFTER_DUE,
      lastFertilizedBucket,
      reasons: ['fixed_30_45_day_baseline_due']
    }
  }

  return {
    baseline: { ...FERTILIZING_BASELINE },
    action: FERTILIZING_ACTIONS.NORMAL_BASELINE,
    lastFertilizedBucket,
    reasons: ['not_due_by_fixed_baseline']
  }
}

function hasDirectExposureScene({ userLightCondition = '', userHasDirectSunExposure = false, behaviorTimeline = {} } = {}) {
  if (userHasDirectSunExposure === true) {return true}
  if (includesAnyToken(userLightCondition, DIRECT_LIGHT_TOKENS)) {return true}
  const summary = behaviorTimeline?.summary || {}
  return summary.userHasDirectSunExposure === true
}

function buildLightPlanner({
  forecast = {},
  userLightCondition = '',
  userHasDirectSunExposure = false,
  plantRequiresBrightLight = false,
  behaviorTimeline = {}
} = {}) {
  const timeline = behaviorTimeline?.summary
    ? behaviorTimeline
    : normalizeCareBehaviorTimeline(behaviorTimeline)
  const lightContext = []
  const directExposure = hasDirectExposureScene({
    userLightCondition,
    userHasDirectSunExposure,
    behaviorTimeline: timeline
  })

  if (directExposure && Number(forecast.aboveGenusUvMaxDays || 0) > 0) {
    lightContext.push(LIGHT_CONTEXTS.EXCESS_LIGHT_OR_SUNBURN_RISK)
  }

  if (directExposure && timeline.summary?.movedToStrongerLightWithin10d === true) {
    lightContext.push(LIGHT_CONTEXTS.RECENT_LIGHT_INCREASE_STRESS)
  }

  if (plantRequiresBrightLight && includesAnyToken(userLightCondition, LOW_LIGHT_TOKENS)) {
    lightContext.push(LIGHT_CONTEXTS.LOW_LIGHT_BACKGROUND)
  }

  return {
    lightContext,
    realExposureScene: directExposure
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
  careBehaviorTimeline = {}
} = {}) {
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate:
      diagnosisDate ||
      environmentWeatherWindow?.meta?.diagnosisDate ||
      environmentWeatherWindow?.meta?.diagnosis_date ||
      careBehaviorTimeline?.referenceDate ||
      careBehaviorTimeline?.reference_date,
    ...careBehaviorTimeline
  })
  const directExposure = hasDirectExposureScene({
    userLightCondition: plantContext.userLightCondition || plantContext.lightCondition || '',
    userHasDirectSunExposure: timeline.summary.userHasDirectSunExposure,
    behaviorTimeline: timeline
  })
  const bounds = {
    plantContext,
    temperatureMin: plantContext.temperatureMin,
    temperatureMax: plantContext.temperatureMax,
    humidityMin: plantContext.humidityMin,
    humidityMax: plantContext.humidityMax,
    uvIndexMax: plantContext.uvIndexMax
  }
  const historicalSummary10d = buildHistoricalEnvironmentSummary10d({
    dailyRecords: environmentWeatherWindow.historicalDays || environmentWeatherWindow.historical_days || [],
    userHasDirectSunExposure: directExposure,
    ...bounds
  })
  const forecastSummary15d = buildForecastEnvironmentSummary15d({
    dailyRecords: environmentWeatherWindow.forecastDays || environmentWeatherWindow.forecast_days || [],
    userHasDirectSunExposure: directExposure,
    ...bounds
  })
  const watering = buildWateringPlanner({
    wateringStrategy: plantContext.watering || plantContext.wateringStrategy || plantContext.watering_strategy_json || {},
    historical: historicalSummary10d,
    forecast: forecastSummary15d,
    behaviorTimeline: timeline
  })
  const fertilizing = buildFertilizingPlanner({
    behaviorTimeline: timeline,
    lastFertilizedBucket: timeline.lastFertilizedBucket,
    plantShowsWeakGrowth: Boolean(plantContext.plantShowsWeakGrowth || plantContext.weakGrowth),
    justRepottedRecently: Boolean(plantContext.justRepottedRecently || plantContext.recentlyRepotted)
  })
  const light = buildLightPlanner({
    forecast: forecastSummary15d,
    userLightCondition: plantContext.userLightCondition || plantContext.lightCondition || '',
    userHasDirectSunExposure: directExposure,
    plantRequiresBrightLight: resolvePlantRequiresBrightLight(plantContext),
    behaviorTimeline: timeline
  })

  return {
    version: 'v7',
    environmentWeatherWindow,
    careBehaviorTimeline: timeline,
    historicalSummary10d,
    forecastSummary15d,
    behaviorSummary10d: timeline.summary,
    watering,
    fertilizing,
    light,
    outputs: {
      wateringContext: watering.wateringContext,
      wateringAction: watering.action,
      fertilizingAction: fertilizing.action,
      lightContext: light.lightContext
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
  FERTILIZING_BASELINE
}
