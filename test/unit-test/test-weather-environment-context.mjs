import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildEnvironmentWeatherWindow
} = require('../../cloudfunctions/weather-http/services/weather-window-service.js')

const calls = {
  current: 0,
  forecast: 0,
  historicalDates: []
}

const adapter = {
  async fetchCurrentWeather() {
    calls.current += 1
    return {
      tempC: 28,
      humidity: 58,
      text: '多云',
      source: 'fake_current'
    }
  },
  async fetchForecast15d() {
    calls.forecast += 1
    return Array.from({ length: 15 }, (_, index) => ({
      date: addDays('2026-05-27', index),
      tempMaxC: index < 3 ? 34 : 29,
      tempMinC: 22,
      humidity: index < 3 ? 35 : 60,
      precipMm: 0,
      uvIndex: index < 4 ? 8 : 4,
      textDay: '晴',
      source: 'fake_forecast'
    }))
  },
  async fetchHistoricalWeather({ date }) {
    calls.historicalDates.push(date)
    return {
      date,
      tempMaxC: 27,
      tempMinC: 20,
      humidity: 64,
      precipMm: 0,
      textDay: '多云',
      source: 'fake_history'
    }
  }
}

function addDays(dateText, offset) {
  const date = new Date(`${dateText}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const windowPayload = await buildEnvironmentWeatherWindow({
  lat: 31.2,
  lng: 121.5,
  diagnosisDate: '2026-05-27',
  adapter
})

assert.equal(windowPayload.meta.historicalWindow.start, '2026-05-17')
assert.equal(windowPayload.meta.historicalWindow.end, '2026-05-26')
assert.equal(windowPayload.meta.forecastWindow.start, '2026-05-27')
assert.equal(windowPayload.meta.forecastWindow.end, '2026-06-10')
assert.equal(windowPayload.historicalDays.length, 10)
assert.equal(windowPayload.forecastDays.length, 15)
assert.equal(windowPayload.meta.recordCounts.totalDailyRecords, 25)
assert.equal(calls.current, 1)
assert.equal(calls.forecast, 1)
assert.deepEqual(calls.historicalDates, [
  '2026-05-17',
  '2026-05-18',
  '2026-05-19',
  '2026-05-20',
  '2026-05-21',
  '2026-05-22',
  '2026-05-23',
  '2026-05-24',
  '2026-05-25',
  '2026-05-26'
])
assert.equal(windowPayload.historicalDays.some(day => Object.hasOwn(day, 'uvIndex')), false)
assert.equal(windowPayload.forecastDays.filter(day => day.uvIndex === 8).length, 4)
assert.equal(windowPayload.meta.todaySource, 'forecast_15d_with_weather_now')

console.log('weather-environment-context tests passed')

const qweatherAdapterPath = require.resolve('../../cloudfunctions/weather-http/adapters/qweather-adapter.js')
const { createQWeatherAdapter } = require(qweatherAdapterPath)

await runQWeatherAdapterTests()

async function runQWeatherAdapterTests() {
  const calls = []
  let nowCalls = 0
  let forecastCalls = 0
  let historicalCalls = 0
  let lookupCalls = 0

  const mockedNowResponse = {
    status: 200,
    data: {
      code: '200',
      now: { temp: 27, humidity: 70, text: '阴', feelsLike: 27, obsTime: '2026-06-01T12:00+08:00' }
    }
  }

  const mockedForecastResponse = {
    status: 200,
    data: {
      code: '200',
      daily: [{ fxDate: '2026-06-01', tempMax: '30', tempMin: '20', humidity: 55, precip: '1', uvIndex: 8, textDay: '晴', textNight: '晴' }]
    }
  }

  const mockedLookupResponse = {
    status: 200,
    data: {
      code: '200',
      location: [{ id: 'LOCATION_ID_001' }]
    }
  }

  const mockedHistoricalResponse = (dateText) => ({
    status: 200,
    data: {
      code: '200',
      daily: {
        date: dateText,
        tempMax: '28',
        tempMin: '18',
        humidity: 60,
        precip: '2',
        textDay: '阴',
        textNight: '阴'
      }
    }
  })

  const mockGet = async (url, options = {}) => {
    const params = options.params || {}
    if (url.includes('/geo/v2/city/lookup')) {
      lookupCalls += 1
      calls.push({ path: '/geo/v2/city/lookup', params })
      return mockedLookupResponse
    }
    if (url.includes('/v7/weather/now')) {
      nowCalls += 1
      calls.push({ path: '/v7/weather/now', params })
      return mockedNowResponse
    }
    if (url.includes('/v7/weather/15d')) {
      forecastCalls += 1
      calls.push({ path: '/v7/weather/15d', params })
      return mockedForecastResponse
    }
    if (url.includes('/v7/historical/weather')) {
      historicalCalls += 1
      calls.push({ path: '/v7/historical/weather', params })
      return mockedHistoricalResponse(params.date)
    }
    throw new Error(`unmocked qweather request: ${url}`)
  }

  const adapterUnderTest = createQWeatherAdapter({ apiKey: 'test-key', httpClient: { get: mockGet } })

  const nowPayload = await adapterUnderTest.fetchCurrentWeather({ lat: 31.2, lng: 121.5 })
  const forecastPayload = await adapterUnderTest.fetchForecast15d({ lat: 31.2, lng: 121.5 })
  const historyPayload = await adapterUnderTest.fetchHistoricalWeather({ lat: 31.2, lng: 121.5, date: '2026-05-22' })

  assert.equal(nowPayload.tempC, 27)
  assert.equal(nowPayload.text, '阴')
  assert.equal(forecastPayload.length, 1)
  assert.equal(forecastPayload[0].date, '2026-06-01')
  assert.equal(historyPayload.date, '20260522')
  assert.equal(lookupCalls, 1, '历史数据应先请求一次地理反查')
  assert.equal(nowCalls, 1, '实时天气必须通过经纬度请求')
  assert.equal(forecastCalls, 1, '15d预报必须通过经纬度请求')
  assert.equal(historicalCalls, 1, '历史接口应按本轮调用一次')

  const lookupCall = calls.find((item) => item.path === '/geo/v2/city/lookup')
  const historicalCall = calls.find((item) => item.path === '/v7/historical/weather')
  const nowCall = calls.find((item) => item.path === '/v7/weather/now')
  const forecastCall = calls.find((item) => item.path === '/v7/weather/15d')
  assert.equal(lookupCall.params.location, '121.5,31.2')
  assert.equal(historicalCall.params.location, 'LOCATION_ID_001')
  assert.equal(nowCall.params.location, '121.5,31.2')
  assert.equal(forecastCall.params.location, '121.5,31.2')

  await adapterUnderTest.fetchHistoricalWeather({ lat: 31.2, lng: 121.5, date: '2026-05-23' })
  assert.equal(lookupCalls, 1, '地理反查应命中进程内缓存')

  const mockGetWithError = async (url, options = {}) => {
    if (url.includes('/v7/historical/weather')) {
      const error = new Error('请求错误')
      error.response = { status: 400, data: { code: '400' } }
      throw error
    }
    return mockGet(url, options)
  }
  const adapterErrorCase = createQWeatherAdapter({ apiKey: 'test-key', httpClient: { get: mockGetWithError } })
  let hasCodeStatus = false
  try {
    await adapterErrorCase.fetchHistoricalWeather({ lat: 31.2, lng: 121.5, date: '2026-05-24' })
  } catch (error) {
    hasCodeStatus = /code=400/.test(error.message) && /status=400/.test(error.message)
  }
  assert.equal(hasCodeStatus, true, '非200响应必须保留 code 与 status')
}
