import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  buildRecentWeatherObjectPath,
  buildWeatherDailyObjectPath,
  buildWeatherManifestObjectPath
} = require('../../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  clearRecentWeatherMemoryCache
} = require('../../../cloudfunctions/weather-http/services/recent-weather-memory-cache.js')
const {
  createRecentWeatherService
} = require('../../../cloudfunctions/weather-http/services/recent-weather-service.js')
const {
  buildCloudStorageFileIdCandidates,
  createWeatherObjectStorage
} = require('../../../cloudfunctions/weather-http/services/weather-object-storage.js')

function createMemoryStorage(initialObjects = {}) {
  const objects = new Map(Object.entries(initialObjects))
  const objectsByFileId = new Map()
  const writes = []
  const deletes = []

  for (const [cloudPath, payload] of objects.entries()) {
    objectsByFileId.set(`cloud://${cloudPath}`, payload)
  }

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
      if (fileId) {
        return objectsByFileId.get(fileId) || null
      }
      return objects.get(cloudPath) || null
    },
    async deleteJson({ cloudPath, fileId }) {
      deletes.push({ cloudPath, fileId })
      objects.delete(cloudPath)
      if (fileId) {
        objectsByFileId.delete(fileId)
      }
      return true
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
// 新架构：预置 finalized day file
const { buildWeatherDayObjectPath } = require('../../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const noSchemaD1Path = buildWeatherDayObjectPath('city:shanghai', '2026-06-13')
noSchemaStorage.objects.set(noSchemaD1Path, {
  schemaVersion: 'weather-cache/v1/day-now-sample',
  locationKey: 'city:shanghai',
  date: '2026-06-13',
  state: 'finalized',
  samples: [{ slotName: 'morning', temp: 28, humidity: 60, sourceKind: 'weather_now_sample' }],
  latestSample: { slotName: 'morning', temp: 28 },
  dailyRollup: {
    date: '2026-06-13', quality: 'partial',
    sampleSummary: { sampleCount: 1, daylightSampleCount: 1, missingSlots: ['forenoon', 'noon', 'afternoon'] },
    lightFeatures: { daylightCloudMean: null, lowLightProxy: 'none' },
    moistureFeatures: { humidityMean: 60, precipLastHourSum: null, wetSoilRiskFromWeather: 'low' },
    tempFeatures: { tempMean: 28, tempMax: 28, heatStressLevel: 'low', coldStressLevel: 'low' },
    tempMin: 28, dominantWeatherText: ''
  },
  sourceKind: 'observed_now_rollup', quality: 'partial', weatherObjectPath: noSchemaD1Path
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
assert.equal(noSchemaRead.historicalDays.find(day => day.date === '2026-06-13').missing, false)

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

const previousCloudBaseEnvId = process.env.CLOUDBASE_ENV_ID
const previousWeatherCacheStorageBucket = process.env.WEATHER_CACHE_STORAGE_BUCKET
process.env.CLOUDBASE_ENV_ID = 'cloud1-2grufevs395a9d5e'
delete process.env.WEATHER_CACHE_STORAGE_BUCKET
try {
  const directCloudPath = buildWeatherDailyObjectPath('coord:121_46_31_22', '2026-06-17')
  const directFileId =
    'cloud://cloud1-2grufevs395a9d5e.636c-cloud1-2grufevs395a9d5e-1403815561/weather-cache/v1/locations/coord:121_46_31_22/daily/2026-06-17.json'
  assert.equal(
    buildCloudStorageFileIdCandidates({ cloudPath: directCloudPath }).includes(directFileId),
    true
  )
  const directPayload = { date: '2026-06-17', uvIndex: 6, quality: 'partial' }
  const directCloudPathRead = await createWeatherObjectStorage({
    app: {
      async downloadFile({ fileID }) {
        if (fileID !== directFileId) {
          return null
        }
        return { fileContent: Buffer.from(JSON.stringify(directPayload), 'utf8') }
      }
    }
  }).downloadJson({ cloudPath: directCloudPath })
  assert.equal(directCloudPathRead.uvIndex, 6)
} finally {
  if (previousCloudBaseEnvId === undefined) {
    delete process.env.CLOUDBASE_ENV_ID
  } else {
    process.env.CLOUDBASE_ENV_ID = previousCloudBaseEnvId
  }
  if (previousWeatherCacheStorageBucket === undefined) {
    delete process.env.WEATHER_CACHE_STORAGE_BUCKET
  } else {
    process.env.WEATHER_CACHE_STORAGE_BUCKET = previousWeatherCacheStorageBucket
  }
}

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
const archiveOnlyService = createRecentWeatherService({
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
})
const archiveOnlyDefaultRead = await archiveOnlyService.readRecentWeatherForDiagnosis({
  locationKey: 'city:ArchiveOnly',
  diagnosisDate: '2026-06-13'
})
assert.equal(archiveOnlyDefaultRead.historicalDays.length, 0)
assert.equal(archiveOnlyDefaultRead.meta.reason, 'recent_10d_rebuild_deferred')
const archiveOnlyRead = await archiveOnlyService.readRecentWeatherForDiagnosis({
  locationKey: 'city:ArchiveOnly',
  diagnosisDate: '2026-06-13',
  allowArchiveRebuild: true
})
// 新架构：旧 dailyArchives 不再作为 recent 聚合输入，rebuild 后应为 missing
assert.equal(archiveOnlyRead.weatherEvidenceInsufficient, true)
assert.equal(
  archiveOnlyRead.historicalDays.length === 0 ||
    archiveOnlyRead.historicalDays.every(day => day.missing),
  true,
  '旧 dailyArchives 不应重建出有效 historical days'
)
assert.equal(archiveOnlyRead.meta.quality, 'missing')
assert.equal(
  archiveOnlyStorage.writes.some(
    item => item.cloudPath === buildRecentWeatherObjectPath('city:ArchiveOnly')
  ),
  false,
  '只有旧 dailyArchives 时不应上传有效 recent 文件'
)

clearRecentWeatherMemoryCache()
const directDailyOnlyStorage = createMemoryStorage()
directDailyOnlyStorage.objects.set(buildRecentWeatherObjectPath('coord:121_46_31_22'), {
  schemaVersion: 'weather-cache/v1/recent-10d',
  sourceKind: 'weather_cache_recent_10d',
  quality: 'missing',
  weatherEvidenceInsufficient: true,
  window: { targetDate: '2026-06-17', start: '2026-06-08', end: '2026-06-17', days: 10 },
  historicalDays: [],
  meta: { diagnosisDate: '2026-06-18', quality: 'missing' }
})
// 新架构：写 finalized day files 而非旧 daily archives
for (const day of buildForecastDaily('2026-06-08', 10)) {
  const dayPath = buildWeatherDayObjectPath('coord:121_46_31_22', day.date)
  directDailyOnlyStorage.objects.set(dayPath, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'coord:121_46_31_22',
    date: day.date,
    state: 'finalized',
    samples: [{ slotName: 'morning', temp: day.tempMaxC, humidity: day.humidity, sourceKind: 'weather_now_sample' }],
    latestSample: { slotName: 'morning', temp: day.tempMaxC },
    dailyRollup: {
      date: day.date, quality: 'partial',
      sampleSummary: { sampleCount: 1, daylightSampleCount: 1, missingSlots: ['forenoon', 'noon', 'afternoon'] },
      lightFeatures: { daylightCloudMean: null, lowLightProxy: 'none' },
      moistureFeatures: { humidityMean: day.humidity, precipLastHourSum: null, wetSoilRiskFromWeather: 'low' },
      tempFeatures: { tempMean: day.tempMaxC, tempMax: day.tempMaxC, heatStressLevel: 'low', coldStressLevel: 'low' },
      tempMin: day.tempMinC, dominantWeatherText: ''
    },
    sourceKind: 'observed_now_rollup', quality: 'partial', weatherObjectPath: dayPath
  })
}
const directDailyOnlyRead = await createRecentWeatherService({
  storage: directDailyOnlyStorage,
  locationRepository: createMemoryLocationRepository(),
  now: () => new Date('2026-06-18T00:30:00Z')
}).readRecentWeatherForDiagnosis({ locationKey: 'coord:121_46_31_22', lat: 31.22352, lng: 121.45591, city: '上海市', diagnosisDate: '2026-06-18', allowArchiveRebuild: true })
assert.equal(directDailyOnlyRead.historicalDays.length, 10)
assert.equal(directDailyOnlyRead.cacheSourceKind, 'rebuilt_from_day_archives')
assert.equal(directDailyOnlyRead.historicalDays.at(-1).date, '2026-06-17')
assert.equal(directDailyOnlyRead.historicalDays.at(-1).sourceKind, 'observed_now_rollup')
assert.equal(
  directDailyOnlyStorage.writes.some(
    item => item.cloudPath === buildRecentWeatherObjectPath('coord:121_46_31_22')
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
  diagnosisDate: '2026-06-14',
  allowArchiveRebuild: true
})
// 新架构：旧 dailyArchives 不再作为 recent 输入，rebuild 后应为 missing
assert.equal(historicalDailyRead.weatherEvidenceInsufficient, true)
assert.equal(historicalDailyRead.meta.quality, 'missing')

const missingObjectStorage = createWeatherObjectStorage({
  app: {
    async downloadFile() {
      const error = new Error('')
      error.code = 'STORAGE_FILE_NONEXIST'
      throw error
    },
    async getUploadMetadata() {
      const error = new Error('')
      error.code = 'STORAGE_FILE_NONEXIST'
      throw error
    }
  }
})
assert.equal(
  await missingObjectStorage.downloadJson({
    cloudPath: buildWeatherManifestObjectPath('coord:121_46_31_22'),
    fileId: 'cloud://missing/weather-cache/v1/locations/coord:121_46_31_22/manifest.json'
  }),
  null
)

console.log('weather-history-cache regression tests passed')
