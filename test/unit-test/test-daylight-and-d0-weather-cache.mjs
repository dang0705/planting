import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath,
  buildWeatherWorkingObjectPath,
  buildRecentWeatherObjectPath
} = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  buildDaylightSlots,
  buildSunWindow,
  clamp
} = require('../../cloudfunctions/weather-http/services/daylight-slots.js')
const {
  buildD0WorkingPayload
} = require('../../cloudfunctions/weather-http/services/d0-weather-24h-service.js')
const {
  createRecentWeatherService
} = require('../../cloudfunctions/weather-http/services/recent-weather-service.js')
const {
  clearRecentWeatherMemoryCache
} = require('../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')

function createMemoryStorage() {
  const objects = new Map()
  return {
    objects,
    writes: [],
    deletes: [],
    async uploadJson({ cloudPath, payload }) {
      const fileId = `cloud://${cloudPath}`
      objects.set(cloudPath, payload)
      this.writes.push({ cloudPath, fileId, payload })
      return { cloudPath, fileId }
    },
    async downloadJson({ cloudPath }) {
      return objects.get(cloudPath) || null
    },
    async deleteJson({ cloudPath }) {
      this.deletes.push({ cloudPath })
      objects.delete(cloudPath)
      return true
    }
  }
}

function buildForecastDaily(startDate, count) {
  const start = new Date(`${startDate}T12:00:00Z`)
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start)
    date.setUTCDate(start.getUTCDate() + index)
    return {
      date: date.toISOString().slice(0, 10),
      tempMaxC: 28,
      tempMinC: 18,
      humidity: 58,
      uvIndex: 7,
      cloud: 20,
      textDay: '晴'
    }
  })
}

function buildHourly24h(date = '2026-06-18') {
  return [
    {
      fxTime: `${date}T06:30:00+08:00`,
      cloud: 20,
      precip: 0.1,
      pop: 30,
      humidity: 60,
      temp: 24,
      windSpeed: 8,
      text: '晴'
    },
    {
      fxTime: `${date}T08:30:00+08:00`,
      cloud: 80,
      precip: 0.3,
      pop: 70,
      humidity: 70,
      temp: 26,
      windSpeed: 12,
      text: '多云'
    },
    {
      fxTime: `${date}T09:30:00+08:00`,
      cloud: 40,
      precip: 0,
      pop: 20,
      humidity: 62,
      temp: 27,
      windSpeed: 10,
      text: '多云'
    },
    {
      fxTime: `${date}T11:30:00+08:00`,
      cloud: 60,
      precip: 0.2,
      pop: 55,
      humidity: 64,
      temp: 29,
      windSpeed: 14,
      text: '阴'
    },
    {
      fxTime: `${date}T12:30:00+08:00`,
      cloud: 10,
      precip: 0,
      pop: 10,
      humidity: 50,
      temp: 31,
      windSpeed: 16,
      text: '晴'
    },
    {
      fxTime: `${date}T15:30:00+08:00`,
      cloud: 30,
      precip: 0.5,
      pop: 65,
      humidity: 58,
      temp: 30,
      windSpeed: 18,
      text: '阵雨'
    }
  ]
}

const sunWindow = buildSunWindow({
  date: '2026-06-18',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
})
assert.match(sunWindow.sunrise, /^2026-06-18T\d{2}:\d{2}:\d{2}\+08:00$/)
assert.match(sunWindow.sunset, /^2026-06-18T\d{2}:\d{2}:\d{2}\+08:00$/)
assert.match(sunWindow.solarNoon, /^2026-06-18T\d{2}:\d{2}:\d{2}\+08:00$/)
assert.equal(sunWindow.source, 'suncalc_estimated')
assert.equal(sunWindow.quality, 'estimated')

const slots = buildDaylightSlots({
  date: '2026-06-18',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
})
assert.equal(slots.length, 4)
assert.deepEqual(
  slots.map(slot => slot.slotKey),
  ['morning', 'forenoon', 'noon', 'afternoon']
)
assert.equal(
  slots.every(slot => slot.durationMinutes > 0),
  true
)
assert.equal(
  slots.some(slot => slot.slotKey === 'midday' || slot.slotKey === 'evening'),
  false
)
assert.equal(slots[0].startTime < slots[0].endTime, true)
assert.equal(slots[1].durationMinutes, 180)
assert.equal(slots[2].durationMinutes, 120)
assert.equal(slots[3].durationMinutes > 0, true)
assert.equal(clamp(120, 0, 100), 100)
assert.equal(clamp(-3, 0, 100), 0)

const shortDaySlots = buildDaylightSlots({
  date: '2026-06-18',
  timezone: 'Asia/Shanghai',
  sunrise: new Date('2026-06-18T07:00:00Z'),
  sunset: new Date('2026-06-18T08:00:00Z')
})
assert.equal(
  shortDaySlots.filter(slot => slot.missing).length,
  3,
  '短日照下无有效区间的 slot 必须显式 missing'
)
assert.equal(shortDaySlots.find(slot => slot.slotKey === 'afternoon').quality, 'complete')

const workingPayload = buildD0WorkingPayload({
  location: {
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737
  },
  date: '2026-06-18',
  timezone: 'Asia/Shanghai',
  hourly: buildHourly24h(),
  generatedAt: '2026-06-18T03:30:00.000Z',
  weatherObjectPath: buildWeatherWorkingObjectPath('city:shanghai', '2026-06-18')
})
assert.equal(workingPayload.sunWindow.solarNoon.includes('+08:00'), true)
assert.deepEqual(
  workingPayload.daylightSlots.map(slot => slot.slotKey),
  ['morning', 'forenoon', 'noon', 'afternoon']
)
const morningSlot = workingPayload.daylightSlots.find(slot => slot.slotKey === 'morning')
assert.equal(morningSlot.name, 'morning')
assert.equal(morningSlot.start, morningSlot.startTime)
assert.equal(morningSlot.end, morningSlot.endTime)
assert.equal(morningSlot.sourceKind, 'hourly_forecast_snapshot')
assert.equal(morningSlot.updatedAt, '2026-06-18T03:30:00.000Z')
assert.deepEqual(morningSlot.missingFields, [])
assert.equal(morningSlot.cloudMean, 50)
assert.equal(morningSlot.cloudMax, 80)
assert.equal(morningSlot.cloudP75, 80)
assert.equal(morningSlot.precipSum, 0.4)
assert.equal(morningSlot.precipMaxHourly, 0.3)
assert.equal(morningSlot.popMax, 70)
assert.equal(morningSlot.humidityMean, 65)
assert.equal(morningSlot.tempMean, 25)
assert.equal(morningSlot.windSpeedMean, 10)
assert.equal(morningSlot.dominantText, '晴')
assert.equal(workingPayload.weatherLocation, '121.4737,31.2304')
assert.equal(workingPayload.sourceKind, 'qweather_weather_24h_working')

clearRecentWeatherMemoryCache()
const storage = createMemoryStorage()
const service = createRecentWeatherService({
  storage,
  locationRepository: {
    async upsertLocation(input) {
      return input
    },
    async findByLocationKey() {
      return null
    },
    async updateRecentObjectMetadata() {}
  },
  now: () => new Date('2026-06-18T03:00:00Z'),
  adapter: {
    async fetchForecast10d() {
      return { raw: { code: '200' }, daily: buildForecastDaily('2026-06-18', 10) }
    }
  }
})

const d0SlotUpdate = await service.updateD0Weather24hWorking({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-18',
  hourly: buildHourly24h()
})
assert.equal(
  storage.objects.has(buildWeatherWorkingObjectPath('city:shanghai', '2026-06-18')),
  true,
  '24h D0 slot update 必须写 working archive'
)
assert.equal(d0SlotUpdate.workingPayload.sunWindow.solarNoon.includes('+08:00'), true)
assert.equal(d0SlotUpdate.workingPayload.daylightSlots[0].cloudMean, 50)
assert.equal(d0SlotUpdate.workingPayload.daylightSlots[0].name, 'morning')
assert.equal(d0SlotUpdate.workingPayload.daylightSlots[0].sourceKind, 'hourly_forecast_snapshot')
assert.equal(d0SlotUpdate.workingPayload.daylightSlots[0].updatedAt, '2026-06-18T03:00:00.000Z')
assert.equal(
  storage.objects.has(buildRecentWeatherObjectPath('city:shanghai')),
  false,
  '24h D0 slot update 不得写 recent-10d'
)

const d0Finalize = await service.updateD0Weather24hWorking({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-18',
  hourly: buildHourly24h(),
  finalize: true
})
assert.equal(d0Finalize.finalized, true)
assert.equal(storage.objects.has(buildWeatherDailyObjectPath('city:shanghai', '2026-06-18')), true)
assert.equal(d0Finalize.dailyPayload.daily.daylightSlots[0].precipSum, 0.4)
assert.equal(
  storage.objects.has(buildRecentWeatherObjectPath('city:shanghai')),
  false,
  '24h D0 finalize 不得写 recent-10d'
)

await service.getCurrentWeatherFromDailyArchive({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  waitForArchive: true
})

assert.equal(
  storage.objects.has(buildWeatherWorkingObjectPath('city:shanghai', '2026-06-18')),
  true,
  'D0 当前天气必须写 working archive'
)
assert.equal(storage.objects.has(buildWeatherDailyObjectPath('city:shanghai', '2026-06-18')), true)
assert.equal(storage.objects.has(buildWeatherManifestObjectPath('city:shanghai')), true)
assert.equal(
  storage.objects.has(buildRecentWeatherObjectPath('city:shanghai')),
  false,
  'D0 当前天气不得重建 recent-10d'
)

const d0Daily = storage.objects.get(buildWeatherDailyObjectPath('city:shanghai', '2026-06-18'))
assert.equal(d0Daily.daily.daylight.slots.length, 4)
assert.equal(d0Daily.daily.daylight.quality, 'complete')

service.adapter = null
const ingestService = createRecentWeatherService({
  storage,
  locationRepository: {
    async upsertLocation(input) {
      return input
    },
    async updateRecentObjectMetadata() {}
  },
  now: () => new Date('2026-06-18T03:00:00Z'),
  adapter: {
    async fetchForecast10d() {
      return { raw: { code: '200' }, daily: buildForecastDaily('2026-06-08', 10) }
    }
  }
})
const ingest = await ingestService.ingestRecentForecast({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-17'
})

assert.equal(
  ingest.recentPayload.historicalDays.some(day => day.date === '2026-06-18'),
  false
)
assert.equal(ingest.recentPayload.window.targetDate, '2026-06-17')
assert.equal(ingest.recentPayload.meta.diagnosisDate, '2026-06-18')
assert.equal(
  ingest.prunedFutureDailyArchives.some(item => item.date === '2026-06-18'),
  true
)

console.log('daylight-and-d0-weather-cache tests passed')
