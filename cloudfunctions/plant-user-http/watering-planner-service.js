'use strict'

/**
 * 浇水规划器共享 service -- 从 app.js 抽取的 planner 入参组装与计算逻辑。
 *
 * 职责：
 *   - buildWeatherSummary: 天气日数据 -> planner 摘要（从 app.js 提取，两端共用）
 *   - computeAdhocPlanner: 独立浇水建议（无 plantId，catalog 取属级策略 + 临时盆型）
 *
 * 纯计算 + 只读 catalog 查询，不涉及落库。
 */

const { getPlantCatalogById } = require('/opt/utils/plant-knowledge')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')

/**
 * 从前端天气日数据（environmentWeatherWindow.historicalDays）构建 planner 所需的摘要。
 * 适配实际字段名：tempMaxC / tempMinC / humidity / precipMm / textDay。
 * 提取 highHumidityDays / coldHumidDays / rainyDays / hotDryDays 等字段。
 */
function buildWeatherSummary(dailyRecords = [], plantContext = {}) {
  const humidityMax = Number(plantContext.humidityMax || 75)
  const humidityMin = Number(plantContext.humidityMin || 35)
  const tempMax = Number(plantContext.temperatureMax || 30)
  const tempMin = Number(plantContext.temperatureMin || 12)
  const summary = {
    highHumidityDays: 0,
    coldHumidDays: 0,
    rainyDays: 0,
    hotDryDays: 0,
    maxConsecutiveHighHumidityDays: 0,
    maxConsecutiveColdHumidDays: 0,
    maxConsecutiveRainyDays: 0,
    maxConsecutiveHotDryDays: 0
  }
  let streakHigh = 0
  let streakCold = 0
  let streakRain = 0
  let streakDry = 0
  for (const record of dailyRecords) {
    if (!record || typeof record !== 'object') {
      continue
    }
    // 适配 historicalDays 实际字段名 tempMaxC/tempMinC/precipMm/textDay
    const humidity = Number(record.humidity ?? record.humidityPercent)
    const tempMaxVal = Number(
      record.tempMaxC ?? record.tempMax ?? record.temperatureMax ?? record.dayMaxTemp
    )
    const tempMinVal = Number(
      record.tempMinC ?? record.tempMin ?? record.temperatureMin ?? record.dayMinTemp
    )
    const precipitation = Number(record.precipMm ?? record.precipitation ?? record.precip ?? 0)
    const weatherText = String(record.textDay ?? record.weatherText ?? record.weather ?? '')
    const isHighHumidity = !isNaN(humidity) && humidity > humidityMax
    const isLowHumidity = !isNaN(humidity) && humidity < humidityMin
    const isHot = !isNaN(tempMaxVal) && tempMaxVal > tempMax
    const isCold = !isNaN(tempMinVal) && tempMinVal < tempMin
    const isRainy = precipitation > 0 || /雨|rain|shower/i.test(weatherText)
    if (isHighHumidity) {
      summary.highHumidityDays++
    }
    if (isCold && isHighHumidity) {
      summary.coldHumidDays++
    }
    if (isRainy) {
      summary.rainyDays++
    }
    if (isHot && isLowHumidity) {
      summary.hotDryDays++
    }
    streakHigh = isHighHumidity ? streakHigh + 1 : 0
    streakCold = isCold && isHighHumidity ? streakCold + 1 : 0
    streakRain = isRainy ? streakRain + 1 : 0
    streakDry = isHot && isLowHumidity ? streakDry + 1 : 0
    summary.maxConsecutiveHighHumidityDays = Math.max(
      summary.maxConsecutiveHighHumidityDays,
      streakHigh
    )
    summary.maxConsecutiveColdHumidDays = Math.max(summary.maxConsecutiveColdHumidDays, streakCold)
    summary.maxConsecutiveRainyDays = Math.max(summary.maxConsecutiveRainyDays, streakRain)
    summary.maxConsecutiveHotDryDays = Math.max(summary.maxConsecutiveHotDryDays, streakDry)
  }
  return summary
}

/**
 * 独立浇水建议计算（无 plantId、无浇水历史）。
 *
 * 通过 catalogPlantId 从植物知识库取属级浇水策略 + 温湿度 bounds，
 * 盆型由前端临时传入，天气由前端自动获取后传入。
 *
 * @param {object} params
 * @param {string} params.catalogPlantId - 植物种类 ID
 * @param {object} params.potProfile - 盆型档案 { potTopDiameterCm, potBottomDiameterCm, potHeightCm, hasDrainageHole, substrateType }
 * @param {Array}  params.weatherDays - 历史 10d 天气日数据
 * @param {Array}  params.forecastDays - 预报 15d 天气日数据
 * @param {string} params.referenceDate - 参考日期 YYYY-MM-DD
 * @returns {Promise<object>} planner 计算结果 + catalog 植物信息
 */
async function computeAdhocPlanner({
  catalogPlantId,
  potProfile = null,
  weatherDays = [],
  forecastDays = [],
  referenceDate = ''
} = {}) {
  if (!catalogPlantId) {
    return { error: '缺少植物种类ID', statusCode: 400 }
  }

  const plant = await getPlantCatalogById(catalogPlantId)
  if (!plant) {
    return { error: '植物种类不存在', statusCode: 404 }
  }

  const strategy = {
    watering: plant.watering || null,
    wateringQuantization: plant.wateringQuantization || null,
    temperatureMin: plant.temperatureMin ?? null,
    temperatureMax: plant.temperatureMax ?? null,
    humidityMin: plant.humidityMin ?? null,
    humidityMax: plant.humidityMax ?? null
  }

  const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
  const forecast = buildWeatherSummary(forecastDays.slice(0, 15), strategy)

  // 独立入口无浇水历史，传空事件集合
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate,
    watering_events_10d: []
  })

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
