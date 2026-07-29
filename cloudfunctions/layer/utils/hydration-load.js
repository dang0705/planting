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

const { resolveMlToDoseClass } = require('./water-volume-format')

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
  NO_DRAINAGE_NARROW_BOTTOM: 'NO_DRAINAGE_NARROW_BOTTOM',
  DRY_SUPPRESSED_BY_WET_ENVIRONMENT: 'DRY_SUPPRESSED_BY_WET_ENVIRONMENT',
  AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL: 'AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL',
  WET_ENVIRONMENT_AMOUNT_REDUCED: 'WET_ENVIRONMENT_AMOUNT_REDUCED',
  USER_DOSE_ANCHORED: 'USER_DOSE_ANCHORED'
})

/** 冲突检测阈值：≤50ml 的浇水配非喷雾标签才算冲突（如 30ml+normal）。 */
const MIST_TEXT_MAX_ML_FOR_CONFLICT = 50

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
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
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
 * 将浇水事件映射到 doseClass 枚举。
 *
 * 优先级：
 *   1. 事件带数值 amountMl（录入侧存的绝对水量）→ 按盆体积百分比反推档（Task 5）。
 *   2. 否则回退到 amount 字符串档匹配（向后兼容历史相对档数据）。
 *
 * @param {object} event
 * @param {number} [potVolumeMl] - 盆体积，用于 amountMl 反推；缺省时反推走固定 ml 阈值
 */
function resolveDoseClass(event = {}, potVolumeMl = 0) {
  return resolveDoseClassWithConflict(event, potVolumeMl).doseClass
}

/** doseClass → 数值 rank，用于冲突判定（mist=0 ... thorough=3）。 */
const DOSE_RANK = { mist: 0, small: 1, normal: 2, thorough: 3, unknown: -1 }

/**
 * 解析 doseClass 并检测 amountMl 与 amount 标签的冲突。
 *
 * 冲突定义：amountMl 反推的档位与 amount 标签档位的 rank 差 ≥ 2（如 normal vs mist）。
 * 冲突时以 amountMl 反推为准，标记 doseConflict=true。
 *
 * @param {object} event
 * @param {number} [potVolumeMl]
 * @returns {{ doseClass: string, doseConflict: boolean }}
 */
function resolveDoseClassWithConflict(event = {}, potVolumeMl = 0) {
  const amountMl = Number(event.amountMl ?? event.amount_ml)
  const amount = normalizeText(event.amount || event.wateringAmount || event.level || event.value)
  const labelDose = resolveDoseClassByLabel(amount)

  if (Number.isFinite(amountMl) && amountMl > 0) {
    const inferredDose = resolveMlToDoseClass(amountMl, potVolumeMl)
    // 冲突检测：仅当 ml 处于喷雾量级（≤50ml）但用户标签是 small/normal/thorough 时才算冲突。
    // 大盆下 normal 档代表 ml（如 550ml）可能占盆体积比 <5% 被归为 MIST，
    // 但这是动态瓶档的正常换算结果，不是数据冲突。
    const isMistLevelMl = amountMl <= MIST_TEXT_MAX_ML_FOR_CONFLICT
    const isLabelNonMist = labelDose !== DOSE_CLASS.MIST && labelDose !== DOSE_CLASS.UNKNOWN
    const doseConflict = isMistLevelMl && isLabelNonMist
    return { doseClass: inferredDose, doseConflict }
  }

  return { doseClass: labelDose, doseConflict: false }
}

/** 仅按 amount 字符串标签解析 doseClass（原 resolveDoseClass 的字符串匹配部分）。 */
function resolveDoseClassByLabel(amount) {
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
function computeEffectiveHydrationLoad(
  wateringEvents = [],
  referenceDate = '',
  lookbackWindowDays = 10,
  potVolumeMl = 0
) {
  if (!wateringEvents.length || lookbackWindowDays <= 0) {
    return 0
  }
  let totalLoad = 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookbackWindowDays) {
      continue
    }
    const doseClass = resolveDoseClass(event, potVolumeMl)
    const weight = DOSE_HYDRATION_WEIGHT[doseClass] ?? 0.4
    const recencyDecay = 1 - diff / lookbackWindowDays
    totalLoad += weight * recencyDecay
  }
  return Math.round((totalLoad / lookbackWindowDays) * 10 * 100) / 100
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
  const potVolumeMl = Number(potGeometry.potVolumeMl) || 0
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff >= lookbackWindowDays) {
      continue
    }
    const doseClass = resolveDoseClass(event, potVolumeMl)
    const weight = DOSE_WET_PRESSURE_WEIGHT[doseClass] ?? 0.3
    const recencyDecay = 1 - diff / lookbackWindowDays
    totalPressure += weight * recencyDecay
  }
  const drainageMultiplier = Number(potGeometry.drainageRiskFactor) || 0.5
  return Math.round((totalPressure / lookbackWindowDays) * 10 * drainageMultiplier * 100) / 100
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
function computeLastEffectiveRootWateredDaysAgo(
  wateringEvents = [],
  referenceDate = '',
  potVolumeMl = 0
) {
  let latest = null
  for (const event of wateringEvents) {
    const { doseClass, doseConflict } = resolveDoseClassWithConflict(event, potVolumeMl)
    if (doseClass === DOSE_CLASS.MIST) {
      // 大盆下 normal 档代表 ml 可能被归为 MIST，但用户明确选了非喷雾档且无冲突，
      // 仍视为有效根浇（记录日期），只是 hydration 权重按 MIST 算。
      // 有冲突（如 30ml+normal，ml 与标签极端矛盾）时以 ml 为准→跳过。
      if (doseConflict) {
        continue
      }
      const labelDose = resolveDoseClassByLabel(
        normalizeText(event.amount || event.wateringAmount || event.level || event.value)
      )
      if (labelDose === DOSE_CLASS.MIST || labelDose === DOSE_CLASS.UNKNOWN) {
        continue
      }
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
 * 提取用户近期代表性剂量：最近一次非喷雾浇水的 doseClass + amountMl；
 * 若只有喷雾则返回 mist；无事件返回 null。
 *
 * @returns {{ doseClass: string, amountMl: number|null } | string | null}
 *   返回对象 { doseClass, amountMl }；向后兼容：调用方若按字符串使用，
 *   对象的 toString 不影响——planner 和 app.js 已适配对象格式。
 *   mist 时返回 { doseClass: 'mist', amountMl: null }。
 */
function resolveUserDoseEcho(wateringEvents = [], referenceDate = '', potVolumeMl = 0) {
  let bestDiff = null
  let bestDose = null
  let bestAmountMl = null
  let mistSeen = false
  for (const event of wateringEvents) {
    const doseClass = resolveDoseClass(event, potVolumeMl)
    if (doseClass === DOSE_CLASS.MIST) {
      mistSeen = true
      continue
    }
    const diff = referenceDate ? daysAgo(referenceDate, event.date) : 0
    const effectiveDiff = diff === null ? Number.MAX_SAFE_INTEGER : diff
    if (bestDiff === null || effectiveDiff < bestDiff) {
      bestDiff = effectiveDiff
      bestDose = doseClass
      const rawMl = Number(event.amountMl ?? event.amount_ml)
      bestAmountMl = Number.isFinite(rawMl) && rawMl > 0 ? rawMl : null
    }
  }
  if (bestDose !== null) {
    return { doseClass: bestDose, amountMl: bestAmountMl }
  }
  return mistSeen ? { doseClass: DOSE_CLASS.MIST, amountMl: null } : null
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

  const isWet =
    (isHighMoisture && isHighWetPressure) ||
    (isThoroughAndRecent && weatherWetPressureHitCount >= 2) ||
    isNoDrainageNarrowHighMoisture ||
    isVeryHighMoistureAndRecent

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
  // 保留触发原因，用于湿信号刹车判断
  const isLowMoisture = rootZoneMoistureIndex < 0.3
  const baselineMinDays = Number(baselineIntervalDays[0]) || 5
  const isTooLongAgo =
    lastEffectiveRootWateredDaysAgo === null || lastEffectiveRootWateredDaysAgo >= baselineMinDays

  const dryReasons = []
  if (isLowMoisture && isTooLongAgo) {
    dryReasons.push('LOW_MOISTURE_LONG_GAP')
  }
  if (forecastHotDryHit && isTooLongAgo) {
    dryReasons.push('FORECAST_HOT_DRY_HIT')
  }
  if (historicalHotDryHit && lastEffectiveRootWateredDaysAgo === null) {
    dryReasons.push('HISTORICAL_HOT_DRY_NO_WATERING')
  }
  const isDry = dryReasons.length > 0

  // 湿信号刹车：强偏湿环境（≥2 项）且 DRY 不来自预报热干时，降级为 BASELINE + 查土
  // 但超期天数远超基线（>baselineMinDays×2）时不压制——严重缺水不会被天气湿信号掩盖
  // null（无有效根浇）且 isTooLongAgo 时也视为严重超期
  const severeOverdueDays = (baselineMinDays || 5) * 2
  const isSevereOverdue =
    isTooLongAgo &&
    (lastEffectiveRootWateredDaysAgo === null ||
      lastEffectiveRootWateredDaysAgo >= severeOverdueDays)
  if (
    isDry &&
    weatherWetPressureHitCount >= 2 &&
    !dryReasons.includes('FORECAST_HOT_DRY_HIT') &&
    !isSevereOverdue
  ) {
    reasonCodes.push(REASON_CODE.STRONG_WET_ENVIRONMENT)
    reasonCodes.push(REASON_CODE.DRY_SUPPRESSED_BY_WET_ENVIRONMENT)
    reasonCodes.push(REASON_CODE.CHECK_SOIL_BEFORE_WATERING)
    reasonCodes.push(REASON_CODE.BASELINE_INTERVAL)
    return {
      gateState: GATE_STATE.BASELINE,
      reasonCodes,
      wateringContext: 'keep_baseline_or_check_soil',
      action: 'follow_baseline_or_check_soil'
    }
  }

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
function hasRecentThoroughWatering(
  wateringEvents = [],
  referenceDate = '',
  withinDays = 5,
  potVolumeMl = 0
) {
  for (const event of wateringEvents) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0 || diff > withinDays) {
      continue
    }
    if (resolveDoseClass(event, potVolumeMl) === DOSE_CLASS.THOROUGH) {
      return true
    }
  }
  return false
}

/**
 * 计算下次水量建议。
 *
 * 根据盆型体积、gate 状态推荐水量区间（ml），并给出矿泉水瓶度量文案。
 *
 * @param {object} potGeometry - 盆型几何
 * @param {string} gateState - 门控状态
 * @param {number[]} baselineIntervalDays - 属级基线间隔
 * @returns {object} { amountRangeMl, stopCondition, confidenceLevel }
 *
 * 注：文案换算已移至前端 src/utils/water-volume-format.js，后端只返回 amountRangeMl（ml 数组），
 * 不再产出 amountBottleText。
 */
function computeAmountSuggestion(
  potGeometry = {},
  gateState = GATE_STATE.BASELINE,
  _baselineIntervalDays = [5, 8],
  options = {}
) {
  const volumeMl = Number(potGeometry.potVolumeMl) || 0
  const volumeConfidence = potGeometry.volumeConfidence || 'low'

  // 无盆型体积：无法可靠估算，按 gate 保守给区间
  if (volumeMl <= 0) {
    if (gateState === GATE_STATE.WET) {
      return {
        amountRangeMl: [0, 0],
        stopCondition: '暂停浇水，检查土壤干湿后再决定',
        confidenceLevel: 'low'
      }
    }
    if (gateState === GATE_STATE.DRY) {
      return {
        amountRangeMl: [100, 200],
        stopCondition: '盆底出水即可停止',
        confidenceLevel: 'low'
      }
    }
    return {
      amountRangeMl: [50, 150],
      stopCondition: '盆土表面湿润即可停止',
      confidenceLevel: 'low'
    }
  }

  // WET 恒暂停
  if (gateState === GATE_STATE.WET) {
    return {
      amountRangeMl: [0, 0],
      stopCondition: '暂停浇水，检查土壤干湿后再决定',
      confidenceLevel: volumeConfidence
    }
  }

  // 按 gate 定倍率算建议量区间
  let amountRangeMl
  let stopCondition
  if (gateState === GATE_STATE.DRY) {
    amountRangeMl = [Math.round(volumeMl * 0.2), Math.round(volumeMl * 0.3)]
    stopCondition = '盆底有水流出即可停止'
  } else {
    amountRangeMl = [Math.round(volumeMl * 0.1), Math.round(volumeMl * 0.15)]
    stopCondition = '盆土表面湿润即可停止'
  }

  // 天气偏湿水量压制（仅 DRY 生效，BASELINE 不压）
  const wetFactor = resolveWeatherWetAmountFactor(
    gateState,
    Number(options.weatherWetPressureHitCount) || 0
  )
  if (wetFactor < 1.0) {
    amountRangeMl = [
      Math.round(amountRangeMl[0] * wetFactor),
      Math.round(amountRangeMl[1] * wetFactor)
    ]
    if (gateState === GATE_STATE.DRY && Number(options.weatherWetPressureHitCount) >= 2) {
      stopCondition = '先查土，确认表层 3-5cm 干透后再浇；不要按毫升一次倒完'
    }
  }

  // 属级需水量修正（Task 6）：以 targetMoistureMid 为锚，喜干收窄、湿润放大
  const speciesFactor = resolveSpeciesWaterFactor(options.wateringQuantization)
  amountRangeMl = [
    Math.round(amountRangeMl[0] * speciesFactor),
    Math.round(amountRangeMl[1] * speciesFactor)
  ]

  // 排水孔/基质/喜干植物修正：无排水孔时收窄水量以防积水烂根
  const modifier = resolveDrainageAmountModifier(potGeometry, options.wateringQuantization)
  amountRangeMl = [
    Math.round(amountRangeMl[0] * modifier.lower),
    Math.round(amountRangeMl[1] * modifier.upper)
  ]
  if (modifier.stopCondition) {
    stopCondition = modifier.stopCondition
  }

  // 用户历史剂量锚定区间下限（mist/unknown 不锚定）
  const reasonCodes = []
  const echo = options.userDoseEcho
  const echoDoseClass = echo ? (typeof echo === 'string' ? echo : echo.doseClass) : null
  const echoAmountMl = echo && typeof echo === 'object' ? Number(echo.amountMl) : null
  if (echoDoseClass && echoDoseClass !== DOSE_CLASS.MIST && echoDoseClass !== DOSE_CLASS.UNKNOWN) {
    // 锚定 ml：优先用具体 amountMl，无则按 doseClass 反推代表 ml
    let anchorMl = null
    if (Number.isFinite(echoAmountMl) && echoAmountMl > 0) {
      anchorMl = echoAmountMl
    } else {
      // 按 doseClass 对应体积百分比反推代表 ml
      const ratioByDose = { small: 0.08, normal: 0.2, thorough: 0.4 }
      const ratio = ratioByDose[echoDoseClass]
      if (ratio) {
        anchorMl = Math.round(volumeMl * ratio)
      }
    }
    // 仅当锚定值在 [当前下限, 上限) 区间内才锚定
    // 超过上限时不锚定——用户浇量异常多（如浇透/一大桶）不代表下次也要浇这么多
    if (anchorMl && anchorMl > amountRangeMl[0] && anchorMl < amountRangeMl[1]) {
      amountRangeMl[0] = anchorMl
      reasonCodes.push(REASON_CODE.USER_DOSE_ANCHORED)
    }
  }

  return {
    amountRangeMl,
    stopCondition,
    confidenceLevel: volumeConfidence,
    reasonCodes
  }
}

/**
 * 天气偏湿对 DRY 水量的压制系数（仅 DRY 生效，BASELINE/WET 返回 1.0）。
 *
 * | weatherWetPressureHitCount | 系数 | 语义 |
 * |---|---|---|
 * | 0 | 1.0 | 正常 |
 * | 1 | 0.8 | 轻度偏湿，收窄 20% |
 * | ≥2 | 0.5 | 强偏湿，水量砍半 + 查土提示 |
 *
 * @param {string} gateState
 * @param {number} weatherWetPressureHitCount
 * @returns {number}
 */
function resolveWeatherWetAmountFactor(gateState, weatherWetPressureHitCount = 0) {
  if (gateState !== GATE_STATE.DRY) {
    return 1.0
  }
  if (weatherWetPressureHitCount >= 2) {
    return 0.5
  }
  if (weatherWetPressureHitCount === 1) {
    return 0.8
  }
  return 1.0
}

/**
 * 属级需水量修正系数（Task 6）。
 *
 * 以属级量化 watering_way_quantization_json.targetMoistureMid（目标湿度中值）为锚，
 * 映射到单次建议水量的乘子，让"这类植物本身多需水"真正参与水量（不只看盆体积）：
 *   - 喜干  (≤0.35，如多肉/龙舌兰) → 0.6
 *   - 微干  (0.35~0.55)            → 0.85
 *   - 中性  (0.55 附近缺省 0.5)     → 1.0
 *   - 湿润  (0.55~0.75)            → 1.15
 *   - 高湿/水生 (>0.75)            → 1.25
 * 无量化数据 / 非法值 → 1.0（中性，不改变水量）。
 *
 * @param {object|null} wateringQuantization
 * @returns {number} 需水系数
 */
function resolveSpeciesWaterFactor(wateringQuantization = null) {
  const mid = Number(wateringQuantization?.targetMoistureMid)
  if (!Number.isFinite(mid)) {
    return 1.0
  }
  if (mid <= 0.35) {
    return 0.6
  }
  if (mid <= 0.55) {
    // 0.5 缺省档保持中性 1.0；0.35~0.5 之间轻收窄
    return mid < 0.5 ? 0.85 : 1.0
  }
  if (mid <= 0.75) {
    return 1.15
  }
  return 1.25
}

/**
 * 排水孔/基质/喜干植物对单次水量的修正系数（下限×lower、上限×upper）。
 * 按积水风险从高到低匹配，只取第一命中：
 *   - 有排水孔          → 1.0 / 1.0（基线）
 *   - 无排水孔+喜干植物  → 0.4 / 0.35（最高积水风险，如多肉/虎尾兰）
 *   - 无排水孔+保水基质  → 0.5 / 0.4
 *   - 无排水孔（普通）   → 0.6 / 0.5
 *   - 未知排水孔        → 1.0 / 0.85（不假设无孔，但适度收上限）
 * 喜干判定用属级量化 watering_way_quantization_json.dryTolerance === 'high'；
 * 保水基质用 potGeometry.substrateRetentionFactor > 1.0（保水因子高于中性田园土）。
 */
function resolveDrainageAmountModifier(potGeometry = {}, wateringQuantization = null) {
  const drainage = potGeometry.hasDrainageHole || 'unknown'
  if (drainage === 'true') {
    return { lower: 1.0, upper: 1.0 }
  }
  if (drainage === 'false') {
    const isDryLoving = String(wateringQuantization?.dryTolerance || '').toLowerCase() === 'high'
    if (isDryLoving) {
      return { lower: 0.4, upper: 0.35, stopCondition: '无排水孔且喜干，少量给水、切勿积水' }
    }
    const retentionFactor = Number(potGeometry.substrateRetentionFactor)
    const isWaterRetaining = Number.isFinite(retentionFactor) && retentionFactor > 1.0
    if (isWaterRetaining) {
      return { lower: 0.5, upper: 0.4, stopCondition: '无排水孔且基质保水强，少量给水、切勿积水' }
    }
    return { lower: 0.6, upper: 0.5, stopCondition: '无排水孔，控制水量避免积水' }
  }
  // unknown
  return { lower: 1.0, upper: 0.85 }
}

module.exports = {
  DOSE_CLASS,
  GATE_STATE,
  REASON_CODE,
  DOSE_HYDRATION_WEIGHT,
  DOSE_WET_PRESSURE_WEIGHT,
  resolveDoseClass,
  resolveDoseClassWithConflict,
  resolveLookbackWindowDays,
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  computeRootZoneMoistureIndex,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion,
  resolveSpeciesWaterFactor,
  resolveWeatherWetAmountFactor,
  resolveDrainageAmountModifier,
  resolveUserDoseEcho
}
