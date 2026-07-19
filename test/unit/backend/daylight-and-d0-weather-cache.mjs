import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildWeatherDayObjectPath,
  buildRecentWeatherObjectPath
} = require('../../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  buildDaylightSlots,
  buildSunWindow,
  clamp
} = require('../../../cloudfunctions/weather-http/services/daylight-slots.js')
const {
  createRecentWeatherService
} = require('../../../cloudfunctions/weather-http/services/recent-weather-service.js')
const {
  clearRecentWeatherMemoryCache
} = require('../../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')
const {
  normalizeCurrentWeather
} = require('../../../cloudfunctions/weather-http/adapters/qweather-adapter.js')

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

// === daylight-slots 基础测试 ===
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

const normalizedNow = normalizeCurrentWeather({
  now: {
    temp: '25',
    feelsLike: '27',
    icon: '100',
    text: '晴',
    wind360: '180',
    windDir: '南风',
    windScale: '3',
    windSpeed: '12',
    humidity: '60',
    precip: '0.2',
    pressure: '1007',
    vis: '12',
    cloud: '35',
    dew: '18',
    obsTime: '2026-06-18T09:30:00+08:00'
  }
})
assert.equal(normalizedNow.cloud, 35)
assert.equal(normalizedNow.wind360, 180)
assert.equal(normalizedNow.precipMm, 0.2)
assert.equal(normalizedNow.visibilityKm, 12)
assert.equal(normalizedNow.dew, 18)

// === now-sample D0 服务测试 ===
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
    async fetchCurrentWeather() {
      return {
        tempC: 25,
        feelsLikeC: 27,
        icon: '100',
        text: '晴',
        wind360: 180,
        windDir: '南风',
        windScale: '3',
        windSpeed: 12,
        humidity: 60,
        precipMm: 0.2,
        pressure: 1007,
        visibilityKm: 12,
        cloud: 35,
        dew: 18,
        obsTime: '2026-06-18T09:30:00+08:00',
        source: 'qweather_weather_now'
      }
    },
    async fetchForecast10d() {
      return { raw: {}, daily: [] }
    }
  }
})

const dayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')

// now 采样 → days/{date}.json，不写 working/ 或 daily/
const sampleResult = await service.sampleNowWeather({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-18',
  slotName: 'morning'
})
assert.equal(sampleResult.finalized, false)
assert.equal(sampleResult.dayObjectPath, dayPath)
assert.equal(storage.objects.has(dayPath), true)
assert.equal(
  storage.objects.has('weather-cache/v1/locations/city:shanghai/working/2026-06-18.json'),
  false,
  'now 采样不得写 working/'
)
assert.equal(
  storage.objects.has('weather-cache/v1/locations/city:shanghai/daily/2026-06-18.json'),
  false,
  'now 采样不得写 daily/'
)

const dayFile = storage.objects.get(dayPath)
assert.equal(dayFile.state, 'working')
assert.equal(dayFile.sourceKind, 'observed_now_samples')
assert.equal(dayFile.latestSample.slotName, 'morning')
assert.equal(dayFile.latestSample.sourceKind, 'weather_now_sample')
assert.equal(dayFile.samples[0].cloud, 35, 'now sample 必须保留 /v7/weather/now.cloud')
assert.equal(dayFile.samples[0].feelsLike, 27)
assert.equal(dayFile.samples[0].icon, '100')
assert.equal(dayFile.samples[0].wind360, 180)
assert.equal(dayFile.samples[0].windDir, '南风')
assert.equal(dayFile.samples[0].windScale, '3')
assert.equal(dayFile.samples[0].windSpeed, 12)
assert.equal(dayFile.samples[0].precipLastHour, 0.2)
assert.equal(dayFile.samples[0].pressure, 1007)
assert.equal(dayFile.samples[0].visibilityKm, 12)
assert.equal(dayFile.samples[0].dew, 18)

// 时间字段使用本地 ISO 字符串（不以 Z 结尾）
assert.ok(
  dayFile.generatedAt && !dayFile.generatedAt.endsWith('Z'),
  `generatedAt 应为本地 ISO 字符串, got ${dayFile.generatedAt}`
)
assert.ok(
  dayFile.updatedAt && !dayFile.updatedAt.endsWith('Z'),
  `updatedAt 应为本地 ISO 字符串, got ${dayFile.updatedAt}`
)
assert.ok(
  dayFile.samples[0].sampledAt && !dayFile.samples[0].sampledAt.endsWith('Z'),
  `sampledAt 应为本地 ISO 字符串, got ${dayFile.samples[0].sampledAt}`
)
assert.ok(
  dayFile.samples[0].obsTime && !dayFile.samples[0].obsTime.endsWith('Z'),
  `obsTime 应为本地 ISO 字符串, got ${dayFile.samples[0].obsTime}`
)

dayFile.samples.push({
  slotName: 'afternoon',
  sampledAt: '2026-06-18T10:30:00.000Z',
  obsTime: '2026-06-18T18:30:00+08:00',
  temp: 28,
  humidity: 58,
  cloud: 60,
  sourceKind: 'weather_now_sample'
})
dayFile.latestSample = dayFile.samples[0]

// finalize → dailyRollup + state=finalized
const finalizeResult = await service.finalizeNowWeather({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-18'
})
assert.equal(finalizeResult.finalized, true)
const finalizedDayFile = storage.objects.get(dayPath)
assert.equal(finalizedDayFile.state, 'finalized')
assert.equal(finalizedDayFile.sourceKind, 'observed_now_rollup')
assert.ok(finalizedDayFile.dailyRollup, 'finalize 必须生成 dailyRollup')
assert.ok(finalizedDayFile.finalizedAt, 'finalize 必须设置 finalizedAt')
assert.ok(
  !finalizedDayFile.finalizedAt.endsWith('Z'),
  `finalizedAt 应为本地 ISO 字符串, got ${finalizedDayFile.finalizedAt}`
)
assert.equal(
  finalizedDayFile.samples.some(s => s.slotName === 'finalize'),
  false,
  'days/{date}.json.samples[] 不得包含 slotName=finalize'
)
assert.equal(finalizedDayFile.latestSample.slotName, 'afternoon')
assert.equal(finalizedDayFile.latestSample.cloud, 60)
assert.equal(
  storage.objects.has(buildRecentWeatherObjectPath('city:shanghai')),
  false,
  'D0 finalize 不得写 recent-10d'
)

// 当前天气从 latestSample 读，不触发 QWeather
const currentResult = await service.getCurrentWeatherFromDailyArchive({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai'
})
assert.ok(currentResult.weatherData, '当前天气从 latestSample 读')
assert.equal(currentResult.weatherData.sourceKind, 'weather_now_sample')
assert.equal(currentResult.dailyWeatherCache.cacheHit, true)

// ingestRecentForecast 从 finalized day files 重建 recent-10d
// 先写一个 D-1 finalized day file
const d1Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-17')
storage.objects.set(d1Path, {
  schemaVersion: 'weather-cache/v1/day-now-sample',
  locationKey: 'city:shanghai',
  date: '2026-06-17',
  state: 'finalized',
  samples: [{ slotName: 'morning', temp: 22, humidity: 60, sourceKind: 'weather_now_sample' }],
  latestSample: { slotName: 'morning', temp: 22 },
  dailyRollup: {
    date: '2026-06-17',
    quality: 'partial',
    sampleCount: 1,
    temp: 22,
    humidity: 60,
    text: '晴'
  },
  sourceKind: 'observed_now_rollup',
  quality: 'partial',
  weatherObjectPath: d1Path
})

const ingest = await service.ingestRecentForecast({
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-17'
})
assert.ok(ingest.recentPayload, 'recentPayload should exist')
assert.equal(
  ingest.recentPayload.historicalDays.some(day => day.date === '2026-06-18'),
  false,
  'D0 今日不得进入 recent-10d'
)
assert.equal(ingest.recentPayload.window.targetDate, '2026-06-17')
assert.equal(ingest.recentPayload.meta.diagnosisDate, '2026-06-18')

console.log('daylight-and-d0-weather-cache tests passed')
