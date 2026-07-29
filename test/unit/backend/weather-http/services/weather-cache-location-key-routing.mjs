import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildLocationKey,
  buildRecentWeatherObjectPath
} = require('../../../../../cloudfunctions/weather-http/services/weather-cache-paths.js')
const {
  createDiagnosisRecentWeatherReader
} = require('../../../../../cloudfunctions/weather-http/services/recent-weather-diagnosis-reader.js')
const {
  buildHotCityIngestionTargets
} = require('../../../../../cloudfunctions/weather-http/services/recent-weather-batch.js')

// 1) 显式 locationKey 必须原样保留，不得被覆盖
assert.equal(
  buildLocationKey({ locationKey: 'city:shanghai', cityName: '上海', lat: 31.23, lng: 121.47 }),
  'city:shanghai'
)

// 2) 仅中文 cityName='上海'，必须解析到热门城市 key，而不是回退 coord:*
assert.equal(buildLocationKey({ cityName: '上海' }), 'city:shanghai')
assert.equal(buildLocationKey({ city: '上海市' }), 'city:shanghai')

// 3) 仅给坐标且落在上海半径内，必须命中 city:shanghai 而不是 coord:*
assert.equal(buildLocationKey({ lat: 31.23, lng: 121.47 }), 'city:shanghai')

// 4) 未匹配热城且只有中文城市，不得 silently 生成 city:unknown 或 coord:*；返回 ''
assert.equal(buildLocationKey({ cityName: '未在热城列表的小镇XYZ' }), '')

// 5) 只有坐标且不在任何热城半径内，才允许 fallback coord:*
const remoteKey = buildLocationKey({ lat: 0.0, lng: 0.0 })
assert.equal(remoteKey, 'coord:0_00_0_00')

// 6) 诊断 reader：传 city:shanghai 时必须读 weather-cache/v1/locations/city:shanghai/recent-10d.json
let observedReadKey = ''
const stubRead = async ({ locationKey }) => {
  observedReadKey = locationKey
  return null
}
const reader = createDiagnosisRecentWeatherReader({
  readRecentWeather: stubRead,
  rebuildRecentWeatherFromArchives: async () => null
})
const missShanghai = await reader({
  locationKey: 'city:shanghai',
  plantId: 'p1',
  careLocationId: 'cl1',
  source: 'manual_selected',
  diagnosisDate: '2026-06-18'
})
assert.equal(observedReadKey, 'city:shanghai')
assert.equal(missShanghai.locationKey, 'city:shanghai')
assert.equal(missShanghai.meta.weatherObjectPath, buildRecentWeatherObjectPath('city:shanghai'))
assert.equal(missShanghai.weatherEvidenceInsufficient, true)
assert.equal(missShanghai.meta.reason, 'recent_10d_rebuild_deferred')

// 7) 诊断 reader：仅给中文 cityName='上海' 也必须解析到 city:shanghai，而非 coord:*
observedReadKey = ''
const missShanghaiFromCity = await reader({
  cityName: '上海',
  diagnosisDate: '2026-06-18'
})
assert.equal(observedReadKey, 'city:shanghai')
assert.equal(missShanghaiFromCity.locationKey, 'city:shanghai')

// 8) 诊断 reader：未提供 locationKey 且无法解析到热城，但只有坐标 -> 必须暴露 diagnosis_location_key_missing
observedReadKey = ''
let rebuiltCalled = false
const reader2 = createDiagnosisRecentWeatherReader({
  readRecentWeather: async ({ locationKey }) => {
    observedReadKey = locationKey
    return null
  },
  rebuildRecentWeatherFromArchives: async () => {
    rebuiltCalled = true
    return null
  }
})
const coordOnly = await reader2({
  lat: 0.0,
  lng: 0.0,
  diagnosisDate: '2026-06-18',
  allowArchiveRebuild: true
})
assert.equal(observedReadKey, '', '坐标 fallback 不应触发 storage 读取')
assert.equal(rebuiltCalled, false, '坐标 fallback 不应触发归档重建')
assert.equal(coordOnly.weatherEvidenceInsufficient, true)
assert.equal(coordOnly.meta.reason, 'diagnosis_location_key_missing')

function buildUsableRecentPayload({
  targetDate = '2026-06-17',
  diagnosisDate = '2026-06-18'
} = {}) {
  return {
    sourceKind: 'weather_cache_recent_10d',
    quality: 'partial',
    weatherEvidenceInsufficient: false,
    weatherObjectPath: buildRecentWeatherObjectPath('city:shanghai'),
    window: {
      start: '2026-06-08',
      end: targetDate,
      targetDate,
      days: 10
    },
    historicalDays: [
      {
        date: targetDate,
        tempMaxC: 29,
        tempMinC: 21,
        humidity: 68,
        textDay: '晴',
        quality: 'partial',
        sourceKind: 'qweather_time_machine_daily_archive'
      }
    ],
    meta: {
      diagnosisDate,
      quality: 'partial',
      weatherEvidenceInsufficient: false
    }
  }
}

// 9) 诊断 reader：日期窗口匹配的 partial recent-10d 必须可作为有效证据
const freshReader = createDiagnosisRecentWeatherReader({
  readRecentWeather: async () => ({
    payload: buildUsableRecentPayload(),
    cacheHit: false,
    sourceKind: 'object_storage'
  }),
  rebuildRecentWeatherFromArchives: async () => null
})
const freshWeather = await freshReader({
  locationKey: 'city:shanghai',
  diagnosisDate: '2026-06-18'
})
assert.equal(freshWeather.locationKey, 'city:shanghai')
assert.equal(freshWeather.weatherEvidenceInsufficient, false)
assert.equal(freshWeather.historicalDays.length, 1)

// 10) 诊断 reader：过期 partial payload 即使非 insufficient，也不得作为当前诊断日证据
const staleReader = createDiagnosisRecentWeatherReader({
  readRecentWeather: async () => ({
    payload: buildUsableRecentPayload({
      targetDate: '2026-06-10',
      diagnosisDate: '2026-06-11'
    }),
    cacheHit: false,
    sourceKind: 'object_storage'
  }),
  rebuildRecentWeatherFromArchives: async () => null
})
const staleWeather = await staleReader({
  locationKey: 'city:shanghai',
  diagnosisDate: '2026-06-18'
})
assert.equal(staleWeather.locationKey, 'city:shanghai')
assert.equal(staleWeather.weatherEvidenceInsufficient, true)
assert.equal(staleWeather.historicalDays.length, 0)
assert.equal(staleWeather.meta.reason, 'recent_10d_rebuild_deferred')

// 11) 批量采集目标必须覆盖全部 20 个热城且都是 city:* key（含 city:shanghai）
const ingestionTargets = buildHotCityIngestionTargets()
assert.equal(ingestionTargets.length, 20)
assert.equal(
  ingestionTargets.every(item => item.locationKey.startsWith('city:')),
  true
)
assert.equal(
  ingestionTargets.some(item => item.locationKey === 'city:shanghai'),
  true
)

console.log('weather-cache-location-key-routing tests passed')
