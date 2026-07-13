'use strict'

/**
 * 浇水规划器服务 —— plant-user-http 内部服务。
 *
 * 提供两个能力：
 *   1. buildWeatherSummary(weatherDays, strategy)
 *      从前端传入的逐日天气记录构建历史/预报摘要，供 watering-planner 使用。
 *      产出 highHumidityDays / hotDryDays / coldHumidDays / rainyDays /
 *      maxConsecutive* 字段，与 diagnose-http environment-context-v7 口径一致。
 *
 *   2. computeAdhocPlanner({ catalogPlantId, potProfile, weatherDays, forecastDays, referenceDate })
 *      独立浇水入口：不绑定用户植物，不读取光照，不使用蒸腾间隔修正。
 *      仅返回建议毫升数（amountRangeMl / potVolumeMl / stopCondition / confidenceLevel），
 *      不输出日期、间隔、盆土判断、蒸腾或光照文案。
 *
 * 合同约束（浇水算法 v3）：
 *   - 独立浇水不读取光照，也不使用蒸腾间隔修正。
 *   - 仅返回/展示建议毫升数。
 *   - 继续使用盆体积、基质、排水、植物策略和当前天气。
 */

const { models } = require('/opt/utils/cloudbase')
const { getPlantCatalogById } = require('/opt/utils/plant-knowledge')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')

/* ---------- 基础工具 ---------- */

function toFiniteNumber(value, fallback = undefined) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function normalizeDate(value = '') {
  const raw = normalizeText(value)
  if (!raw) {
    return ''
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
  }
  return raw.slice(0, 10)
}

function firstNumber(...values) {
  for (const v of values) {
    if (v === null || v === undefined || v === '') {
      continue
    }
    const num = Number(v)
    if (Number.isFinite(num)) {
      return num
    }
  }
  return undefined
}

/* ---------- 天气记录归一化 ---------- */

function normalizeDailyWeatherRecord(record = {}) {
  if (!record || typeof record !== 'object') {
    return null
  }
  const tempMin = firstNumber(
    record.tempMin,
    record.temp_min,
    record.temperatureMin,
    record.temperature_min,
    record.tmp_min,
    record.minTemp
  )
  const tempMax = firstNumber(
    record.tempMax,
    record.temp_max,
    record.temperatureMax,
    record.temperature_max,
    record.tmp_max,
    record.maxTemp
  )
  const humidity = firstNumber(
    record.humidity,
    record.hum,
    record.rh,
    record.relativeHumidity,
    record.relative_humidity
  )
  const precipitation = firstNumber(
    record.precipitation,
    record.precip,
    record.precipitationMm,
    record.rain,
    record.rainfall
  )
  const weatherText = normalizeText(
    record.weatherText ||
      record.weather_text ||
      record.text ||
      record.weather ||
      record.cond_txt ||
      record.condition
  )
  const date = normalizeDate(
    record.date || record.fxDate || record.obsDate || record.time || record.day
  )
  if (
    tempMin === undefined &&
    tempMax === undefined &&
    humidity === undefined &&
    precipitation === undefined &&
    !weatherText
  ) {
    return null
  }
  return { date, tempMin, tempMax, humidity, precipitation, weatherText }
}

function isRainyRecord(record = {}) {
  const precipitation = toFiniteNumber(record.precipitation, 0)
  if (precipitation > 0) {
    return true
  }
  return /雨|雪|rain|shower|storm/i.test(record.weatherText || '')
}

function updateConsecutiveStreak(state = {}, key = '', active = false) {
  const currentKey = `${key}Current`
  const maxKey = `${key}Max`
  state[currentKey] = active ? Number(state[currentKey] || 0) + 1 : 0
  state[maxKey] = Math.max(Number(state[maxKey] || 0), Number(state[currentKey] || 0))
}

/* ---------- 默认环境阈值（与 diagnose-http care-planner-thresholds 保守值一致） ---------- */

const DEFAULT_ENV_THRESHOLDS = Object.freeze({
  conservativeTemperatureMinC: 10,
  conservativeTemperatureMaxC: 32,
  conservativeHumidityMinPercent: 30,
  conservativeHumidityMaxPercent: 80
})

function resolveEnvironmentBounds(strategy = {}) {
  const watering = strategy.watering || strategy.wateringStrategy || {}
  return {
    temperatureMin: firstNumber(
      strategy.temperatureMin,
      strategy.tempMin,
      watering.tempMin,
      DEFAULT_ENV_THRESHOLDS.conservativeTemperatureMinC
    ),
    temperatureMax: firstNumber(
      strategy.temperatureMax,
      strategy.tempMax,
      watering.tempMax,
      DEFAULT_ENV_THRESHOLDS.conservativeTemperatureMaxC
    ),
    humidityMin: firstNumber(
      strategy.humidityMin,
      strategy.rhMin,
      watering.humidityMin,
      DEFAULT_ENV_THRESHOLDS.conservativeHumidityMinPercent
    ),
    humidityMax: firstNumber(
      strategy.humidityMax,
      strategy.rhMax,
      watering.humidityMax,
      DEFAULT_ENV_THRESHOLDS.conservativeHumidityMaxPercent
    )
  }
}

/**
 * 从逐日天气记录构建天气摘要。
 *
 * @param {Array} weatherDays - 逐日天气记录数组
 * @param {object} strategy   - 植物策略（含 watering / temperatureMin/Max / humidityMin/Max）
 * @returns {object} 天气摘要：highHumidityDays / hotDryDays / coldHumidDays / rainyDays /
 *                    maxConsecutive* / recordCount
 */
function buildWeatherSummary(weatherDays = [], strategy = {}) {
  const records = (Array.isArray(weatherDays) ? weatherDays : [])
    .map(normalizeDailyWeatherRecord)
    .filter(Boolean)
  const bounds = resolveEnvironmentBounds(strategy)
  const summary = {
    recordCount: records.length,
    highHumidityDays: 0,
    lowHumidityDays: 0,
    coldHumidDays: 0,
    hotDryDays: 0,
    hotHumidDays: 0,
    rainyDays: 0,
    maxConsecutiveHighHumidityDays: 0,
    maxConsecutiveLowHumidityDays: 0,
    maxConsecutiveColdHumidDays: 0,
    maxConsecutiveHotDryDays: 0,
    maxConsecutiveRainyDays: 0,
    thresholds: {
      humidityMinPercent: bounds.humidityMin,
      humidityMaxPercent: bounds.humidityMax,
      temperatureMinC: bounds.temperatureMin,
      temperatureMaxC: bounds.temperatureMax
    }
  }
  const streaks = {}
  for (const record of records) {
    const highHumidity =
      record.humidity !== undefined &&
      bounds.humidityMax !== undefined &&
      record.humidity > bounds.humidityMax
    const lowHumidity =
      record.humidity !== undefined &&
      bounds.humidityMin !== undefined &&
      record.humidity < bounds.humidityMin
    const cold =
      record.tempMin !== undefined &&
      bounds.temperatureMin !== undefined &&
      record.tempMin < bounds.temperatureMin
    const hot =
      record.tempMax !== undefined &&
      bounds.temperatureMax !== undefined &&
      record.tempMax > bounds.temperatureMax
    const rainy = isRainyRecord(record)

    if (highHumidity) {
      summary.highHumidityDays += 1
    }
    if (lowHumidity) {
      summary.lowHumidityDays += 1
    }
    if (cold && highHumidity) {
      summary.coldHumidDays += 1
    }
    if (hot && lowHumidity) {
      summary.hotDryDays += 1
    }
    if (hot && highHumidity) {
      summary.hotHumidDays += 1
    }
    if (rainy) {
      summary.rainyDays += 1
    }

    updateConsecutiveStreak(streaks, 'highHumidity', highHumidity)
    updateConsecutiveStreak(streaks, 'lowHumidity', lowHumidity)
    updateConsecutiveStreak(streaks, 'coldHumid', cold && highHumidity)
    updateConsecutiveStreak(streaks, 'hotDry', hot && lowHumidity)
    updateConsecutiveStreak(streaks, 'rainy', rainy)
  }
  summary.maxConsecutiveHighHumidityDays = Number(streaks.highHumidityMax || 0)
  summary.maxConsecutiveLowHumidityDays = Number(streaks.lowHumidityMax || 0)
  summary.maxConsecutiveColdHumidDays = Number(streaks.coldHumidMax || 0)
  summary.maxConsecutiveHotDryDays = Number(streaks.hotDryMax || 0)
  summary.maxConsecutiveRainyDays = Number(streaks.rainyMax || 0)
  return summary
}

/* ---------- 独立浇水：computeAdhocPlanner ---------- */

/**
 * 独立浇水建议计算。
 *
 * 合同约束：
 *   - 不读取光照，不使用蒸腾间隔修正。
 *   - 仅返回建议毫升数（amountRangeMl / potVolumeMl / stopCondition / confidenceLevel）。
 *   - 不输出日期、间隔、盆土判断、蒸腾或光照文案。
 *   - 继续使用盆体积、基质、排水、植物策略和当前天气。
 *
 * @param {object} params
 * @param {string} params.catalogPlantId - 植物种类 ID（plant_identity_id 或 session_plant_id）
 * @param {object} params.potProfile     - 盆型档案
 * @param {Array}  params.weatherDays    - 历史天气逐日记录
 * @param {Array}  params.forecastDays   - 预报天气逐日记录
 * @param {string} params.referenceDate  - 参考日期
 * @returns {Promise<{ statusCode: number, data: object|null, error: string|null }>}
 */
async function computeAdhocPlanner({
  catalogPlantId = '',
  potProfile = null,
  weatherDays = [],
  forecastDays = [],
  referenceDate = new Date().toISOString().slice(0, 10)
} = {}) {
  const trimmedCatalogPlantId = normalizeText(catalogPlantId)
  if (!trimmedCatalogPlantId) {
    return { statusCode: 400, data: null, error: '缺少植物种类ID' }
  }

  const plant = await getPlantCatalogById(trimmedCatalogPlantId)
  if (!plant) {
    return { statusCode: 404, data: null, error: '未找到植物种类' }
  }

  const strategy = {
    watering: plant.watering || {},
    wateringQuantization: plant.wateringQuantization || null,
    temperatureMin: plant.temperatureMin ?? null,
    temperatureMax: plant.temperatureMax ?? null,
    humidityMin: plant.humidityMin ?? null,
    humidityMax: plant.humidityMax ?? null
  }

  const historical = buildWeatherSummary(
    Array.isArray(weatherDays) ? weatherDays.slice(0, 10) : [],
    strategy
  )
  const forecast = buildWeatherSummary(
    Array.isArray(forecastDays) ? forecastDays.slice(0, 15) : [],
    strategy
  )

  const timeline = normalizeCareBehaviorTimeline({
    referenceDate,
    watering_events_10d: []
  })

  // 独立浇水：不注入 transpirationIntervalFactor，不读取光照。
  const plan = buildWateringPlanner({
    wateringStrategy: strategy.watering || {},
    historical,
    forecast,
    behaviorTimeline: timeline,
    potProfile: potProfile || null,
    wateringQuantization: strategy.wateringQuantization || null,
    referenceDate
  })

  // 独立浇水仅返回建议毫升数，不返回日期/间隔/盆土判断/蒸腾/光照文案。
  return {
    statusCode: 200,
    data: {
      amountRangeMl: plan.amountRangeMl
    },
    error: null
  }
}

module.exports = {
  buildWeatherSummary,
  computeAdhocPlanner,
  normalizeDailyWeatherRecord,
  resolveEnvironmentBounds,
  DEFAULT_ENV_THRESHOLDS
}
