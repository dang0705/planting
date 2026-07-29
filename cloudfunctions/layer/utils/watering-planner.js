'use strict'

/**
 * 浇水规划器 v2.1 —— 共享纯计算模块。
 * 日期算术、行为时间线、间隔/下次浇水日期组合已提取到 watering-schedule.js。
 * 纯函数，无 DB、无外部 IO。diagnose-http 与 plant-user-http 共用此模块。
 */

const { computePotGeometry } = require('./pot-geometry')
const {
  GATE_STATE,
  REASON_CODE,
  resolveDoseClassWithConflict,
  resolveLookbackWindowDays,
  evaluateDryWetGate,
  hasRecentThoroughWatering,
  computeAmountSuggestion,
  resolveUserDoseEcho
} = require('./hydration-load')
const {
  WATERING_CONTEXTS,
  isPlainObject,
  buildBehaviorSummary,
  normalizeCareBehaviorTimeline,
  resolveBaselineInterval,
  resolveNextWaterDate
} = require('./watering-schedule')

const WATERING_ACTIONS = Object.freeze({
  WET: 'delay_and_check_soil',
  DRY: 'increase_soil_check_frequency',
  BASELINE: 'follow_baseline_or_check_soil'
})

const FORMULA_VERSION = 'watering_planner_v21'

/* ---------- 基础工具函数（planner 专有） ---------- */

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
 *   amountRangeMl / stopCondition / confidenceLevel / reasonCodes
 *   effectiveHydrationLoad / wetPressureLoad / lastEffectiveRootWateredDaysAgo /
 *   rootZoneMoistureIndex / potGeometry
 *
 * 注：文案换算已移至前端 src/utils/water-volume-format.js，后端只返回 amountRangeMl（ml 数组），
 * 不再产出 amountBottleText。
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
  resolveThresholds = null,
  transpirationIntervalFactor = null
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
    referenceDate || timeline.referenceDate || timeline.reference_date || new Date().toISOString()
  const recentThoroughWatering = hasRecentThoroughWatering(
    timeline.watering_events_10d || timeline.wateringEvents10d || [],
    effectiveReferenceDate,
    5,
    Number(potGeometry.potVolumeMl) || 0
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

  // amountMl 与 amount 标签冲突检测（Task 修正）
  const events = timeline.watering_events_10d || timeline.wateringEvents10d || []
  const potVolumeMl = Number(potGeometry.potVolumeMl) || 0
  let hasDoseConflict = false
  for (const ev of events) {
    if (resolveDoseClassWithConflict(ev, potVolumeMl).doseConflict) {
      hasDoseConflict = true
      break
    }
  }
  if (hasDoseConflict) {
    gate.reasonCodes.push(REASON_CODE.AMOUNT_ML_CONFLICTS_WITH_AMOUNT_LABEL)
  }

  // 用户历史剂量回显（最近一次非喷雾浇水的剂量档 + amountMl）
  const userDoseEcho = resolveUserDoseEcho(
    timeline.watering_events_10d || timeline.wateringEvents10d || [],
    timeline.referenceDate || timeline.reference_date || referenceDate,
    Number(potGeometry.potVolumeMl) || 0
  )

  // 水量建议（传入 userDoseEcho 锚定区间下限）
  const amountSuggestion = computeAmountSuggestion(
    potGeometry,
    gate.gateState,
    baseline.intervalDays,
    {
      wateringQuantization,
      weatherWetPressureHitCount,
      userDoseEcho
    }
  )

  // 合并水量建议产生的 reasonCodes（如 USER_DOSE_ANCHORED）
  if (Array.isArray(amountSuggestion.reasonCodes) && amountSuggestion.reasonCodes.length) {
    for (const rc of amountSuggestion.reasonCodes) {
      if (!gate.reasonCodes.includes(rc)) {
        gate.reasonCodes.push(rc)
      }
    }
  }

  // 下次浇水日期（排水孔轻微拉长 BASELINE 周期：无孔 ×1.15，其余 ×1.0）
  const drainageIntervalFactor = potGeometry.hasDrainageHole === 'false' ? 1.15 : 1.0
  // v3 蒸腾因素：仅影响 BASELINE 间隔，不影响 DRY/WET 判定，也不影响单次毫升数。
  // 缺省/中性/影子运行时为 1.0，由调用方通过 transpiration Layer 注入。
  const transpirationFactor =
    transpirationIntervalFactor === null || transpirationIntervalFactor === undefined
      ? 1.0
      : Number.isFinite(Number(transpirationIntervalFactor))
        ? Number(transpirationIntervalFactor)
        : 1.0
  const combinedIntervalFactor = Math.max(
    0.5,
    Math.min(1.5, drainageIntervalFactor * transpirationFactor)
  )
  const nextWater = resolveNextWaterDate(
    baseline,
    gate.wateringContext,
    timeline,
    effectiveReferenceDate,
    combinedIntervalFactor
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
        inputs: {
          baselineMaxInterval: baseline.intervalDays[1],
          hasDrainageHole: potGeometry.hasDrainageHole
        },
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
        expression:
          'Σ(doseWetPressureWeight × recencyDecay) / lookbackWindowDays × drainageRiskFactor',
        inputs: {
          wetPressureLoad,
          lookbackWindowDays,
          drainageRiskFactor: potGeometry.drainageRiskFactor
        },
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
        inputs: {
          effectiveHydrationLoad,
          wetPressureLoad,
          potGeometryDryDownFactor: potGeometry.potGeometryDryDownFactor,
          weatherWetPressureHitCount
        },
        result: rootZoneMoistureIndex
      }),
      // 兼容诊断页展示：保留天气偏湿命中追踪
      buildPlannerFormulaStep({
        key: 'high_humidity_pressure_hit',
        expression:
          'highHumidityDays >= wetHighHumidityDaysMin || maxConsecutiveHighHumidityDays >= wetHighHumidityConsecutiveDaysMin',
        inputs: {
          highHumidityDays: Number(historical.highHumidityDays || 0),
          maxConsecutiveHighHumidityDays: Number(historical.maxConsecutiveHighHumidityDays || 0)
        },
        thresholds: {
          wetHighHumidityDaysMin: Number(thresholds.wetHighHumidityDaysMin || 0),
          wetHighHumidityConsecutiveDaysMin: Number(
            thresholds.wetHighHumidityConsecutiveDaysMin || 0
          )
        },
        result: highHumidityPressureHit,
        passed: highHumidityPressureHit
      }),
      buildPlannerFormulaStep({
        key: 'wet_pressure_score',
        expression: 'wetPressureHitCount * wetPressureDeductionPerHit',
        inputs: {
          wetPressureHitCount: weatherWetPressureHitCount,
          highHumidityPressureHit,
          coldHumidPressureHit,
          rainyPressureHit
        },
        thresholds: {
          wetPressureDeductionPerHit: Number(thresholds.wetPressureDeductionPerHit || 1)
        },
        result: weatherWetPressureHitCount * Number(thresholds.wetPressureDeductionPerHit || 1)
      }),
      // 兼容诊断页展示：保留 too_wet_condition / too_dry_condition 追踪
      buildPlannerFormulaStep({
        key: 'too_wet_condition',
        expression: 'dry_wet_gate === WET',
        inputs: {
          rootZoneMoistureIndex,
          wetPressureLoad,
          lastEffectiveRootWateredDaysAgo,
          weatherWetPressureHitCount
        },
        result: gate.gateState === GATE_STATE.WET,
        passed: gate.gateState === GATE_STATE.WET
      }),
      buildPlannerFormulaStep({
        key: 'too_dry_condition',
        expression: 'dry_wet_gate === DRY',
        inputs: {
          rootZoneMoistureIndex,
          lastEffectiveRootWateredDaysAgo,
          forecastHotDryHit,
          historicalHotDryHit
        },
        result: gate.gateState === GATE_STATE.DRY,
        passed: gate.gateState === GATE_STATE.DRY
      }),
      buildPlannerFormulaStep({
        key: 'dry_wet_gate',
        expression:
          'evaluateDryWetGate(moistureIndex, wetPressure, lastRootWatered, potGeometry, weather)',
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
    amountRangeMl: amountSuggestion.amountRangeMl,
    stopCondition: amountSuggestion.stopCondition,
    confidenceLevel: hasDoseConflict ? 'low' : amountSuggestion.confidenceLevel,
    // 下次浇水日期
    nextWaterDate: nextWater.nextWaterDate,
    nextWaterWindow: nextWater.nextWaterWindow,
    nextWaterReason: nextWater.nextWaterReason,
    // v3 蒸腾间隔修正（仅 BASELINE 间隔生效，不影响单次毫升数）
    transpirationIntervalFactor: transpirationFactor
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
    watering: Object.assign(clonePlain(DEFAULT_WATERING_THRESHOLDS), clonePlain(overrides.watering))
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
