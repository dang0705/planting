'use strict'

const axios = require('axios')

const DEFAULT_QWEATHER_BASE_URL = 'https://n773jqqeap.re.qweatherapi.com'
const LOCATION_ID_CACHE = new Map()

function normalizeBaseUrl(value = '') {
  return String(value || DEFAULT_QWEATHER_BASE_URL).replace(/\/+$/, '')
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function toDate8(value = '') {
  return String(value || '')
    .replace(/-/g, '')
    .slice(0, 8)
}

function normalizeLocation({ lat, lng } = {}) {
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    throw new Error('缺少位置参数：lat 和 lng')
  }
  return `${lng},${lat}`
}

function formatQWeatherError(error, path) {
  if (error.response) {
    const status = error.response.status
    const code = error.response.data && error.response.data.code
    const details = [code ? `code=${code}` : null, `status=${status}`].filter(Boolean).join(' ')
    return `和风天气API错误: ${details} path=${path}`
  }
  if (error.message) {
    return `和风天气API错误: ${error.message}`
  }
  return '和风天气API错误'
}

function pruneUndefined(payload = {}) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== '')
  )
}

function normalizeForecastDaily(record = {}, source = 'qweather_forecast_15d') {
  return pruneUndefined({
    date: record.fxDate || record.date,
    tempMaxC: toNumber(record.tempMax),
    tempMinC: toNumber(record.tempMin),
    humidity: toNumber(record.humidity),
    precipMm: toNumber(record.precip),
    uvIndex: toNumber(record.uvIndex),
    textDay: record.textDay || '',
    textNight: record.textNight || '',
    source
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
  timeout = 10000,
  httpClient = axios
} = {}) {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  async function request(path, params = {}) {
    if (!apiKey) {
      throw new Error('缺少环境变量 QWEATHER_API_KEY')
    }
    let response
    try {
      response = await httpClient.get(`${normalizedBaseUrl}${path}`, {
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
    } catch (error) {
      throw new Error(formatQWeatherError(error, path))
    }

    const data = response.data || {}
    if (data.code && data.code !== '200') {
      throw new Error(`和风天气API错误: code=${data.code} status=${response.status} path=${path}`)
    }
    return data
  }

  async function resolveLocationId(location) {
    const cacheKey = normalizeLocation(location)
    if (LOCATION_ID_CACHE.has(cacheKey)) {
      return LOCATION_ID_CACHE.get(cacheKey)
    }

    const lookupPromise = (async () => {
      const data = await request('/geo/v2/city/lookup', {
        location: cacheKey
      })
      const locationId =
        data && Array.isArray(data.location) && data.location[0] && data.location[0].id
      if (!locationId) {
        throw new Error(
          `和风天气历史定位失败: code=${data.code || 'UNKNOWN'} status=200 path=/geo/v2/city/lookup`
        )
      }
      return String(locationId)
    })()

    LOCATION_ID_CACHE.set(cacheKey, lookupPromise)

    lookupPromise.catch(() => {
      LOCATION_ID_CACHE.delete(cacheKey)
    })

    return lookupPromise
  }

  return {
    async fetchCurrentWeather({ lat, lng }) {
      return normalizeCurrentWeather(
        await request('/v7/weather/now', {
          location: normalizeLocation({ lat, lng })
        })
      )
    },

    async fetchForecast15d({ lat, lng }) {
      const data = await request('/v7/weather/15d', {
        location: normalizeLocation({ lat, lng })
      })
      return (Array.isArray(data.daily) ? data.daily : []).map(normalizeForecastDaily)
    },

    async fetchForecast10d({ locationId, lat, lng }) {
      const location = String(locationId || '').trim() || normalizeLocation({ lat, lng })
      const data = await request('/v7/weather/10d', { location })
      return {
        raw: data,
        daily: (Array.isArray(data.daily) ? data.daily : []).map(record =>
          normalizeForecastDaily(record, 'qweather_forecast_10d')
        )
      }
    },

    async fetchHistoricalWeather({ lat, lng, date }) {
      const locationId = await resolveLocationId({ lat, lng })
      const data = await request('/v7/historical/weather', {
        location: locationId,
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
