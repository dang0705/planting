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
const {
  createWeatherObjectStorage
} = require('../../cloudfunctions/weather-http/services/weather-object-storage.js')

function createMemoryStorage(initialObjects = {}) {
  const objects = new Map(Object.entries(initialObjects))
  const objectsByFileId = new Map()
  const writes = []

  for (const [cloudPath, payload] of objects.entries()) {
    objectsByFileId.set(`cloud://${cloudPath}`, payload)
  }

  return {
    writes,
    objects,
    async uploadJson({ cloudPath, payload }) {
      const fileId = `cloud://${cloudPath}`
      objects.set(cloudPath, payload)
      objectsByFileId.set(fileId, payload)
      writes.push({ cloudPath, fileId, payload })
      return { cloudPath, fileId }
    },
    async downloadJson({ cloudPath, fileId }) {
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
      tempMaxC: 29 + index,
      tempMinC: 18,
      humidity: 38 + index,
      precipMm: index === 0 ? 2 : 0,
      pressure: 1020 + index,
      visibilityKm: 25 - index,
      cloud: 4 + index,
      uvIndex: index >= 3 ? 8 : 4,
      textDay: index === 0 ? '小雨' : '晴',
      textNight: index === 0 ? '阴' : '晴',
      windScaleDay: '1-2',
      windSpeedDay: 3 + index,
      windScaleNight: '1-2',
      windSpeedNight: 2 + index,
      source: 'fake_forecast_10d'
    }
  })
}

assert.equal(
  buildRecentWeatherObjectPath('coord:121_45591_31_22352'),
  'weather-cache/v1/locations/coord:121_45591_31_22352/recent-10d.json'
)

clearRecentWeatherMemoryCache()
const coordinateStorage = createMemoryStorage()
let coordinateForecastLocation = ''
const coordinateService = createRecentWeatherService({
  storage: coordinateStorage,
  locationRepository: createMemoryLocationRepository(),
  now: () => new Date('2026-06-14T00:30:00Z'),
  adapter: {
    async fetchForecast10d({ locationId, lat, lng }) {
      coordinateForecastLocation = locationId || `${lng},${lat}`
      return {
        raw: { code: '200' },
        daily: buildForecastDaily('2026-06-13', 10)
      }
    }
  }
})
const coordinateIngest = await coordinateService.ingestRecentForecast({
  lat: 31.22352,
  lng: 121.45591,
  cityName: '上海市',
  timezone: 'Asia/Shanghai'
})
assert.equal(coordinateIngest.location.locationKey, 'coord:121_45591_31_22352')
assert.equal(coordinateForecastLocation, '121.45591,31.22352')
const coordinateRead = await coordinateService.readRecentWeatherForDiagnosis({
  lat: 31.22352,
  lng: 121.45591,
  city: '上海市',
  diagnosisDate: '2026-06-14'
})
assert.equal(coordinateRead.historicalDays.length, 10)
assert.equal(coordinateRead.location.locationKey, 'coord:121_45591_31_22352')
const archivedForecastDay = coordinateRead.historicalDays.find(day => day.date === '2026-06-13')
assert.equal(archivedForecastDay.source, 'qweather_forecast_10d_archive')
assert.equal(archivedForecastDay.sourceKind, 'qweather_forecast_10d_archive')
assert.equal(archivedForecastDay.uvIndex, 4)
assert.equal(archivedForecastDay.cloud, 4)
assert.equal(archivedForecastDay.visibilityKm, 25)
assert.equal(archivedForecastDay.windSpeedDay, 3)
assert.equal(archivedForecastDay.windScaleNight, '1-2')
assert.equal(coordinateIngest.forecastDailyArchives.length, 10)
assert.equal(coordinateIngest.forecastDailyArchives[0].date, '2026-06-13')

clearRecentWeatherMemoryCache()
const noSchemaStorage = createMemoryStorage()
const noSchemaService = createRecentWeatherService({
  storage: noSchemaStorage,
  locationRepository: {
    async upsertLocation() {
      throw new Error("Table 'cloud1_dev.weather_locations' doesn't exist")
    },
    async findByLocationKey() {
      throw new Error("Table 'cloud1_dev.weather_locations' doesn't exist")
    }
  },
  now: () => new Date('2026-06-14T00:30:00Z'),
  adapter: {
    async fetchForecast10d() {
      return {
        raw: { code: '200' },
        daily: buildForecastDaily('2026-06-13', 10)
      }
    }
  }
})
await noSchemaService.ingestRecentForecast({
  lat: 31.22352,
  lng: 121.45591,
  cityName: '上海市',
  timezone: 'Asia/Shanghai'
})
const noSchemaRead = await noSchemaService.readRecentWeatherForDiagnosis({
  lat: 31.22352,
  lng: 121.45591,
  city: '上海市',
  diagnosisDate: '2026-06-14'
})
assert.equal(noSchemaRead.historicalDays.length, 10)
assert.equal(noSchemaRead.historicalDays.find(day => day.date === '2026-06-13').uvIndex, 4)

const cloudPathOnlyPayload = {
  schemaVersion: 'weather-cache/v1/recent-10d',
  sourceKind: 'weather_cache_recent_10d',
  quality: 'partial',
  location: {
    locationKey: 'city:CloudPathOnly',
    timezone: 'Asia/Shanghai'
  },
  window: {
    targetDate: '2026-06-13',
    start: '2026-06-04',
    end: '2026-06-13',
    days: 10
  },
  historicalDays: buildForecastDaily('2026-06-04', 10),
  meta: { quality: 'partial' }
}
const cloudPathOnlyApp = {
  async downloadFile({ fileID }) {
    if (
      fileID !== 'cloud://test-env/weather-cache/v1/locations/city:CloudPathOnly/recent-10d.json'
    ) {
      return null
    }
    return {
      fileContent: Buffer.from(JSON.stringify(cloudPathOnlyPayload), 'utf8')
    }
  },
  async getUploadMetadata({ cloudPath }) {
    assert.equal(cloudPath, buildRecentWeatherObjectPath('city:CloudPathOnly'))
    return {
      data: {
        fileId: `cloud://test-env/${cloudPath}`
      }
    }
  }
}
const cloudPathOnlyRead = await createRecentWeatherService({
  storage: createWeatherObjectStorage({ app: cloudPathOnlyApp }),
  locationRepository: createMemoryLocationRepository()
}).readRecentWeatherForDiagnosis({ locationKey: 'city:CloudPathOnly' })
assert.equal(cloudPathOnlyRead.historicalDays.length, 10)
assert.equal(cloudPathOnlyRead.historicalDays.at(-1).date, '2026-06-13')

clearRecentWeatherMemoryCache()
const historicalPollutedStorage = createMemoryStorage({
  [buildRecentWeatherObjectPath('city:HistoricalPolluted')]: {
    schemaVersion: 'weather-cache/v1/recent-10d',
    sourceKind: 'weather_cache_recent_10d',
    quality: 'partial',
    historicalDays: [
      {
        date: '2026-06-13',
        source: 'qweather_historical_weather',
        sourceKind: 'qweather_historical_weather',
        tempMaxC: 27,
        tempMinC: 20,
        humidity: 72,
        precipMm: 2
      }
    ],
    meta: { quality: 'partial' }
  }
})
const historicalPollutedRead = await createRecentWeatherService({
  storage: historicalPollutedStorage,
  locationRepository: createMemoryLocationRepository()
}).readRecentWeatherForDiagnosis({ locationKey: 'city:HistoricalPolluted' })
assert.equal(historicalPollutedRead.historicalDays.length, 1)
assert.equal(historicalPollutedRead.historicalDays[0].missing, true)
assert.equal(historicalPollutedRead.historicalDays[0].source, 'weather_cache_daily_missing')
assert.equal(
  historicalPollutedRead.historicalDays[0].warning,
  'qweather_historical_weather_disallowed'
)

clearRecentWeatherMemoryCache()
const legacyDailyStorage = createMemoryStorage({
  [buildRecentWeatherObjectPath('city:LegacyDaily')]: {
    schemaVersion: 'weather-cache/v1/recent-10d',
    sourceKind: 'weather_cache_recent_10d',
    quality: 'complete',
    daily: buildForecastDaily('2026-06-03', 10),
    meta: { quality: 'complete' }
  }
})
const legacyDailyRead = await createRecentWeatherService({
  storage: legacyDailyStorage,
  locationRepository: createMemoryLocationRepository()
}).readRecentWeatherForDiagnosis({ locationKey: 'city:LegacyDaily' })
assert.equal(legacyDailyRead.historicalDays.length, 10)
assert.equal(legacyDailyRead.meta.recordCounts.historicalDays, 10)

clearRecentWeatherMemoryCache()
const archiveOnlyStorage = createMemoryStorage()
archiveOnlyStorage.objects.set(buildWeatherManifestObjectPath('city:ArchiveOnly'), {
  schemaVersion: 'weather-cache/v1/manifest',
  locationKey: 'city:ArchiveOnly',
  rawSnapshots: [],
  dailyArchives: Object.fromEntries(
    buildForecastDaily('2026-06-03', 10).map(day => [
      day.date,
      { cloudPath: buildWeatherDailyObjectPath('city:ArchiveOnly', day.date), fileId: '' }
    ])
  ),
  updatedAt: '2026-06-13T00:00:00Z'
})
for (const day of buildForecastDaily('2026-06-03', 10)) {
  archiveOnlyStorage.objects.set(buildWeatherDailyObjectPath('city:ArchiveOnly', day.date), {
    schemaVersion: 'weather-cache/v1/daily',
    date: day.date,
    sourceKind: 'weather_cache_daily_archive',
    quality: 'complete',
    daily: day
  })
}
const archiveOnlyRead = await createRecentWeatherService({
  storage: archiveOnlyStorage,
  locationRepository: createMemoryLocationRepository([
    {
      locationKey: 'city:ArchiveOnly',
      qweatherLocationId: 'ARCHIVE001',
      cityName: '归档测试',
      timezone: 'Asia/Shanghai',
      isActive: true
    }
  ]),
  now: () => new Date('2026-06-14T00:30:00Z')
}).readRecentWeatherForDiagnosis({
  locationKey: 'city:ArchiveOnly',
  diagnosisDate: '2026-06-13'
})
assert.equal(archiveOnlyRead.historicalDays.length, 10)
assert.equal(archiveOnlyRead.cacheSourceKind, 'rebuilt_from_daily_archives')
assert.equal(
  archiveOnlyStorage.writes.some(
    item => item.cloudPath === buildRecentWeatherObjectPath('city:ArchiveOnly')
  ),
  true
)

clearRecentWeatherMemoryCache()
const historicalDailyStorage = createMemoryStorage({
  [buildWeatherManifestObjectPath('city:HistoricalDaily')]: {
    schemaVersion: 'weather-cache/v1/manifest',
    locationKey: 'city:HistoricalDaily',
    rawSnapshots: [],
    dailyArchives: {
      '2026-06-13': {
        cloudPath: buildWeatherDailyObjectPath('city:HistoricalDaily', '2026-06-13'),
        fileId: ''
      }
    },
    updatedAt: '2026-06-14T00:00:00Z'
  },
  [buildWeatherDailyObjectPath('city:HistoricalDaily', '2026-06-13')]: {
    schemaVersion: 'weather-cache/v1/daily',
    date: '2026-06-13',
    sourceKind: 'qweather_historical_weather',
    quality: 'partial',
    daily: {
      date: '2026-06-13',
      source: 'qweather_historical_weather',
      sourceKind: 'qweather_historical_weather',
      tempMaxC: 27,
      tempMinC: 20,
      humidity: 72,
      precipMm: 2
    }
  }
})
const historicalDailyRead = await createRecentWeatherService({
  storage: historicalDailyStorage,
  locationRepository: createMemoryLocationRepository(),
  now: () => new Date('2026-06-14T00:30:00Z')
}).readRecentWeatherForDiagnosis({
  locationKey: 'city:HistoricalDaily',
  diagnosisDate: '2026-06-14'
})
assert.equal(historicalDailyRead.historicalDays.at(-1).date, '2026-06-13')
assert.equal(historicalDailyRead.historicalDays.at(-1).missing, true)
assert.equal(
  historicalDailyRead.historicalDays.at(-1).warning,
  'qweather_historical_weather_disallowed'
)

console.log('weather-history-cache regression tests passed')
