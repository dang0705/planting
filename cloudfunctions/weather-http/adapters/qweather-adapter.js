'use strict'

const axios = require('axios')

const DEFAULT_QWEATHER_BASE_URL = 'https://n773jqqeap.re.qweatherapi.com'

function normalizeBaseUrl(value = '') {
  return String(value || DEFAULT_QWEATHER_BASE_URL).replace(/\/+$/, '')
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {return undefined}
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toDate8(value = '') {
  return String(value || '').replace(/-/g, '').slice(0, 8)
}

function normalizeLocation({ lat, lng } = {}) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    throw new Error('缺少位置参数：lat 和 lng')
  }
  return `${lng},${lat}`
}

function pruneUndefined(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
  )
}

function normalizeForecastDaily(record = {}) {
  return pruneUndefined({
    date: record.fxDate || record.date,
    tempMaxC: toNumber(record.tempMax),
    tempMinC: toNumber(record.tempMin),
    humidity: toNumber(record.humidity),
    precipMm: toNumber(record.precip),
    uvIndex: toNumber(record.uvIndex),
    textDay: record.textDay || '',
    textNight: record.textNight || '',
    source: 'qweather_forecast_15d'
  })
}

function normalizeHistoricalDaily(record = {}, date = '') {
  return pruneUndefined({
    date: record.date || date,
    tempMaxC: toNumber(record.tempMax),
    tempMinC: toNumber(record.tempMin),
    humidity: toNumber(record.humidity),
    precipMm: toNumber(record.precip),
    textDay: record.textDay || record.text || '',
    textNight: record.textNight || '',
    source: 'qweather_historical_weather'
  })
}

function normalizeCurrentWeather(data = {}) {
  const now = data.now || data
  return pruneUndefined({
    tempC: toNumber(now.temp),
    humidity: toNumber(now.humidity),
    text: now.text || '',
    feelsLikeC: toNumber(now.feelsLike),
    obsTime: now.obsTime || '',
    source: 'qweather_weather_now'
  })
}

function createQWeatherAdapter({
  apiKey = '',
  baseUrl = DEFAULT_QWEATHER_BASE_URL,
  timeout = 10000
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  async function request(path, params = {}) {
    if (!apiKey) {
      throw new Error('缺少环境变量 QWEATHER_API_KEY')
    }
    const response = await axios.get(`${normalizedBaseUrl}${path}`, {
      timeout,
      params: {
        ...params,
        key: apiKey
      },
      headers: {
        'Accept-Encoding': 'gzip, deflate',
        'User-Agent': 'CloudBase-Weather/1.0'
      }
    })
    const data = response.data || {}
    if (data.code && data.code !== '200') {
      throw new Error(`和风天气API错误: code=${data.code}`)
    }
    return data
  }

  return {
    async fetchCurrentWeather({ lat, lng }) {
      return normalizeCurrentWeather(await request('/v7/weather/now', {
        location: normalizeLocation({ lat, lng })
      }))
    },

    async fetchForecast15d({ lat, lng }) {
      const data = await request('/v7/weather/15d', {
        location: normalizeLocation({ lat, lng })
      })
      return (Array.isArray(data.daily) ? data.daily : []).map(normalizeForecastDaily)
    },

    async fetchHistoricalWeather({ lat, lng, date }) {
      const data = await request('/v7/historical/weather', {
        location: normalizeLocation({ lat, lng }),
        date: toDate8(date)
      })
      return normalizeHistoricalDaily(data.weatherDaily || data.daily || {}, date)
    }
  }
}

module.exports = {
  createQWeatherAdapter,
  normalizeForecastDaily,
  normalizeHistoricalDaily,
  normalizeCurrentWeather
}
