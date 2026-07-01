'use strict'

/**
 * 水合负载与 Dry/Wet Gate 模块 —— 浇水提醒算法 v2.1。
 *
 * 从浇水事件序列（10 天窗口）+ 属级 watering_strategy_json + 盆型几何 + 天气摘要，
 * 计算有效水合负载、湿压负载、根区湿度指数，并输出 Dry/Wet Gate 判定与提醒策略。
 *
 * 核心不变量：
 *   - unknown 浇水历史不能当成 0 次；喷雾不能抵消干燥风险。
 *   - 浇透 + 近日期 + 强偏湿 → 触发过浇风险或查土策略。
 *   - 无排水孔 + 窄底盆 → 提高 wetPressureLoad 与 OVERWATERING_RISK_WARNING 权重。
 *   - 算法输出是"提醒策略"，不是实时盆土 WET / DRY 状态。
 *
 * 纯函数，无 DB、无外部 IO。
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * 浇水量分级
 */
const DOSE_CLASS = Object.freeze({
  UNKNOWN: 'unknown',
  MIST: 'mist',
  SMALL: 'small',
  NORMAL: 'normal',
  THOROUGH: 'thorough'
})

/**
 * 提醒策略门控状态
 */
const GATE_STATE = Object.freeze({
  WET: 'wet',
  DRY: 'dry',
  BASELINE: 'baseline'
})

/**
 * 原因码
 */
const REASON_CODE = Object.freeze({
  OVERWATERING_RISK_WARNING: 'OVERWATERING_RISK_WARNING',
  CHECK_SOIL_BEFORE_WATERING: 'CHECK_SOIL_BEFORE_WATERING',
  INCREASE_WATERING_FREQUENCY: 'INCREASE_WATERING_FREQUENCY',
  RECENT_THOROUGH_WATERING: 'RECENT_THOROUGH_WATERING',
  STRONG_WET_ENVIRONMENT: 'STRONG_WET_ENVIRONMENT',
  HOT_DRY_FORECAST: 'HOT_DRY_FORECAST',
  NO_RECENT_WATERING: 'NO_RECENT_WATERING',
  BASELINE_INTERVAL: 'BASELINE_INTERVAL',
  MIST_DOES_NOT_OFFSET_DRY: 'MIST_DOES_NOT_OFFSET_DRY',
  NO_DRAINAGE_NARROW_BOTTOM: 'NO_DRAINAGE_NARROW_BOTTOM'
})

/**
 * 各 doseClass 的有效水合权重（0~1）。
 * 喷雾（mist）水合贡献极低，不能抵消干燥风险。
 */
const DOSE_HYDRATION_WEIGHT = Object.freeze({
  unknown: 0.4,
  mist: 0.1,
  small: 0.4,
  normal: 0.7,
  thorough: 1.0
})

/**
 * 各 doseClass 对湿压的贡献权重（0~1）。
 * 喷雾不贡献湿压，浇透贡献最高。
 */
const DOSE_WET_PRESSURE_WEIGHT = Object.freeze({
  unknown: 0.3,
  mist: 0.05,
  small: 0.3,
  normal: 0.6,
  thorough: 1.0
})

/* ---------- 基础工具 ---------- */

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

function normalizeDate(value = '') {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join('-')
  }
  return raw.slice(0, 10)
}

function parseDate(value = '') {
  const normalized = normalizeDate(value)
  if (!normalized) {
    return null
  }
  const date = new Date(`${normalized}T12:00:00Z`)
  return Number.isNaN(date.getTime()) ? null : date
}

function daysAgo(referenceDate = '', eventDate = '') {
  const reference = parseDate(referenceDate)
  const event = parseDate(eventDate)
  if (!reference || !event) {
    return null
  }
  return Math.floor((reference.getTime() - event.getTime()) / MS_PER_DAY)
}

/**
 * 将浇水事件的 amount 字段映射到 doseClass 枚举。
 */
function resolveDoseClass(event = {}) {
  const amount = normalizeText(event.amount || event.wateringAmount || event.level || event.value)
  if (!amount || amount === 'unknown') {
    return DOSE_CLASS.UNKNOWN
  }
  if (['mist', '喷雾', '喷淋'].includes(amount)) {
    return DOSE_CLASS.MIST
  }
  if (['small', '少量', '少许'].includes(amount)) {
    return DOSE_CLASS.SMALL
  }
  if (['normal', '普通', '常规'].includes(amount)) {
    return DOSE_CLASS.NORMAL
  }
  if (['thorough', 'deep', 'soaked', '浇透', '透浇', '大水'].includes(amount)) {
    return DOSE_CLASS.THOROUGH
  }
  return DOSE_CLASS.UNKNOWN
}

/* ---------- 核心计算 ---------- */

/**
 * 计算动态回看窗口天数。
 *
 * 以 watering_strategy_json.freq 的 min/max 为基线，取 max 作为回看窗口。
 * 无排水孔或窄底盆时适当扩大窗口以更保守地评估过浇风险。
 *
 * @param {number[]} baselineIntervalDays - [min, max]
 * @param {object} potGeometry - 盆型几何因子
 * @returns {number} 回看窗口天数
 */
function resolveLookbackWindowDays(baselineIntervalDays = [5, 8], potGeometry = {}) {
  const maxInterval = Math.max(1, Number(baselineIntervalDays[1]) || 8)
  // 基线窗口至少覆盖一个完整浇水周期
  let window = Math.max(10, maxInterval * 1.5)
  // 无排水孔时扩大窗口 30%
  if (potGeometry.hasDrainageHole === 'false') {
    window *= 1.3
  }
  return Math.round(window)
}

/**
 * 计算有效水合负载。
 *
 * 有效水合负载 = Σ(doseHydrationWeight × recencyDecay) / lookbackWindowDays
 *
 * recencyDecay = 1 - (daysAgo / lookbackWindowDays)，越近的浇水贡献越高。
 * unknown 浇水事件按 0.4 权重计入，不能忽略。
 *
 * @param {Array} wateringEvents - 归一化后的浇水事件
 * @param {string} referenceDate - 参考日期
 * @param {number} lookbackWindowDays - 回看窗口
 * @returns {number} 0~1+ 的水合负载
 */
function computeEffectiveHydrationLoad(wateringEvents = [], referenceDate = '', lookbackWindowDays = 10) {
  if (!wateringEvents.length || lookbackWindowDays <= 0) {
    return 0
  }
  let totalLoad = 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookbackWindowDays) {
      continue
    }
    const doseClass = resolveDoseClass(event)
    const weight = DOSE_HYDRATION_WEIGHT[doseClass] ?? 0.4
    const recencyDecay = 1 - diff / lookbackWindowDays
    totalLoad += weight * recencyDecay
  }
  return Math.round((totalLoad / lookbackWindowDays * 10) * 100) / 100
}

/**
 * 计算湿压负载。
 *
 * 湿压 = Σ(doseWetPressureWeight × recencyDecay) / lookbackWindowDays
 * 无排水孔 + 窄底盆时乘以 drainageRiskFactor 放大。
 *
 * @param {Array} wateringEvents - 归一化后的浇水事件
 * @param {string} referenceDate - 参考日期
 * @param {number} lookbackWindowDays - 回看窗口
 * @param {object} potGeometry - 盆型几何因子
 * @returns {number} 0~1+ 的湿压负载
 */
function computeWetPressureLoad(
  wateringEvents = [],
  referenceDate = '',
  lookbackWindowDays = 10,
  potGeometry = {}
) {
  if (!wateringEvents.length || lookbackWindowDays <= 0) {
    return 0
  }
  let totalPressure = 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookbackWindowDays) {
      continue
    }
    const doseClass = resolveDoseClass(event)
    const weight = DOSE_WET_PRESSURE_WEIGHT[doseClass] ?? 0.3
    const recencyDecay = 1 - diff / lookbackWindowDays
    totalPressure += weight * recencyDecay
  }
  const drainageMultiplier = Number(potGeometry.drainageRiskFactor) || 0.5
  return Math.round((totalPressure / lookbackWindowDays * 10 * drainageMultiplier) * 100) / 100
}

/**
 * 计算距上次有效根区浇水的天数。
 *
 * "有效根区浇水" = 非喷雾的浇水事件（small / normal / thorough / unknown）。
 * 喷雾（mist）不计入，因为喷雾不抵达根区。
 *
 * @param {Array} wateringEvents - 归一化后的浇水事件
 * @param {string} referenceDate - 参考日期
 * @returns {number|null} 天数，null 表示无有效浇水记录
 */
function computeLastEffectiveRootWateredDaysAgo(wateringEvents = [], referenceDate = '') {
  let latest = null
  for (const event of wateringEvents) {
    const doseClass = resolveDoseClass(event)
    if (doseClass === DOSE_CLASS.MIST) {
      continue
    }
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {
      continue
    }
    latest = latest === null ? diff : Math.min(latest, diff)
  }
  return latest
}

/**
 * 计算根区湿度指数（0~1）。
 *
 * 综合水合负载、湿压、盆型干透因子和天气偏湿信号，
 * 输出一个 0（极干）到 1（极湿）的指数。
 *
 * @param {number} effectiveHydrationLoad
 * @param {number} wetPressureLoad
 * @param {number} potGeometryDryDownFactor - 盆型干透因子（越高干透越快）
 * @param {number} weatherWetPressureHitCount - 天气偏湿命中数
 * @returns {number} 0~1
 */
function computeRootZoneMoistureIndex(
  effectiveHydrationLoad = 0,
  wetPressureLoad = 0,
  potGeometryDryDownFactor = 1.0,
  weatherWetPressureHitCount = 0
) {
  // 基础：水合负载 / 干透因子，干透越快则当前湿度越低
  const baseMoisture = effectiveHydrationLoad / Math.max(0.3, potGeometryDryDownFactor)
  // 叠加湿压
  const wetBoost = wetPressureLoad * 0.5
  // 天气偏湿加成
  const weatherBoost = Math.min(0.3, weatherWetPressureHitCount * 0.1)
  const index = baseMoisture + wetBoost + weatherBoost
  return Math.max(0, Math.min(1, Math.round(index * 100) / 100))
}

/**
 * Dry/Wet Gate 判定。
 *
 * 决策逻辑：
 *   - rootZoneMoistureIndex 高 + 无排水孔/窄底 → WET（过浇风险）
 *   - rootZoneMoistureIndex 低 + 距上次有效浇水较久 + 天气偏干 → DRY
 *   - 否则 BASELINE
 *
 * 同时输出 reasonCodes 和建议策略。
 *
 * @param {object} params
 * @returns {object} { gateState, reasonCodes, wateringContext, action }
 */
function evaluateDryWetGate({
  rootZoneMoistureIndex = 0.5,
  wetPressureLoad = 0,
  lastEffectiveRootWateredDaysAgo = null,
  potGeometry = {},
  weatherWetPressureHitCount = 0,
  forecastHotDryHit = false,
  historicalHotDryHit = false,
  baselineIntervalDays = [5, 8],
  recentThoroughWatering = false
} = {}) {
  const reasonCodes = []
  const hasNoDrainageNarrowBottom =
    potGeometry.hasDrainageHole === 'false' && Number(potGeometry.taperRatio) > 1.3

  // ---- WET 判定 ----
  // 条件1：根区湿度高（>0.6）且湿压高（>0.4）
  // 条件2：浇透 + 近日期（≤3天）+ 强偏湿天气
  // 条件3：无排水孔 + 窄底 + 根区湿度偏高（>0.5）
  // 条件4：根区湿度极高（>0.8）+ 近期有效浇水（≤2天）→ 无论天气信号
  const isHighMoisture = rootZoneMoistureIndex > 0.6
  const isHighWetPressure = wetPressureLoad > 0.4
  const isThoroughAndRecent =
    recentThoroughWatering &&
    lastEffectiveRootWateredDaysAgo !== null &&
    lastEffectiveRootWateredDaysAgo <= 3
  const isNoDrainageNarrowHighMoisture = hasNoDrainageNarrowBottom && rootZoneMoistureIndex > 0.5
  const isVeryHighMoistureAndRecent =
    rootZoneMoistureIndex > 0.8 &&
    lastEffectiveRootWateredDaysAgo !== null &&
    lastEffectiveRootWateredDaysAgo <= 2

  const isWet = isHighMoisture && isHighWetPressure || isThoroughAndRecent && weatherWetPressureHitCount >= 2 || isNoDrainageNarrowHighMoisture || isVeryHighMoistureAndRecent

  if (isWet) {
    if (hasNoDrainageNarrowBottom) {
      reasonCodes.push(REASON_CODE.NO_DRAINAGE_NARROW_BOTTOM)
    }
    reasonCodes.push(REASON_CODE.OVERWATERING_RISK_WARNING)
    if (isThoroughAndRecent) {
      reasonCodes.push(REASON_CODE.RECENT_THOROUGH_WATERING)
    }
    if (weatherWetPressureHitCount >= 2) {
      reasonCodes.push(REASON_CODE.STRONG_WET_ENVIRONMENT)
    }
    reasonCodes.push(REASON_CODE.CHECK_SOIL_BEFORE_WATERING)
    return {
      gateState: GATE_STATE.WET,
      reasonCodes,
      wateringContext: 'likely_too_wet',
      action: 'delay_and_check_soil'
    }
  }

  // ---- DRY 判定 ----
  // 条件1：根区湿度低（<0.3）+ 距上次有效浇水较久（≥ baseline min）
  // 条件2：天气偏干（预报/历史 hot-dry）+ 无有效浇水记录或距上次浇水很久
  // 喷雾不能抵消干燥风险
  const isLowMoisture = rootZoneMoistureIndex < 0.3
  const baselineMinDays = Number(baselineIntervalDays[0]) || 5
  const isTooLongAgo =
    lastEffectiveRootWateredDaysAgo === null ||
    lastEffectiveRootWateredDaysAgo >= baselineMinDays
  const isDry = isLowMoisture && isTooLongAgo || (forecastHotDryHit && isTooLongAgo) || (historicalHotDryHit && lastEffectiveRootWateredDaysAgo === null)

  if (isDry) {
    reasonCodes.push(REASON_CODE.INCREASE_WATERING_FREQUENCY)
    if (lastEffectiveRootWateredDaysAgo === null) {
      reasonCodes.push(REASON_CODE.NO_RECENT_WATERING)
    }
    if (forecastHotDryHit) {
      reasonCodes.push(REASON_CODE.HOT_DRY_FORECAST)
    }
    // 若历史只有喷雾记录，标注喷雾不能抵消干燥
    reasonCodes.push(REASON_CODE.MIST_DOES_NOT_OFFSET_DRY)
    return {
      gateState: GATE_STATE.DRY,
      reasonCodes,
      wateringContext: 'likely_too_dry',
      action: 'increase_soil_check_frequency'
    }
  }

  // ---- BASELINE ----
  reasonCodes.push(REASON_CODE.BASELINE_INTERVAL)
  return {
    gateState: GATE_STATE.BASELINE,
    reasonCodes,
    wateringContext: 'keep_baseline_or_check_soil',
    action: 'follow_baseline_or_check_soil'
  }
}

/**
 * 检测近期是否有浇透事件。
 */
function hasRecentThoroughWatering(wateringEvents = [], referenceDate = '', withinDays = 5) {
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff > withinDays) {
      continue
    }
    if (resolveDoseClass(event) === DOSE_CLASS.THOROUGH) {
      return true
    }
  }
  return false
}

/**
 * 计算下次水量建议。
 *
 * 根据盆型体积、gate 状态和 doseClass 推荐水量区间（ml）。
 *
 * @param {object} potGeometry - 盆型几何
 * @param {string} gateState - 门控状态
 * @param {number[]} baselineIntervalDays - 属级基线间隔
 * @returns {object} { amountClass, amountRangeMl, stopCondition, confidenceLevel }
 */
function computeAmountSuggestion(potGeometry = {}, gateState = GATE_STATE.BASELINE, _baselineIntervalDays = [5, 8]) {
  const volumeMl = Number(potGeometry.potVolumeMl) || 0
  const volumeConfidence = potGeometry.volumeConfidence || 'low'

  // 体积未知时给出保守区间
  if (volumeMl <= 0) {
    return {
      amountClass: DOSE_CLASS.NORMAL,
      amountRangeMl: [50, 200],
      stopCondition: '盆底出水即可停止',
      confidenceLevel: 'low'
    }
  }

  let amountClass
  let amountRangeMl
  let stopCondition

  if (gateState === GATE_STATE.WET) {
    amountClass = DOSE_CLASS.UNKNOWN
    amountRangeMl = [0, 0]
    stopCondition = '暂停浇水，检查土壤干湿后再决定'
  } else if (gateState === GATE_STATE.DRY) {
    amountClass = DOSE_CLASS.THOROUGH
    // 干燥时建议浇透，约盆体体积的 20%~30%
    amountRangeMl = [Math.round(volumeMl * 0.2), Math.round(volumeMl * 0.3)]
    stopCondition = '盆底有水流出即可停止'
  } else {
    amountClass = DOSE_CLASS.NORMAL
    // 基线建议约盆体体积的 10%~15%
    amountRangeMl = [Math.round(volumeMl * 0.1), Math.round(volumeMl * 0.15)]
    stopCondition = '盆土表面湿润即可停止'
  }

  return {
    amountClass,
    amountRangeMl,
    stopCondition,
    confidenceLevel: volumeConfidence
  }
}

module.exports = {
  DOSE_CLASS,
  GATE_STATE,
  REASON_CODE,
  DOSE_HYDRATION_WEIGHT,
  DOSE_WET_PRESSURE_WEIGHT,
  resolveDoseClass,
  resolveLookbackWindowDays,
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  computeRootZoneMoistureIndex,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion
}
