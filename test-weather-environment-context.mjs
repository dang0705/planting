import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildEnvironmentWeatherWindow
} = require('./cloudfunctions/weather-http/services/weather-window-service.js')

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
