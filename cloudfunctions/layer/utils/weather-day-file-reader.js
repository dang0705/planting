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
  DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS,
  downloadJsonWithTimeout,
  normalizeTimeoutMs
} = require('./weather-day-file-timeout')
const {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  isUsableFinalizedDayFile,
  isUsableLatestSample
} = require('./weather-day-file-current-weather')

/**
 * 把 D0 day file 的 latestSample 转换为 dailyRecord，供浇水 planner 的 buildWeatherSummary 消费。
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
 * readDailyRecordFromDayFile：读取指定日期 day file 的 latestSample 并转换为 dailyRecord，
 *   只读 latestSample，不做 finalized fallback，用于浇水 planner D0 注入。
 *   与 getCurrentWeatherFromDailyArchive 不同：本函数只关心 latestSample 是否可用作 dailyRecord，
 *   不返回 current weather 字段。
 *
 * injectD0IntoForecast：读取 D0 day file latestSample，转换为 dailyRecord 并塞到 forecastDays 开头。
 *   D0 缺失/超时返回 todayWeatherSource='missing'，forecastDays 不变（仍为 14 项），summary 按 14 天统计。
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
    const timeout = normalizeTimeoutMs(readTimeoutMs, DEFAULT_CURRENT_WEATHER_STORAGE_READ_TIMEOUT_MS)
    const read = await downloadJsonWithTimeout(
      storage,
      { cloudPath: dayObjectPath, fileId: '' },
      timeout
    )
    if (read.timedOut) {
      return { dailyRecord: null, dayFile: null, reason: 'day_latest_sample_read_timeout', timedOut: true }
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
   * 读取 D0 latestSample 并注入 forecastDays 开头。
   * 返回 { forecastDays, todayWeatherSource, todayWeatherRecord, todayWeatherReason }
   * - todayWeatherSource: 'day_latest_sample' | 'missing'
   * - 命中时 forecastDays = [d0Record, ...originalForecastDays]（15 项）
   * - 缺失/超时时 forecastDays = originalForecastDays（不变，14 项），summary 按 14 天统计
   */
  async function injectD0IntoForecast({
    locationKey,
    date,
    forecastDays = [],
    timezone = 'Asia/Shanghai',
    readTimeoutMs
  } = {}) {
    const referenceDate = date || formatLocalDateInTimezone(now(), timezone)
    const result = await readDailyRecordFromDayFile({ locationKey, date: referenceDate, readTimeoutMs })
    if (result.dailyRecord) {
      return {
        forecastDays: [result.dailyRecord, ...forecastDays],
        todayWeatherSource: 'day_latest_sample',
        todayWeatherRecord: result.dailyRecord,
        todayWeatherReason: result.reason,
        referenceDate
      }
    }
    return {
      forecastDays,
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
 * 把 D0 day file 的 latestSample 注入 forecastDays 开头，供 buildWeatherSummary 消费。
 * - 命中：forecastDays = [d0Record, ...originalForecastDays]（15 项），todayWeatherSource='day_latest_sample'
 * - 缺失/超时/无 locationKey：forecastDays 不变（14 项），todayWeatherSource='missing'，summary 按 14 天统计
 *
 * 三个浇水 planner 入口（diagnose-http buildEnvironmentCareContextV7 / plant-user-http /watering-planner / /watering-advisor）
 * 共用此函数，确保 D0 注入与时区修正逻辑一致。
 *
 * @param {object} params
 * @param {string} params.locationKey - 地点 key
 * @param {string} params.timezone - 时区，默认 Asia/Shanghai
 * @param {string} params.referenceDate - D0 日期 YYYY-MM-DD（空则按 timezone 解析当前日期）
 * @param {Array}  params.forecastDays - 前端传入的 D+1..D+14 预报数组（14 项，不含 D0）
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
    String(referenceDate || '').trim() ||
    formatLocalDateInTimezone(new Date(), resolvedTimezone)
  const trimmedLocationKey = String(locationKey || '').trim()
  if (!trimmedLocationKey) {
    return {
      forecastDays,
      todayWeatherSource: 'missing',
      todayWeatherRecord: null,
      todayWeatherReason: 'location_key_missing',
      referenceDate: resolvedReferenceDate
    }
  }
  const reader = getSharedD0Reader()
  return reader.injectD0IntoForecast({
    locationKey: trimmedLocationKey,
    date: resolvedReferenceDate,
    forecastDays,
    timezone: resolvedTimezone
  })
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
