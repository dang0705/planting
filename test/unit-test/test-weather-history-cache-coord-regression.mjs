import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath
} = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  clearRecentWeatherMemoryCache
} = require('../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')
const {
  createRecentWeatherService
} = require('../../cloudfunctions/weather-http/services/recent-weather-service.js')

function createMemoryStorage() {
  const objects = new Map()
  const objectsByFileId = new Map()
  const writes = []
  const deletes = []
  return {
    writes,
    deletes,
    objects,
    async uploadJson({ cloudPath, payload }) {
      const fileId = `cloud://${cloudPath}`
      objects.set(cloudPath, payload)
      objectsByFileId.set(fileId, payload)
      writes.push({ cloudPath, fileId, payload })
      return { cloudPath, fileId }
    },
    async downloadJson({ cloudPath, fileId }) {
      if (fileId) return objectsByFileId.get(fileId) || null
      return objects.get(cloudPath) || null
    },
    async deleteJson({ cloudPath, fileId }) {
      deletes.push({ cloudPath, fileId })
      objects.delete(cloudPath)
      if (fileId) objectsByFileId.delete(fileId)
      return true
    }
  }
}

function createMemoryLocationRepository() {
  const locations = new Map()
  return {
    async findByLocationKey(key) {
      return locations.get(key) || null
    },
    async upsertLocation(input) {
      const location = {
        locationKey: input.locationKey,
        qweatherLocationId: input.qweatherLocationId || '',
        cityName: input.cityName || '',
        timezone: input.timezone || 'Asia/Shanghai',
        isActive: input.isActive !== false
      }
      locations.set(location.locationKey, location)
      return location
    },
    async updateRecentObjectMetadata(input) {
      Object.assign(locations.get(input.locationKey), input)
      return locations.get(input.locationKey)
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
      tempMaxC: 30 + index,
      tempMinC: 20 + index,
      humidity: 60,
      textDay: '晴',
      iconDay: '100',
      textNight: index === 0 ? '阴' : '晴',
      windScaleDay: '1-2',
      windSpeedDay: 3 + index,
      windScaleNight: '1-2',
      windSpeedNight: 2 + index,
      uvIndex: 4,
      cloud: 4,
      visibilityKm: 25,
      precipMm: 0,
      pressure: 1013,
      source: 'fake_forecast_10d'
    }
  })
}

// 远离热门城市的坐标，确保 buildLocationKey 走 coord:* fallback。
const COORD = 'coord:105_46_35_22'
const LAT = 35.22352
const LNG = 105.45591

assert.equal(
  buildRecentWeatherObjectPath(COORD),
  `weather-cache/v1/locations/${COORD}/recent-10d.json`
)

clearRecentWeatherMemoryCache()
const storage = createMemoryStorage()
storage.objects.set(buildWeatherManifestObjectPath(COORD), {
  schemaVersion: 'weather-cache/v1/manifest',
  locationKey: COORD,
  rawSnapshots: [],
  dailyArchives: {
    '2026-06-14': {
      cloudPath: buildWeatherDailyObjectPath(COORD, '2026-06-14'),
      fileId: `cloud://weather-cache/v1/locations/${COORD}/daily/2026-06-14.json`,
      generatedAt: '2026-06-14T00:00:00Z',
      quality: 'partial'
    }
  }
})
storage.objects.set(buildWeatherDailyObjectPath(COORD, '2026-06-14'), {
  schemaVersion: 'weather-cache/v1/daily',
  date: '2026-06-14',
  sourceKind: 'qweather_forecast_10d_archive',
  quality: 'partial'
})
let observedForecastLocation = ''
const service = createRecentWeatherService({
  storage,
  locationRepository: createMemoryLocationRepository(),
  now: () => new Date('2026-06-14T00:30:00Z'),
  adapter: {
    async fetchForecast10d({ locationId, lat, lng }) {
      observedForecastLocation = locationId || `${lng},${lat}`
      return { raw: { code: '200' }, daily: buildForecastDaily('2026-06-13', 10) }
    }
  }
})
const ingest = await service.ingestRecentForecast({
  lat: LAT,
  lng: LNG,
  cityName: '远离热城测试地',
  timezone: 'Asia/Shanghai'
})
assert.equal(ingest.location.locationKey, COORD)
assert.equal(observedForecastLocation, '105.46,35.22')

const read = await service.readRecentWeatherForDiagnosis({
  locationKey: COORD,
  lat: LAT,
  lng: LNG,
  diagnosisDate: '2026-06-14'
})
assert.equal(read.historicalDays.length, 10)
assert.equal(read.location.locationKey, COORD)

const archivedForecastDay = read.historicalDays.find(day => day.date === '2026-06-13')
assert.equal(archivedForecastDay.source, 'qweather_forecast_10d_archive')
assert.equal(archivedForecastDay.sourceKind, 'qweather_forecast_10d_archive')
assert.equal(archivedForecastDay.uvIndex, 4)
assert.equal(archivedForecastDay.cloud, 4)
assert.equal(archivedForecastDay.visibilityKm, 25)
assert.equal(archivedForecastDay.windSpeedDay, 3)
assert.equal(archivedForecastDay.windScaleNight, '1-2')

assert.equal(ingest.forecastDailyArchives.length, 0)
assert.equal(ingest.prunedFutureDailyArchives.length, 1)
assert.equal(ingest.prunedFutureDailyArchives[0].date, '2026-06-14')
assert.equal(storage.objects.has(buildWeatherDailyObjectPath(COORD, '2026-06-14')), false)
assert.equal(
  storage.writes.at(-1).payload.dailyArchives['2026-06-14'],
  undefined,
  'manifest 不得继续引用 targetDate 之后的 future daily archive'
)
assert.equal(
  storage.writes.filter(item =>
    item.cloudPath.includes(`weather-cache/v1/locations/${COORD}/daily/`)
  ).length,
  1,
  'ingestion 不得把 10d 未来预报批量写入 daily 历史缓存目录'
)
assert.equal(
  storage.writes.some(
    item => item.cloudPath === buildWeatherDailyObjectPath(COORD, '2026-06-14')
  ),
  false,
  'D0 预报不得写入 daily 历史缓存目录'
)

console.log('weather-history-cache-coord-regression tests passed')
