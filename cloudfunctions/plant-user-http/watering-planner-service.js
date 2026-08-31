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
const { models } = require('/opt/utils/cloudbase')
const {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline
} = require('/opt/utils/watering-planner')
// D0 注入器已下沉到 layer 共享：plant-user-http / diagnose-http 共用同一实现。
const { injectD0IntoForecastDays } = require('/opt/utils/weather-day-file-reader')
const {
  computeTranspirationIntervalFactor,
  resolveShadowModeFromEnv
} = require('/opt/utils/transpiration')
const { resolveAirEnvironmentEvidence } = require('/opt/utils/air-environment-evidence')

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

async function resolveConfirmedWateringEvents({
  openid = '',
  catalogPlantId = '',
  wateringEvents = []
} = {}) {
  if (Array.isArray(wateringEvents) && wateringEvents.length) {
    return wateringEvents
  }
  if (!openid || !catalogPlantId) {
    return []
  }
  try {
    const result = await models.$runSQL(
      `SELECT CAST(planner_result_json AS CHAR) AS planner_result_json_text
       FROM watering_advisor_sessions
       WHERE _openid = {{openid}} AND catalog_plant_id = {{catalogPlantId}}
       ORDER BY created_at DESC
       LIMIT 1`,
      { openid, catalogPlantId }
    )
    const raw = result?.data?.executeResultList?.[0]?.planner_result_json_text
    const plannerResult = raw && typeof raw === 'string' ? JSON.parse(raw) : raw || {}
    const confirmedDate = String(plannerResult?.confirmedWateredDate || '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(confirmedDate)) {
      return [{ date: confirmedDate, watered: true, amount: 'normal' }]
    }
  } catch (error) {
    // 历史表未就绪或旧记录损坏时，保持无历史语义，不伪造日期。
    console.warn('读取独立浇水确认记录失败:', error?.message || error)
  }
  return []
}

/**
 * 独立浇水建议计算（无 plantId；未确认过浇水时无历史）。
 *
 * 通过 catalogPlantId 从植物知识库取属级浇水策略 + 温湿度 bounds，
 * 盆型由前端临时传入，天气由前端自动获取后传入。
 *
 * D0 当日天气从 day file latestSample 注入：前端传完整 D0..D+14，后端先去掉调用方 D0，
 * 再注入唯一权威 D0 后 buildWeatherSummary 统计最多 15 天。D0 缺失/超时仅统计 D+1..D+14。
 *
 * @param {object} params
 * @param {string} params.catalogPlantId - 植物种类 ID
 * @param {object} params.potProfile - 盆型档案 { potTopDiameterCm, potBottomDiameterCm, potHeightCm, hasDrainageHole, substrateType }
 * @param {Array}  params.weatherDays - 历史 10d 天气日数据
 * @param {Array}  params.forecastDays - D0..D+14 天气日数据（最多 15 项；D0 会由后端校验）
 * @param {string} params.referenceDate - 参考日期 YYYY-MM-DD
 * @param {string} params.locationKey - 地点 key（用于 D0 day file 读取）
 * @param {string} params.timezone - 时区，默认 Asia/Shanghai
 * @returns {Promise<object>} planner 计算结果 + 日期/盆土/环境审计字段
 */
async function computeAdhocPlanner({
  openid = '',
  catalogPlantId,
  potProfile = null,
  weatherDays = [],
  forecastDays = [],
  referenceDate = '',
  locationKey = '',
  timezone = 'Asia/Shanghai',
  lightEnvironment = null,
  airEnvironmentOverride = null,
  wateringEvents = []
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

  const resolvedWateringEvents = await resolveConfirmedWateringEvents({
    openid,
    catalogPlantId,
    wateringEvents
  })

  // D0 校验：前端传完整 D0..D+14，后端剔除调用方 D0 后注入 day file latestSample
  const {
    forecastDays: forecastWithD0,
    todayWeatherSource,
    todayWeatherReason,
    referenceDate: resolvedReferenceDate
  } = await injectD0IntoForecastDays({
    locationKey,
    timezone,
    referenceDate,
    forecastDays: forecastDays.slice(0, 15)
  })

  const historical = buildWeatherSummary(weatherDays.slice(0, 10), strategy)
  const forecast = buildWeatherSummary(forecastWithD0.slice(0, 15), strategy)

  // 独立入口默认无历史；若用户曾明确确认完成浇水，则复用该确认事件。
  const timeline = normalizeCareBehaviorTimeline({
    referenceDate: resolvedReferenceDate,
    watering_events_10d: resolvedWateringEvents
  })

  const airEnvironmentEvidence = resolveAirEnvironmentEvidence(airEnvironmentOverride)
  const transpiration = computeTranspirationIntervalFactor({
    lightEnvironment,
    weatherDays: weatherDays.slice(0, 10),
    weatherSummary: historical,
    airEnvironmentEvidence,
    plantStrategy: strategy.wateringQuantization
      ? { wateringQuantization: strategy.wateringQuantization }
      : null,
    shadow: resolveShadowModeFromEnv(process.env)
  })

  const plan = buildWateringPlanner({
    wateringStrategy: strategy.watering || {},
    historical,
    forecast,
    behaviorTimeline: timeline,
    potProfile: potProfile || null,
    wateringQuantization: strategy.wateringQuantization || null,
    referenceDate: resolvedReferenceDate,
    transpirationIntervalFactor: transpiration.intervalFactor
  })

  // 无历史时 nextWaterDate 保持 null；有明确传入的 wateringEvents 时才允许推导日期。
  const hasWateringHistory = resolvedWateringEvents.length > 0
  return {
    statusCode: 200,
    data: {
      amountRangeMl: plan.amountRangeMl,
      nextWaterDate: hasWateringHistory ? plan.nextWaterDate : null,
      nextWaterWindow: hasWateringHistory ? plan.nextWaterWindow : null,
      nextWaterReason: hasWateringHistory
        ? plan.nextWaterReason
        : '尚无上次浇水记录，暂不推导下次浇水日期；请先检查盆土。',
      wateringContext: plan.wateringContext,
      action: plan.action,
      stopCondition: plan.stopCondition,
      confidenceLevel: plan.confidenceLevel,
      reasonCodes: plan.reasonCodes,
      soilCheck: plan.soilCheck,
      transpirationIntervalFactor: plan.transpirationIntervalFactor,
      seasonalIntervalFactor: plan.seasonalIntervalFactor,
      airEnvironmentAudit: airEnvironmentEvidence
        ? {
            evidence: airEnvironmentEvidence,
            intervalFactor: transpiration.intervalFactor,
            airFactor: transpiration.airFactor,
            computedFactor: transpiration.computedFactor,
            shadow: transpiration.shadow
          }
        : null,
      todayWeatherSource,
      todayWeatherReason
    },
    error: null
  }
}

module.exports = {
  buildWeatherSummary,
  computeAdhocPlanner,
  injectD0IntoForecastDays,
  resolveConfirmedWateringEvents
}
