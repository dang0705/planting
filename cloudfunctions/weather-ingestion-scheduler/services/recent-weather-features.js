'use strict'

function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return new Date().toISOString().slice(0, 10)
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) {
    return raw.slice(0, 10)
  }
  return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-')
}

function addDays(dateText = '', offset = 0) {
  const date = new Date(`${normalizeDate(dateText)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function buildDateRangeEndingAt(endDate = '', count = 10) {
  const normalizedEndDate = normalizeDate(endDate)
  return Array.from({ length: Math.max(0, count) }, (_, index) =>
    addDays(normalizedEndDate, index - count + 1)
  )
}

function formatLocalDateInTimezone(now = new Date(), timezone = 'Asia/Shanghai') {
  const date = now instanceof Date ? now : new Date(now)
  const resolvedTimezone = String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: resolvedTimezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date)
    const partMap = Object.fromEntries(parts.map(part => [part.type, part.value]))
    return `${partMap.year}-${partMap.month}-${partMap.day}`
  } catch {
    return date.toISOString().slice(0, 10)
  }
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function pruneNullish(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  )
}

function normalizeDailyWeatherRecord(record = {}, fallback = {}) {
  const raw = isPlainObject(record) ? record : {}
  const normalized = pruneNullish({
    date: normalizeDate(raw.date || raw.fxDate || fallback.date),
    tempMaxC: normalizeNumber(raw.tempMaxC ?? raw.tempMax),
    tempMinC: normalizeNumber(raw.tempMinC ?? raw.tempMin),
    humidity: normalizeNumber(raw.humidity),
    precipMm: normalizeNumber(raw.precipMm ?? raw.precip),
    pressure: normalizeNumber(raw.pressure),
    visibilityKm: normalizeNumber(raw.visibilityKm ?? raw.vis),
    cloud: normalizeNumber(raw.cloud),
    uvIndex: normalizeNumber(raw.uvIndex ?? raw.uv),
    iconDay: raw.iconDay || '',
    textDay: raw.textDay || raw.text || '',
    iconNight: raw.iconNight || '',
    textNight: raw.textNight || '',
    wind360Day: normalizeNumber(raw.wind360Day),
    windDirDay: raw.windDirDay || '',
    windScaleDay: raw.windScaleDay || '',
    windSpeedDay: normalizeNumber(raw.windSpeedDay),
    wind360Night: normalizeNumber(raw.wind360Night),
    windDirNight: raw.windDirNight || '',
    windScaleNight: raw.windScaleNight || '',
    windSpeedNight: normalizeNumber(raw.windSpeedNight),
    source: raw.source || fallback.source || 'weather_cache_daily',
    sourceKind: raw.sourceKind || fallback.sourceKind || 'weather_cache_daily_archive',
    quality: raw.quality || fallback.quality || 'complete',
    weatherObjectPath: raw.weatherObjectPath || fallback.weatherObjectPath || '',
    rawObjectPath: raw.rawObjectPath || fallback.rawObjectPath || '',
    warning: raw.warning || fallback.warning || '',
    missing: Boolean(raw.missing || fallback.missing)
  })

  if (normalized.missing) {
    normalized.quality = normalized.quality === 'complete' ? 'missing' : normalized.quality
  }

  return normalized
}

function hasMeaningfulDailyFields(day = {}) {
  return [day.tempMaxC, day.tempMinC, day.humidity, day.precipMm, day.uvIndex, day.textDay].some(
    value => value !== undefined && value !== null && value !== ''
  )
}

function resolveRecentWeatherQuality(days = []) {
  const safeDays = Array.isArray(days) ? days : []
  if (!safeDays.length || safeDays.every(day => day?.missing)) {
    return 'missing'
  }
  if (
    safeDays.length < 10 ||
    safeDays.some(
      day => day?.missing || day?.quality !== 'complete' || !hasMeaningfulDailyFields(day)
    )
  ) {
    return 'partial'
  }
  return 'complete'
}

function buildPlantWeatherFeatures(days = []) {
  const validDays = (Array.isArray(days) ? days : []).filter(day => !day?.missing)
  const humidityValues = validDays.map(day => normalizeNumber(day.humidity)).filter(Number.isFinite)
  const uvValues = validDays.map(day => normalizeNumber(day.uvIndex)).filter(Number.isFinite)
  const precipValues = validDays.map(day => normalizeNumber(day.precipMm)).filter(Number.isFinite)
  const tempMaxValues = validDays.map(day => normalizeNumber(day.tempMaxC)).filter(Number.isFinite)
  const tempMinValues = validDays.map(day => normalizeNumber(day.tempMinC)).filter(Number.isFinite)
  const sum = values => values.reduce((total, value) => total + value, 0)
  const avg = values => (values.length ? Math.round((sum(values) / values.length) * 10) / 10 : null)
  const max = values => (values.length ? Math.max(...values) : null)
  const min = values => (values.length ? Math.min(...values) : null)
  const rainyDays = precipValues.filter(value => value > 0).length
  const highUvDays = uvValues.filter(value => value >= 7).length
  const dryAirDays = humidityValues.filter(value => value > 0 && value < 40).length
  const humidAirDays = humidityValues.filter(value => value >= 75).length

  return {
    dayCount: validDays.length,
    missingDayCount: Math.max(0, 10 - validDays.length),
    avgHumidity: avg(humidityValues),
    minHumidity: min(humidityValues),
    maxHumidity: max(humidityValues),
    totalPrecipMm: Math.round(sum(precipValues) * 10) / 10,
    rainyDays,
    highUvDays,
    dryAirDays,
    humidAirDays,
    maxTempC: max(tempMaxValues),
    minTempC: min(tempMinValues),
    heatStressDays: tempMaxValues.filter(value => value >= 32).length,
    coldStressDays: tempMinValues.filter(value => value <= 8).length
  }
}

module.exports = {
  addDays,
  buildDateRangeEndingAt,
  buildPlantWeatherFeatures,
  formatLocalDateInTimezone,
  normalizeDailyWeatherRecord,
  normalizeDate,
  resolveRecentWeatherQuality
}
