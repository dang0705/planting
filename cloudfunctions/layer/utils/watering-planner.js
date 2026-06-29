'use strict'

/**
 * 浇水规划器 —— 从 diagnose-http 抽取的共享纯计算模块。
 *
 * 以属级 watering.freq / intervalDays 为基线，叠加最近 10 天实际浇水次数、
 * 最近一次浇水距今天数、历史/预报天气偏湿偏干信号，输出：
 *   - wateringContext / action / reasons / calculation（原有契约，诊断链路依赖）
 *   - nextWaterDate / nextWaterWindow / nextWaterReason（新增，首页浇水提醒弹框依赖）
 *
 * 纯函数，无 DB、无外部 IO。diagnose-http 与 plant-user-http 共用此模块。
 */

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
  const dailyRecords = Array.isArray(source.dailyRecords)
    ? source.dailyRecords
    : Array.isArray(source.daily_records)
      ? source.daily_records
      : []
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

function buildBehaviorSummary(referenceDate = '', events = {}) {
  const wateringEvents = Array.isArray(events.wateringEvents) ? events.wateringEvents : []
  return {
    wateringCount10d: wateringEvents.length,
    thoroughWateringCount10d: wateringEvents.filter(event =>
      ['thorough', 'deep', 'soaked', '浇透', '透浇'].includes(normalizeText(event.amount))
    ).length,
    lastWateredDaysAgo: latestDaysAgo(referenceDate, wateringEvents)
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
 * - WET：偏湿，延迟浇水，下次 = 最近浇水日 + max(baseline interval)
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
function resolveNextWaterDate(baseline, wateringContext, timeline, referenceDate) {
  const interval = baseline.intervalDays || [5, 8]
  const minDays = Math.max(1, Number(interval[0]) || 5)
  const maxDays = Math.max(minDays, Number(interval[1]) || minDays)
  const midDays = Math.max(1, Math.round((minDays + maxDays) / 2))

  const wateringEvents = timeline?.watering_events_10d || timeline?.wateringEvents10d || []
  const refDate = parseDate(referenceDate) || new Date()

  // clamp 辅助：确保日期不早于 referenceDate + 1（明天）
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
    // WET 意味着近期浇水偏多或环境偏湿，系统不应再推导具体浇水日期
    // 返回 null 让前端提示"暂停浇水并检查土壤"，避免在过浇风险下仍安排浇水
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

  // BASELINE
  if (wateringEvents.length === 0) {
    return {
      nextWaterDate: null,
      nextWaterWindow: [minDays, maxDays],
      nextWaterReason: '尚无浇水记录，请先选择最近 10 天的浇水日期'
    }
  }
  const latestEvent = wateringEvents
    .slice()
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0]
  const base = latestEvent ? parseDate(latestEvent.date) || refDate : refDate
  base.setDate(base.getDate() + midDays)
  // clamp：如果最近浇水已超过基线间隔，算出的日期会在过去，clamp 到明天
  const clamped = clampToTomorrow(base)
  return {
    nextWaterDate: formatDate(clamped),
    nextWaterWindow: [minDays, maxDays],
    nextWaterReason: '按属级基线间隔建议下次浇水时间'
  }
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

/* ---------- 主计算入口 ---------- */

/**
 * buildWateringPlanner
 *
 * 输入：
 *   wateringStrategy  - 属级浇水配置 { freq: [minDays, maxDays] }
 *   historical        - 天气历史摘要
 *   forecast          - 天气预报摘要
 *   behaviorTimeline  - 归一化或原始浇水事件集合
 *   thresholds        - 可选阈值覆盖
 *   referenceDate     - 可选参考日期（默认今天）
 *
 * 输出（原有）：baseline / wateringContext / action / reasons / thresholds / calculation
 * 输出（新增）：nextWaterDate / nextWaterWindow / nextWaterReason
 */
function buildWateringPlanner({
  wateringStrategy = {},
  historical = {},
  forecast = {},
  behaviorTimeline = {},
  thresholds: rawThresholds = null,
  referenceDate = '',
  resolveThresholds = null
} = {}) {
  const thresholds = resolveThresholds
    ? resolveThresholds(rawThresholds).watering
    : resolveDefaultThresholds(rawThresholds).watering
  const timeline = behaviorTimeline?.summary
    ? behaviorTimeline
    : normalizeCareBehaviorTimeline(behaviorTimeline)
  const summary = timeline.summary || {}
  const wateringCount10d = Number(summary.wateringCount10d || 0)
  const lastWateredDaysAgo = summary.lastWateredDaysAgo
  const baseline = {
    intervalDays: resolveBaselineInterval(wateringStrategy)
  }
  const minIntervalDays = Math.max(1, Number(baseline.intervalDays?.[0]) || 5)
  const behaviorWindowDays = Math.max(1, Number(thresholds.behaviorWindowDays || 10))
  const maxReasonableWaterings10d = Math.max(1, Math.ceil(behaviorWindowDays / minIntervalDays))
  const highHumidityPressureHit =
    Number(historical.highHumidityDays || 0) >= Number(thresholds.wetHighHumidityDaysMin || 0) ||
    Number(historical.maxConsecutiveHighHumidityDays || 0) >=
      Number(thresholds.wetHighHumidityConsecutiveDaysMin || 0)
  const coldHumidPressureHit =
    Number(historical.coldHumidDays || 0) >= Number(thresholds.wetColdHumidDaysMin || 0) ||
    Number(historical.maxConsecutiveColdHumidDays || 0) >=
      Number(thresholds.wetColdHumidConsecutiveDaysMin || 0)
  const rainyPressureHit =
    Number(historical.rainyDays || 0) >= Number(thresholds.wetRainyDaysMin || 0) ||
    Number(historical.maxConsecutiveRainyDays || 0) >=
      Number(thresholds.wetRainyConsecutiveDaysMin || 0)
  const wetPressureHitCount = [
    highHumidityPressureHit,
    coldHumidPressureHit,
    rainyPressureHit
  ].filter(Boolean).length
  const wetPressureScore = wetPressureHitCount * Number(thresholds.wetPressureDeductionPerHit || 1)
  const effectiveWetWaterings10d = Math.max(1, maxReasonableWaterings10d - wetPressureScore)
  const forecastHotDryHit =
    Number(forecast.hotDryDays || 0) >= Number(thresholds.dryForecastHotDryDaysMin || 0) ||
    Number(forecast.maxConsecutiveHotDryDays || 0) >=
      Number(thresholds.dryForecastHotDryConsecutiveDaysMin || 0)
  const historicalHotDryHit =
    Number(historical.hotDryDays || 0) >= Number(thresholds.dryHistoricalHotDryDaysMin || 0) ||
    Number(historical.maxConsecutiveHotDryDays || 0) >=
      Number(thresholds.dryHistoricalHotDryConsecutiveDaysMin || 0)
  const lastWateredTooLongAgo =
    lastWateredDaysAgo === null ||
    Number(lastWateredDaysAgo) >= Number(thresholds.dryLastWateredDaysAgoMin || 0)
  // 天气偏湿信号足够强时独立触发 WET，即使浇水次数未超基线窗口。
  // 条件：历史和预报都有偏湿信号（至少 2 种偏湿天气命中），表明环境持续偏湿而非短暂波动。
  // 不再限制 lastWateredDaysAgo——偏湿环境下无论多久前浇过水，都不应按基线间隔正常安排浇水。
  const strongWetEnvironment = wetPressureHitCount >= 2 && lastWateredDaysAgo !== null
  const wetExceeded = wateringCount10d > effectiveWetWaterings10d || strongWetEnvironment
  const dryExceeded =
    (forecastHotDryHit && lastWateredTooLongAgo) ||
    (historicalHotDryHit && wateringCount10d === 0)
  const calculation = {
    formulaVersion: 'watering_planner_v7_configurable',
    inputs: {
      wateringCount10d,
      lastWateredDaysAgo,
      baselineIntervalDays: baseline.intervalDays,
      historical: pickNumberFields(historical, [
        'highHumidityDays',
        'coldHumidDays',
        'rainyDays',
        'hotDryDays',
        'maxConsecutiveHighHumidityDays',
        'maxConsecutiveColdHumidDays',
        'maxConsecutiveRainyDays',
        'maxConsecutiveHotDryDays'
      ]),
      forecast: pickNumberFields(forecast, ['hotDryDays', 'maxConsecutiveHotDryDays'])
    },
    thresholds: clonePlain(thresholds),
    formulas: [
      buildPlannerFormulaStep({
        key: 'max_reasonable_waterings_10d',
        expression: 'ceil(behaviorWindowDays / minIntervalDays)',
        inputs: { behaviorWindowDays, minIntervalDays },
        result: maxReasonableWaterings10d
      }),
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
        key: 'cold_humid_pressure_hit',
        expression:
          'coldHumidDays >= wetColdHumidDaysMin || maxConsecutiveColdHumidDays >= wetColdHumidConsecutiveDaysMin',
        inputs: {
          coldHumidDays: Number(historical.coldHumidDays || 0),
          maxConsecutiveColdHumidDays: Number(historical.maxConsecutiveColdHumidDays || 0)
        },
        thresholds: {
          wetColdHumidDaysMin: Number(thresholds.wetColdHumidDaysMin || 0),
          wetColdHumidConsecutiveDaysMin: Number(thresholds.wetColdHumidConsecutiveDaysMin || 0)
        },
        result: coldHumidPressureHit,
        passed: coldHumidPressureHit
      }),
      buildPlannerFormulaStep({
        key: 'rainy_pressure_hit',
        expression:
          'rainyDays >= wetRainyDaysMin || maxConsecutiveRainyDays >= wetRainyConsecutiveDaysMin',
        inputs: {
          rainyDays: Number(historical.rainyDays || 0),
          maxConsecutiveRainyDays: Number(historical.maxConsecutiveRainyDays || 0)
        },
        thresholds: {
          wetRainyDaysMin: Number(thresholds.wetRainyDaysMin || 0),
          wetRainyConsecutiveDaysMin: Number(thresholds.wetRainyConsecutiveDaysMin || 0)
        },
        result: rainyPressureHit,
        passed: rainyPressureHit
      }),
      buildPlannerFormulaStep({
        key: 'wet_pressure_score',
        expression: 'wetPressureHitCount * wetPressureDeductionPerHit',
        inputs: {
          wetPressureHitCount,
          highHumidityPressureHit,
          coldHumidPressureHit,
          rainyPressureHit
        },
        thresholds: {
          wetPressureDeductionPerHit: Number(thresholds.wetPressureDeductionPerHit || 1)
        },
        result: wetPressureScore
      }),
      buildPlannerFormulaStep({
        key: 'effective_wet_waterings_10d',
        expression: 'max(1, maxReasonableWaterings10d - wetPressureScore)',
        inputs: { maxReasonableWaterings10d, wetPressureScore },
        result: effectiveWetWaterings10d
      }),
      buildPlannerFormulaStep({
        key: 'too_wet_condition',
        expression: 'wateringCount10d > effectiveWetWaterings10d || (strongWetEnvironment && lastWateredRecently)',
        inputs: { wateringCount10d, effectiveWetWaterings10d, strongWetEnvironment, wetPressureHitCount, lastWateredDaysAgo },
        result: wetExceeded,
        passed: wetExceeded
      }),
      buildPlannerFormulaStep({
        key: 'too_dry_condition',
        expression:
          '(forecastHotDryHit && lastWateredTooLongAgo) || (historicalHotDryHit && wateringCount10d === 0)',
        inputs: { forecastHotDryHit, lastWateredTooLongAgo, historicalHotDryHit, wateringCount10d },
        result: dryExceeded,
        passed: dryExceeded
      })
    ]
  }

  let result
  if (wetExceeded) {
    const reasons = strongWetEnvironment
      ? ['strong_wet_environment_recently_watered']
      : wetPressureScore > 0
        ? ['recent_watering_plus_wet_environment']
        : ['recent_watering_exceeds_baseline_window']
    result = {
      baseline,
      wateringContext: WATERING_CONTEXTS.WET,
      action: WATERING_ACTIONS.WET,
      reasons,
      thresholds: clonePlain(thresholds),
      calculation: {
        ...calculation,
        result: {
          wateringContext: WATERING_CONTEXTS.WET,
          action: WATERING_ACTIONS.WET
        }
      }
    }
  } else if (dryExceeded) {
    result = {
      baseline,
      wateringContext: WATERING_CONTEXTS.DRY,
      action: WATERING_ACTIONS.DRY,
      reasons: ['hot_dry_window_plus_low_recent_watering'],
      thresholds: clonePlain(thresholds),
      calculation: {
        ...calculation,
        result: {
          wateringContext: WATERING_CONTEXTS.DRY,
          action: WATERING_ACTIONS.DRY
        }
      }
    }
  } else {
    result = {
      baseline,
      wateringContext: WATERING_CONTEXTS.BASELINE,
      action: WATERING_ACTIONS.BASELINE,
      reasons: ['baseline_or_manual_soil_check'],
      thresholds: clonePlain(thresholds),
      calculation: {
        ...calculation,
        result: {
          wateringContext: WATERING_CONTEXTS.BASELINE,
          action: WATERING_ACTIONS.BASELINE
        }
      }
    }
  }

  // 新增：计算 nextWaterDate / nextWaterWindow / nextWaterReason
  const effectiveReferenceDate =
    referenceDate ||
    timeline.referenceDate ||
    timeline.reference_date ||
    new Date().toISOString()
  const nextWater = resolveNextWaterDate(baseline, result.wateringContext, timeline, effectiveReferenceDate)
  result.nextWaterDate = nextWater.nextWaterDate
  result.nextWaterWindow = nextWater.nextWaterWindow
  result.nextWaterReason = nextWater.nextWaterReason

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
  resolveDefaultThresholds
}
