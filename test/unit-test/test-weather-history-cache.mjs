import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath,
  buildWeatherRawForecastObjectPath
} = require('../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  clearRecentWeatherMemoryCache
} = require('../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')
const {
  createRecentWeatherService
} = require('../../cloudfunctions/weather-http/services/recent-weather-service.js')
const {
  createQWeatherAdapter
} = require('../../cloudfunctions/weather-http/adapters/qweather-adapter.js')
const {
  createWeatherLocationRepository
} = require('../../cloudfunctions/weather-http/repositories/weather-location-repository.js')

function createMemoryStorage(initialObjects = {}) {
  const objects = new Map(Object.entries(initialObjects))
  const objectsByFileId = new Map()
  const reads = new Map()
  const writes = []

  for (const [cloudPath, payload] of objects.entries()) {
    objectsByFileId.set(`cloud://${cloudPath}`, payload)
  }

  return {
    reads,
    writes,
    objects,
    objectsByFileId,
    async uploadJson({ cloudPath, payload }) {
      const fileId = `cloud://${cloudPath}`
      objects.set(cloudPath, payload)
      objectsByFileId.set(fileId, payload)
      writes.push({ cloudPath, fileId, payload })
      return { cloudPath, fileId }
    },
    async downloadJson({ cloudPath, fileId }) {
      const readKey = fileId || cloudPath
      reads.set(readKey, (reads.get(readKey) || 0) + 1)
      if (fileId) {
        return objectsByFileId.get(fileId) || null
      }
      return objects.get(cloudPath) || null
    }
  }
}

function createMemoryLocationRepository(initialLocations = []) {
  const locations = new Map(initialLocations.map(location => [location.locationKey, location]))
  return {
    async findByLocationKey(locationKey) {
      return locations.get(locationKey) || null
    },
    async listActiveLocations({ limit = 20 } = {}) {
      return Array.from(locations.values())
        .filter(location => location.isActive !== false && location.qweatherLocationId)
        .slice(0, Number(limit || 20))
    },
    async upsertLocation(input) {
      const existing = locations.get(input.locationKey) || {}
      const location = {
        ...existing,
        locationKey: input.locationKey,
        qweatherLocationId: input.qweatherLocationId || '',
        cityName: input.cityName || '',
        timezone: input.timezone || 'Asia/Shanghai',
        isActive: input.isActive !== false,
        recentObjectPath: input.recentObjectPath || existing.recentObjectPath || '',
        recentFileId: input.recentFileId || existing.recentFileId || '',
        manifestObjectPath: input.manifestObjectPath || existing.manifestObjectPath || '',
        manifestFileId: input.manifestFileId || existing.manifestFileId || ''
      }
      locations.set(location.locationKey, location)
      return location
    },
    async updateRecentObjectMetadata(input) {
      const location = locations.get(input.locationKey)
      Object.assign(location, {
        recentObjectPath: input.recentObjectPath,
        recentFileId: input.recentFileId,
        manifestObjectPath: input.manifestObjectPath || location.manifestObjectPath || '',
        manifestFileId: input.manifestFileId || location.manifestFileId || '',
        recentGeneratedAt: input.recentGeneratedAt
      })
      return location
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
      tempMaxC: 29 + index,
      tempMinC: 18,
      humidity: 38 + index,
      precipMm: index === 0 ? 2 : 0,
      uvIndex: index >= 3 ? 8 : 4,
      textDay: index === 0 ? '小雨' : '晴',
      source: 'fake_forecast_10d'
    }
  })
}

assert.equal(
  buildRecentWeatherObjectPath('city:Shanghai'),
  'weather-cache/v1/locations/city:Shanghai/recent-10d.json'
)
assert.equal(
  buildWeatherManifestObjectPath('city:Shanghai'),
  'weather-cache/v1/locations/city:Shanghai/manifest.json'
)
assert.equal(
  buildWeatherDailyObjectPath('city:Shanghai', '2026-06-12'),
  'weather-cache/v1/locations/city:Shanghai/daily/2026-06-12.json'
)
assert.equal(
  buildWeatherRawForecastObjectPath('city:Shanghai', '2026-06-14T00:30:00Z'),
  'weather-cache/v1/locations/city:Shanghai/raw/forecast-2026-06-14T00:30:00Z.json'
)

clearRecentWeatherMemoryCache()
const storage = createMemoryStorage()
let qweather10dCalls = 0
const service = createRecentWeatherService({
  storage,
  locationRepository: createMemoryLocationRepository(),
  now: () => new Date('2026-06-14T00:30:00Z'),
  adapter: {
    async fetchForecast10d() {
      qweather10dCalls += 1
      return {
        raw: { code: '200' },
        daily: buildForecastDaily('2026-06-12', 10)
      }
    }
  }
})

const ingestResult = await service.ingestRecentForecast({
  locationKey: 'city:LosAngeles',
  qweatherLocationId: 'LA001',
  cityName: '洛杉矶',
  timezone: 'America/Los_Angeles'
})

assert.equal(qweather10dCalls, 1, 'ingestion 必须调用 QWeather 10d 一次')
assert.equal(ingestResult.targetDate, '2026-06-12', 'D-1 应按地点 timezone 计算')
assert.equal(ingestResult.recentObjectPath, buildRecentWeatherObjectPath('city:LosAngeles'))
assert.equal(ingestResult.quality, 'partial', '缺少 D-10 到 D-2 daily 时 recent 应标记 partial')
assert.equal(ingestResult.recentPayload.window.start, '2026-06-03')
assert.equal(ingestResult.recentPayload.window.end, '2026-06-12')
assert.equal(ingestResult.recentPayload.historicalDays.length, 10)
assert.equal(ingestResult.recentPayload.historicalDays.at(-1).date, '2026-06-12')
assert.equal(
  ingestResult.recentPayload.historicalDays.at(-1).sourceKind,
  'qweather_forecast_10d_archive'
)
assert.equal(ingestResult.recentPayload.sourceKind, 'weather_cache_recent_10d')
assert.equal(ingestResult.recentPayload.plantFeatures.dayCount, 1)
assert.equal(ingestResult.recentPayload.plantFeatures.missingDayCount, 9)
assert.equal(
  storage.writes.some(item => item.cloudPath === buildWeatherManifestObjectPath('city:LosAngeles')),
  true,
  'ingestion 必须写 manifest.json'
)
assert.equal(
  storage.writes.some(
    item => item.cloudPath === buildWeatherDailyObjectPath('city:LosAngeles', '2026-06-12')
  ),
  true,
  'ingestion 必须写 D-1 daily archive'
)
assert.equal(
  storage.writes.some(item => item.cloudPath === buildRecentWeatherObjectPath('city:LosAngeles')),
  true,
  'ingestion 必须写 recent-10d.json'
)

const sqlStatements = []
const locationRepositoryUnderTest = createWeatherLocationRepository({
  sqlModels: {
    async $runSQL(sql, params = {}) {
      sqlStatements.push({ sql, params })
      if (/SELECT/.test(sql)) {
        return {
          data: {
            executeResultList: [
              {
                location_key: 'city:Existing',
                qweather_location_id: 'OLD001',
                city_name: '旧地点',
                timezone: 'Asia/Shanghai',
                is_active: 1,
                recent_object_path: buildRecentWeatherObjectPath('city:Existing'),
                recent_file_id: 'cloud://existing/recent-10d.json',
                manifest_object_path: buildWeatherManifestObjectPath('city:Existing'),
                manifest_file_id: 'cloud://existing/manifest.json',
                recent_generated_at: '2026-06-13 00:00:00'
              }
            ]
          }
        }
      }
      return { data: { executeResultList: [] } }
    }
  }
})
const preservedLocation = await locationRepositoryUnderTest.upsertLocation({
  locationKey: 'city:Existing',
  qweatherLocationId: 'NEW001',
  cityName: '新地点',
  timezone: 'Asia/Shanghai'
})
assert.equal(preservedLocation.recentObjectPath, buildRecentWeatherObjectPath('city:Existing'))
assert.equal(preservedLocation.recentFileId, 'cloud://existing/recent-10d.json')
assert.equal(preservedLocation.manifestObjectPath, buildWeatherManifestObjectPath('city:Existing'))
assert.equal(preservedLocation.manifestFileId, 'cloud://existing/manifest.json')
assert.equal(
  sqlStatements.some(item => /UPDATE weather_locations/.test(item.sql)),
  true
)
sqlStatements.length = 0
await locationRepositoryUnderTest.listActiveLocations({ limit: 7 })
assert.equal(
  sqlStatements.some(item =>
    /WHERE is_active = 1\s+AND qweather_location_id <> ''/.test(item.sql.replace(/\s+/g, ' '))
  ),
  true
)
assert.equal(sqlStatements.find(item => /FROM weather_locations/.test(item.sql)).params.limit, 7)
sqlStatements.length = 0
await locationRepositoryUnderTest.listActiveLocations({ limit: 'abc' })
assert.equal(sqlStatements.find(item => /FROM weather_locations/.test(item.sql)).params.limit, 20)

clearRecentWeatherMemoryCache()
const rollingStorage = createMemoryStorage()
const rollingRepository = createMemoryLocationRepository()
let rollingNow = new Date('2026-06-14T00:30:00Z')
let rollingCallCount = 0
const rollingService = createRecentWeatherService({
  storage: rollingStorage,
  locationRepository: rollingRepository,
  now: () => rollingNow,
  adapter: {
    async fetchForecast10d() {
      rollingCallCount += 1
      return {
        raw: { code: '200' },
        daily:
          rollingCallCount === 1
            ? buildForecastDaily('2026-06-12', 10)
            : buildForecastDaily('2026-06-14', 10)
      }
    }
  }
})

const firstRollingIngest = await rollingService.ingestRecentForecast({
  locationKey: 'city:Rolling',
  qweatherLocationId: 'ROLLING001',
  cityName: '滚动测试',
  timezone: 'America/Los_Angeles'
})
rollingNow = new Date('2026-06-15T00:30:00Z')
const secondRollingIngest = await rollingService.ingestRecentForecast({
  locationKey: 'city:Rolling',
  qweatherLocationId: 'ROLLING001',
  cityName: '滚动测试',
  timezone: 'America/Los_Angeles'
})

const rollingLocation = await rollingRepository.findByLocationKey('city:Rolling')
const rollingManifest = rollingStorage.objectsByFileId.get(rollingLocation.manifestFileId)
const dailyFromPreviousRaw = rollingStorage.objects.get(
  buildWeatherDailyObjectPath('city:Rolling', '2026-06-13')
)
assert.equal(
  rollingManifest.dailyArchives['2026-06-12'].fileId.includes('/daily/2026-06-12.json'),
  true
)
assert.equal(
  rollingManifest.dailyArchives['2026-06-13'].fileId.includes('/daily/2026-06-13.json'),
  true
)
assert.equal(dailyFromPreviousRaw.daily.missing, false)
assert.equal(dailyFromPreviousRaw.rawObjectPath, firstRollingIngest.rawObjectPath)
assert.equal(
  secondRollingIngest.recentPayload.historicalDays.find(day => day.date === '2026-06-12').missing,
  false
)
assert.equal(
  secondRollingIngest.recentPayload.historicalDays.find(day => day.date === '2026-06-13').missing,
  false
)

clearRecentWeatherMemoryCache()
let batchForecastCalls = 0
const batchStorage = createMemoryStorage()
const batchService = createRecentWeatherService({
  storage: batchStorage,
  locationRepository: createMemoryLocationRepository([
    {
      locationKey: 'city:BatchA',
      qweatherLocationId: 'BATCH_A',
      cityName: '批量A',
      timezone: 'Asia/Shanghai',
      isActive: true
    },
    {
      locationKey: 'city:BatchInactive',
      qweatherLocationId: 'BATCH_INACTIVE',
      cityName: '批量停用',
      timezone: 'Asia/Shanghai',
      isActive: false
    },
    {
      locationKey: 'city:BatchNoLocationId',
      qweatherLocationId: '',
      cityName: '缺少和风ID',
      timezone: 'Asia/Shanghai',
      isActive: true
    }
  ]),
  now: () => new Date('2026-06-14T00:30:00Z'),
  adapter: {
    async fetchForecast10d({ locationId }) {
      batchForecastCalls += 1
      assert.equal(locationId, 'BATCH_A')
      return {
        raw: { code: '200' },
        daily: buildForecastDaily('2026-06-13', 10)
      }
    }
  }
})
const batchResult = await batchService.ingestActiveLocations({ limit: 10 })
assert.equal(batchResult.total, 1)
assert.equal(batchResult.successCount, 1)
assert.equal(batchResult.failureCount, 0)
assert.equal(batchForecastCalls, 1)

clearRecentWeatherMemoryCache()
const missStorage = createMemoryStorage()
const missService = createRecentWeatherService({
  storage: missStorage,
  locationRepository: createMemoryLocationRepository(),
  adapter: {
    async fetchForecast10d() {
      throw new Error('diagnosis miss 不应请求和风')
    }
  }
})
const missWindow = await missService.readRecentWeatherForDiagnosis({
  locationKey: 'city:Missing'
})
assert.equal(missWindow.weatherEvidenceInsufficient, true)
assert.equal(missWindow.historicalDays.length, 0)
assert.equal(missWindow.meta.quality, 'missing')
assert.equal(missStorage.reads.get(buildRecentWeatherObjectPath('city:Missing')), 1)

clearRecentWeatherMemoryCache()
const cacheStorage = createMemoryStorage({
  [buildRecentWeatherObjectPath('city:Cached')]: {
    schemaVersion: 'weather-cache/v1/recent-10d',
    sourceKind: 'weather_cache_recent_10d',
    quality: 'complete',
    weatherObjectPath: buildRecentWeatherObjectPath('city:Cached'),
    historicalDays: buildForecastDaily('2026-06-03', 10),
    meta: { quality: 'complete' }
  }
})
const cacheService = createRecentWeatherService({
  storage: cacheStorage,
  locationRepository: createMemoryLocationRepository()
})
const firstRead = await cacheService.readRecentWeatherForDiagnosis({ locationKey: 'city:Cached' })
const secondRead = await cacheService.readRecentWeatherForDiagnosis({ locationKey: 'city:Cached' })
assert.equal(firstRead.meta.cacheHit, false)
assert.equal(secondRead.meta.cacheHit, true)
assert.equal(cacheStorage.reads.get(buildRecentWeatherObjectPath('city:Cached')), 1)

const qweatherCalls = []
const adapter = createQWeatherAdapter({
  apiKey: 'test-key',
  httpClient: {
    async get(url, options = {}) {
      qweatherCalls.push({ url, params: options.params })
      return {
        status: 200,
        data: {
          code: '200',
          daily: [{ fxDate: '2026-06-01', tempMax: '30', tempMin: '20', humidity: '60' }]
        }
      }
    }
  }
})
const forecast10d = await adapter.fetchForecast10d({ locationId: '101020100' })
assert.equal(forecast10d.daily.length, 1)
assert.equal(forecast10d.daily[0].source, 'qweather_forecast_10d')
assert.equal(qweatherCalls[0].url.endsWith('/v7/weather/10d'), true)
assert.equal(qweatherCalls[0].params.location, '101020100')

console.log('weather-history-cache tests passed')
