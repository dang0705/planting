'use strict'

function envNumber(name, conservative) {
  const value = Number(process.env[name])
  return Number.isFinite(value) ? value : conservative
}

function envText(name, conservative = '') {
  const value = String(process.env[name] || '').trim()
  return value || conservative
}

function envTextList(name, conservative) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) {
    return conservative
  }
  return raw
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

function envJson(name, conservative = {}) {
  const raw = String(process.env[name] || '').trim()
  if (!raw) {
    return conservative
  }

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed
    }
  } catch {
    // ignore
  }

  return conservative
}

function buildConfigFromEnvOverrides(base = {}) {
  const inline = envJson('CARE_PLANNER_THRESHOLDS_JSON', null)
  if (inline) {
    return inline
  }

  return {
    version: envText('CARE_PLANNER_THRESHOLDS_VERSION', base.version || ''),
    environment: {
      conservativeHumidityMinPercent: envNumber('CARE_ENV_HUMIDITY_MIN_PERCENT', undefined),
      conservativeHumidityMaxPercent: envNumber('CARE_ENV_HUMIDITY_MAX_PERCENT', undefined),
      conservativeTemperatureMinC: envNumber('CARE_ENV_TEMPERATURE_MIN_C', undefined),
      conservativeTemperatureMaxC: envNumber('CARE_ENV_TEMPERATURE_MAX_C', undefined)
    },
    watering: {
      behaviorWindowDays: envNumber('CARE_WATERING_BEHAVIOR_WINDOW_DAYS', undefined),
      wetHighHumidityDaysMin: envNumber('CARE_WATERING_WET_HIGH_HUMIDITY_DAYS_MIN', undefined),
      wetHighHumidityConsecutiveDaysMin: envNumber(
        'CARE_WATERING_WET_HIGH_HUMIDITY_CONSECUTIVE_DAYS_MIN',
        undefined
      ),
      wetColdHumidDaysMin: envNumber('CARE_WATERING_WET_COLD_HUMID_DAYS_MIN', undefined),
      wetColdHumidConsecutiveDaysMin: envNumber(
        'CARE_WATERING_WET_COLD_HUMID_CONSECUTIVE_DAYS_MIN',
        undefined
      ),
      wetRainyDaysMin: envNumber('CARE_WATERING_WET_RAINY_DAYS_MIN', undefined),
      wetRainyConsecutiveDaysMin: envNumber('CARE_WATERING_WET_RAINY_CONSECUTIVE_DAYS_MIN', undefined),
      wetPressureDeductionPerHit: envNumber('CARE_WATERING_WET_PRESSURE_DEDUCTION_PER_HIT', undefined),
      dryForecastHotDryDaysMin: envNumber('CARE_WATERING_DRY_FORECAST_HOT_DRY_DAYS_MIN', undefined),
      dryForecastHotDryConsecutiveDaysMin: envNumber(
        'CARE_WATERING_DRY_FORECAST_HOT_DRY_CONSECUTIVE_DAYS_MIN',
        undefined
      ),
      dryHistoricalHotDryDaysMin: envNumber('CARE_WATERING_DRY_HISTORY_HOT_DRY_DAYS_MIN', undefined),
      dryHistoricalHotDryConsecutiveDaysMin: envNumber(
        'CARE_WATERING_DRY_HISTORY_HOT_DRY_CONSECUTIVE_DAYS_MIN',
        undefined
      ),
      dryLastWateredDaysAgoMin: envNumber('CARE_WATERING_DRY_LAST_WATERED_DAYS_AGO_MIN', undefined)
    },
    fertilizing: {
      intervalMinDays: envNumber('CARE_FERTILIZING_INTERVAL_MIN_DAYS', undefined),
      intervalMaxDays: envNumber('CARE_FERTILIZING_INTERVAL_MAX_DAYS', undefined),
      recentWindowDays: envNumber('CARE_FERTILIZING_RECENT_WINDOW_DAYS', undefined),
      concentratedStrengths: envTextList('CARE_FERTILIZING_CONCENTRATED_STRENGTHS', undefined),
      deficiencyGapBuckets: envTextList('CARE_FERTILIZING_DEFICIENCY_GAP_BUCKETS', undefined),
      dueGapBuckets: envTextList('CARE_FERTILIZING_DUE_GAP_BUCKETS', undefined)
    }
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function mergeConfig(base = {}, overrides = {}) {
  const merged = clone(base)
  if (!isPlainObject(overrides)) {
    return merged
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (isPlainObject(value) && isPlainObject(merged[key])) {
      merged[key] = mergeConfig(merged[key], value)
    } else if (value !== undefined) {
      merged[key] = value
    }
  }

  return merged
}

const CARE_PLANNER_THRESHOLDS_BASE = {
  version: 'care_planner_thresholds_v1',
  environment: {
    conservativeHumidityMinPercent: envNumber('CARE_ENV_HUMIDITY_MIN_PERCENT', 35),
    conservativeHumidityMaxPercent: envNumber('CARE_ENV_HUMIDITY_MAX_PERCENT', 75),
    conservativeTemperatureMinC: envNumber('CARE_ENV_TEMPERATURE_MIN_C', 12),
    conservativeTemperatureMaxC: envNumber('CARE_ENV_TEMPERATURE_MAX_C', 30)
  },
  watering: {
    behaviorWindowDays: envNumber('CARE_WATERING_BEHAVIOR_WINDOW_DAYS', 10),
    wetHighHumidityDaysMin: envNumber('CARE_WATERING_WET_HIGH_HUMIDITY_DAYS_MIN', 4),
    wetHighHumidityConsecutiveDaysMin: envNumber(
      'CARE_WATERING_WET_HIGH_HUMIDITY_CONSECUTIVE_DAYS_MIN',
      4
    ),
    wetColdHumidDaysMin: envNumber('CARE_WATERING_WET_COLD_HUMID_DAYS_MIN', 2),
    wetColdHumidConsecutiveDaysMin: envNumber(
      'CARE_WATERING_WET_COLD_HUMID_CONSECUTIVE_DAYS_MIN',
      2
    ),
    wetRainyDaysMin: envNumber('CARE_WATERING_WET_RAINY_DAYS_MIN', 4),
    wetRainyConsecutiveDaysMin: envNumber('CARE_WATERING_WET_RAINY_CONSECUTIVE_DAYS_MIN', 4),
    wetPressureDeductionPerHit: envNumber('CARE_WATERING_WET_PRESSURE_DEDUCTION_PER_HIT', 1),
    dryForecastHotDryDaysMin: envNumber('CARE_WATERING_DRY_FORECAST_HOT_DRY_DAYS_MIN', 3),
    dryForecastHotDryConsecutiveDaysMin: envNumber(
      'CARE_WATERING_DRY_FORECAST_HOT_DRY_CONSECUTIVE_DAYS_MIN',
      3
    ),
    dryHistoricalHotDryDaysMin: envNumber('CARE_WATERING_DRY_HISTORY_HOT_DRY_DAYS_MIN', 3),
    dryHistoricalHotDryConsecutiveDaysMin: envNumber(
      'CARE_WATERING_DRY_HISTORY_HOT_DRY_CONSECUTIVE_DAYS_MIN',
      3
    ),
    dryLastWateredDaysAgoMin: envNumber('CARE_WATERING_DRY_LAST_WATERED_DAYS_AGO_MIN', 7)
  },
  fertilizing: {
    intervalMinDays: envNumber('CARE_FERTILIZING_INTERVAL_MIN_DAYS', 30),
    intervalMaxDays: envNumber('CARE_FERTILIZING_INTERVAL_MAX_DAYS', 45),
    recentWindowDays: envNumber('CARE_FERTILIZING_RECENT_WINDOW_DAYS', 10),
    concentratedStrengths: envTextList('CARE_FERTILIZING_CONCENTRATED_STRENGTHS', [
      'strong',
      'concentrated',
      'high',
      'heavy',
      '浓肥',
      '浓'
    ]),
    deficiencyGapBuckets: envTextList('CARE_FERTILIZING_DEFICIENCY_GAP_BUCKETS', [
      'over_60d',
      'almost_never',
      'unknown'
    ]),
    dueGapBuckets: envTextList('CARE_FERTILIZING_DUE_GAP_BUCKETS', [
      '31_60d',
      'over_60d',
      'almost_never'
    ])
  }
}

const DEFAULT_CARE_PLANNER_THRESHOLDS = Object.freeze(
  mergeConfig(CARE_PLANNER_THRESHOLDS_BASE, buildConfigFromEnvOverrides(CARE_PLANNER_THRESHOLDS_BASE))
)

function resolveCarePlannerThresholds(overrides = {}) {
  return mergeConfig(DEFAULT_CARE_PLANNER_THRESHOLDS, overrides)
}

module.exports = {
  DEFAULT_CARE_PLANNER_THRESHOLDS,
  resolveCarePlannerThresholds
}
