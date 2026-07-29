import { formatWeatherText } from '@/utils/care-behavior-weather.js'
import { buildWeatherByDateFromEnvironmentWeatherWindow } from '@/utils/care-behavior-weather-window.js'

export function collectWeatherSources(question = {}, timeline = {}) {
  const qTimeline = question?.careBehaviorTimeline || {}
  const environmentContext = question?.environmentContext || {}
  const payload = question?.payload || {}
  const payloadTimeline =
    payload?.careBehaviorTimeline || payload?.care_behavior_timeline || payload?.timeline || {}
  const timelineEnvContext = payloadTimeline?.environmentContext || {}
  return [
    question?.weather,
    question?.weatherByDate,
    question?.environmentWeatherWindow,
    environmentContext?.weatherByDate,
    environmentContext?.weather,
    environmentContext?.environmentWeatherWindow,
    environmentContext?.careBehaviorTimeline,
    timeline?.weather,
    timeline?.weatherByDate,
    timeline?.environmentWeatherWindow,
    timeline?.careBehaviorTimeline,
    timeline?.environmentContext,
    qTimeline?.weather,
    qTimeline?.weatherByDate,
    qTimeline?.environmentWeatherWindow,
    qTimeline?.careBehaviorTimeline,
    payload?.weather,
    payload?.weatherByDate,
    payload?.environmentWeatherWindow,
    payload?.environmentContext,
    payload?.careBehaviorTimeline,
    payload?.care_behavior_timeline,
    payload?.timeline,
    payloadTimeline?.weather,
    payloadTimeline?.weatherByDate,
    payloadTimeline?.environmentWeatherWindow,
    payloadTimeline?.careBehaviorTimeline,
    timelineEnvContext?.weather,
    timelineEnvContext?.weatherByDate,
    timelineEnvContext?.environmentWeatherWindow
  ]
}

export function normalizeWeatherMetricValue(value = '') {
  if (value === null || value === undefined || value === '') {return ''}
  const raw = String(value).trim()
  if (!raw) {return ''}
  const cleaned = raw.replace(/[℃°℉%]/g, '').trim()
  if (!cleaned) {return ''}
  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? `${Math.round(numeric)}` : cleaned
}

export function formatCellMetricText(value = '', suffix = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}${suffix}` : ''
}

export function formatDialogTemperatureText(value = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}°C` : '—'
}

export function formatDialogHumidityText(value = '') {
  const normalized = normalizeWeatherMetricValue(value)
  return normalized ? `${normalized}%` : '—'
}

export function normalizeDateValue(value = '') {
  if (!value) {return ''}
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-')
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {return ''}
  const month = String(parsed.getMonth() + 1).padStart(2, '0')
  const day = String(parsed.getDate()).padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

function getWeatherTemperatureText(entry = {}) {
  return normalizeWeatherMetricValue(
    entry.temp ??
      entry.temperature ??
      entry.tempC ??
      entry.tempF ??
      entry.tempMaxC ??
      entry.tempMax ??
      entry.maxTemp ??
      entry.maxTemperature ??
      entry.tempMinC ??
      entry.tempMin ??
      entry.minTemp ??
      entry.minTemperature ??
      entry.tempMaxF ??
      entry.tempMinF ??
      ''
  )
}

function getWeatherHumidityText(entry = {}) {
  return normalizeWeatherMetricValue(entry.humidity ?? entry.humi)
}

export function normalizeWeatherInput(weatherInput = {}, fallbackDate = '') {
  if (!weatherInput) {return {}}
  if (typeof weatherInput === 'string' || typeof weatherInput === 'number') {
    const text = formatWeatherText({ weather: weatherInput })
    const normalizedDate = normalizeDateValue(fallbackDate)
    return normalizedDate && text
      ? { [normalizedDate]: { text, temperatureText: '', humidityText: '' } }
      : {}
  }
  if (typeof weatherInput !== 'object' && !Array.isArray(weatherInput)) {return {}}

  const normalized = {}
  const addMapEntry = (date, entry) => {
    const normalizedDate = normalizeDateValue(date) || normalizeDateValue(fallbackDate)
    const text = normalizedDate ? formatWeatherText(entry) : ''
    if (!normalizedDate || !text) {return}
    normalized[normalizedDate] = {
      text,
      temperatureText: getWeatherTemperatureText(entry),
      humidityText: getWeatherHumidityText(entry)
    }
  }

  const mergeFromObject = candidate => {
    if (!candidate || (typeof candidate !== 'object' && !Array.isArray(candidate))) {return}
    const getDate = item => item?.date || item?.day || item?.dayKey || item?.dateKey || item?.fxDate

    if (Array.isArray(candidate)) {
      candidate.forEach(item => item && addMapEntry(getDate(item), item))
      return
    }
    if (Array.isArray(candidate.daily)) {
      candidate.daily.forEach(item => addMapEntry(getDate(item), item))
      return
    }
    if (candidate.weatherByDate && typeof candidate.weatherByDate === 'object') {
      Object.entries(candidate.weatherByDate).forEach(([date, entry]) => addMapEntry(date, entry))
      return
    }
    if (candidate.environmentWeatherWindow && typeof candidate.environmentWeatherWindow === 'object') {
      mergeFromObject(candidate.environmentWeatherWindow)
      return
    }

    const environmentWindowWeatherByDate = buildWeatherByDateFromEnvironmentWeatherWindow(candidate)
    if (Object.keys(environmentWindowWeatherByDate).length) {
      Object.entries(environmentWindowWeatherByDate).forEach(([date, entry]) => addMapEntry(date, entry))
      return
    }
    if (candidate.timeline && typeof candidate.timeline === 'object') {
      mergeFromObject(candidate.timeline)
      return
    }
    if (candidate.environmentContext && typeof candidate.environmentContext === 'object') {
      mergeFromObject(candidate.environmentContext)
      return
    }
    if (candidate.careBehaviorTimeline && typeof candidate.careBehaviorTimeline === 'object') {
      mergeFromObject(candidate.careBehaviorTimeline)
      return
    }
    if (candidate.weather && typeof candidate.weather === 'object') {
      mergeFromObject(candidate.weather)
    }

    const keys = Object.keys(candidate)
    const isDateMap = keys.length > 0 && keys.every(
      key => /^\d{4}-\d{1,2}-\d{1,2}$/.test(key) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(key)
    )
    if (isDateMap) {
      Object.entries(candidate).forEach(([date, entry]) => addMapEntry(date, entry))
      return
    }

    const fallbackText = formatWeatherText(candidate)
    const date = normalizeDateValue(fallbackDate)
    if (fallbackText && date) {
      normalized[date] = { text: fallbackText, temperatureText: '', humidityText: '' }
    }
  }

  mergeFromObject(weatherInput)
  return normalized
}

export function formatDateLabel(date = '') {
  const normalizedDate = normalizeDateValue(date)
  if (!normalizedDate) {return ''}
  const [, month, day] = normalizedDate.split('-')
  return `${Number(month)}月${Number(day)}日`
}

export function normalizeErrorText(error = '') {
  if (!error) {return ''}
  if (typeof error === 'string') {return error.trim()}
  if (typeof error === 'object') {
    return String(error.message || error.msg || error.errorMessage || '').trim()
  }
  return ''
}
