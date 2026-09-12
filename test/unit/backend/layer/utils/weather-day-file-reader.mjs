import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createWeatherDayFileReader
} = require('../../../../../cloudfunctions/layer/utils/weather-day-file-reader.js')

function addDays(dateText, offset) {
  const date = new Date(`${dateText}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}

const referenceDate = '2026-08-30'
const forecastDays = Array.from({ length: 16 }, (_, index) => ({
  date: addDays(referenceDate, index),
  tempMaxC: 20 + index,
  tempMinC: 15 + index,
  humidity: 50,
  source: index === 0 ? 'qweather_forecast_15d' : 'qweather_forecast_15d'
}))

const storage = {
  async downloadJson({ cloudPath }) {
    if (cloudPath.endsWith(`/days/${referenceDate}.json`)) {
      return {
        date: referenceDate,
        latestSample: {
          temp: 31,
          humidity: 66,
          text: '晴',
          precipLastHour: 0
        }
      }
    }
    return null
  }
}

const reader = createWeatherDayFileReader({
  storage,
  now: () => new Date(`${referenceDate}T03:00:00.000Z`)
})

const hit = await reader.injectD0IntoForecast({
  locationKey: 'city:shanghai',
  date: referenceDate,
  forecastDays
})
assert.equal(hit.todayWeatherSource, 'day_latest_sample')
assert.equal(hit.forecastDays.length, 15)
assert.equal(hit.forecastDays[0].date, referenceDate)
assert.equal(hit.forecastDays[0].source, 'weather_cache_day_latest_sample')
assert.equal(hit.forecastDays[0].tempMaxC, 31)
assert.equal(hit.forecastDays.filter(day => day.date === referenceDate).length, 1)
assert.equal(hit.forecastDays.at(-1).date, addDays(referenceDate, 14))

const missingReader = createWeatherDayFileReader({
  storage: {
    async downloadJson() {
      return null
    }
  },
  now: () => new Date(`${referenceDate}T03:00:00.000Z`)
})
const miss = await missingReader.injectD0IntoForecast({
  locationKey: 'city:shanghai',
  date: referenceDate,
  forecastDays
})
assert.equal(miss.todayWeatherSource, 'missing')
assert.equal(miss.forecastDays.length, 14)
assert.equal(
  miss.forecastDays.some(day => day.date === referenceDate),
  false
)
assert.equal(miss.forecastDays[0].date, addDays(referenceDate, 1))

const slowReader = createWeatherDayFileReader({
  storage: {
    async downloadJson() {
      await new Promise(resolve => setTimeout(resolve, 25))
      return { latestSample: { temp: 30, humidity: 60, text: '晴' } }
    }
  },
  now: () => new Date(`${referenceDate}T03:00:00.000Z`)
})
const slowHit = await slowReader.injectD0IntoForecast({
  locationKey: 'city:shanghai',
  date: referenceDate,
  readTimeoutMs: 10,
  forecastDays: forecastDays.slice(0, 15)
})
assert.equal(slowHit.todayWeatherSource, 'day_latest_sample')
assert.equal(slowHit.forecastDays[0].date, referenceDate)

console.log('weather day file reader D0 contract tests passed')
