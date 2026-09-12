'use strict'

// 共享 day file 读取与 latestSample 转 dailyRecord 工具。
// 从 weather-http/services/recent-weather-current.js 下沉到 layer；本文件作为对外统一入口，
// 内部按职责拆分为 paths / timeout / current-weather 三个子模块（layer 部署后 /opt/utils/ 下平铺，相对 require 同目录解析）。
//
// 本文件保留：
//   - latestSampleToDailyRecord：day file latestSample → dailyRecord（浇水 planner D0 注入用）
//   - createWeatherDayFileReader：D0 注入 reader 工厂
//   - injectD0IntoForecastDays：模块级懒单例 D0 注入器，供 plant-user-http / diagnose-http / watering-advisor 共用
// 并 re-export 子模块的对外 API，保持现有调用方无需改动 require 路径与命名导入。

const {
  addDays,
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
  formatLocalDateInTimezone,
  isPlainObject,
  normalizeDate,
  normalizeLocationKey
} = require('./weather-day-file-paths')
const {
  DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS,
  DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  downloadJsonWithTimeout,
  normalizeTimeoutMs,
  startStorageRead
} = require('./weather-day-file-timeout')
const {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  isUsableFinalizedDayFile,
  isUsableLatestSample
} = require('./weather-day-file-current-weather')

/**
 * 把 D0 当天 day file 的 latestSample 缓存转换为 dailyRecord，供浇水 planner 的 buildWeatherSummary 消费。
 * 字段映射不可变（architecture_invariants）：
 *   tempMax = tempMin = latestSample.temp
 *   humidity = latestSample.humidity
 *   precip = latestSample.precipLastHour
 *   textDay = latestSample.text
 *
 * @param {object} sample - day file 的 latestSample 对象
 * @param {string} date - YYYY-MM-DD 格式的 D0 日期
 * @returns {object} dailyRecord，含 date/tempMaxC/tempMinC/humidity/precipMm/textDay/sourceKind/missing
 */
function latestSampleToDailyRecord(sample = {}, date = '') {
  const safeSample = isPlainObject(sample) ? sample : {}
  return {
    date: String(date || ''),
    tempMaxC: safeSample.temp,
    tempMinC: safeSample.temp,
    humidity: safeSample.humidity,
    precipMm: safeSample.precipLastHour,
    textDay: safeSample.text || '',
    sourceKind: 'weather_now_sample',
    source: 'weather_cache_day_latest_sample',
    missing: false,
    cacheSource: 'day_latest_sample'
  }
}

/**
 * 创建 day file reader 工厂。
 *
 * readDailyRecordFromDayFile：读取指定日期 day file 的 latestSample 缓存并转换为 dailyRecord，
 *   只读 latestSample，不做 finalized fallback，用于浇水 planner D0 注入。
 *   与 getCurrentWeatherFromDailyArchive 不同：本函数只关心 latestSample 是否可用作 dailyRecord，
 *   不返回 current weather 字段。
 *
 * injectD0IntoForecast：读取 D0 day file latestSample，转换为 dailyRecord 并塞到 forecastDays 开头。
 *   调用方可传 D0..D+14；服务端会先去除调用方 D0，D0 缺失/超时时只保留 D+1..D+14。
 */
function createWeatherDayFileReader({ storage, now = () => new Date() } = {}) {
  if (!storage || typeof storage.downloadJson !== 'function') {
    throw new Error('createWeatherDayFileReader: storage with downloadJson is required')
  }

  async function readDailyRecordFromDayFile({ locationKey, date, readTimeoutMs } = {}) {
    const targetDate = normalizeDate(date)
    if (!targetDate) {
      return { dailyRecord: null, dayFile: null, reason: 'date_missing', timedOut: false }
    }
    const dayObjectPath = buildWeatherDayObjectPath(locationKey, targetDate)
    const timeout = normalizeTimeoutMs(
      readTimeoutMs,
      DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS
    )
    const primaryRead = startStorageRead(storage, { cloudPath: dayObjectPath, fileId: '' })
    const initialRead = await primaryRead.raceWith(timeout)
    // 对象存储冷读可能超过首个 600ms 窗口；在已有总预算内继续等待同一次读取，
    // 避免浇水首次打开因网络抖动误判 D0 缺失，同时不允许无限等待。
    const read = initialRead.timedOut
      ? await primaryRead.raceWith(DEFAULT_CURRENT_WEATHER_STORAGE_GRACE_TOTAL_MS)
      : initialRead
    if (read.timedOut) {
      return {
        dailyRecord: null,
        dayFile: null,
        reason: 'day_latest_sample_read_timeout',
        timedOut: true
      }
    }
    const dayFile = read.payload
    if (!isUsableLatestSample(dayFile)) {
      return { dailyRecord: null, dayFile, reason: 'day_latest_sample_missing', timedOut: false }
    }
    return {
      dailyRecord: latestSampleToDailyRecord(dayFile.latestSample, targetDate),
      dayFile,
      reason: 'day_latest_sample_present',
      timedOut: false
    }
  }

  /**
   * 读取 D0 最新缓存 latestSample 并注入 forecastDays 开头。
   * 返回 { forecastDays, todayWeatherSource, todayWeatherRecord, todayWeatherReason }
   * - todayWeatherSource: 'day_latest_sample' | 'missing'
   * - 命中时 forecastDays = [d0Record, ...futureForecastDays]（最多 15 项）
   * - 缺失/超时时过滤掉调用方传入的 D0，保留 D+1..D+14，避免伪造或过期 D0 进入计算
   */
  async function injectD0IntoForecast({
    locationKey,
    date,
    forecastDays = [],
    timezone = 'Asia/Shanghai',
    readTimeoutMs
  } = {}) {
    const referenceDate = date || formatLocalDateInTimezone(now(), timezone)
    const result = await readDailyRecordFromDayFile({
      locationKey,
      date: referenceDate,
      readTimeoutMs
    })
    const futureForecastDays = Array.isArray(forecastDays)
      ? forecastDays
          .filter(item => String(item?.date || item?.fxDate || '').slice(0, 10) !== referenceDate)
          .slice(0, 14)
      : []
    if (result.dailyRecord) {
      return {
        forecastDays: [result.dailyRecord, ...futureForecastDays],
        todayWeatherSource: 'day_latest_sample',
        todayWeatherRecord: result.dailyRecord,
        todayWeatherReason: result.reason,
        referenceDate
      }
    }
    return {
      forecastDays: futureForecastDays,
      todayWeatherSource: 'missing',
      todayWeatherRecord: null,
      todayWeatherReason: result.reason,
      referenceDate
    }
  }

  return {
    readDailyRecordFromDayFile,
    injectD0IntoForecast,
    latestSampleToDailyRecord
  }
}

// ===== D0 注入器（模块级懒单例）：供 plant-user-http / diagnose-http 共用 =====
// 延迟 require weather-object-storage 避免加载顺序依赖；模块级单例确保首次调用后复用 storage + reader。
let _sharedD0Storage = null
let _sharedD0Reader = null

function getSharedD0Reader() {
  if (!_sharedD0Reader) {
    // layer 部署后 /opt/utils/ 下文件平铺，相对路径指向同目录；本地测试时 cloudfunctions/layer/utils/ 同目录。
    const { createWeatherObjectStorage } = require('./weather-object-storage')
    _sharedD0Storage = createWeatherObjectStorage()
    _sharedD0Reader = createWeatherDayFileReader({ storage: _sharedD0Storage })
  }
  return _sharedD0Reader
}

/**
 * 把 D0 当天最新缓存 latestSample 注入 forecastDays 开头，供 buildWeatherSummary 消费。
 * - 调用方可以传完整 D0..D+14；本函数先剔除调用方 D0，再用 day file 的 latestSample 覆盖
 * - 命中：forecastDays = [权威 d0Record, ...D+1..D+14]（15 项），todayWeatherSource='day_latest_sample'
 * - 缺失/超时/无 locationKey：只保留 D+1..D+14（最多 14 项），todayWeatherSource='missing'
 *
 * 三个浇水 planner 入口（diagnose-http buildEnvironmentCareContextV7 / plant-user-http /watering-planner / /watering-advisor）
 * 共用此函数，确保 D0 注入与时区修正逻辑一致。
 *
 * @param {object} params
 * @param {string} params.locationKey - 地点 key
 * @param {string} params.timezone - 时区，默认 Asia/Shanghai
 * @param {string} params.referenceDate - D0 日期 YYYY-MM-DD（空则按 timezone 解析当前日期）
 * @param {Array}  params.forecastDays - 前端传入的 D0..D+14 天气数组；D0 会被服务端校验并去重
 * @returns {Promise<{forecastDays: Array, todayWeatherSource: string, todayWeatherRecord: object|null, todayWeatherReason: string, referenceDate: string}>}
 */
async function injectD0IntoForecastDays({
  locationKey = '',
  timezone = 'Asia/Shanghai',
  referenceDate = '',
  forecastDays = []
} = {}) {
  const resolvedTimezone = String(timezone || 'Asia/Shanghai').trim() || 'Asia/Shanghai'
  const resolvedReferenceDate =
    String(referenceDate || '').trim() || formatLocalDateInTimezone(new Date(), resolvedTimezone)
  const trimmedLocationKey = String(locationKey || '').trim()
  if (!trimmedLocationKey) {
    return {
      forecastDays: Array.isArray(forecastDays)
        ? forecastDays
            .filter(
              item =>
                String(item?.date || item?.fxDate || '').slice(0, 10) !== resolvedReferenceDate
            )
            .slice(0, 14)
        : [],
      todayWeatherSource: 'missing',
      todayWeatherRecord: null,
      todayWeatherReason: 'location_key_missing',
      referenceDate: resolvedReferenceDate
    }
  }
  const reader = getSharedD0Reader()
  const futureForecastDays = Array.isArray(forecastDays)
    ? forecastDays.filter(
        item => String(item?.date || item?.fxDate || '').slice(0, 10) !== resolvedReferenceDate
      )
    : []
  const result = await reader.injectD0IntoForecast({
    locationKey: trimmedLocationKey,
    date: resolvedReferenceDate,
    forecastDays: futureForecastDays.slice(0, 14),
    timezone: resolvedTimezone
  })
  return result
}

module.exports = {
  addDays,
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  buildRecentWeatherObjectPath,
  buildWeatherDayObjectPath,
  createCurrentWeatherArchiveService,
  createWeatherDayFileReader,
  downloadJsonWithTimeout,
  formatLocalDateInTimezone,
  injectD0IntoForecastDays,
  isUsableFinalizedDayFile,
  isUsableLatestSample,
  latestSampleToDailyRecord,
  normalizeDate,
  normalizeLocationKey
}
