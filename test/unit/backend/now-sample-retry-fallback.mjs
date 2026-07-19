import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const { createD0NowSampleService } = require('../../../cloudfunctions/weather-http/services/d0-now-sample-service.js')
const { attemptWeatherObservation } = require('../../../cloudfunctions/weather-http/services/now-sample-weather-observation.js')
const { buildWeatherDayObjectPath } = require('../../../cloudfunctions/weather-http/services/weather-cache-paths.js')

// 注入式 sleep stub：不真等 10 秒，仅记录调用次数与间隔
function createSleepStub() {
  const calls = []
  const sleep = async ms => { calls.push(ms) }
  return { sleep, calls }
}

// 内存 storage：模拟 uploadJson/downloadJson，day file 落在 Map 里
function createMemoryStorage() {
  const store = new Map()
  return {
    store,
    async downloadJson({ cloudPath }) {
      return store.has(cloudPath) ? store.get(cloudPath) : null
    },
    async uploadJson({ cloudPath, payload }) {
      store.set(cloudPath, payload)
      return { cloudPath, fileId: `cloud://${cloudPath}` }
    }
  }
}

function resolveLocationInput(input = {}) {
  return {
    locationKey: input.locationKey || 'city:test',
    qweatherLocationId: '',
    cityName: input.cityName || '测试',
    latitude: input.latitude ?? input.lat ?? 0,
    longitude: input.longitude ?? input.lng ?? 0,
    timezone: input.timezone || 'Asia/Shanghai',
    isActive: true
  }
}

// 计数式 adapter：按 primaryFails/fallbackFails 控制失败次数，超限后返回成功数据
function createCountingAdapter({ primaryFails = 0, fallbackFails = 0 } = {}) {
  let primaryCalls = 0
  let fallbackCalls = 0
  const primaryData = { tempC: 24, humidity: 65, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' }
  const fallbackData = { tempC: 25, humidity: 60, text: '多云', obsTime: '2026-06-18T12:30:00+08:00', source: 'qweather_grid_weather_now' }
  return {
    async fetchCurrentWeather() {
      primaryCalls += 1
      if (primaryCalls <= primaryFails) {
        throw new Error(`primary fail #${primaryCalls}`)
      }
      return primaryData
    },
    async fetchGridWeatherNow() {
      fallbackCalls += 1
      if (fallbackCalls <= fallbackFails) {
        throw new Error(`fallback fail #${fallbackCalls}`)
      }
      return fallbackData
    },
    primaryCalls: () => primaryCalls,
    fallbackCalls: () => fallbackCalls
  }
}

// 可变模式 adapter：用于跨多次采样切换成功/失败行为
function createMutableAdapter() {
  let mode = 'primary_success'
  const calls = { primary: 0, fallback: 0 }
  return {
    setMode(m) { mode = m },
    resetCalls() { calls.primary = 0; calls.fallback = 0 },
    calls,
    async fetchCurrentWeather() {
      calls.primary += 1
      if (mode === 'primary_success') {
        return { tempC: 24, humidity: 65, text: '晴', obsTime: '2026-06-18T09:30:00+08:00', source: 'qweather_weather_now' }
      }
      throw new Error(`primary fail #${calls.primary}`)
    },
    async fetchGridWeatherNow() {
      calls.fallback += 1
      if (mode === 'fallback_success') {
        return { tempC: 25, humidity: 60, text: '多云', obsTime: '2026-06-18T12:30:00+08:00', source: 'qweather_grid_weather_now' }
      }
      throw new Error(`fallback fail #${calls.fallback}`)
    }
  }
}

const fixedNow = () => new Date('2026-06-18T13:00:00+08:00')
const baseInput = {
  locationKey: 'city:shanghai',
  cityName: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  targetDate: '2026-06-18'
}

// === 1. helper 直测：primary 失败 4 次后 fallback 成功 ===
{
  const { sleep, calls: sleepCalls } = createSleepStub()
  const adapter = createCountingAdapter({ primaryFails: 4, fallbackFails: 0 })
  const result = await attemptWeatherObservation({
    fetchPrimary: () => adapter.fetchCurrentWeather(),
    fetchFallback: () => adapter.fetchGridWeatherNow(),
    sleep,
    slotName: 'morning',
    sampledAt: '2026-06-18T09:30:00+08:00'
  })
  assert.equal(result.ok, true, 'fallback 成功后 ok=true')
  assert.equal(result.sourceKind, 'grid_weather_now_sample', 'sourceKind 应为 grid_weather_now_sample')
  assert.equal(result.missingSample, null)
  assert.equal(adapter.primaryCalls(), 4, 'primary 共尝试 4 次（首次+3 重试）')
  assert.equal(adapter.fallbackCalls(), 1, 'fallback 首次即成功')
  assert.equal(sleepCalls.length, 3, 'primary 4 次尝试间产生 3 次 sleep')
  assert.ok(sleepCalls.every(ms => ms === 10000), '每次 sleep 间隔 10 秒')
  console.log('  ✓ helper: primary fail x4 -> fallback success')
}

// === 2. helper 直测：primary + fallback 全失败 -> missing sample ===
{
  const { sleep, calls: sleepCalls } = createSleepStub()
  const adapter = createCountingAdapter({ primaryFails: 4, fallbackFails: 4 })
  const result = await attemptWeatherObservation({
    fetchPrimary: () => adapter.fetchCurrentWeather(),
    fetchFallback: () => adapter.fetchGridWeatherNow(),
    sleep,
    slotName: 'noon',
    sampledAt: '2026-06-18T14:30:00+08:00'
  })
  assert.equal(result.ok, false, '全失败后 ok=false')
  assert.equal(result.sourceKind, 'weather_now_sample_missing')
  assert.equal(result.weatherData, null)
  assert.ok(result.missingSample, '应返回 missingSample')
  assert.equal(result.missingSample.missing, true)
  assert.equal(result.missingSample.slotName, 'noon')
  assert.equal(result.missingSample.sampledAt, '2026-06-18T14:30:00+08:00')
  assert.equal(result.missingSample.sourceKind, 'weather_now_sample_missing')
  assert.ok(result.missingSample.failureReason, 'failureReason 应存在')
  assert.ok(result.missingSample.failureReason.includes('primary'), 'failureReason 含 primary')
  assert.ok(result.missingSample.failureReason.includes('fallback'), 'failureReason 含 fallback')
  assert.equal(adapter.primaryCalls(), 4)
  assert.equal(adapter.fallbackCalls(), 4)
  assert.equal(sleepCalls.length, 6, 'primary 3 + fallback 3 = 6 次 sleep')
  console.log('  ✓ helper: primary+fallback 全失败 -> missing sample')
}

// === 3. service 集成：primary fail x4 -> fallback 成功，写入 grid_weather_now_sample ===
{
  const { sleep, calls: sleepCalls } = createSleepStub()
  const storage = createMemoryStorage()
  const adapter = createCountingAdapter({ primaryFails: 4, fallbackFails: 0 })
  const service = createD0NowSampleService({
    storage,
    locationRepository: { async upsertLocation(loc) { return loc } },
    adapter,
    now: fixedNow,
    resolveLocationInput,
    sleep
  })

  const result = await service.sampleNowWeather({ ...baseInput, slotName: 'morning' })
  assert.equal(result.finalized, false)
  assert.equal(result.sample.sourceKind, 'grid_weather_now_sample', 'sample sourceKind 为 grid_weather_now_sample')
  assert.equal(result.sample.missing, undefined, '成功样本不带 missing')
  assert.equal(adapter.primaryCalls(), 4)
  assert.equal(adapter.fallbackCalls(), 1)
  assert.equal(sleepCalls.length, 3)

  const dayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  const dayFile = storage.store.get(dayPath)
  assert.equal(dayFile.samples.length, 1)
  assert.equal(dayFile.samples[0].sourceKind, 'grid_weather_now_sample')
  assert.equal(dayFile.latestSample.sourceKind, 'grid_weather_now_sample', 'latestSample 来自 fallback 成功')
  assert.equal(dayFile.latestSample.missing, undefined)
  console.log('  ✓ service: primary fail x4 -> fallback success 写入 grid_weather_now_sample')
}

// === 4. service 集成：primary+fallback 全失败 -> missing sample 写入，不抛出 ===
{
  const { sleep, calls: sleepCalls } = createSleepStub()
  const storage = createMemoryStorage()
  const adapter = createCountingAdapter({ primaryFails: 4, fallbackFails: 4 })
  const service = createD0NowSampleService({
    storage,
    locationRepository: { async upsertLocation(loc) { return loc } },
    adapter,
    now: fixedNow,
    resolveLocationInput,
    sleep
  })

  const result = await service.sampleNowWeather({ ...baseInput, slotName: 'noon' })
  assert.equal(result.finalized, false)
  assert.equal(result.sample.missing, true, '写入 missing sample')
  assert.equal(result.sample.sourceKind, 'weather_now_sample_missing')
  assert.equal(adapter.primaryCalls(), 4)
  assert.equal(adapter.fallbackCalls(), 4)
  assert.equal(sleepCalls.length, 6)

  const dayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  const dayFile = storage.store.get(dayPath)
  assert.equal(dayFile.samples.length, 1)
  assert.equal(dayFile.samples[0].missing, true)
  assert.equal(dayFile.quality, 'missing', '只有 missing 样本时 quality 仍为 missing')
  assert.equal(dayFile.latestSample, null, 'latestSample 不被 missing 覆盖，保持 null')
  console.log('  ✓ service: 全失败 -> missing sample 写入，latestSample=null，quality=missing')
}

// === 5. service 集成：later missing sample 不覆盖已有 latestSample ===
{
  const { sleep, calls: sleepCalls } = createSleepStub()
  const storage = createMemoryStorage()
  const adapter = createMutableAdapter()
  const service = createD0NowSampleService({
    storage,
    locationRepository: { async upsertLocation(loc) { return loc } },
    adapter,
    now: fixedNow,
    resolveLocationInput,
    sleep
  })

  // 第一次采样：primary 成功，写入 weather_now_sample
  adapter.setMode('primary_success')
  await service.sampleNowWeather({ ...baseInput, slotName: 'morning' })
  const dayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  let dayFile = storage.store.get(dayPath)
  assert.equal(dayFile.samples.length, 1)
  assert.equal(dayFile.latestSample.sourceKind, 'weather_now_sample')
  assert.equal(dayFile.latestSample.temp, 24)
  assert.equal(dayFile.quality, 'partial', '1 个成功样本 -> partial')

  // 第二次采样：primary + fallback 全失败，写入 missing sample
  adapter.setMode('all_fail')
  adapter.resetCalls()
  sleepCalls.length = 0
  const result2 = await service.sampleNowWeather({ ...baseInput, slotName: 'noon' })
  assert.equal(result2.sample.missing, true)
  assert.equal(adapter.calls.primary, 4)
  assert.equal(adapter.calls.fallback, 4)
  assert.equal(sleepCalls.length, 6)

  dayFile = storage.store.get(dayPath)
  assert.equal(dayFile.samples.length, 2, '1 成功 + 1 missing')
  assert.equal(dayFile.samples[0].sourceKind, 'weather_now_sample')
  assert.equal(dayFile.samples[1].missing, true)
  assert.equal(dayFile.samples[1].sourceKind, 'weather_now_sample_missing')
  // 关键：latestSample 仍指向第一次成功样本，未被 missing 覆盖
  assert.equal(dayFile.latestSample.sourceKind, 'weather_now_sample', 'latestSample 不被 missing 覆盖')
  assert.equal(dayFile.latestSample.temp, 24)
  assert.equal(dayFile.latestSample.missing, undefined)
  // quality 只按成功样本计数：1 个成功 -> partial
  assert.equal(dayFile.quality, 'partial')
  console.log('  ✓ service: later missing sample 不覆盖已有 latestSample，quality 只按成功样本计数')
}

console.log('now-sample-retry-fallback tests passed')
