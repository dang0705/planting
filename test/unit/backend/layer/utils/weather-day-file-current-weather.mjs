import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  createCurrentWeatherArchiveService
} = require('../../../../../cloudfunctions/layer/utils/weather-day-file-current-weather.js')

const locationKey = 'city:memory-cache'
const targetDate = '2026-09-08'
const dayPath = `weather-cache/v1/locations/${locationKey}/days/${targetDate}.json`
const dayPayload = {
  locationKey,
  date: targetDate,
  state: 'working',
  latestSample: {
    temp: 26,
    humidity: 61,
    text: '晴',
    obsTime: '2026-09-08T10:00:00+08:00'
  }
}

let storedPayload = dayPayload
let readCount = 0
const service = createCurrentWeatherArchiveService({
  storage: {
    async downloadJson({ cloudPath }) {
      readCount += 1
      return cloudPath === dayPath ? storedPayload : null
    }
  },
  now: () => new Date('2026-09-08T02:00:00Z'),
  resolveLocationInput: input => ({
    locationKey: input.locationKey,
    timezone: input.timezone || 'Asia/Shanghai'
  })
})

const input = {
  locationKey,
  timezone: 'Asia/Shanghai',
  targetDate,
  useCache: true,
  useMemoryCache: true
}
const firstRead = await service.getCurrentWeatherFromDailyArchive(input)
assert.equal(firstRead.weatherData.temperature, 26)
assert.equal(firstRead.dailyWeatherCache.reason, 'day_latest_sample_present')
assert.equal(readCount, 1)

storedPayload = null
const warmRead = await service.getCurrentWeatherFromDailyArchive(input)
assert.equal(
  warmRead.weatherData.temperature,
  26,
  '正缓存命中时应返回上一次确认存在的 latestSample'
)
assert.equal(readCount, 1, '热读不应再次访问对象存储')

service.clearCurrentWeatherCache({ locationKey, targetDate })
const missingAfterClear = await service.getCurrentWeatherFromDailyArchive(input)
assert.equal(missingAfterClear.weatherData, null, '主动失效后应重新确认 D0 文件是否存在')
assert.equal(missingAfterClear.dailyWeatherCache.cacheHit, false)
assert.ok(readCount > 1)

storedPayload = dayPayload
const recoveredRead = await service.getCurrentWeatherFromDailyArchive(input)
assert.equal(
  recoveredRead.weatherData.temperature,
  26,
  '缺失结果不应被负缓存，文件恢复后应重新命中'
)

let boundedReadCount = 0
const boundedService = createCurrentWeatherArchiveService({
  storage: {
    async downloadJson() {
      boundedReadCount += 1
      await new Promise(resolve => setTimeout(resolve, 80))
      return null
    }
  },
  now: () => new Date('2026-09-08T02:00:00Z'),
  resolveLocationInput: input => ({
    locationKey: input.locationKey,
    timezone: input.timezone || 'Asia/Shanghai'
  })
})
const boundedStartedAt = Date.now()
const boundedMiss = await boundedService.getCurrentWeatherFromDailyArchive({
  ...input,
  useMemoryCache: false,
  skipFinalizedFallback: true,
  readTimeoutMs: 20
})
assert.equal(boundedMiss.weatherData, null)
assert.equal(boundedMiss.dailyWeatherCache.reason, 'day_latest_sample_read_timeout')
assert.equal(boundedReadCount, 1, '环境模式跳过旧日期 fallback 时不应额外读取 7 个 day file')
assert.ok(Date.now() - boundedStartedAt < 60, '环境模式 D0 超时应保持在单次读取预算内')

let concurrentReadCount = 0
const concurrentService = createCurrentWeatherArchiveService({
  storage: {
    async downloadJson({ cloudPath }) {
      concurrentReadCount += 1
      await new Promise(resolve => setTimeout(resolve, 20))
      return cloudPath === dayPath ? dayPayload : null
    }
  },
  now: () => new Date('2026-09-08T02:00:00Z'),
  resolveLocationInput: input => ({
    locationKey: input.locationKey,
    timezone: input.timezone || 'Asia/Shanghai'
  })
})
await Promise.all([
  concurrentService.getCurrentWeatherFromDailyArchive({ ...input, useMemoryCache: false }),
  concurrentService.getCurrentWeatherFromDailyArchive({ ...input, useMemoryCache: false })
])
assert.equal(concurrentReadCount, 1, '未启用正缓存时仍应保留并发读取去重')

console.log('current-weather-memory-cache tests passed')
