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
  // 1) scheduler config 保留 D0 timer triggers；weather-http config 不再有 timer triggers
  const schedulerConfig = JSON.parse(
    readFileSync('cloudfunctions/weather-ingestion-scheduler/config.json', 'utf8')
  )
  const schedulerTriggersByName = new Map(schedulerConfig.triggers.map(t => [t.name, t]))
  assert.equal(schedulerTriggersByName.has('weather-d0-now-sunrise'), false)
  assert.equal(schedulerTriggersByName.has('weather-d0-now-morning-0920'), true)
  assert.equal(schedulerTriggersByName.get('weather-d0-now-morning-0920').config, '0 20 9 * * * *')
  assert.equal(schedulerTriggersByName.has('weather-d0-now-finalize-2130'), false)
  assert.equal(schedulerTriggersByName.has('weather-ingestion-recent-10d'), true)

  const httpConfig = JSON.parse(readFileSync('cloudfunctions/weather-http/config.json', 'utf8'))
  assert.equal(httpConfig.triggers.length, 0, 'weather-http 不再保留任何 timer trigger')

  const {
    HOT_CITY_WEATHER_LOCATIONS
  } = require('../../cloudfunctions/weather-ingestion-scheduler/services/hot-city-locations.js')
  const {
    buildWeatherDayObjectPath
  } = require('../../cloudfunctions/weather-ingestion-scheduler/services/weather-cache-paths.js')
  const {
    buildD0TimerAuditPath
  } = require('../../cloudfunctions/weather-ingestion-scheduler/services/d0-slot-paths.js')
  const {
    isD0Weather24hTimerEvent
  } = require('../../cloudfunctions/weather-ingestion-scheduler/routes/recent-weather-routes.js')
  const schedulerApp = require('../../cloudfunctions/weather-ingestion-scheduler/app.js')
  assert.equal(
    isD0Weather24hTimerEvent({
      Type: 'Timer',
      TriggerName: 'weather-d0-now-sunrise__city_shanghai'
    }),
    true
  )
  assert.equal(
    isD0Weather24hTimerEvent({
      Type: 'Timer',
      TriggerName: 'weather-d0-now-sunset__city_shanghai'
    }),
    true
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-sunrise' }),
    false
  )
  assert.equal(
    isD0Weather24hTimerEvent({ Type: 'Timer', TriggerName: 'weather-d0-now-finalize-2130' }),
    false
  )

  // batchSize=5：20 城需要 4 批推进，验证 manifest cursor 跨 invocation 持久化
  process.env.WEATHER_D0_SLOT_BATCH_SIZE = '5'

  // 2) per-city sunrise 定时器：只处理 trigger 指定城市，不得全量跑所有热城市
  const sunriseResponse = await schedulerApp.main(
    {
      Type: 'Timer',
      TriggerName: 'weather-d0-now-sunrise__city_shanghai',
      targetDate: '2026-06-19'
    },
    {}
  )
  assert.equal(sunriseResponse.code, 200)
  assert.equal(sunriseResponse.data.triggerName, 'weather-d0-now-sunrise__city_shanghai')
  assert.equal(sunriseResponse.data.totalCities, 1)
  assert.equal(sunriseResponse.data.succeeded, 1)
  assert.equal(storageObjects.has(buildWeatherDayObjectPath('city:shanghai', '2026-06-19')), true)
  assert.equal(storageObjects.has(buildWeatherDayObjectPath('city:beijing', '2026-06-19')), false)
  nowCallCount = 0

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

  // 3) sunset 定时器：只 finalize trigger 指定城市
  const finalizeResponse = await schedulerApp.main(
    { Type: 'Timer', TriggerName: 'weather-d0-now-sunset__city_shanghai', targetDate: '2026-06-18' },
    {}
  )

  assert.equal(finalizeResponse.code, 200)
  assert.equal(finalizeResponse.data.triggerName, 'weather-d0-now-sunset__city_shanghai')
  assert.equal(finalizeResponse.data.finalized, true)
  assert.equal(finalizeResponse.data.completed, true)
  assert.equal(finalizeResponse.data.totalCities, 1)

  // 验证 finalize 后的 day file
  const finalizedDayFile = storageObjects.get(shanghaiDayPath)
  assert.equal(finalizedDayFile.state, 'finalized')
  assert.equal(finalizedDayFile.sourceKind, 'observed_now_rollup')
  assert.ok(finalizedDayFile.dailyRollup, 'should have dailyRollup')
  assert.ok(finalizedDayFile.finalizedAt, 'should have finalizedAt')
  assert.equal(
    storageObjects.has('weather-cache/v1/locations/city:shanghai/recent-10d.json'),
    false,
    'finalize should not write recent-10d'
  )

  // 4) 审计日志：4 working + 1 sunset finalize = 5 records，按日期聚合到同一 JSON
  const auditPath = buildD0TimerAuditPath({ date: '2026-06-18' })
  const auditFile = storageObjects.get(auditPath)
  assert.ok(auditFile, '应有审计日志文件')
  assert.equal(auditFile.records.length, 5, '5 条审计记录（4 working + 1 sunset finalize）')
  assert.equal(auditFile.summary.totalInvocations, 5)
  assert.equal(auditFile.summary.success, 5, '5 条全部 success（20城 working + 上海 sunset finalize 无失败）')
  assert.equal(auditFile.summary.failure, 0)
  assert.equal(auditFile.summary.ignored, 0)

  // 验证每条记录有 startAt/endAt/status/sourceKind/errorSummary/cities summary
  for (const record of auditFile.records) {
    assert.ok(record.recordId, 'record 应有 recordId')
    assert.ok(record.startAt, 'record 应有 startAt')
    assert.ok(record.endAt, 'record 应有 endAt')
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

  // 5) 被忽略事件也要写审计：status=ignored
  const ignoredResponse = await schedulerApp.main(
    { Type: 'Unknown', TriggerName: 'unrecognized-trigger' },
    {}
  )
  assert.equal(ignoredResponse.code, 200)
  assert.equal(ignoredResponse.data.ignored, true)

  // 被忽略事件 audit 按当天日期聚合
  const {
    resolveTargetDate
  } = require('../../cloudfunctions/weather-ingestion-scheduler/services/d0-slot-manifest.js')
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

  // 6) 失败场景：某批存在失败城市时，audit status 必须是 failure（不是 success/advanced/completed）
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
