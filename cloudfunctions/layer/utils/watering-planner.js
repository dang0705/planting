'use strict'

/**
 * 浇水规划器 v2.1 —— 从 diagnose-http 抽取的共享纯计算模块。
 *
 * v2.1 核心升级：
 *   - 移除 wateringCount10d 作为核心判断或 fallback。
 *   - 引入 effectiveHydrationLoad / wetPressureLoad / lastEffectiveRootWateredDaysAgo /
 *     rootZoneMoistureIndex / Dry/Wet Gate。
 *   - 接入盆型几何因子（potGeometry）影响干透速率、排水风险和水量建议。
 *   - watering_strategy_json.way/freq 影响动态回看窗口、Dry/Wet Gate、下次水量建议和提醒时间。
 *   - unknown 浇水历史不能当成 0 次；喷雾不能抵消干燥风险。
 *   - 浇透 + 近日期 + 强偏湿 → 过浇风险或查土策略。
 *   - 无排水孔 + 窄底盆 → 提高 wetPressureLoad 与 OVERWATERING_RISK_WARNING 权重。
 *
 * 纯函数，无 DB、无外部 IO。diagnose-http 与 plant-user-http 共用此模块。
 */

const {
  computePotGeometry
} = require('./pot-geometry')
const {
  DOSE_CLASS,
  GATE_STATE,
  resolveDoseClass,
  resolveLookbackWindowDays,
  computeEffectiveHydrationLoad,
  computeWetPressureLoad,
  computeLastEffectiveRootWateredDaysAgo,
  computeRootZoneMoistureIndex,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion,
  resolveUserDoseEcho
} = require('./hydration-load')

const MS_PER_DAY = 24 * 60 * 60 * 1000

const WATERING_CONTEXTS = Object.freeze({
  WET: 'likely_too_wet',
  DRY: 'likely_too_dry',
  BASELINE: 'keep_baseline_or_check_soil'
})

const WATERING_ACTIONS = Object.freeze({
  WET: 'delay_and_check_soil',
  DRY: 'increase_soil_check_frequency',
  BASELINE: 'follow_baseline_or_check_soil'
})

const FORMULA_VERSION = 'watering_planner_v21'

/* ---------- 基础工具函数 ---------- */

function normalizeRawText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function normalizeText(value = '') {
  return normalizeRawText(value)
    .replace(/\s+/g, '_')
    .toLowerCase()
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return undefined
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function clonePlain(value) {
  if (!isPlainObject(value) && !Array.isArray(value)) {
    return value
  }
  return JSON.parse(JSON.stringify(value))
}

function pickNumberFields(source = {}, fields = []) {
  const picked = {}
  for (const field of fields) {
    if (source[field] !== undefined && source[field] !== null) {
      picked[field] = Number(source[field])
    }
  }
  return picked
}

function normalizeDate(value = '') {
  const raw = normalizeRawText(value)
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

function latestDaysAgo(referenceDate = '', events = []) {
  let latest = null
  for (const event of events) {
    const diff = daysAgo(referenceDate, event.date)
    if (diff === null || diff < 0) {
      continue
    }
    latest = latest === null ? diff : Math.min(latest, diff)
  }
  return latest
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) {
    return null
  }
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function normalizeWateringEvent(event = {}, conservativeReferenceDate = '') {
  if (!isPlainObject(event)) {
    return null
  }
  const watered = event.watered !== false && event.didWater !== false && event.action !== 'none'
  const amount = normalizeText(
    event.amount || event.wateringAmount || event.watering_amount || event.level || event.value
  )
  const date = normalizeDate(
    event.date || event.eventDate || event.day || conservativeReferenceDate
  )
  if (!watered && !amount) {
    return null
  }
  return {
    date,
    watered: true,
    amount: amount || 'unknown'
  }
}

function dedupeNormalizedEvents(events = [], keyResolver = event => JSON.stringify(event)) {
  const seen = new Map()
  for (const event of events) {
    if (!event) {
      continue
    }
    const key = keyResolver(event)
    if (!seen.has(key)) {
      seen.set(key, event)
    }
  }
  return Array.from(seen.values())
}

/* ---------- 行为时间线归一化 ---------- */

function normalizeCareBehaviorTimeline(input = {}) {
  const source = isPlainObject(input) ? input : {}
  const referenceDate = normalizeDate(
    source.referenceDate ||
      source.reference_date ||
      source.diagnosisDate ||
      source.diagnosis_date ||
      new Date().toISOString()
  )
  const wateringEvents10d = [
    ...(Array.isArray(source.wateringEvents10d) ? source.wateringEvents10d : []),
    ...(Array.isArray(source.watering_events_10d) ? source.watering_events_10d : [])
  ]
    .map(event => normalizeWateringEvent(event, referenceDate))
    .filter(Boolean)
  const dedupedWateringEvents10d = dedupeNormalizedEvents(wateringEvents10d, event =>
    normalizeDate(event.date)
  ).slice(0, 10)

  const summary = buildBehaviorSummary(referenceDate, {
    wateringEvents: dedupedWateringEvents10d
  })

  return {
    referenceDate,
    reference_date: referenceDate,
    wateringEvents10d: dedupedWateringEvents10d,
    watering_events_10d: dedupedWateringEvents10d,
    summary
  }
}

/**
 * 构建 v2.1 行为摘要。
 *
 * 移除 wateringCount10d，改用 v2.1 字段：
 *   - effectiveHydrationLoad
 *   - wetPressureLoad
 *   - lastEffectiveRootWateredDaysAgo
 *   - rootZoneMoistureIndex
 *   - thoroughWateringCount10d（保留用于诊断展示，非核心判断）
 *   - lastWateredDaysAgo（保留用于诊断展示，非核心判断）
 */
function buildBehaviorSummary(referenceDate = '', events = {}, potGeometry = {}) {
  const wateringEvents = Array.isArray(events.wateringEvents) ? events.wateringEvents : []
  const lookbackWindowDays = resolveLookbackWindowDays([5, 8], potGeometry)

  const effectiveHydrationLoad = computeEffectiveHydrationLoad(
    wateringEvents,
    referenceDate,
    lookbackWindowDays
  )
  const wetPressureLoad = computeWetPressureLoad(
    wateringEvents,
    referenceDate,
    lookbackWindowDays,
    potGeometry
  )
  const lastEffectiveRootWateredDaysAgo = computeLastEffectiveRootWateredDaysAgo(
    wateringEvents,
    referenceDate
  )
  const rootZoneMoistureIndex = computeRootZoneMoistureIndex(
    effectiveHydrationLoad,
    wetPressureLoad,
    Number(potGeometry.potGeometryDryDownFactor) || 1.0,
    0
  )

  return {
    effectiveHydrationLoad,
    wetPressureLoad,
    lastEffectiveRootWateredDaysAgo,
    rootZoneMoistureIndex,
    thoroughWateringCount10d: wateringEvents.filter(event =>
      resolveDoseClass(event) === DOSE_CLASS.THOROUGH
    ).length,
    lastWateredDaysAgo: latestDaysAgo(referenceDate, wateringEvents),
    lookbackWindowDays
  }
}

/* ---------- 阈值解析 ---------- */

function resolveBaselineInterval(wateringStrategy = {}) {
  const freq =
    wateringStrategy.freq || wateringStrategy.intervalDays || wateringStrategy.interval_days
  if (Array.isArray(freq) && freq.length >= 2) {
    const min = toNumber(freq[0])
    const max = toNumber(freq[1])
    if (min !== undefined && max !== undefined) {
      return [min, max]
    }
  }
  return [5, 8]
}

function buildPlannerFormulaStep({
  key = '',
  expression = '',
  inputs = {},
  thresholds = {},
  result = null,
  passed = null
} = {}) {
  return {
    key,
    expression,
    inputs,
    thresholds,
    result,
    ...(passed === null || passed === undefined ? {} : { passed: Boolean(passed) })
  }
}

/**
 * 从 wateringContext + baseline 推导出下次浇水日期。
 *
 * - WET：偏湿，延迟浇水，下次返回 null 让前端提示"暂停浇水并检查土壤"
 * - DRY：偏干，尽快浇水，下次 = 今天 + 1
 * - BASELINE：正常，下次 = 最近浇水日 + mid(baseline interval)；无浇水记录时返回 null
 *
 * 所有日期均 clamp 到不早于明天（referenceDate + 1），避免算出过去日期。
 *
 * @param {object} baseline - { intervalDays: [min, max] }
 * @param {string} wateringContext - WATERING_CONTEXTS 枚举值
 * @param {object} timeline - 归一化后的行为时间线
 * @param {string} referenceDate - 参考日期 'YYYY-MM-DD'
 * @returns {{ nextWaterDate: string|null, nextWaterWindow: [number, number], nextWaterReason: string }}
 */
function resolveNextWaterDate(baseline, wateringContext, timeline, referenceDate, intervalFactor = 1.0) {
  const interval = baseline.intervalDays || [5, 8]
  const minDays = Math.max(1, Number(interval[0]) || 5)
  const maxDays = Math.max(minDays, Number(interval[1]) || minDays)
  const midDays = Math.max(1, Math.round((minDays + maxDays) / 2))

  const wateringEvents = timeline?.watering_events_10d || timeline?.wateringEvents10d || []
  const refDate = parseDate(referenceDate) || new Date()

  function clampToTomorrow(date) {
    const tomorrow = new Date(refDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(12, 0, 0, 0)
    if (date < tomorrow) {
      return tomorrow
    }
    return date
  }

  if (wateringContext === WATERING_CONTEXTS.WET) {
    return {
      nextWaterDate: null,
      nextWaterWindow: [minDays, maxDays],
      nextWaterReason: '近期浇水偏多或环境偏湿，建议暂停浇水并检查土壤干湿状态'
    }
  }

  if (wateringContext === WATERING_CONTEXTS.DRY) {
    const tomorrow = new Date(refDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return {
      nextWaterDate: formatDate(tomorrow),
      nextWaterWindow: [1, minDays],
      nextWaterReason: '环境偏干或距上次浇水较久，建议尽快检查土壤并补水'
    }
  }

  // BASELINE：排水孔仅在此轻微调制周期（intervalFactor），DRY/WET 不受影响
  const factor = Number(intervalFactor) > 0 ? Number(intervalFactor) : 1.0
  const baselineMinDays = Math.max(1, Math.round(minDays * factor))
  const baselineMaxDays = Math.max(baselineMinDays, Math.round(maxDays * factor))
  const baselineMidDays = Math.max(1, Math.round((baselineMinDays + baselineMaxDays) / 2))
  if (wateringEvents.length === 0) {
    return {
      nextWaterDate: null,
      nextWaterWindow: [baselineMinDays, baselineMaxDays],
      nextWaterReason: '尚无浇水记录，请先选择最近 10 天的浇水日期'
    }
  }
  const latestEvent = wateringEvents
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
  const base = latestEvent ? parseDate(latestEvent.date) || refDate : refDate
  base.setDate(base.getDate() + baselineMidDays)
  const clamped = clampToTomorrow(base)
  return {
    nextWaterDate: formatDate(clamped),
    nextWaterWindow: [baselineMinDays, baselineMaxDays],
    nextWaterReason: '按属级基线间隔建议下次浇水时间'
  }
}

/* ---------- 主计算入口 ---------- */

/**
 * buildWateringPlanner v2.1
 *
 * 输入：
 *   wateringStrategy  - 属级浇水配置 { freq: [minDays, maxDays], way: '...' }
 *   historical        - 天气历史摘要
 *   forecast          - 天气预报摘要
 *   behaviorTimeline  - 归一化或原始浇水事件集合
 *   potProfile        - 盆型档案（可选，来自 user_plant_instances 主表盆型列）
 *   thresholds        - 可选阈值覆盖
 *   referenceDate     - 可选参考日期（默认今天）
 *   resolveThresholds - 可选外部阈值解析器（diagnose-http 注入）
 *
 * 输出：
 *   baseline / wateringContext / action / reasons / thresholds / calculation
 *   nextWaterDate / nextWaterWindow / nextWaterReason
 *   amountClass / amountRangeMl / stopCondition / confidenceLevel / reasonCodes
 *   effectiveHydrationLoad / wetPressureLoad / lastEffectiveRootWateredDaysAgo /
 *   rootZoneMoistureIndex / potGeometry
 */
function buildWateringPlanner({
  wateringStrategy = {},
  historical = {},
  forecast = {},
  behaviorTimeline = {},
  potProfile = null,
  wateringQuantization = null,
  thresholds: rawThresholds = null,
  referenceDate = '',
  resolveThresholds = null
} = {}) {
  const thresholds = resolveThresholds
    ? resolveThresholds(rawThresholds).watering
    : resolveDefaultThresholds(rawThresholds).watering

  // 盆型几何计算
  const potGeometry = potProfile ? computePotGeometry(potProfile) : computePotGeometry({})

  const timeline = behaviorTimeline?.summary
    ? behaviorTimeline
    : normalizeCareBehaviorTimeline(behaviorTimeline)

  // 重新用盆型几何构建摘要（lookbackWindow 依赖盆型）
  const summary = buildBehaviorSummary(
    timeline.referenceDate || timeline.reference_date || referenceDate || new Date().toISOString(),
    { wateringEvents: timeline.watering_events_10d || timeline.wateringEvents10d || [] },
    potGeometry
  )

  const baseline = {
    intervalDays: resolveBaselineInterval(wateringStrategy)
  }

  // 动态回看窗口（受 way/freq + 盆型影响）
  const lookbackWindowDays = resolveLookbackWindowDays(baseline.intervalDays, potGeometry)

  // v2.1 核心指标
  const effectiveHydrationLoad = summary.effectiveHydrationLoad
  const wetPressureLoad = summary.wetPressureLoad
  const lastEffectiveRootWateredDaysAgo = summary.lastEffectiveRootWateredDaysAgo
  const rootZoneMoistureIndex = summary.rootZoneMoistureIndex

  // 天气偏湿/偏干信号（保留原有摘要逻辑）
  const highHumidityPressureHit =
    Number(historical.highHumidityDays || 0) >= Number(thresholds.wetHighHumidityDaysMin || 0) ||
    Number(historical.maxConsecutiveHighHumidityDays || 0) >=
      Number(thresholds.wetHighHumidityConsecutiveDaysMin || 0)
  const coldHumidPressureHit =
    Number(historical.coldHumidDays || 0) >= Number(thresholds.wetColdHumidDaysMin || 0) ||
    Number(historical.maxConsecutiveColdHumidityDays || 0) >=
      Number(thresholds.wetColdHumidConsecutiveDaysMin || 0)
  const rainyPressureHit =
    Number(historical.rainyDays || 0) >= Number(thresholds.wetRainyDaysMin || 0) ||
    Number(historical.maxConsecutiveRainyDays || 0) >=
      Number(thresholds.wetRainyConsecutiveDaysMin || 0)
  const weatherWetPressureHitCount = [
    highHumidityPressureHit,
    coldHumidPressureHit,
    rainyPressureHit
  ].filter(Boolean).length

  const forecastHotDryHit =
    Number(forecast.hotDryDays || 0) >= Number(thresholds.dryForecastHotDryDaysMin || 0) ||
    Number(forecast.maxConsecutiveHotDryDays || 0) >=
      Number(thresholds.dryForecastHotDryConsecutiveDaysMin || 0)
  const historicalHotDryHit =
    Number(historical.hotDryDays || 0) >= Number(thresholds.dryHistoricalHotDryDaysMin || 0) ||
    Number(historical.maxConsecutiveHotDryDays || 0) >=
      Number(thresholds.dryHistoricalHotDryConsecutiveDaysMin || 0)

  // 近期浇透检测
  const effectiveReferenceDate =
    referenceDate ||
    timeline.referenceDate ||
    timeline.reference_date ||
    new Date().toISOString()
  const recentThoroughWatering = hasRecentThoroughWatering(
    timeline.watering_events_10d || timeline.wateringEvents10d || [],
    effectiveReferenceDate
  )

  // Dry/Wet Gate 判定
  const gate = evaluateDryWetGate({
    rootZoneMoistureIndex,
    effectiveHydrationLoad,
    wetPressureLoad,
    lastEffectiveRootWateredDaysAgo,
    potGeometry,
    weatherWetPressureHitCount,
    forecastHotDryHit,
    historicalHotDryHit,
    baselineIntervalDays: baseline.intervalDays,
    recentThoroughWatering
  })

  // 水量建议
  const amountSuggestion = computeAmountSuggestion(potGeometry, gate.gateState, baseline.intervalDays, {
    wateringQuantization
  })

  // 用户历史剂量回显（最近一次非喷雾浇水的剂量档）
  const userDoseEcho = resolveUserDoseEcho(
    timeline.watering_events_10d || timeline.wateringEvents10d || [],
    timeline.referenceDate || timeline.reference_date || referenceDate
  )

  // 下次浇水日期（排水孔轻微拉长 BASELINE 周期：无孔 ×1.15，其余 ×1.0）
  const drainageIntervalFactor = potGeometry.hasDrainageHole === 'false' ? 1.15 : 1.0
  const nextWater = resolveNextWaterDate(
    baseline,
    gate.wateringContext,
    timeline,
    effectiveReferenceDate,
    drainageIntervalFactor
  )

  // 计算过程（保留 formula step 结构，兼容诊断页展示）
  const calculation = {
    formulaVersion: FORMULA_VERSION,
    inputs: {
      effectiveHydrationLoad,
      wetPressureLoad,
      lastEffectiveRootWateredDaysAgo,
      rootZoneMoistureIndex,
      baselineIntervalDays: baseline.intervalDays,
      lookbackWindowDays,
      potGeometryDryDownFactor: potGeometry.potGeometryDryDownFactor,
      drainageRiskFactor: potGeometry.drainageRiskFactor,
      historical: pickNumberFields(historical, [
        'highHumidityDays',
        'coldHumidDays',
        'rainyDays',
        'hotDryDays',
        'maxConsecutiveHighHumidityDays',
        'maxConsecutiveColdHumidityDays',
        'maxConsecutiveRainyDays',
        'maxConsecutiveHotDryDays'
      ]),
      forecast: pickNumberFields(forecast, ['hotDryDays', 'maxConsecutiveHotDryDays'])
    },
    thresholds: clonePlain(thresholds),
    formulas: [
      buildPlannerFormulaStep({
        key: 'lookback_window_days',
        expression: 'max(10, baselineMaxInterval * 1.5) * (hasDrainageHole===false ? 1.3 : 1)',
        inputs: { baselineMaxInterval: baseline.intervalDays[1], hasDrainageHole: potGeometry.hasDrainageHole },
        result: lookbackWindowDays
      }),
      buildPlannerFormulaStep({
        key: 'effective_hydration_load',
        expression: 'Σ(doseHydrationWeight × recencyDecay) / lookbackWindowDays',
        inputs: { effectiveHydrationLoad, lookbackWindowDays },
        result: effectiveHydrationLoad
      }),
      buildPlannerFormulaStep({
        key: 'wet_pressure_load',
        expression: 'Σ(doseWetPressureWeight × recencyDecay) / lookbackWindowDays × drainageRiskFactor',
        inputs: { wetPressureLoad, lookbackWindowDays, drainageRiskFactor: potGeometry.drainageRiskFactor },
        result: wetPressureLoad
      }),
      buildPlannerFormulaStep({
        key: 'last_effective_root_watered_days_ago',
        expression: 'min(daysAgo) for non-mist watering events',
        inputs: { lastEffectiveRootWateredDaysAgo },
        result: lastEffectiveRootWateredDaysAgo
      }),
      buildPlannerFormulaStep({
        key: 'root_zone_moisture_index',
        expression: 'clamp(0,1, hydrationLoad/dryDownFactor + wetPressure×0.5 + weatherWet×0.1)',
        inputs: { effectiveHydrationLoad, wetPressureLoad, potGeometryDryDownFactor: potGeometry.potGeometryDryDownFactor, weatherWetPressureHitCount },
        result: rootZoneMoistureIndex
      }),
      // 兼容诊断页展示：保留天气偏湿命中追踪
      buildPlannerFormulaStep({
        key: 'high_humidity_pressure_hit',
        expression: 'highHumidityDays >= wetHighHumidityDaysMin || maxConsecutiveHighHumidityDays >= wetHighHumidityConsecutiveDaysMin',
        inputs: {
          highHumidityDays: Number(historical.highHumidityDays || 0),
          maxConsecutiveHighHumidityDays: Number(historical.maxConsecutiveHighHumidityDays || 0)
        },
        thresholds: {
          wetHighHumidityDaysMin: Number(thresholds.wetHighHumidityDaysMin || 0),
          wetHighHumidityConsecutiveDaysMin: Number(thresholds.wetHighHumidityConsecutiveDaysMin || 0)
        },
        result: highHumidityPressureHit,
        passed: highHumidityPressureHit
      }),
      buildPlannerFormulaStep({
        key: 'wet_pressure_score',
        expression: 'wetPressureHitCount * wetPressureDeductionPerHit',
        inputs: { wetPressureHitCount: weatherWetPressureHitCount, highHumidityPressureHit, coldHumidPressureHit, rainyPressureHit },
        thresholds: { wetPressureDeductionPerHit: Number(thresholds.wetPressureDeductionPerHit || 1) },
        result: weatherWetPressureHitCount * Number(thresholds.wetPressureDeductionPerHit || 1)
      }),
      // 兼容诊断页展示：保留 too_wet_condition / too_dry_condition 追踪
      buildPlannerFormulaStep({
        key: 'too_wet_condition',
        expression: 'dry_wet_gate === WET',
        inputs: { rootZoneMoistureIndex, wetPressureLoad, lastEffectiveRootWateredDaysAgo, weatherWetPressureHitCount },
        result: gate.gateState === GATE_STATE.WET,
        passed: gate.gateState === GATE_STATE.WET
      }),
      buildPlannerFormulaStep({
        key: 'too_dry_condition',
        expression: 'dry_wet_gate === DRY',
        inputs: { rootZoneMoistureIndex, lastEffectiveRootWateredDaysAgo, forecastHotDryHit, historicalHotDryHit },
        result: gate.gateState === GATE_STATE.DRY,
        passed: gate.gateState === GATE_STATE.DRY
      }),
      buildPlannerFormulaStep({
        key: 'dry_wet_gate',
        expression: 'evaluateDryWetGate(moistureIndex, wetPressure, lastRootWatered, potGeometry, weather)',
        inputs: {
          rootZoneMoistureIndex,
          wetPressureLoad,
          lastEffectiveRootWateredDaysAgo,
          hasDrainageHole: potGeometry.hasDrainageHole,
          taperRatio: potGeometry.taperRatio,
          weatherWetPressureHitCount,
          forecastHotDryHit,
          historicalHotDryHit,
          recentThoroughWatering
        },
        result: gate.gateState,
        passed: gate.gateState !== GATE_STATE.BASELINE
      })
    ]
  }

  const result = {
    baseline,
    wateringContext: gate.wateringContext,
    action: gate.action,
    reasons: gate.reasonCodes,
    reasonCodes: gate.reasonCodes,
    thresholds: clonePlain(thresholds),
    calculation: {
      ...calculation,
      result: {
        wateringContext: gate.wateringContext,
        action: gate.action
      }
    },
    // v2.1 新增字段
    effectiveHydrationLoad,
    wetPressureLoad,
    lastEffectiveRootWateredDaysAgo,
    rootZoneMoistureIndex,
    userDoseEcho,
    potGeometry,
    amountClass: amountSuggestion.amountClass,
    amountRangeMl: amountSuggestion.amountRangeMl,
    stopCondition: amountSuggestion.stopCondition,
    confidenceLevel: amountSuggestion.confidenceLevel,
    // 下次浇水日期
    nextWaterDate: nextWater.nextWaterDate,
    nextWaterWindow: nextWater.nextWaterWindow,
    nextWaterReason: nextWater.nextWaterReason
  }

  return result
}

/* ---------- 默认阈值（layer 独立可用，不依赖 diagnose-http configs） ---------- */

const DEFAULT_WATERING_THRESHOLDS = Object.freeze({
  behaviorWindowDays: 10,
  wetHighHumidityDaysMin: 4,
  wetHighHumidityConsecutiveDaysMin: 4,
  wetColdHumidDaysMin: 2,
  wetColdHumidConsecutiveDaysMin: 2,
  wetRainyDaysMin: 4,
  wetRainyConsecutiveDaysMin: 4,
  wetPressureDeductionPerHit: 1,
  dryForecastHotDryDaysMin: 3,
  dryForecastHotDryConsecutiveDaysMin: 3,
  dryHistoricalHotDryDaysMin: 3,
  dryHistoricalHotDryConsecutiveDaysMin: 3,
  dryLastWateredDaysAgoMin: 7
})

function resolveDefaultThresholds(overrides = {}) {
  if (!isPlainObject(overrides) || !isPlainObject(overrides.watering)) {
    return { watering: clonePlain(DEFAULT_WATERING_THRESHOLDS) }
  }
  return {
    watering: Object.assign(
      clonePlain(DEFAULT_WATERING_THRESHOLDS),
      clonePlain(overrides.watering)
    )
  }
}

module.exports = {
  buildWateringPlanner,
  normalizeCareBehaviorTimeline,
  resolveBaselineInterval,
  resolveNextWaterDate,
  WATERING_CONTEXTS,
  WATERING_ACTIONS,
  DEFAULT_WATERING_THRESHOLDS,
  resolveDefaultThresholds,
  FORMULA_VERSION
}
