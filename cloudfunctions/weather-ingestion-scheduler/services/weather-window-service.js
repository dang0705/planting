'use strict'

const { createQWeatherAdapter } = require('../adapters/qweather-adapter')

function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {return new Date().toISOString().slice(0, 10)}
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (!match) {return raw.slice(0, 10)}
  return [
    match[1],
    String(match[2]).padStart(2, '0'),
    String(match[3]).padStart(2, '0')
  ].join('-')
}

function addDays(dateText = '', offset = 0) {
  const date = new Date(`${normalizeDate(dateText)}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

function buildDateRange(startDate = '', count = 0) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => addDays(startDate, index))
}

function hasLocation({ lat, lng } = {}) {
  return lat !== undefined && lat !== null && lat !== '' && lng !== undefined && lng !== null && lng !== ''
}

function pruneUndefined(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  )
}

function buildLocalDevWeatherWindow({ diagnosisDate = '', lat, lng } = {}) {
  const d0 = normalizeDate(diagnosisDate)
  const historicalDates = buildDateRange(addDays(d0, -10), 10)
  const forecastDates = buildDateRange(d0, 15)
  const historicalDays = historicalDates.map((date, index) => pruneUndefined({
    date,
    tempMaxC: index < 4 ? 24 : 27,
    tempMinC: index < 4 ? 18 : 21,
    humidity: index < 4 ? 78 : 62,
    precipMm: index < 2 ? 1 : 0,
    textDay: index < 2 ? '小雨' : '多云',
    source: 'local_dev_fallback'
  }))
  const forecastDays = forecastDates.map((date, index) => pruneUndefined({
    date,
    tempMaxC: index < 3 ? 33 : 29,
    tempMinC: index < 3 ? 25 : 22,
    humidity: index < 3 ? 35 : 60,
    precipMm: 0,
    uvIndex: index < 3 ? 8 : 4,
    textDay: index < 3 ? '晴' : '多云',
    source: 'local_dev_fallback'
  }))

  return {
    meta: {
      diagnosisDate: d0,
      historicalWindow: {
        start: historicalDates[0],
        end: historicalDates[historicalDates.length - 1]
      },
      forecastWindow: {
        start: forecastDates[0],
        end: forecastDates[forecastDates.length - 1]
      },
      todaySource: 'local_dev_fallback',
      recordCounts: {
        historicalDays: historicalDays.length,
        forecastDays: forecastDays.length,
        totalDailyRecords: historicalDays.length + forecastDays.length
      },
      lat,
      lng,
      warnings: ['local_dev_missing_qweather_api_key']
    },
    historicalDays,
    forecastDays,
    currentWeather: {
      tempC: forecastDays[0]?.tempMaxC,
      humidity: forecastDays[0]?.humidity,
      text: forecastDays[0]?.textDay,
      source: 'local_dev_fallback'
    }
  }
}

function normalizeAdapterDaily(record = {}, fallback = {}) {
  return pruneUndefined({
    date: normalizeDate(record.date || record.fxDate || fallback.date),
    tempMaxC: record.tempMaxC ?? record.tempMax,
    tempMinC: record.tempMinC ?? record.tempMin,
    humidity: record.humidity,
    precipMm: record.precipMm ?? record.precip,
    uvIndex: record.uvIndex ?? record.uv,
    textDay: record.textDay,
    textNight: record.textNight,
    source: record.source || fallback.source,
    missing: record.missing
  })
}

async function fetchHistoricalDays({ adapter, lat, lng, dates }) {
  const results = await Promise.all(dates.map(async date => {
    try {
      return normalizeAdapterDaily(
        await adapter.fetchHistoricalWeather({ lat, lng, date }),
        { date, source: 'qweather_historical_weather' }
      )
    } catch (error) {
      return {
        date,
        source: 'qweather_historical_error',
        missing: true,
        warning: error.message || '历史天气读取失败'
      }
    }
  }))
  return results.slice(0, 10)
}

async function fetchForecastDays({ adapter, lat, lng, diagnosisDate }) {
  const forecastDays = await adapter.fetchForecast15d({ lat, lng, diagnosisDate })
  return (Array.isArray(forecastDays) ? forecastDays : [])
    .map((record, index) => normalizeAdapterDaily(record, {
      date: addDays(diagnosisDate, index),
      source: 'qweather_forecast_15d'
    }))
    .slice(0, 15)
}

async function buildEnvironmentWeatherWindow({
  lat,
  lng,
  diagnosisDate = '',
  appEnv = 'production',
  apiKey = '',
  baseUrl = '',
  adapter = null
} = {}) {
  if (!hasLocation({ lat, lng })) {
    throw new Error('缺少位置参数：lat 和 lng')
  }

  const d0 = normalizeDate(diagnosisDate)
  if (!adapter && !apiKey && appEnv === 'development') {
    return buildLocalDevWeatherWindow({ diagnosisDate: d0, lat, lng })
  }

  const qweatherAdapter = adapter || createQWeatherAdapter({ apiKey, baseUrl })
  const historicalDates = buildDateRange(addDays(d0, -10), 10)
  const forecastDates = buildDateRange(d0, 15)
  const warnings = []
  const historicalDays = await fetchHistoricalDays({
    adapter: qweatherAdapter,
    lat,
    lng,
    dates: historicalDates
  })
  let forecastDays = []
  let currentWeather = null

  try {
    forecastDays = await fetchForecastDays({
      adapter: qweatherAdapter,
      lat,
      lng,
      diagnosisDate: d0
    })
  } catch (error) {
    warnings.push(`forecast_15d_failed:${error.message || error}`)
  }

  try {
    currentWeather = await qweatherAdapter.fetchCurrentWeather({ lat, lng })
  } catch (error) {
    warnings.push(`current_weather_failed:${error.message || error}`)
  }

  return {
    meta: {
      diagnosisDate: d0,
      historicalWindow: {
        start: historicalDates[0],
        end: historicalDates[historicalDates.length - 1]
      },
      forecastWindow: {
        start: forecastDates[0],
        end: forecastDates[forecastDates.length - 1]
      },
      todaySource: currentWeather
        ? 'forecast_15d_with_weather_now'
        : 'forecast_15d',
      recordCounts: {
        historicalDays: historicalDays.length,
        forecastDays: forecastDays.length,
        totalDailyRecords: historicalDays.length + forecastDays.length
      },
      lat,
      lng,
      warnings
    },
    historicalDays,
    forecastDays,
    currentWeather
  }
}

module.exports = {
  addDays,
  buildDateRange,
  buildEnvironmentWeatherWindow,
  buildLocalDevWeatherWindow
}
