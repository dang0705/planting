import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
const storageObjects = new Map()
const storageObjectsByFileId = new Map()
let nowCallCount = 0
let failBeijingStorage = false

function buildMissingStorageError() {
  const error = new Error('storage file not found')
  error.code = 'STORAGE_FILE_NONEXIST'
  return error
}

const fakeCloudbaseApp = {
  async downloadFile({ fileID }) {
    const payload = storageObjectsByFileId.get(fileID)
    if (!payload) {
      throw buildMissingStorageError()
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  },
  async uploadFile({ cloudPath, fileContent }) {
    if (failBeijingStorage && /locations\/city:beijing\/days\//.test(cloudPath)) {
      throw new Error('beijing storage upload forced failure')
    }
    const chunks = []
    await new Promise((resolve, reject) => {
      fileContent.on('data', chunk => chunks.push(Buffer.from(chunk)))
      fileContent.on('end', resolve)
      fileContent.on('error', reject)
    })
    const fileID = `cloud://${cloudPath}`
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    storageObjects.set(cloudPath, payload)
    storageObjectsByFileId.set(fileID, payload)
    return { fileID }
  },
  async downloadFileByCloudPath({ cloudPath }) {
    const payload = storageObjects.get(cloudPath)
    if (!payload) {
      throw buildMissingStorageError()
    }
    return { fileContent: Buffer.from(JSON.stringify(payload), 'utf8') }
  },
  async getUploadMetadata({ cloudPath }) {
    if (storageObjects.has(cloudPath)) {
      return { data: { fileId: `cloud://${cloudPath}` } }
    }
    throw buildMissingStorageError()
  },
  async deleteFile({ fileList }) {
    for (const fileID of fileList) {
      storageObjectsByFileId.delete(fileID)
    }
    return { fileList: [] }
  }
}

Module._load = function patchedWeatherD0TimerLoad(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      getCloudBase: () => fakeCloudbaseApp,
      models: {
        async $runSQL() {
          return { data: { executeResultList: [] } }
        }
      }
    }
  }

  if (request === '/opt/utils/http') {
    return {
      jsonResponse(statusCode, payload) {
        return { statusCode, body: JSON.stringify(payload) }
      },
      notFound(path) {
        return { statusCode: 404, body: JSON.stringify({ code: 404, path }) }
      },
      methodNotAllowed(method) {
        return { statusCode: 405, body: JSON.stringify({ code: 405, method }) }
      },
      getHttpRequestData(event) {
        return event
      },
      resolveRequestAppEnv() {
        return 'production'
      },
      runWithRequestAppEnv(_appEnv, runner) {
        return runner()
      }
    }
  }

  // 拦截 qweather-adapter，模拟 /v7/weather/now
  if (request === '../adapters/qweather-adapter' || request === './adapters/qweather-adapter') {
    return {
      createQWeatherAdapter: () => ({
        async fetchCurrentWeather() {
          nowCallCount += 1
          return {
            tempC: 25,
            humidity: 60,
            text: '晴',
            obsTime: '2026-06-18T09:30:00+08:00',
            source: 'qweather_weather_now'
          }
        },
        async fetchForecast10d() {
          return { raw: {}, daily: [] }
        },
        async fetchWeather24h() {
          return { raw: {}, hourly: [] }
        }
      })
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

try {
  // 1) scheduler config 保留新固定 D0 timer triggers；weather-http config 不再有 timer triggers
  const schedulerConfig = JSON.parse(
    readFileSync('cloudfunctions/weather-ingestion-scheduler/config.json', 'utf8')
  )
  const schedulerTriggersByName = new Map(schedulerConfig.triggers.map(t => [t.name, t]))
  // 新固定定时器名与 cron
  assert.equal(schedulerTriggersByName.has('weather-d0-now-sunrise-sweep'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-sunrise-sweep').config, '0 */10 4-7 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-morning-0720'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-morning-0720').config, '0 20 7 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-forenoon-1120'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-forenoon-1120').config, '0 20 11 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-noon-1420'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-noon-1420').config, '0 20 14 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-afternoon-1620'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-afternoon-1620').config, '0 20 16 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-sunset-sweep'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-sunset-sweep').config, '0 */10 17-20 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-finalize-2130'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-finalize-2130').config, '0 30 21 * * * *')
  // 旧定时器名不应存在
  assert.equal(schedulerTriggersByName.has('weather-d0-now-morning-0920'), false, '旧 morning-0920 不应存在')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-forenoon-1220'), false, '旧 forenoon-1220 不应存在')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-afternoon-1820'), false, '旧 afternoon-1820 不应存在')
  assert.equal(schedulerTriggersByName.has('weather-ingestion-recent-10d'), true)

  const httpConfig = JSON.parse(readFileSync('cloudfunctions/weather-http/config.json', 'utf8'))
  assert.equal(httpConfig.triggers.length, 0, 'weather-http 不再保留任何 timer trigger')

  const {
    HOT_CITY_WEATHER_LOCATIONS
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/hot-city-locations.js')
  const {
    buildWeatherDayObjectPath
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/weather-cache-paths.js')
  const {
    buildD0TimerAuditPath
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/d0-slot-paths.js')
  const {
    isD0Weather24hTimerEvent
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/routes/recent-weather-routes.js')
  const {
    createRecentWeatherService
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/recent-weather-service.js')
  const schedulerApp = require('../../../../cloudfunctions/weather-ingestion-scheduler/app.js')

  // 2) sunrise/sunset 动态触发器是 D0 第一枪/最后一枪，应被识别为 D0 timer 事件
  assert.equal(
    isD0Weather24hTimerEvent({
      Type: 'Timer',
      TriggerName: 'weather-d0-now-sunrise__city_shanghai'
    }),
    true,
    'sunrise 动态触发器应被识别为 D0 timer 事件'
  )
  assert.equal(
    isD0Weather24hTimerEvent({
      Type: 'Timer',
      TriggerName: 'weather-d0-now-sunset__city_shanghai'
    }),
    true,
    'sunset 动态触发器应被识别为 D0 timer 事件'
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-morning-0720' }),
    true,
    '新固定 morning-0720 应被识别为 D0 timer 事件'
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-sunrise-sweep' }),
    true,
    'sunrise sweep 应被识别为 D0 timer 事件'
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-sunset-sweep' }),
    true,
    'sunset sweep 应被识别为 D0 timer 事件'
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-sunrise' }),
    false
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-finalize-2130' }),
    true,
    'finalize-2130 应被识别为 D0 timer 事件'
  )

  // 2a) sunset 是 D0 最后一枪 sample，不是 finalize
  const sunsetResponse = await schedulerApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-sunset__city_shanghai', targetDate: '2026-06-19' },
    {}
  )
  assert.equal(sunsetResponse.code, 200)
  assert.equal(sunsetResponse.data.finalized, false)
  assert.equal(sunsetResponse.data.attempted, 1)
  assert.equal(sunsetResponse.data.cities[0].slotName, 'sunset')
  const sunsetDayFile = storageObjects.get(buildWeatherDayObjectPath('city:shanghai', '2026-06-19'))
  assert.equal(sunsetDayFile.samples.some(sample => sample.slotName === 'sunset'), true)
  assert.equal(sunsetDayFile.samples.some(sample => sample.slotName === 'finalize'), false)

  // batchSize=5：20 城需要 4 批推进，验证 manifest cursor 跨 invocation 持久化
  nowCallCount = 0
  process.env.WEATHER_D0_SLOT_BATCH_SIZE = '5'

  // 3) working 定时器：分批推进直到 completed
  let workingResponse
  let workingIterations = 0
  do {
    workingResponse = await schedulerApp.main(
      { Type: 'Timer', TriggerName: 'weather-d0-now-noon-1420', targetDate: '2026-06-18' },
      {}
    )
    workingIterations += 1
    assert.ok(workingIterations <= 10, 'working 批次推进超过预期')
  } while (!workingResponse.data.completed)

  assert.equal(workingResponse.code, 200)
  assert.equal(workingResponse.data.triggerName, 'weather-d0-now-noon-1420')
  assert.equal(workingResponse.data.finalized, false)
  assert.equal(workingResponse.data.totalCities, 20)
  assert.equal(workingResponse.data.cursor, 20)
  assert.equal(workingResponse.data.completed, true)
  assert.equal(workingIterations, 4, '20城 batchSize=5 应该 4 批完成')
  assert.equal(nowCallCount, 20, '4 批合计调用 fetchCurrentWeather 20 次')
  assert.equal(
    HOT_CITY_WEATHER_LOCATIONS.every(city =>
      storageObjects.has(buildWeatherDayObjectPath(city.key, '2026-06-18'))
    ),
    true,
    'all cities should have days/{date}.json'
  )

  // 验证 day file 结构
  const shanghaiDayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  const shanghaiDayFile = storageObjects.get(shanghaiDayPath)
  assert.equal(shanghaiDayFile.state, 'working')
  assert.equal(shanghaiDayFile.sourceKind, 'observed_now_samples')
  assert.ok(shanghaiDayFile.samples.length > 0, 'should have samples')
  assert.equal(shanghaiDayFile.samples[0].slotName, 'noon')
  assert.ok(shanghaiDayFile.latestSample, 'should have latestSample')
  assert.equal(shanghaiDayFile.latestSample.sourceKind, 'weather_now_sample')

  // 3a) 重复同 slot 调用不得产生两个有效相同样本；
  // 同时覆盖线上旧文件已存在重复 slot 和 Z 时间字段的清理。
  storageObjects.set(shanghaiDayPath, {
    ...shanghaiDayFile,
    generatedAt: '2026-06-17T23:20:00.000Z',
    samples: [
      ...shanghaiDayFile.samples,
      {
        ...shanghaiDayFile.samples[0],
        sampledAt: '2026-06-18T05:20:00.000Z',
        obsTime: '2026-06-18T05:12:00.000Z'
      }
    ]
  })
  nowCallCount = 0
  const directSampleService = createRecentWeatherService({
    apiKey: 'test-key',
    baseUrl: 'https://test.qweatherapi.com',
    now: () => new Date('2026-06-18T14:20:00+08:00')
  })
  const repeatResponse = await directSampleService.sampleNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18',
    slotName: 'noon'
  })
  assert.equal(repeatResponse.slotName, 'noon')
  const repeatDayFile = storageObjects.get(shanghaiDayPath)
  const noonSamples = repeatDayFile.samples.filter(s => s.slotName === 'noon' && !s.missing)
  assert.equal(noonSamples.length, 1, '重复同 slot 调用不得产生两个有效 noon 样本')
  assert.ok(
    repeatDayFile.generatedAt && !repeatDayFile.generatedAt.endsWith('Z'),
    `旧 generatedAt 应被归一为本地 ISO 字符串, got ${repeatDayFile.generatedAt}`
  )
  assert.equal(
    repeatDayFile.samples.every(sample => !String(sample.sampledAt || '').endsWith('Z')),
    true,
    '旧 sampledAt 应被归一为本地 ISO 字符串'
  )

  // 3b) day file 时间字段使用本地 ISO 字符串（不以 Z 结尾）
  assert.ok(
    shanghaiDayFile.generatedAt && !shanghaiDayFile.generatedAt.endsWith('Z'),
    `generatedAt 应为本地 ISO 字符串不以 Z 结尾, got ${shanghaiDayFile.generatedAt}`
  )
  assert.ok(
    shanghaiDayFile.updatedAt && !shanghaiDayFile.updatedAt.endsWith('Z'),
    `updatedAt 应为本地 ISO 字符串不以 Z 结尾, got ${shanghaiDayFile.updatedAt}`
  )
  assert.ok(
    shanghaiDayFile.samples[0].sampledAt && !shanghaiDayFile.samples[0].sampledAt.endsWith('Z'),
    `sampledAt 应为本地 ISO 字符串不以 Z 结尾, got ${shanghaiDayFile.samples[0].sampledAt}`
  )
  assert.ok(
    shanghaiDayFile.samples[0].obsTime && !shanghaiDayFile.samples[0].obsTime.endsWith('Z'),
    `obsTime 应为本地 ISO 字符串不以 Z 结尾, got ${shanghaiDayFile.samples[0].obsTime}`
  )

  // 4) 显式 finalize 路由：通过 /weather/v7/weather/24h finalize=true 触发
  //    finalize 不调用 QWeather /now，仅从已有 samples[] 生成 dailyRollup
  const d0NowSampleService = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/d0-now-sample-service.js')
  const { createD0NowSampleService } = d0NowSampleService
  const finalizeStorage = {
    store: new Map(),
    async downloadJson({ cloudPath }) { return this.store.get(cloudPath) || null },
    async uploadJson({ cloudPath, payload }) { this.store.set(cloudPath, payload); return { cloudPath, fileId: `cloud://${cloudPath}` } }
  }
  const finalizeService = createD0NowSampleService({
    storage: finalizeStorage,
    locationRepository: { async upsertLocation(loc) { return loc } },
    adapter: {
      async fetchCurrentWeather() { throw new Error('finalize 不得调用 fetchCurrentWeather') },
      async fetchGridWeatherNow() { throw new Error('finalize 不得调用 fetchGridWeatherNow') }
    },
    now: () => new Date('2026-06-18T18:00:00+08:00'),
    resolveLocationInput: (input) => ({
      locationKey: input.locationKey || 'city:shanghai',
      cityName: input.cityName || '上海',
      latitude: input.latitude ?? 0,
      longitude: input.longitude ?? 0,
      timezone: input.timezone || 'Asia/Shanghai',
      isActive: true
    }),
    sleep: async () => {}
  })
  // 先写入已有样本
  const finalizeDayPath = buildWeatherDayObjectPath('city:shanghai', '2026-06-18')
  finalizeStorage.store.set(finalizeDayPath, {
    schemaVersion: 'weather-cache/v1/day-now-sample',
    locationKey: 'city:shanghai',
    date: '2026-06-18',
    timezone: 'Asia/Shanghai',
    state: 'working',
    samples: [
      { slotName: 'morning', temp: 22, humidity: 60, sampledAt: '2026-06-18T07:20:00+08:00', sourceKind: 'weather_now_sample' },
      { slotName: 'noon', temp: 28, humidity: 55, sampledAt: '2026-06-18T14:20:00+08:00', sourceKind: 'weather_now_sample' }
    ],
    latestSample: { slotName: 'noon', temp: 28 },
    sunWindow: { sunrise: '2026-06-18T05:00:00+08:00', sunset: '2026-06-18T19:00:00+08:00' },
    sourceKind: 'observed_now_samples',
    quality: 'partial',
    weatherObjectPath: finalizeDayPath
  })
  const finalizeResult = await finalizeService.finalizeNowWeather({
    locationKey: 'city:shanghai',
    cityName: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
    targetDate: '2026-06-18'
  })
  assert.equal(finalizeResult.finalized, true)
  const finalizedDayFile = finalizeStorage.store.get(finalizeDayPath)
  assert.equal(finalizedDayFile.state, 'finalized')
  assert.equal(finalizedDayFile.sourceKind, 'observed_now_rollup')
  assert.ok(finalizedDayFile.dailyRollup, 'finalize 必须生成 dailyRollup')
  assert.ok(finalizedDayFile.finalizedAt, 'finalize 必须设置 finalizedAt')
  assert.ok(!finalizedDayFile.finalizedAt.endsWith('Z'), 'finalizedAt 应为本地 ISO 字符串')
  // finalize 不产生 slotName=finalize 样本
  assert.equal(
    finalizedDayFile.samples.some(s => s.slotName === 'finalize'),
    false,
    'days/{date}.json.samples[] 不得包含 slotName=finalize'
  )

  process.env.WEATHER_HOT_CITY_INGESTION_KEYS = 'city:shanghai'
  const finalizeTimerResponse = await schedulerApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-finalize-2130', targetDate: '2026-06-18' },
    {}
  )
  assert.equal(finalizeTimerResponse.code, 200)
  assert.equal(finalizeTimerResponse.data.finalized, true)
  assert.equal(finalizeTimerResponse.data.attempted, 1)
  assert.equal(finalizeTimerResponse.data.succeeded, 1)
  assert.equal(finalizeTimerResponse.data.failed, 0)
  assert.equal(finalizeTimerResponse.data.cities[0].locationKey, 'city:shanghai')
  assert.equal(
    finalizeTimerResponse.data.cities[0].recentObjectPath,
    'weather-cache/v1/locations/city:shanghai/recent-10d.json'
  )
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/recent-10d.json'),
    true,
    'finalize timer 成功后应预生成 recent-10d'
  )
  delete process.env.WEATHER_HOT_CITY_INGESTION_KEYS

  // 5) 审计日志：4 working = 4 records
  const auditPath = buildD0TimerAuditPath({ date: '2026-06-18' })
  const auditFile = storageObjects.get(auditPath)
  assert.ok(auditFile, '应有审计日志文件')
  assert.ok(auditFile.records.length >= 4, '至少 4 条审计记录（4 working）')
  assert.equal(auditFile.summary.success >= 4, true)
  assert.equal(auditFile.summary.failure, 0)
  assert.equal(auditFile.summary.ignored, 0)

  // 审计时间字段使用本地 ISO 字符串
  for (const record of auditFile.records) {
    assert.ok(record.startAt, 'record 应有 startAt')
    assert.ok(record.endAt, 'record 应有 endAt')
    assert.ok(!record.startAt.endsWith('Z'), 'startAt 应为本地 ISO 字符串')
    assert.ok(!record.endAt.endsWith('Z'), 'endAt 应为本地 ISO 字符串')
    assert.ok(
      ['success', 'failure'].includes(record.status),
      'D0 record status 应为 success/failure'
    )
    assert.ok(record.sourceKind, 'record 应有 sourceKind')
    assert.equal(typeof record.errorSummary, 'string', 'record 应有 errorSummary（字符串）')
    assert.match(record.errorSummary, /^failed:\d+/, 'errorSummary 应以 failed:N 开头')
    assert.equal(typeof record.attempted, 'number')
    assert.ok(Array.isArray(record.cities), 'record 应有 cities summary')
  }

  // 6) 被忽略事件也要写审计：status=ignored
  const ignoredResponse = await schedulerApp.main(
    { Type: 'Unknown', TriggerName: 'unrecognized-trigger' },
    {}
  )
  assert.equal(ignoredResponse.code, 200)
  assert.equal(ignoredResponse.data.ignored, true)

  // 被忽略事件 audit 按当天日期聚合
  const {
    resolveTargetDate
  } = require('../../../../cloudfunctions/weather-ingestion-scheduler/services/d0-slot-manifest.js')
  const todayAuditPath = buildD0TimerAuditPath({ date: resolveTargetDate('') })
  const todayAuditFile = storageObjects.get(todayAuditPath)
  assert.ok(todayAuditFile, '被忽略事件应写入当天审计日志')
  const ignoredRecord = todayAuditFile.records.find(r => r.status === 'ignored')
  assert.ok(ignoredRecord, '应有一条 status=ignored 的审计记录')
  assert.equal(ignoredRecord.triggerName, 'unrecognized-trigger')
  assert.equal(ignoredRecord.sourceKind, 'weather_timer_ignored', 'ignored record 应有 sourceKind')
  assert.equal(typeof ignoredRecord.errorSummary, 'string', 'ignored record 应有 errorSummary')
  assert.match(ignoredRecord.errorSummary, /^failed:\d+/, 'ignored errorSummary 应以 failed:N 开头')
  assert.equal(ignoredRecord.attempted, 0)
  assert.ok(!ignoredRecord.startAt.endsWith('Z'), 'ignored startAt 应为本地 ISO 字符串')

  // 7) 失败场景：某批存在失败城市时，audit status 必须是 failure
  failBeijingStorage = true
  const failureResponse = await schedulerApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-noon-1420', targetDate: '2026-06-19' },
    {}
  )
  failBeijingStorage = false
  assert.equal(failureResponse.code, 200)
  assert.equal(failureResponse.data.failed, 1, '北京应失败')
  assert.equal(failureResponse.data.succeeded, 4, '其余4城成功')

  const failureAuditPath = buildD0TimerAuditPath({ date: '2026-06-19' })
  const failureAuditFile = storageObjects.get(failureAuditPath)
  assert.ok(failureAuditFile, '失败场景应有审计日志')
  const failureRecord = failureAuditFile.records.find(r => r.status === 'failure')
  assert.ok(failureRecord, '应有一条 status=failure 的审计记录')
  assert.ok(failureRecord.sourceKind, 'failure record 应有 sourceKind')
  assert.match(failureRecord.errorSummary, /^failed:1/, 'errorSummary 应含失败城市数 failed:1')
  assert.match(
    failureRecord.errorSummary,
    /beijing storage upload forced failure/,
    'errorSummary 应含首个错误信息'
  )
  assert.equal(failureAuditFile.summary.failure, 1, 'summary.failure 应为 1')
} finally {
  Module._load = originalLoad
  delete process.env.WEATHER_D0_SLOT_BATCH_SIZE
}

console.log('weather-d0-24h-timers tests passed')
